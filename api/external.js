const {
  extractBearerToken,
  verifyAdminToken,
} = require('../lib/admin-session.js');
const { createSupabaseServerClient } = require('../lib/supabase-config.js');

const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';
const ALLOWED_HOST_SUFFIXES = [
  'steamgriddb.com',
  'rawg.io',
  'media.rawg.io',
  'images.boosty.to',
];
const ALLOWED_PROVIDERS = [
  'poster-proxy',
  'steamgriddb',
  'tmdb',
  'kinopoisk',
  'rawg',
  'igdb',
];

let igdbAccessToken = null;
let igdbAccessTokenExpiresAt = 0;

function normalizeIgdbCoverUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return null;
  const normalized = url.trim().replace(/^http:/, 'https:');
  return normalized.startsWith('//') ? `https:${normalized}` : normalized;
}

function toIgdbTimeMinutes(seconds) {
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds / 60) : null;
}

function normalizeIgdbGame(game, timeToBeat = null) {
  const released = Number.isFinite(game?.first_release_date)
    ? new Date(game.first_release_date * 1000).toISOString().slice(0, 10)
    : null;
  const companies = Array.isArray(game?.involved_companies) ? game.involved_companies : [];
  const companyNames = (field) => companies
    .filter((company) => company?.[field] && company?.company?.name)
    .map((company) => company.company.name);

  return {
    id: game?.id ?? null,
    name: game?.name || '',
    released,
    genres: Array.isArray(game?.genres)
      ? game.genres.filter((genre) => genre?.name).map((genre) => ({ name: genre.name }))
      : [],
    background_image: normalizeIgdbCoverUrl(game?.cover?.url),
    description_raw: game?.summary || '',
    // IGDB rating is 0–100; existing site storage/display expects 0–5.
    rating: Number.isFinite(game?.rating) ? Math.round((game.rating / 20) * 10) / 10 : null,
    metacritic: null,
    // The existing playtime field is shown on cards in hours; detailed IGDB values are stored in minutes.
    playtime: Number.isFinite(timeToBeat?.normally)
      ? Math.round(timeToBeat.normally / 3600)
      : null,
    playtimeHastily: toIgdbTimeMinutes(timeToBeat?.hastily),
    playtimeNormally: toIgdbTimeMinutes(timeToBeat?.normally),
    playtimeCompletely: toIgdbTimeMinutes(timeToBeat?.completely),
    playtimeCount: Number.isSafeInteger(timeToBeat?.count) ? timeToBeat.count : null,
    platforms: Array.isArray(game?.platforms)
      ? game.platforms.filter((platform) => platform?.name).map((platform) => ({ platform: { name: platform.name } }))
      : [],
    developers: companyNames('developer').map((name) => ({ name })),
    publishers: companyNames('publisher').map((name) => ({ name })),
  };
}

async function fetchIgdbGameTimeToBeat(fetchImpl, clientId, token, gameId) {
  const response = await fetchImpl('https://api.igdb.com/v4/game_time_to_beats', {
    method: 'POST',
    headers: { 'Client-ID': clientId, Authorization: `Bearer ${token}`, Accept: 'application/json' },
    body: `fields game_id,hastily,normally,completely,count; where game_id = ${gameId}; limit 1;`,
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => []);
  return Array.isArray(payload) ? payload[0] || null : null;
}

async function getIgdbAccessToken(fetchImpl) {
  if (igdbAccessToken && Date.now() < igdbAccessTokenExpiresAt) return igdbAccessToken;

  const clientId = process.env.TWITCH_IGDB_CLIENT_ID;
  const clientSecret = process.env.TWITCH_IGDB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const error = new Error('IGDB is not configured. Set TWITCH_IGDB_CLIENT_ID and TWITCH_IGDB_CLIENT_SECRET.');
    error.status = 500;
    throw error;
  }

  const response = await fetchImpl('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }).toString(),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    const error = new Error(payload.message || 'Failed to authenticate with IGDB.');
    error.status = response.status || 502;
    throw error;
  }

  igdbAccessToken = payload.access_token;
  igdbAccessTokenExpiresAt = Date.now() + Math.max(60, Number(payload.expires_in) - 60) * 1000;
  return igdbAccessToken;
}

function isAllowedHost(hostname) {
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)
  );
}

function normalizeImdbId(id) {
  return typeof id === 'string' ? id.trim() : '';
}

