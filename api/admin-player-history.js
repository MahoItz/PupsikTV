const { createClient } = require('@supabase/supabase-js');
const { createHash } = require('node:crypto');
const {
  extractBearerToken,
  verifyAdminToken,
} = require('../lib/admin-session.js');

const SUPABASE_URL = 'https://shwekurmzyzivtworjup.supabase.co';
const TABLE_NAME = 'admin_player_history';
const MAX_PLAYER_HISTORY = 15;
const HISTORY_CACHE_CONTROL = 'private, max-age=30, must-revalidate';

function createHistoryEtag(rows) {
  const payload = (Array.isArray(rows) ? rows : [])
    .map((row) => `${row?.kp_id || ''}:${row?.created_at || ''}`)
    .join('|');

  const hash = createHash('sha1').update(payload).digest('hex');
  return `"${hash}"`;
}

function normalizeEtag(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function parseYear(value) {
  if (value === null || value === undefined || value === '') return null;
  const year = Number.parseInt(value, 10);
  if (!Number.isFinite(year)) return null;
  return year;
}

function normalizeRowPayload(payload) {
  const kpId = Number.parseInt(payload?.kp_id, 10);
  if (!Number.isFinite(kpId)) return null;

  return {
    kp_id: kpId,
    title: String(payload?.title || 'Без названия').slice(0, 500),
    year: parseYear(payload?.year),
    poster: typeof payload?.poster === 'string' ? payload.poster : null,
    created_at: new Date().toISOString(),
  };
}

function createSupabaseClient() {
  const supabaseKey = process.env.SUPABASE_KEY;
  if (!supabaseKey) {
    throw new Error('Missing SUPABASE_KEY');
  }

  return createClient(SUPABASE_URL, supabaseKey, {
    auth: { persistSession: false },
  });
}

function verifyAdminRequest(req) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return { ok: false, status: 401, error: 'Missing token' };
  }

  const verification = verifyAdminToken(token);
  if (!verification.valid) {
    return {
      ok: false,
      status: 401,
      error: verification.error || 'Invalid token',
      expired: Boolean(verification.expired),
    };
  }

  return { ok: true };
}

async function getHistory(supabase, req, res) {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('created_at, kp_id, title, year, poster')
    .order('created_at', { ascending: false })
    .limit(MAX_PLAYER_HISTORY);

  if (error) {
    console.error('Failed to load admin player history', error);
    return res.status(500).json({ error: 'Failed to load history' });
  }

  const items = data || [];
  const etag = createHistoryEtag(items);
  const requestEtag = normalizeEtag(req.headers['if-none-match']);

  res.setHeader('Cache-Control', HISTORY_CACHE_CONTROL);
  res.setHeader('ETag', etag);

  if (requestEtag && requestEtag === etag) {
    return res.status(304).end();
  }

  return res.status(200).json({ items });
}

async function saveHistoryItem(supabase, req, res) {
  let payload = req.body;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload || '{}');
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
  }

  const normalized = normalizeRowPayload(payload || {});
  if (!normalized) {
    return res.status(400).json({ error: 'Invalid kp_id' });
  }

  const { error: deleteError } = await supabase
    .from(TABLE_NAME)
    .delete()
    .eq('kp_id', normalized.kp_id);

  if (deleteError) {
    console.error('Failed to dedupe admin player history', deleteError);
    return res.status(500).json({ error: 'Failed to save history' });
  }

  const { error: insertError } = await supabase
    .from(TABLE_NAME)
    .insert(normalized);

  if (insertError) {
    console.error('Failed to insert admin player history', insertError);
    return res.status(500).json({ error: 'Failed to save history' });
  }

  const { data: tailRows, error: tailError } = await supabase
    .from(TABLE_NAME)
    .select('created_at')
    .order('created_at', { ascending: false })
    .range(MAX_PLAYER_HISTORY, MAX_PLAYER_HISTORY + 1000);

  if (tailError) {
    console.error('Failed to trim admin player history', tailError);
    return res.status(500).json({ error: 'Failed to save history' });
  }

  if (Array.isArray(tailRows) && tailRows.length) {
    const cutoffCreatedAt = tailRows[0].created_at;
    const { error: trimError } = await supabase
      .from(TABLE_NAME)
      .delete()
      .lte('created_at', cutoffCreatedAt);

    if (trimError) {
      console.error(
        'Failed to delete old admin player history rows',
        trimError
      );
      return res.status(500).json({ error: 'Failed to save history' });
    }
  }

  return getHistory(supabase, req, res);
}

async function handler(req, res) {
  const method = (req.method || '').toUpperCase();
  if (!['GET', 'POST', 'DELETE'].includes(method)) {
    res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let access;
  try {
    access = verifyAdminRequest(req);
  } catch (error) {
    console.error('Failed to verify admin request', error);
    return res.status(500).json({ error: 'Server error' });
  }

  if (!access.ok) {
    return res
      .status(access.status)
      .json({ error: access.error, expired: access.expired || false });
  }

  let supabase;
  try {
    supabase = createSupabaseClient();
  } catch (error) {
    console.error('Supabase configuration error', error);
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (method === 'GET') {
    return getHistory(supabase, req, res);
  }

  if (method === 'DELETE') {
    const rawId = req.query?.kp_id ?? req.body?.kp_id;
    const kpId = Number.parseInt(rawId, 10);
    if (!Number.isFinite(kpId)) {
      return res.status(400).json({ error: 'Invalid kp_id' });
    }

    const { error } = await supabase
      .from(TABLE_NAME)
      .delete()
      .eq('kp_id', kpId);
    if (error) {
      console.error('Failed to delete admin player history row', error);
      return res.status(500).json({ error: 'Failed to delete history item' });
    }

    return getHistory(supabase, req, res);
  }

  return saveHistoryItem(supabase, req, res);
}

module.exports = handler;
