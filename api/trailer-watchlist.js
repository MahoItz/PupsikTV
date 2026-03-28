const { createClient } = require('@supabase/supabase-js');
const {
  extractBearerToken,
  verifyAdminToken,
} = require('../lib/admin-session.js');

const SUPABASE_URL = 'https://shwekurmzyzivtworjup.supabase.co';
const TABLE_NAME = 'trailer_watchlist';
const ALLOWED_METHODS = ['GET', 'POST', 'PATCH', 'DELETE'];
const VALID_STATUSES = new Set(['planned', 'watched']);
const PG_UNDEFINED_TABLE = '42P01';
const PG_UNDEFINED_COLUMN = '42703';
const PG_INSUFFICIENT_PRIVILEGE = '42501';
const SELECT_FIELDS =
  'id, title, youtube_url, youtube_video_id, kinopoisk_id, year, poster, status, streamer_rating, viewer_rating_sum, viewer_rating_count, kinopoisk_data, kinopoisk_cached_at, watched_at, created_at, updated_at';

function createSupabaseClient() {
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!supabaseKey) {
    throw new Error('Missing SUPABASE key');
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

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    return JSON.parse(req.body || '{}');
  }
  return req.body;
}

function parseId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isFinite(id) ? id : null;
}

function parseYear(value) {
  if (value === null || value === undefined || value === '') return null;
  const year = Number.parseInt(value, 10);
  return Number.isFinite(year) ? year : null;
}

function parseKinopoiskId(value) {
  if (value === null || value === undefined || value === '') return null;
  const kpId = Number.parseInt(value, 10);
  return Number.isFinite(kpId) ? kpId : null;
}

function parseRating(value) {
  if (value === null || value === undefined || value === '') return null;
  const rating = Number.parseFloat(value);
  if (!Number.isFinite(rating)) return null;
  return Math.min(11, Math.max(0, Math.round(rating * 10) / 10));
}

function normalizeStatus(value, fallback = 'planned') {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase();
  return VALID_STATUSES.has(normalized) ? normalized : fallback;
}

function normalizeString(value, maxLength) {
  return String(value || '')
    .trim()
    .slice(0, maxLength);
}

function normalizeJsonObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value;
}

function parseIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isMissingTableError(error) {
  return String(error?.code || '') === PG_UNDEFINED_TABLE;
}

function isMissingColumnError(error) {
  return String(error?.code || '') === PG_UNDEFINED_COLUMN;
}

function isPermissionError(error) {
  return String(error?.code || '') === PG_INSUFFICIENT_PRIVILEGE;
}

function normalizeCreatePayload(payload) {
  const title = normalizeString(payload?.title, 300);
  const youtubeUrl = normalizeString(payload?.youtube_url, 1000);
  const videoId = normalizeString(payload?.youtube_video_id, 32);

  if (!title || !youtubeUrl || !videoId) {
    return null;
  }

  return {
    title,
    youtube_url: youtubeUrl,
    youtube_video_id: videoId,
    kinopoisk_id: parseKinopoiskId(payload?.kinopoisk_id),
    year: parseYear(payload?.year),
    poster: normalizeString(payload?.poster, 1000) || null,
    status: normalizeStatus(payload?.status, 'planned'),
    streamer_rating: parseRating(payload?.streamer_rating),
    kinopoisk_data: normalizeJsonObject(payload?.kinopoisk_data),
    kinopoisk_cached_at: parseIsoDate(payload?.kinopoisk_cached_at),
    watched_at: payload?.watched_at
      ? new Date(payload.watched_at).toISOString()
      : null,
  };
}

function normalizePatchPayload(payload) {
  const changes = {};

  if (Object.prototype.hasOwnProperty.call(payload, 'title')) {
    const title = normalizeString(payload.title, 300);
    if (!title) return null;
    changes.title = title;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'youtube_url')) {
    const youtubeUrl = normalizeString(payload.youtube_url, 1000);
    if (!youtubeUrl) return null;
    changes.youtube_url = youtubeUrl;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'youtube_video_id')) {
    const videoId = normalizeString(payload.youtube_video_id, 32);
    if (!videoId) return null;
    changes.youtube_video_id = videoId;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'kinopoisk_id')) {
    changes.kinopoisk_id = parseKinopoiskId(payload.kinopoisk_id);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'year')) {
    changes.year = parseYear(payload.year);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'poster')) {
    changes.poster = normalizeString(payload.poster, 1000) || null;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'streamer_rating')) {
    changes.streamer_rating = parseRating(payload.streamer_rating);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'kinopoisk_data')) {
    changes.kinopoisk_data = normalizeJsonObject(payload.kinopoisk_data);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'kinopoisk_cached_at')) {
    changes.kinopoisk_cached_at = parseIsoDate(payload.kinopoisk_cached_at);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
    const status = normalizeStatus(payload.status, 'planned');
    changes.status = status;
    if (
      status === 'watched' &&
      !Object.prototype.hasOwnProperty.call(payload, 'watched_at')
    ) {
      changes.watched_at = new Date().toISOString();
    }
    if (
      status === 'planned' &&
      !Object.prototype.hasOwnProperty.call(payload, 'watched_at')
    ) {
      changes.watched_at = null;
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'watched_at')) {
    changes.watched_at = payload.watched_at
      ? new Date(payload.watched_at).toISOString()
      : null;
  }

  return changes;
}

