const { createHash } = require('node:crypto');
const {
  extractBearerToken,
  issueAdminToken,
  verifyAdminToken,
} = require('../lib/admin-session.js');
const {
  createSupabaseServerClient,
  getSupabasePublicKey,
} = require('../lib/supabase-config.js');

const GAME_POSTER_BUCKET = 'game-posters';
const PLACEHOLDER_POSTER_HOST = 'images/placeholder-poster.webp';
const OPENROUTER_CHAT_COMPLETIONS_URL =
  'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL_CHECK_PROMPT =
  'Reply with exactly "ok" and nothing else.';
const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);
const SETTINGS_COLUMNS = new Set([
  'roulette_last_winner',
  'ai_model_statuses',
  'selected_ai_model',
  'selected_ai_model_name',
  'kp_api',
  'victory_volume',
  'lose_volume',
  'spin_volume',
]);
const ADMIN_PLAYER_HISTORY_TABLE = 'admin_player_history';
const MAX_PLAYER_HISTORY = 15;
const HISTORY_CACHE_CONTROL = 'private, max-age=30, must-revalidate';
const TABLE_COLUMNS = {
  movies: new Set([
    'title',
    'original_title',
    'genres',
    'poster',
    'year',
    'rating_numeric',
    'rating_OMDB',
    'kp_id',
    'imdb_id',
    'date',
    'order_by',
    'order_type',
    'rating_sum',
    'rating_count',
    'description',
    'country',
    'actors',
    'director',
    'studios',
    'watch_source',
  ]),
  Movie_Orders: new Set([
    'order_title',
    'order_origin_title',
    'order_year',
    'order_genres',
    'order_poster',
    'order_by',
    'order_type',
    'kinopoisk_rate',
    'kp_id',
    'imdb_id',
    'order_length',
    'description',
    'country',
    'actors',
    'director',
    'studios',
    'plan_date',
    'parents_guide',
    'watch_source',
  ]),
  Game_Orders: new Set([
    'game_title',
    'game_year',
    'game_genres',
    'game_poster',
    'game_order_by',
    'game_order_type',
    'game_mode',
    'description',
    'rawg_rating',
    'metacritic',
    'released',
    'playtime',
    'platforms',
    'developers',
    'publishers',
    'rawg_id',
    'game_plan_date',
    'streams_completed',
  ]),
  games: new Set([
    'title',
    'genres',
    'poster',
    'year',
    'rating_numeric',
    'date',
    'order_by',
    'order_type',
    'game_mode',
    'game_rating_sum',
    'game_rating_count',
    'description',
    'rawg_rating',
    'metacritic',
    'released',
    'playtime',
    'platforms',
    'developers',
    'publishers',
    'rawg_id',
    'studios',
  ]),
};
const ALLOWED_METADATA_TABLES = new Set([
  'movies',
  'Movie_Orders',
  'games',
  'Game_Orders',
]);
const ALLOWED_DELETE_TABLES = new Set([
  'movies',
  'Movie_Orders',
  'games',
  'Game_Orders',
  'movie_suggestions',
]);
const ALLOWED_ACTIONS = [
  'env',
  'verify-admin',
  'settings',
  'users',
  'media-admin',
  'media-items',
  'game-posters',
  'kp-api-selection',
  'check-ai-models',
  'player-history',
];

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

function normalizeManagedTable(value) {
  const table = String(value || '').trim();
  return TABLE_COLUMNS[table] ? table : null;
}

function normalizeImdbId(value) {
  if (value === undefined) return undefined;
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeUserName(value) {
  return String(value || '')
    .trim()
    .slice(0, 255);
}

function normalizeUserType(value) {
  return value === 'games' ? 'games' : 'movies';
}

function pickAllowedSettings(payload) {
  const changes = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (SETTINGS_COLUMNS.has(key)) {
      changes[key] = value;
    }
  }
  return changes;
}

