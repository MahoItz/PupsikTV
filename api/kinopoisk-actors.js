const { createClient } = require('@supabase/supabase-js');
const {
  extractBearerToken,
  verifyAdminToken,
} = require('../lib/admin-session.js');

const SUPABASE_URL = 'https://shwekurmzyzivtworjup.supabase.co';
const TABLE_NAME = 'kinopoisk_actors';
const SELECT_FIELDS =
  'id, kinopoisk_film_id, staff_id, actor_name, poster_url, profession_text, created_at, updated_at';
const ALLOWED_METHODS = ['GET', 'POST'];
const PG_UNDEFINED_TABLE = '42P01';
const PG_INSUFFICIENT_PRIVILEGE = '42501';

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
    };
  }

  return { ok: true };
}

function parseFilmId(value) {
  const filmId = Number.parseInt(value, 10);
  return Number.isFinite(filmId) ? filmId : null;
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    return JSON.parse(req.body || '{}');
  }
  return req.body;
}

function normalizeString(value, maxLength) {
  return String(value || '')
    .trim()
    .slice(0, maxLength);
}

function isMissingTableError(error) {
  return String(error?.code || '') === PG_UNDEFINED_TABLE;
}

function isPermissionError(error) {
  return String(error?.code || '') === PG_INSUFFICIENT_PRIVILEGE;
}

function isActorRole(person) {
  const key = String(person?.professionKey || '')
    .trim()
    .toUpperCase();
  if (key === 'ACTOR') return true;
  const text = String(person?.professionText || person?.profession_text || '')
    .trim()
    .toLowerCase();
  return (
    text.includes('актер') || text.includes('актёр') || text.includes('actor')
  );
}

function normalizeActorRows(filmId, staff) {
  if (!Number.isFinite(filmId) || !Array.isArray(staff)) {
    return [];
  }

  const rows = [];
  const seen = new Set();

  staff.forEach((person) => {
    if (!isActorRole(person)) return;

    const staffId = parseFilmId(person?.staffId ?? person?.staff_id);
    const actorName = normalizeString(
      person?.nameRu || person?.nameEn || person?.actor_name,
      300
    );
    const posterUrl = normalizeString(
      person?.posterUrl || person?.poster_url,
      1000
    );
    const professionText = normalizeString(
      person?.professionText || person?.profession_text,
      150
    );

    if (!Number.isFinite(staffId) || !actorName) return;

    const dedupeKey = `${filmId}:${staffId}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    rows.push({
      kinopoisk_film_id: filmId,
      staff_id: staffId,
      actor_name: actorName,
      poster_url: posterUrl || null,
      profession_text: professionText || null,
    });
  });

  return rows;
}

async function listActors(supabase, req, res) {
  const filmId = parseFilmId(req.query?.filmId);
  if (!Number.isFinite(filmId)) {
    return res.status(400).json({ error: 'filmId is required' });
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select(SELECT_FIELDS)
    .eq('kinopoisk_film_id', filmId)
    .order('actor_name', { ascending: true });

  if (error) {
    console.error('Failed to load Kinopoisk actors', error);
    if (isMissingTableError(error)) {
      return res.status(200).json({
        items: [],
        setupRequired: true,
        message:
          'Таблица kinopoisk_actors ещё не создана. Примените SQL-миграцию для фото актёров.',
      });
    }
    if (isPermissionError(error)) {
      return res.status(500).json({
        error:
          'Недостаточно прав для чтения kinopoisk_actors. Для server API нужен SUPABASE_SERVICE_ROLE_KEY либо отдельные RLS policy.',
      });
    }
    return res.status(500).json({ error: 'Failed to load actors' });
  }

  return res.status(200).json({ items: data || [] });
}

async function saveActors(supabase, req, res) {
  const auth = verifyAdminRequest(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  let payload;
  try {
    payload = parseBody(req);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const filmId = parseFilmId(payload?.filmId);
  const rows = normalizeActorRows(filmId, payload?.staff);

  if (!Number.isFinite(filmId)) {
    return res.status(400).json({ error: 'filmId is required' });
  }

  if (!rows.length) {
    return res.status(200).json({ items: [] });
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .upsert(rows, {
      onConflict: 'kinopoisk_film_id,staff_id',
      ignoreDuplicates: false,
    })
    .select(SELECT_FIELDS);

  if (error) {
    console.error('Failed to save Kinopoisk actors', error);
    if (isMissingTableError(error)) {
      return res.status(500).json({
        error:
          'Таблица kinopoisk_actors ещё не создана. Примените SQL-миграцию для фото актёров.',
      });
    }
    if (isPermissionError(error)) {
      return res.status(500).json({
        error:
          'Недостаточно прав для записи в kinopoisk_actors. Добавьте SUPABASE_SERVICE_ROLE_KEY в серверные env либо настройте RLS policy.',
      });
    }
    return res.status(500).json({ error: 'Failed to save actors' });
  }

  return res.status(200).json({ items: data || rows });
}

module.exports = async function handler(req, res) {
  if (!ALLOWED_METHODS.includes(req.method)) {
    res.setHeader('Allow', ALLOWED_METHODS.join(', '));
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let supabase;
  try {
    supabase = createSupabaseClient();
  } catch (error) {
    console.error('Failed to initialize Supabase client', error);
    return res.status(500).json({ error: 'Supabase is not configured' });
  }

  if (req.method === 'GET') {
    return listActors(supabase, req, res);
  }

  return saveActors(supabase, req, res);
};