function isBoostyImageHost(hostname) {
  return hostname === 'images.boosty.to';
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

function resolveFetch() {
  if (typeof globalThis.fetch === 'function') {
    return { fetch: globalThis.fetch };
  }

  const attempts = [];
  const candidates = [
    {
      name: 'undici',
      getFetch: (moduleExports) => moduleExports?.fetch,
    },
    {
      name: 'node-fetch',
      getFetch: (moduleExports) => moduleExports?.default ?? moduleExports,
    },
  ];

  for (const candidate of candidates) {
    try {
      const moduleExports = require(candidate.name);
      const fetched = candidate.getFetch(moduleExports);
      if (typeof fetched === 'function') {
        globalThis.fetch = fetched;
        return { fetch: fetched, source: candidate.name };
      }
      attempts.push(`${candidate.name} loaded but did not export fetch`);
    } catch (error) {
      attempts.push(
        `${candidate.name} unavailable: ${error?.message || 'unknown error'}`
      );
    }
  }

  return {
    error:
      'Fetch API is not available in this environment. ' +
      `Node.js version: ${process.version || 'unknown'}. ` +
      `Tried to load undici/node-fetch. Details: ${attempts.join('; ')}.`,
  };
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url);

  if (!response.ok) {
    const error = new Error(`Request failed with status ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return await response.json();
}

async function getSelectedKinopoiskApiKey() {
  const apiKeys = {
    'API 1': process.env.KINOPOISK_API_KEY || '',
    'API 2': process.env.KINOPOISK_API_KEY2 || '',
    'API 3': process.env.KINOPOISK_API_KEY3 || '',
  };

  let selectedApi = 'API 1';
  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('settings')
      .select('kp_api')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!error && data?.kp_api) {
      selectedApi = data.kp_api;
    }
  } catch (error) {
    console.warn('[external] Failed to load selected kp_api', error);
  }

  return (
    apiKeys[selectedApi] ||
    apiKeys['API 1'] ||
    apiKeys['API 2'] ||
    apiKeys['API 3'] ||
    ''
  );
}

async function handlePosterProxy(req, res) {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json({ error: 'Missing url' });
  }

  let target;
  try {
    target = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid url' });
  }

  if (!['http:', 'https:'].includes(target.protocol)) {
    return res.status(400).json({ error: 'Unsupported protocol' });
  }

  if (!isAllowedHost(target.hostname)) {
    return res.status(400).json({ error: 'Host not allowed' });
  }

  try {
    const headers = isBoostyImageHost(target.hostname)
      ? {
          Referer: 'https://boosty.to/',
          'User-Agent': 'Mozilla/5.0 (compatible; PupsikTVImageProxy/1.0)',
        }
      : undefined;

    const response = await fetch(target.toString(), {
      headers,
    });
    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: 'Image request failed' });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType =
      response.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Type', contentType);
    return res.status(200).send(buffer);
  } catch {
    return res.status(500).json({ error: 'Server error' });
  }
}

async function handleSteamGridDb(req, res) {
  const search = req.query.search || '';
  if (!search) {
    return res.status(400).json({ error: 'Missing search' });
  }

  const key = process.env.STEAMGRIDDB_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'Missing API key' });
  }

  try {
    const headers = { Authorization: `Bearer ${key}` };
    const searchUrl = `https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(search)}`;
    const searchRes = await fetch(searchUrl, { headers });
    if (!searchRes.ok) {
      return res
        .status(searchRes.status)
        .json({ error: 'Search request failed' });
    }

    const searchData = await searchRes.json();
    const id =
      searchData.data && searchData.data[0] ? searchData.data[0].id : null;
    if (!id) {
      return res.status(404).json({ error: 'Not found' });
    }

    const gridUrl = `https://www.steamgriddb.com/api/v2/grids/game/${id}?dimensions=600x900`;
    const gridRes = await fetch(gridUrl, { headers });
    if (!gridRes.ok) {
      return res.status(gridRes.status).json({ error: 'Grid request failed' });
    }

    const gridData = await gridRes.json();
    const posters = Array.isArray(gridData.data)
      ? gridData.data.map((g) => ({
          url: g.url,
          thumb: g.thumb || g.url,
        }))
      : [];
    return res.status(200).json({ posters });
  } catch {
    return res.status(500).json({ error: 'Server error' });
  }
}

