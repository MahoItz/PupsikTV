const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';
const ALLOWED_HOST_SUFFIXES = ['steamgriddb.com', 'rawg.io', 'media.rawg.io'];
const ALLOWED_PROVIDERS = ['poster-proxy', 'steamgriddb', 'tmdb'];

function isAllowedHost(hostname) {
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)
  );
}

function normalizeImdbId(id) {
  return typeof id === 'string' ? id.trim() : '';
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
    const response = await fetch(target.toString());
    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: 'Image request failed' });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType =
      response.headers.get('content-type') || 'application/octet-stream';
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

  return handleTmdb(req, res);
};
