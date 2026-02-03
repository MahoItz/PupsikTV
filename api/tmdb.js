const TMDB_API_BASE_URL = "https://api.themoviedb.org/3";

function normalizeImdbId(id) {
  return typeof id === "string" ? id.trim() : "";
}

function resolveFetch() {
  if (typeof globalThis.fetch === "function") {
    return { fetch: globalThis.fetch };
  }

  const attempts = [];
  const candidates = [
    {
      name: "undici",
      getFetch: (moduleExports) => moduleExports?.fetch,
    },
    {
      name: "node-fetch",
      getFetch: (moduleExports) => moduleExports?.default ?? moduleExports,
    },
  ];

  for (const candidate of candidates) {
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const moduleExports = require(candidate.name);
      const fetched = candidate.getFetch(moduleExports);
      if (typeof fetched === "function") {
        globalThis.fetch = fetched;
        return { fetch: fetched, source: candidate.name };
      }
      attempts.push(`${candidate.name} loaded but did not export fetch`);
    } catch (error) {
      attempts.push(
        `${candidate.name} unavailable: ${error?.message || "unknown error"}`
      );
    }
  }

  return {
    error:
      "Fetch API is not available in this environment. " +
      `Node.js version: ${process.version || "unknown"}. ` +
      `Tried to load undici/node-fetch. Details: ${attempts.join("; ")}.`,
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

async function handler(req, res) {
  const apiKey = process.env.TMDB_API;

  if (!apiKey) {
    res.status(500).json({ error: "TMDB API key is not configured." });
    return;
  }

  const imdbId =
    normalizeImdbId(req.query?.imdbId) ||
    normalizeImdbId(req.query?.imdb_id) ||
    normalizeImdbId(req.query?.id);

  if (!imdbId) {
    res.status(400).json({ error: "Missing IMDb ID" });
    return;
  }

  const { fetch: fetchImpl, error: fetchError } = resolveFetch();
  if (!fetchImpl) {
    res.status(500).json({ error: fetchError });
    return;
  }

  try {
    const findUrl = `${TMDB_API_BASE_URL}/find/${encodeURIComponent(
      imdbId
    )}?api_key=${encodeURIComponent(apiKey)}&external_source=imdb_id`;
    const findData = await fetchJson(findUrl, fetchImpl);

    const movieResult =
      findData?.movie_results?.[0] || findData?.tv_results?.[0] || null;

    if (!movieResult?.id) {
      res.status(404).json({ error: "TMDB title not found" });
      return;
    }

    const resourceType =
      Array.isArray(findData?.movie_results) && findData.movie_results.length > 0
        ? "movie"
        : "tv";

    const detailsUrl = `${TMDB_API_BASE_URL}/${resourceType}/${encodeURIComponent(
      movieResult.id
    )}?api_key=${encodeURIComponent(apiKey)}&language=ru-RU`;

    const details = await fetchJson(detailsUrl, fetchImpl);

    res.status(200).json({
      id: movieResult.id,
      type: resourceType,
      details,
    });
  } catch (err) {
    console.error("[tmdb] Failed to fetch data", err);
    const status = Number.isInteger(err.status) ? err.status : 500;
    res.status(status).json({
      error: "Failed to fetch data from TMDB",
    });
  }
}

module.exports = handler;