async function handleTmdb(req, res) {
  const apiKey = process.env.TMDB_API;

  if (!apiKey) {
    return res.status(500).json({ error: 'TMDB API key is not configured.' });
  }

  const imdbId =
    normalizeImdbId(req.query?.imdbId) ||
    normalizeImdbId(req.query?.imdb_id) ||
    normalizeImdbId(req.query?.id);

  if (!imdbId) {
    return res.status(400).json({ error: 'Missing IMDb ID' });
  }

  const { fetch: fetchImpl, error: fetchError } = resolveFetch();
  if (!fetchImpl) {
    return res.status(500).json({ error: fetchError });
  }

  try {
    const findUrl = `${TMDB_API_BASE_URL}/find/${encodeURIComponent(
      imdbId
    )}?api_key=${encodeURIComponent(apiKey)}&external_source=imdb_id`;
    const findData = await fetchJson(findUrl, fetchImpl);

    const movieResult =
      findData?.movie_results?.[0] || findData?.tv_results?.[0] || null;

    if (!movieResult?.id) {
      return res.status(404).json({ error: 'TMDB title not found' });
    }

    const resourceType =
      Array.isArray(findData?.movie_results) &&
      findData.movie_results.length > 0
        ? 'movie'
        : 'tv';

    const detailsUrl = `${TMDB_API_BASE_URL}/${resourceType}/${encodeURIComponent(
      movieResult.id
    )}?api_key=${encodeURIComponent(apiKey)}&language=ru-RU`;

    const details = await fetchJson(detailsUrl, fetchImpl);

    return res.status(200).json({
      id: movieResult.id,
      type: resourceType,
      details,
    });
  } catch (err) {
    console.error('[tmdb] Failed to fetch data', err);
    const status = Number.isInteger(err.status) ? err.status : 500;
    return res.status(status).json({
      error: 'Failed to fetch data from TMDB',
    });
  }
}

async function handleKinopoisk(req, res) {
  const resource = String(req.query?.resource || '')
    .trim()
    .toLowerCase();
  const apiKey = await getSelectedKinopoiskApiKey();

  if (!apiKey) {
    return res.status(500).json({ error: 'Kinopoisk API key is not configured.' });
  }

  let url;
  if (resource === 'search') {
    const keyword = String(req.query?.keyword || '').trim();
    const page = String(req.query?.page || '1').trim() || '1';
    if (!keyword) {
      return res.status(400).json({ error: 'Missing keyword' });
    }
    url = `https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword=${encodeURIComponent(
      keyword
    )}&page=${encodeURIComponent(page)}`;
  } else if (resource === 'film') {
    const id = String(req.query?.id || '').trim();
    if (!id) {
      return res.status(400).json({ error: 'Missing id' });
    }
    url = `https://kinopoiskapiunofficial.tech/api/v2.2/films/${encodeURIComponent(
      id
    )}`;
  } else if (resource === 'staff') {
    const filmId = String(req.query?.filmId || '').trim();
    if (!filmId) {
      return res.status(400).json({ error: 'Missing filmId' });
    }
    url = `https://kinopoiskapiunofficial.tech/api/v1/staff?filmId=${encodeURIComponent(
      filmId
    )}`;
  } else if (resource === 'quota') {
    const access = verifyAdminRequest(req);
    if (!access.ok) {
      return res
        .status(access.status)
        .json({ error: access.error, expired: access.expired || false });
    }
    url = `https://kinopoiskapiunofficial.tech/api/v1/api_keys/${encodeURIComponent(
      apiKey
    )}`;
  } else {
    return res.status(400).json({ error: 'Unknown Kinopoisk resource' });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
    });
    const text = await response.text();
    if (resource === 'film' || resource === 'staff') {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    } else {
      res.setHeader('Cache-Control', 'private, no-store');
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(response.status).send(text);
  } catch (error) {
    console.error('[kinopoisk] Proxy error', error);
    return res.status(500).json({ error: 'Failed to fetch Kinopoisk data' });
  }
}

