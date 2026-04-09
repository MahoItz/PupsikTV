const {
  extractBearerToken,
  verifyAdminToken,
} = require('../lib/admin-session.js');
const { createSupabaseServerClient } = require('../lib/supabase-config.js');

const ALLOWED_METHODS = ['POST'];
const GAME_POSTER_BUCKET = 'game-posters';
const ALLOWED_METADATA_TABLES = new Set(['movies', 'Movie_Orders', 'games', 'Game_Orders']);
const ALLOWED_DELETE_TABLES = new Set(['movies', 'Movie_Orders', 'games', 'Game_Orders']);

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

function parseId(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTable(value) {
  const table = String(value || '').trim();
  return table || null;
}

function normalizeImdbId(value) {
  if (value === undefined) return undefined;
  const normalized = String(value || '').trim();
  return normalized || null;
}

function getGamePosterStoragePath(posterUrl) {
  if (!posterUrl || typeof posterUrl !== 'string') return null;
  try {
    const url = new URL(posterUrl);
    const marker = `/storage/v1/object/public/${GAME_POSTER_BUCKET}/`;
    const idx = url.pathname.indexOf(marker);
    if (idx === -1) return null;
    const path = url.pathname.slice(idx + marker.length);
    return path.replace(/^\/+/, '') || null;
  } catch {
    return null;
  }
}

async function deletePosterIfNeeded(supabase, posterUrl) {
  const path = getGamePosterStoragePath(posterUrl);
  if (!path) return;

  const { error } = await supabase.storage
    .from(GAME_POSTER_BUCKET)
    .remove([path]);

  if (error) {
    throw error;
  }
}

async function updateKinopoiskMetadata(supabase, payload) {
  const table = normalizeTable(payload?.table);
  const itemId = parseId(payload?.itemId);
  const kinopoiskId = parseId(payload?.kinopoiskId);
  const imdbId = normalizeImdbId(payload?.imdbId);

  if (!table || !ALLOWED_METADATA_TABLES.has(table) || !itemId || !kinopoiskId) {
    return { status: 400, body: { error: 'Invalid metadata payload' } };
  }

  const { error } = await supabase
    .from(table)
    .update({
      kp_id: kinopoiskId,
      imdb_id: imdbId,
    })
    .eq('id', itemId);

  if (error) throw error;
  return {
    status: 200,
    body: { ok: true, table, itemId, kinopoiskId, imdbId },
  };
}

async function deleteItem(supabase, payload) {
  const table = normalizeTable(payload?.table);
  const id = parseId(payload?.id);
  const posterUrl = typeof payload?.posterUrl === 'string' ? payload.posterUrl : '';

  if (!table || !ALLOWED_DELETE_TABLES.has(table) || !id) {
    return { status: 400, body: { error: 'Invalid delete payload' } };
  }

  const { data, error } = await supabase
    .from(table)
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return { status: 404, body: { error: 'Item not found or delete blocked' } };
  }

  if ((table === 'games' || table === 'Game_Orders') && posterUrl) {
    await deletePosterIfNeeded(supabase, posterUrl);
  }

  return {
    status: 200,
    body: { ok: true, table, id },
  };
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

  let supabase;
  try {
    supabase = createSupabaseServerClient();
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Server configuration error' });
  }

  try {
    const action = String(payload?.action || '').trim().toLowerCase();
    let result;

    if (action === 'update_kinopoisk_metadata') {
      result = await updateKinopoiskMetadata(supabase, payload);
    } else if (action === 'delete_item') {
      result = await deleteItem(supabase, payload);
    } else {
      return res.status(400).json({ error: 'Unsupported action' });
    }

    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Failed to handle media admin action', error);
    return res.status(500).json({ error: error?.message || 'Failed to handle media admin action' });
  }
}

module.exports = handler;