function pickAllowedChanges(table, changes) {
  const allowedColumns = TABLE_COLUMNS[table];
  const sanitized = {};

  for (const [key, value] of Object.entries(changes || {})) {
    if (allowedColumns.has(key)) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

function normalizeAiModels(payload) {
  if (!Array.isArray(payload)) return [];

  return [
    ...new Set(
      payload
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .slice(0, 50)
    ),
  ];
}

function extractOpenRouterError(rawText) {
  if (!rawText) return 'Empty response';

  try {
    const parsed = JSON.parse(rawText);
    const message =
      parsed?.error?.message ||
      parsed?.message ||
      parsed?.detail ||
      parsed?.error ||
      rawText;
    return String(message).slice(0, 300);
  } catch {
    return String(rawText).slice(0, 300);
  }
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

  return { ok: true, payload: verification.payload };
}

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

function normalizeHistoryRowPayload(payload) {
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

async function loadSelectedKinopoiskApi() {
  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('settings')
      .select('kp_api')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Failed to load selected Kinopoisk API', error);
      return 'API 1';
    }

    return data?.kp_api || 'API 1';
  } catch (error) {
    console.error('Supabase configuration error while loading kp_api', error);
    return 'API 1';
  }
}

async function upsertSettingsRow(supabase, changes) {
  const { data, error } = await supabase
    .from('settings')
    .select('id')
    .order('id', { ascending: true })
    .limit(1);

  if (error) throw error;

  const existing = Array.isArray(data) && data.length > 0 ? data[0] : null;

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from('settings')
      .update(changes)
      .eq('id', existing.id);
    if (updateError) throw updateError;

    return { id: existing.id, changes };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('settings')
    .insert(changes)
    .select('id')
    .single();

  if (insertError) throw insertError;

  return { id: inserted?.id || null, changes };
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

async function mutateUsersTable(supabase, payload) {
  const action = String(payload?.action || '')
    .trim()
    .toLowerCase();
  const userName = normalizeUserName(payload?.userName);
  if (!userName) {
    return { status: 400, body: { error: 'Invalid userName' } };
  }

  if (action === 'increment') {
    const key = normalizeUserType(payload?.type);
    const existing = await findUserRow(supabase, userName);

    if (existing) {
      const changes = {
        movies: Number(existing.movies ?? 0) || 0,
        games: Number(existing.games ?? 0) || 0,
      };
      changes[key] += 1;

      const { error } = await supabase
        .from('users')
        .update(changes)
        .eq('user', existing.user);
      if (error) throw error;

      return {
        status: 200,
        body: {
          ok: true,
          deleted: false,
          item: {
            user: existing.user,
            movies: changes.movies,
            games: changes.games,
          },
        },
      };
    }

    const inserted = {
      user: userName,
      movies: key === 'movies' ? 1 : 0,
      games: key === 'games' ? 1 : 0,
    };
    const { error } = await supabase.from('users').insert(inserted);
    if (error) throw error;
    return { status: 200, body: { ok: true, deleted: false, item: inserted } };
  }

  if (action === 'decrement') {
    const key = normalizeUserType(payload?.type);
    const existing = await findUserRow(supabase, userName);
    if (!existing) {
      return { status: 200, body: { ok: true, deleted: false, item: null } };
    }

    const changes = {
      movies: Math.max(0, Number(existing.movies ?? 0) || 0),
      games: Math.max(0, Number(existing.games ?? 0) || 0),
    };
    changes[key] = Math.max(0, changes[key] - 1);

    if (changes.movies === 0 && changes.games === 0) {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('user', existing.user);
      if (error) throw error;
      return {
        status: 200,
        body: { ok: true, deleted: true, item: { user: existing.user } },
      };
    }

    const { error } = await supabase
      .from('users')
      .update(changes)
      .eq('user', existing.user);
    if (error) throw error;

    return {
      status: 200,
      body: {
        ok: true,
        deleted: false,
        item: {
          user: existing.user,
          movies: changes.movies,
          games: changes.games,
        },
      },
    };
  }

  if (action === 'delete') {
    const existing = await findUserRow(supabase, userName);
    if (!existing) {
      return { status: 200, body: { ok: true, deleted: false, item: null } };
    }

    const { error } = await supabase
      .from('users')
      .delete()
      .eq('user', existing.user);
    if (error) throw error;

    return {
      status: 200,
      body: { ok: true, deleted: true, item: { user: existing.user } },
    };
  }

  return { status: 400, body: { error: 'Unsupported action' } };
}

async function createItem(supabase, payload) {
  const table = normalizeManagedTable(payload?.table);
  if (!table) {
    return { status: 400, body: { error: 'Invalid table' } };
  }

  const changes = pickAllowedChanges(table, payload?.changes);
  if (!Object.keys(changes).length) {
    return { status: 400, body: { error: 'No allowed fields provided' } };
  }

  const { data, error } = await supabase
    .from(table)
    .insert(changes)
    .select()
    .single();

  if (error) throw error;
  return { status: 200, body: { ok: true, row: data } };
}

async function updateItem(supabase, payload) {
  const table = normalizeManagedTable(payload?.table);
  const id = parseId(payload?.id);
  if (!table || !id) {
    return { status: 400, body: { error: 'Invalid update payload' } };
  }

  const changes = pickAllowedChanges(table, payload?.changes);
  if (!Object.keys(changes).length) {
    return { status: 400, body: { error: 'No allowed fields provided' } };
  }

  const { data, error } = await supabase
    .from(table)
    .update(changes)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return { status: 200, body: { ok: true, row: data } };
}

async function promoteMovieOrder(supabase, payload) {
  const orderId = parseId(payload?.orderId);
  const movieChanges = pickAllowedChanges('movies', payload?.movie);
  if (!orderId || !Object.keys(movieChanges).length) {
    return {
      status: 400,
      body: { error: 'Invalid movie order promotion payload' },
    };
  }

  const { data: pendingRatingsData, error: pendingRatingsError } =
    await supabase
      .from('ratings')
      .select('id, rating')
      .eq('movie_id', orderId)
      .eq('category', 'MovieOrder');
  if (pendingRatingsError) throw pendingRatingsError;

  const pendingRatings = Array.isArray(pendingRatingsData)
    ? pendingRatingsData
    : [];
  const pendingRatingSum = pendingRatings.reduce(
    (sum, row) => sum + Number(row?.rating ?? 0),
    0
  );
  const pendingRatingCount = pendingRatings.length;

  movieChanges.rating_sum = pendingRatingSum;
  movieChanges.rating_count = pendingRatingCount;

  const { data: insertedMovie, error: insertError } = await supabase
    .from('movies')
    .insert(movieChanges)
    .select()
    .single();
  if (insertError) throw insertError;

  if (pendingRatingCount > 0) {
    const { error: moveRatingsError } = await supabase
      .from('ratings')
      .update({
        movie_id: insertedMovie.id,
        category: 'Movie',
        title: movieChanges.title || null,
      })
      .eq('movie_id', orderId)
      .eq('category', 'MovieOrder');
    if (moveRatingsError) throw moveRatingsError;
  }

  const { error: deleteOrderError } = await supabase
    .from('Movie_Orders')
    .delete()
    .eq('id', orderId);
  if (deleteOrderError) throw deleteOrderError;

  return {
    status: 200,
    body: {
      ok: true,
      row: insertedMovie,
      pendingRatingSum,
      pendingRatingCount,
    },
  };
}

async function promoteGameOrder(supabase, payload) {
  const orderId = parseId(payload?.orderId);
  const gameChanges = pickAllowedChanges('games', payload?.game);
  if (!orderId || !Object.keys(gameChanges).length) {
    return {
      status: 400,
      body: { error: 'Invalid game order promotion payload' },
    };
  }

  const { data: insertedGame, error: insertError } = await supabase
    .from('games')
    .insert(gameChanges)
    .select()
    .single();
  if (insertError) throw insertError;

  const { error: deleteOrderError } = await supabase
    .from('Game_Orders')
    .delete()
    .eq('id', orderId);
  if (deleteOrderError) throw deleteOrderError;

  return {
    status: 200,
    body: { ok: true, row: insertedGame },
  };
}

async function updateKinopoiskMetadata(supabase, payload) {
  const table = normalizeTable(payload?.table);
  const itemId = parseId(payload?.itemId);
  const kinopoiskId = parseId(payload?.kinopoiskId);
  const imdbId = normalizeImdbId(payload?.imdbId);

  if (
    !table ||
    !ALLOWED_METADATA_TABLES.has(table) ||
    !itemId ||
    !kinopoiskId
  ) {
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

  if (error) throw error;
}

async function deleteItem(supabase, payload) {
  const table = normalizeTable(payload?.table);
  const id = parseId(payload?.id);
  const posterUrl =
    typeof payload?.posterUrl === 'string' ? payload.posterUrl : '';

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

  return { status: 200, body: { ok: true, table, id } };
}

function buildGamePosterFileName(title) {
  const safeTitle = (title || 'game')
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${safeTitle || 'game'}-${suffix}`;
}

function getExtensionFromContentType(contentType) {
  if (!contentType || !contentType.includes('/')) return 'jpg';
  const ext = contentType.split('/')[1].toLowerCase();
  return ext === 'jpeg' ? 'jpg' : ext;
}

function decodeDataUrl(value) {
  const match = String(value || '').match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;
  const [, contentType, base64Payload] = match;
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new Error('Unsupported poster content type');
  }
  return {
    contentType,
    buffer: Buffer.from(base64Payload, 'base64'),
  };
}

async function fetchRemotePoster(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Poster fetch failed with ${response.status}`);
  }
  const contentType = response.headers.get('content-type') || 'image/jpeg';
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new Error('Unsupported remote poster content type');
  }
  return {
    contentType,
    buffer: Buffer.from(await response.arrayBuffer()),
  };
}