async function handleRawg(req, res) {
  const access = verifyAdminRequest(req);
  if (!access.ok) {
    return res
      .status(access.status)
      .json({ error: access.error, expired: access.expired || false });
  }

  const apiKey = process.env.RAWG_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'RAWG API key is not configured.' });
  }

  const resource = String(req.query?.resource || '')
    .trim()
    .toLowerCase();
  let url;

  if (resource === 'search') {
    const search = String(req.query?.search || '').trim();
    const pageSize = String(req.query?.page_size || '5').trim() || '5';
    if (!search) {
      return res.status(400).json({ error: 'Missing search' });
    }
    url = `https://api.rawg.io/api/games?key=${encodeURIComponent(
      apiKey
    )}&search=${encodeURIComponent(search)}&page_size=${encodeURIComponent(
      pageSize
    )}`;
  } else if (resource === 'game') {
    const id = String(req.query?.id || '').trim();
    if (!id) {
      return res.status(400).json({ error: 'Missing id' });
    }
    url = `https://api.rawg.io/api/games/${encodeURIComponent(
      id
    )}?key=${encodeURIComponent(apiKey)}`;
  } else {
    return res.status(400).json({ error: 'Unknown RAWG resource' });
  }

  try {
    const response = await fetch(url);
    const text = await response.text();
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(response.status).send(text);
  } catch (error) {
    console.error('[rawg] Proxy error', error);
    return res.status(500).json({ error: 'Failed to fetch RAWG data' });
  }
}

async function handleIgdb(req, res) {
  const access = verifyAdminRequest(req);
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error, expired: access.expired || false });
  }

  const { fetch: fetchImpl, error: fetchError } = resolveFetch();
  if (fetchError) return res.status(500).json({ error: fetchError });

  const resource = String(req.query?.resource || '').trim().toLowerCase();
  const pageSize = Math.min(10, Math.max(1, Number.parseInt(String(req.query?.page_size || '5'), 10) || 5));
  const fields = 'id,name,summary,first_release_date,genres.name,cover.url,rating,platforms.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher';
  let query;

  if (resource === 'search') {
    const search = String(req.query?.search || '').trim();
    if (!search) return res.status(400).json({ error: 'Missing search' });
    const escapedSearch = search.replace(/[\\"]/g, '\\$&');
    query = `search "${escapedSearch}"; fields ${fields}; limit ${pageSize};`;
  } else if (resource === 'game') {
    const id = Number.parseInt(String(req.query?.id || ''), 10);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid game id' });
    query = `fields ${fields}; where id = ${id}; limit 1;`;
  } else {
    return res.status(400).json({ error: 'Unknown IGDB resource' });
  }

  try {
    const token = await getIgdbAccessToken(fetchImpl);
    const clientId = process.env.TWITCH_IGDB_CLIENT_ID;
    const response = await fetchImpl('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: { 'Client-ID': clientId, Authorization: `Bearer ${token}`, Accept: 'application/json' },
      body: query,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return res.status(response.status).json({ error: payload?.message || 'IGDB request failed.' });

    let timeToBeat = null;
    if (resource === 'game' && Array.isArray(payload) && payload[0]?.id) {
      try {
        timeToBeat = await fetchIgdbGameTimeToBeat(fetchImpl, clientId, token, payload[0].id);
      } catch (error) {
        console.warn('[igdb] Failed to fetch game time to beat', error);
      }
    }
    const games = Array.isArray(payload)
      ? payload.map((game) => normalizeIgdbGame(game, game.id === payload[0]?.id ? timeToBeat : null))
      : [];
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json(resource === 'search' ? { results: games } : games[0] || null);
  } catch (error) {
    console.error('[igdb] Proxy error', error);
    return res.status(error.status || 500).json({ error: error.message || 'Failed to fetch IGDB data.' });
  }
}

module.exports = async function handler(req, res) {
  const provider = String(req.query?.provider || '')
    .trim()
    .toLowerCase();

  if (!ALLOWED_PROVIDERS.includes(provider)) {
    return res.status(400).json({
      error: 'Unknown external provider',
      allowedProviders: ALLOWED_PROVIDERS,
    });
  }

  if (provider === 'poster-proxy') {
    return handlePosterProxy(req, res);
  }

  if (provider === 'steamgriddb') {
    return handleSteamGridDb(req, res);
  }

  if (provider === 'kinopoisk') {
    return handleKinopoisk(req, res);
  }

  if (provider === 'rawg') {
    return handleRawg(req, res);
  }

  if (provider === 'igdb') {
    return handleIgdb(req, res);
  }

  return handleTmdb(req, res);
};