async function listTrailers(supabase, res, options = {}) {
  let query = supabase
    .from(TABLE_NAME)
    .select(SELECT_FIELDS)
    .order('created_at', { ascending: false });

  if (!options.admin) {
    query = query.eq('status', 'watched');
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to load trailer watchlist', error);
    if (isMissingTableError(error)) {
      return res.status(200).json({
        items: [],
        setupRequired: true,
        message:
          'Таблица trailer_watchlist ещё не создана. Примените SQL-миграцию для страницы трейлеров.',
      });
    }
    if (isMissingColumnError(error)) {
      return res.status(200).json({
        items: [],
        setupRequired: true,
        message:
          'В trailer_watchlist не хватает колонок kinopoisk_data и kinopoisk_cached_at для кэша карточки фильма.',
      });
    }
    if (isPermissionError(error)) {
      return res.status(500).json({
        error:
          'Недостаточно прав для чтения trailer_watchlist. Для admin API нужен SUPABASE_SERVICE_ROLE_KEY либо отдельные RLS policy.',
        code: error.code || null,
      });
    }
    return res.status(500).json({ error: 'Failed to load trailer watchlist' });
  }

  return res.status(200).json({ items: data || [] });
}

async function createTrailer(supabase, req, res) {
  let payload;
  try {
    payload = parseBody(req);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const normalized = normalizeCreatePayload(payload || {});
  if (!normalized) {
    return res.status(400).json({ error: 'Invalid trailer payload' });
  }

  if (normalized.status === 'watched' && !normalized.watched_at) {
    normalized.watched_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert(normalized)
    .select(SELECT_FIELDS)
    .single();

  if (error) {
    console.error('Failed to create trailer', error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        error:
          'Таблица trailer_watchlist ещё не создана. Примените SQL-миграцию для страницы трейлеров.',
        setupRequired: true,
      });
    }
    if (isMissingColumnError(error)) {
      return res.status(503).json({
        error:
          'В trailer_watchlist не хватает колонок kinopoisk_data и kinopoisk_cached_at для кэша карточки фильма.',
        setupRequired: true,
      });
    }
    if (isPermissionError(error)) {
      return res.status(500).json({
        error:
          'Недостаточно прав для записи в trailer_watchlist. Добавьте SUPABASE_SERVICE_ROLE_KEY в серверные env либо настройте RLS policy для insert/update/delete.',
        code: error.code || null,
      });
    }
    return res.status(500).json({ error: 'Failed to create trailer' });
  }

  return res.status(201).json({ item: data });
}

async function updateTrailer(supabase, req, res) {
  let payload;
  try {
    payload = parseBody(req);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const id = parseId(payload?.id ?? req.query?.id);
  if (!id) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const changes = normalizePatchPayload(payload || {});
  if (!changes) {
    return res.status(400).json({ error: 'Invalid update payload' });
  }

  if (!Object.keys(changes).length) {
    return res.status(400).json({ error: 'No changes provided' });
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update(changes)
    .eq('id', id)
    .select(SELECT_FIELDS)
    .single();

  if (error) {
    console.error('Failed to update trailer', error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        error:
          'Таблица trailer_watchlist ещё не создана. Примените SQL-миграцию для страницы трейлеров.',
        setupRequired: true,
      });
    }
    if (isMissingColumnError(error)) {
      return res.status(503).json({
        error:
          'В trailer_watchlist не хватает колонок kinopoisk_data и kinopoisk_cached_at для кэша карточки фильма.',
        setupRequired: true,
      });
    }
    if (isPermissionError(error)) {
      return res.status(500).json({
        error:
          'Недостаточно прав для обновления trailer_watchlist. Добавьте SUPABASE_SERVICE_ROLE_KEY в серверные env либо настройте RLS policy для insert/update/delete.',
        code: error.code || null,
      });
    }
    return res.status(500).json({ error: 'Failed to update trailer' });
  }

  return res.status(200).json({ item: data });
}

async function deleteTrailer(supabase, req, res) {
  const payload = (() => {
    try {
      return parseBody(req);
    } catch {
      return undefined;
    }
  })();

  const id = parseId(req.query?.id ?? payload?.id);
  if (!id) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const { error } = await supabase.from(TABLE_NAME).delete().eq('id', id);
  if (error) {
    console.error('Failed to delete trailer', error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        error:
          'Таблица trailer_watchlist ещё не создана. Примените SQL-миграцию для страницы трейлеров.',
        setupRequired: true,
      });
    }
    if (isPermissionError(error)) {
      return res.status(500).json({
        error:
          'Недостаточно прав для удаления из trailer_watchlist. Добавьте SUPABASE_SERVICE_ROLE_KEY в серверные env либо настройте RLS policy для insert/update/delete.',
        code: error.code || null,
      });
    }
    return res.status(500).json({ error: 'Failed to delete trailer' });
  }

  return res.status(200).json({ ok: true });
}

async function handler(req, res) {
  const method = (req.method || '').toUpperCase();
  if (!ALLOWED_METHODS.includes(method)) {
    res.setHeader('Allow', ALLOWED_METHODS);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let supabase;
  try {
    supabase = createSupabaseClient();
  } catch (error) {
    console.error('Supabase configuration error', error);
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (method === 'GET') {
    const access = verifyAdminRequest(req);
    return listTrailers(supabase, res, { admin: access.ok });
  }

  const access = verifyAdminRequest(req);
  if (!access.ok) {
    return res
      .status(access.status)
      .json({ error: access.error, expired: access.expired || false });
  }

  if (method === 'POST') {
    return createTrailer(supabase, req, res);
  }

  if (method === 'PATCH') {
    return updateTrailer(supabase, req, res);
  }

  return deleteTrailer(supabase, req, res);
}

module.exports = handler;