async function resolvePosterSource(source) {
  if (!source || typeof source !== 'string') {
    throw new Error('Missing poster source');
  }

  if (source.includes(PLACEHOLDER_POSTER_HOST)) {
    return null;
  }

  if (source.startsWith('data:')) {
    return decodeDataUrl(source);
  }

  if (source.startsWith('http://') || source.startsWith('https://')) {
    return fetchRemotePoster(source);
  }

  throw new Error('Unsupported poster source');
}

async function handleEnv(req, res) {
  let password;
  try {
    password =
      req.headers['x-admin-password'] ||
      req.query.password ||
      req.body?.password ||
      (typeof req.body === 'string'
        ? JSON.parse(req.body || '{}').password
        : undefined);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  let isAdmin = false;
  const authToken = extractBearerToken(req.headers.authorization);

  if (authToken) {
    try {
      const verification = verifyAdminToken(authToken);
      if (!verification.valid) {
        return res.status(401).json({
          error: verification.error || 'Invalid token',
          expired: Boolean(verification.expired),
        });
      }
      isAdmin = true;
    } catch (err) {
      console.error('Admin token verification error', err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  if (!isAdmin && password) {
    if (password !== process.env.EDIT_PASSWORD) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    isAdmin = true;
  }

  const supabasePublicKey = getSupabasePublicKey();
  if (!supabasePublicKey) {
    return res.status(500).json({ error: 'Missing SUPABASE_PUBLIC_KEY' });
  }

  const env = {
    SUPABASE_PUBLIC_KEY: supabasePublicKey,
    isAdmin,
    TMDB_ENABLED: Boolean(process.env.TMDB_API),
  };

  if (isAdmin) {
    env.KINOPOISK_API_SELECTED = await loadSelectedKinopoiskApi();
    env.KINOPOISK_API_OPTIONS = [
      process.env.KINOPOISK_API_KEY ? 'API 1' : null,
      process.env.KINOPOISK_API_KEY2 ? 'API 2' : null,
      process.env.KINOPOISK_API_KEY3 ? 'API 3' : null,
    ].filter(Boolean);
    env.RAWG_ENABLED = Boolean(process.env.RAWG_API_KEY);

    if (process.env.TWITCH_CLIENT_ID) {
      env.TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
    }
  }

  return res.status(200).json(env);
}

function getTokenExpiresAt(payload) {
  return payload && typeof payload.exp === 'number'
    ? new Date(payload.exp).toISOString()
    : null;
}

function handleVerifyAdmin(req, res) {
  const method = (req.method || '').toUpperCase();

  if (method === 'GET') {
    try {
      const token = extractBearerToken(req.headers.authorization);
      if (!token) {
        return res.status(401).json({ ok: false, error: 'Missing token' });
      }

      const result = verifyAdminToken(token);
      if (!result.valid) {
        return res.status(401).json({
          ok: false,
          error: result.error || 'Invalid token',
          expired: Boolean(result.expired),
        });
      }

      return res.status(200).json({
        ok: true,
        expiresAt: getTokenExpiresAt(result.payload),
      });
    } catch (err) {
      console.error('Admin token verification error', err);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  }

  if (method === 'POST') {
    let password;
    try {
      password =
        req.body?.password ||
        (typeof req.body === 'string'
          ? JSON.parse(req.body || '{}').password
          : undefined);
    } catch {
      return res.status(401).json({ ok: false, error: 'Invalid password' });
    }

    if (password !== process.env.EDIT_PASSWORD) {
      return res.status(401).json({ ok: false, error: 'Invalid password' });
    }

    try {
      const { token, payload } = issueAdminToken();
      return res.status(200).json({
        ok: true,
        token,
        expiresAt: getTokenExpiresAt(payload),
      });
    } catch (err) {
      console.error('Admin token issue error', err);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  }

  if (method === 'PUT') {
    try {
      const token = extractBearerToken(req.headers.authorization);
      if (!token) {
        return res.status(401).json({ ok: false, error: 'Missing token' });
      }

      const result = verifyAdminToken(token);
      if (!result.valid) {
        return res.status(401).json({
          ok: false,
          error: result.error || 'Invalid token',
          expired: Boolean(result.expired),
        });
      }

      const { token: refreshedToken, payload } = issueAdminToken();
      return res.status(200).json({
        ok: true,
        token: refreshedToken,
        expiresAt: getTokenExpiresAt(payload),
      });
    } catch (err) {
      console.error('Admin token refresh error', err);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST', 'PUT']);
  return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
}

async function handleSettings(req, res) {
  const method = (req.method || '').toUpperCase();
  if (method !== 'PATCH') {
    res.setHeader('Allow', ['PATCH']);
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

  const changes = pickAllowedSettings(payload);
  if (!Object.keys(changes).length) {
    return res
      .status(400)
      .json({ error: 'No allowed settings fields provided' });
  }

  try {
    const supabase = createSupabaseServerClient();
    const result = await upsertSettingsRow(supabase, changes);
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error('Failed to persist settings', error);
    return res.status(500).json({
      error: error?.message || 'Failed to persist settings',
    });
  }
}

async function checkOpenRouterModel(model, apiKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://pupsik-tv.vercel.app',
        'X-Title': 'PupsikTV AI Model Status Check',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: OPENROUTER_MODEL_CHECK_PROMPT,
          },
        ],
        temperature: 0,
        max_tokens: 5,
      }),
      signal: controller.signal,
    });

    const rawText = await response.text().catch(() => '');
    const normalizedRaw = response.ok
      ? 'Model responded successfully'
      : extractOpenRouterError(rawText);

    return {
      status: response.ok
        ? 'active'
        : response.status === 429
          ? 'rate_limited'
          : 'unavailable',
      http_status: response.status,
      provider: 'OpenRouter',
      raw: normalizedRaw,
    };
  } catch (error) {
    const isAbort = error?.name === 'AbortError';
    return {
      status: 'unavailable',
      http_status: isAbort ? 504 : 500,
      provider: 'OpenRouter',
      raw: isAbort
        ? 'OpenRouter request timed out'
        : String(error?.message || error || 'Unknown error').slice(0, 300),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function handleCheckAiModels(req, res) {
  const method = (req.method || '').toUpperCase();
  if (method !== 'POST') {
    res.setHeader('Allow', ['POST']);
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

  const models = normalizeAiModels(payload?.models);
  if (!models.length) {
    return res.status(400).json({ error: 'No models provided' });
  }

  const apiKey = process.env.OPENROUTER_API;
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing OPENROUTER_API' });
  }

  const statuses = {};
  for (const model of models) {
    statuses[model] = await checkOpenRouterModel(model, apiKey);
  }

  return res.status(200).json({ ok: true, statuses });
}

async function handleKpApiSelection(req, res) {
  const method = (req.method || '').toUpperCase();
  if (method !== 'PATCH') {
    res.setHeader('Allow', ['PATCH']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const access = verifyAdminRequest(req);
  if (!access.ok) {
    return res.status(access.status).json({
      error: access.error,
      expired: access.expired || false,
    });
  }

  let payload;
  try {
    payload = parseBody(req);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const kpApi =
    payload?.kp_api === 'API 2' || payload?.kp_api === 'API 3'
      ? payload.kp_api
      : 'API 1';

  try {
    const supabase = createSupabaseServerClient();
    const result = await upsertSettingsRow(supabase, { kp_api: kpApi });
    return res.status(200).json({ ok: true, kp_api: kpApi, id: result.id });
  } catch (error) {
    console.error('Failed to update Kinopoisk API selection', error);
    return res
      .status(500)
      .json({ error: 'Failed to update Kinopoisk API selection' });
  }
}

async function handleUsers(req, res) {
  const method = (req.method || '').toUpperCase();
  if (method !== 'POST') {
    res.setHeader('Allow', ['POST']);
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

  try {
    const supabase = createSupabaseServerClient();
    const result = await mutateUsersTable(supabase, payload);
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Failed to mutate users table', error);
    return res.status(500).json({
      error: error?.message || 'Failed to mutate users table',
    });
  }
}

async function handleMediaAdmin(req, res) {
  const method = (req.method || '').toUpperCase();
  if (method !== 'POST') {
    res.setHeader('Allow', ['POST']);
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
    return res
      .status(500)
      .json({ error: error?.message || 'Server configuration error' });
  }

  try {
    const action = String(payload?.action || '')
      .trim()
      .toLowerCase();
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
    return res.status(500).json({
      error: error?.message || 'Failed to handle media admin action',
    });
  }
}

async function handleMediaItems(req, res) {
  const method = (req.method || '').toUpperCase();
  if (method !== 'POST') {
    res.setHeader('Allow', ['POST']);
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
    return res
      .status(500)
      .json({ error: error?.message || 'Server configuration error' });
  }

  try {
    const action = String(payload?.action || '')
      .trim()
      .toLowerCase();
    let result;

    if (action === 'create_item') {
      result = await createItem(supabase, payload);
    } else if (action === 'update_item') {
      result = await updateItem(supabase, payload);
    } else if (action === 'promote_movie_order') {
      result = await promoteMovieOrder(supabase, payload);
    } else if (action === 'promote_game_order') {
      result = await promoteGameOrder(supabase, payload);
    } else {
      return res.status(400).json({ error: 'Unsupported action' });
    }

    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Failed to handle media item action', error);
    return res.status(500).json({
      error: error?.message || 'Failed to handle media item action',
    });
  }
}

async function handleGamePosters(req, res) {
  const method = (req.method || '').toUpperCase();
  if (method !== 'POST' && method !== 'DELETE') {
    res.setHeader('Allow', ['POST', 'DELETE']);
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

  if (method === 'DELETE') {
    const posterUrl =
      typeof payload?.posterUrl === 'string' ? payload.posterUrl : '';
    const path = getGamePosterStoragePath(posterUrl);
    if (!path) {
      return res.status(200).json({ ok: true, deleted: false });
    }

    try {
      const supabase = createSupabaseServerClient();
      const { error } = await supabase.storage
        .from(GAME_POSTER_BUCKET)
        .remove([path]);
      if (error) throw error;
      return res.status(200).json({ ok: true, deleted: true, path });
    } catch (error) {
      console.error('Failed to delete game poster', error);
      return res.status(500).json({
        error: error?.message || 'Failed to delete game poster',
      });
    }
  }

  const source = typeof payload?.source === 'string' ? payload.source : '';
  const title = typeof payload?.title === 'string' ? payload.title : 'game';
  const folder =
    typeof payload?.folder === 'string' && payload.folder.trim()
      ? payload.folder.trim()
      : 'orders';

  let resolved;
  try {
    resolved = await resolvePosterSource(source);
  } catch (error) {
    return res.status(400).json({
      error: error?.message || 'Invalid poster source',
    });
  }

  if (!resolved) {
    return res.status(200).json({ ok: true, publicUrl: source || null });
  }

  try {
    const supabase = createSupabaseServerClient();
    const ext = getExtensionFromContentType(resolved.contentType);
    const path = `${folder}/${buildGamePosterFileName(title)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(GAME_POSTER_BUCKET)
      .upload(path, resolved.buffer, {
        contentType: resolved.contentType,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from(GAME_POSTER_BUCKET)
      .getPublicUrl(path);

    return res.status(200).json({
      ok: true,
      publicUrl: data?.publicUrl || null,
      path,
    });
  } catch (error) {
    console.error('Failed to upload game poster', error);
    return res.status(500).json({
      error: error?.message || 'Failed to upload game poster',
    });
  }
}

async function getPlayerHistory(supabase, req, res) {
  const { data, error } = await supabase
    .from(ADMIN_PLAYER_HISTORY_TABLE)
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

async function savePlayerHistoryItem(supabase, req, res) {
  let payload;
  try {
    payload = parseBody(req);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const normalized = normalizeHistoryRowPayload(payload || {});
  if (!normalized) {
    return res.status(400).json({ error: 'Invalid kp_id' });
  }

  const { error: deleteError } = await supabase
    .from(ADMIN_PLAYER_HISTORY_TABLE)
    .delete()
    .eq('kp_id', normalized.kp_id);
  if (deleteError) {
    console.error('Failed to dedupe admin player history', deleteError);
    return res.status(500).json({ error: 'Failed to save history' });
  }

  const { error: insertError } = await supabase
    .from(ADMIN_PLAYER_HISTORY_TABLE)
    .insert(normalized);
  if (insertError) {
    console.error('Failed to insert admin player history', insertError);
    return res.status(500).json({ error: 'Failed to save history' });
  }

  const { data: tailRows, error: tailError } = await supabase
    .from(ADMIN_PLAYER_HISTORY_TABLE)
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
      .from(ADMIN_PLAYER_HISTORY_TABLE)
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

  return getPlayerHistory(supabase, req, res);
}

async function deletePlayerHistoryItem(supabase, req, res) {
  const payload = (() => {
    try {
      return parseBody(req);
    } catch {
      return undefined;
    }
  })();

  const rawId = req.query?.kp_id ?? payload?.kp_id;
  const kpId = Number.parseInt(rawId, 10);
  if (!Number.isFinite(kpId)) {
    return res.status(400).json({ error: 'Invalid kp_id' });
  }

  const { error } = await supabase
    .from(ADMIN_PLAYER_HISTORY_TABLE)
    .delete()
    .eq('kp_id', kpId);
  if (error) {
    console.error('Failed to delete admin player history row', error);
    return res.status(500).json({ error: 'Failed to delete history item' });
  }

  return getPlayerHistory(supabase, req, res);
}

async function handlePlayerHistory(req, res) {
  const method = (req.method || '').toUpperCase();
  if (!['GET', 'POST', 'DELETE'].includes(method)) {
    res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const access = verifyAdminRequest(req);
  if (!access.ok) {
    return res
      .status(access.status)
      .json({ error: access.error, expired: access.expired || false });
  }

  let supabase;
  try {
    supabase = createSupabaseServerClient();
  } catch (error) {
    console.error('Supabase configuration error', error);
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (method === 'GET') {
    return getPlayerHistory(supabase, req, res);
  }
  if (method === 'DELETE') {
    return deletePlayerHistoryItem(supabase, req, res);
  }
  return savePlayerHistoryItem(supabase, req, res);
}

module.exports = async function handler(req, res) {
  const action = String(req.query?.action || '')
    .trim()
    .toLowerCase();

  if (!ALLOWED_ACTIONS.includes(action)) {
    return res.status(400).json({
      error: 'Unknown admin action',
      allowedActions: ALLOWED_ACTIONS,
    });
  }

  if (action === 'env') {
    return handleEnv(req, res);
  }
  if (action === 'verify-admin') {
    return handleVerifyAdmin(req, res);
  }
  if (action === 'settings') {
    return handleSettings(req, res);
  }
  if (action === 'kp-api-selection') {
    return handleKpApiSelection(req, res);
  }
  if (action === 'check-ai-models') {
    return handleCheckAiModels(req, res);
  }
  if (action === 'users') {
    return handleUsers(req, res);
  }
  if (action === 'media-admin') {
    return handleMediaAdmin(req, res);
  }
  if (action === 'media-items') {
    return handleMediaItems(req, res);
  }
  if (action === 'player-history') {
    return handlePlayerHistory(req, res);
  }

  return handleGamePosters(req, res);
};
