const {
  extractBearerToken,
  verifyAdminToken,
} = require('../lib/admin-session.js');
const { createSupabaseServerClient } = require('../lib/supabase-config.js');

const ALLOWED_METHODS = ['POST'];

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

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    return JSON.parse(req.body || '{}');
  }
  return req.body;
}

function normalizeUserName(value) {
  return String(value || '')
    .trim()
    .slice(0, 255);
}

function normalizeType(value) {
  return value === 'games' ? 'games' : 'movies';
}

async function findUserRow(supabase, userName) {
  const { data, error } = await supabase
    .from('users')
    .select('user, movies, games')
    .ilike('user', userName)
    .limit(1);

  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : null;
}

async function handleIncrement(supabase, userName, type) {
  const key = normalizeType(type);
  const existing = await findUserRow(supabase, userName);

  if (existing) {
    const payload = {
      movies: Number(existing.movies ?? 0) || 0,
      games: Number(existing.games ?? 0) || 0,
    };
    payload[key] += 1;

    const { error } = await supabase
      .from('users')
      .update(payload)
      .eq('user', existing.user);
    if (error) throw error;

    return {
      deleted: false,
      item: {
        user: existing.user,
        movies: payload.movies,
        games: payload.games,
      },
    };
  }

  const payload = {
    user: userName,
    movies: key === 'movies' ? 1 : 0,
    games: key === 'games' ? 1 : 0,
  };

  const { error } = await supabase.from('users').insert(payload);
  if (error) throw error;

  return { deleted: false, item: payload };
}

async function handleDecrement(supabase, userName, type) {
  const key = normalizeType(type);
  const existing = await findUserRow(supabase, userName);
  if (!existing) {
    return { deleted: false, item: null };
  }

  const payload = {
    movies: Math.max(0, Number(existing.movies ?? 0) || 0),
    games: Math.max(0, Number(existing.games ?? 0) || 0),
  };
  payload[key] = Math.max(0, payload[key] - 1);

  if (payload.movies === 0 && payload.games === 0) {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('user', existing.user);
    if (error) throw error;

    return { deleted: true, item: { user: existing.user } };
  }

  const { error } = await supabase
    .from('users')
    .update(payload)
    .eq('user', existing.user);
  if (error) throw error;

  return {
    deleted: false,
    item: {
      user: existing.user,
      movies: payload.movies,
      games: payload.games,
    },
  };
}

async function handleDelete(supabase, userName) {
  const existing = await findUserRow(supabase, userName);
  if (!existing) {
    return { deleted: false, item: null };
  }

  const { error } = await supabase
    .from('users')
    .delete()
    .eq('user', existing.user);
  if (error) throw error;

  return { deleted: true, item: { user: existing.user } };
}

async function handler(req, res) {
  const method = (req.method || '').toUpperCase();
  if (!ALLOWED_METHODS.includes(method)) {
    res.setHeader('Allow', ALLOWED_METHODS);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const access = verifyAdminRequest(req);
  if (!access.ok) {
    return res
      .status(access.status)
      .json({ error: access.error, expired: access.expired || false });
  }

  let payload;
  try {
    payload = parseBody(req);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const action = String(payload?.action || '').trim().toLowerCase();
  const userName = normalizeUserName(payload?.userName);

  if (!userName) {
    return res.status(400).json({ error: 'Invalid userName' });
  }

  try {
    const supabase = createSupabaseServerClient();
    let result;

    if (action === 'increment') {
      result = await handleIncrement(supabase, userName, payload?.type);
    } else if (action === 'decrement') {
      result = await handleDecrement(supabase, userName, payload?.type);
    } else if (action === 'delete') {
      result = await handleDelete(supabase, userName);
    } else {
      return res.status(400).json({ error: 'Unsupported action' });
    }

    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error('Failed to mutate users table', error);
    return res.status(500).json({
      error:
        error?.message || 'Failed to mutate users table',
    });
  }
}

module.exports = handler;
