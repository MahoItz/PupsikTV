const TMDB_API_BASE_URL = "https://api.themoviedb.org/3";

function normalizeImdbId(id) {
  return typeof id === "string" ? id.trim() : "";
}

async function fetchJson(url) {
  const response = await fetch(url);

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

  try {
    const findUrl = `${TMDB_API_BASE_URL}/find/${encodeURIComponent(
      imdbId
    )}?api_key=${encodeURIComponent(apiKey)}&external_source=imdb_id`;
    const findData = await fetchJson(findUrl);

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

    const details = await fetchJson(detailsUrl);

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
