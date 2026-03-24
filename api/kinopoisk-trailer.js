const KINOPOISK_SEARCH_URL =
  "https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword";
const KINOPOISK_FILM_URL = "https://kinopoiskapiunofficial.tech/api/v2.2/films";
const KINOPOISK_STAFF_URL =
  "https://kinopoiskapiunofficial.tech/api/v1/staff";

function resolveFetch() {
  if (typeof globalThis.fetch === "function") {
    return { fetch: globalThis.fetch };
  }

  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const undici = require("undici");
    if (typeof undici?.fetch === "function") {
      globalThis.fetch = undici.fetch;
      return { fetch: undici.fetch };
    }
  } catch (error) {
    return { error: error?.message || "fetch is not available" };
  }

  return { error: "fetch is not available" };
}

async function fetchKinopoiskJson(url, apiKey, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: {
      "X-API-KEY": apiKey,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    const error = new Error(message || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return await response.json();
}

function pickBestFilm(films, title) {
  if (!Array.isArray(films) || !films.length) return null;
  const normalizedTitle = String(title || "").trim().toLowerCase();

  const exact = films.find((film) => {
    const candidate = [film?.nameRu, film?.nameEn, film?.nameOriginal]
      .filter(Boolean)
      .map((name) => String(name).trim().toLowerCase());

    return candidate.includes(normalizedTitle);
  });

  return exact || films[0];
}

async function handler(req, res) {
  const title = String(req.query?.title || "").trim();
  if (!title) {
    return res.status(400).json({ error: "Missing title query parameter" });
  }

  const apiKey = process.env.KINOPOISK_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "KINOPOISK_API_KEY is not configured" });
  }

  const { fetch: fetchImpl, error: fetchError } = resolveFetch();
  if (!fetchImpl) {
    return res.status(500).json({ error: fetchError || "fetch is not available" });
  }

  try {
    const searchUrl = `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(title)}`;
    const searchData = await fetchKinopoiskJson(searchUrl, apiKey, fetchImpl);
    const film = pickBestFilm(searchData?.films || [], title);

    if (!film?.filmId) {
      return res.status(200).json({ film: null, actors: [] });
    }

    const [filmDetails, staff] = await Promise.all([
      fetchKinopoiskJson(
        `${KINOPOISK_FILM_URL}/${encodeURIComponent(film.filmId)}`,
        apiKey,
        fetchImpl
      ),
      fetchKinopoiskJson(
        `${KINOPOISK_STAFF_URL}?filmId=${encodeURIComponent(film.filmId)}`,
        apiKey,
        fetchImpl
      ),
    ]);

    const actors = Array.isArray(staff)
      ? staff
          .filter((person) => person?.professionKey === "ACTOR")
          .slice(0, 10)
          .map((person) => person?.nameRu || person?.nameEn)
          .filter(Boolean)
      : [];

    return res.status(200).json({
      film: {
        kinopoiskId: filmDetails?.kinopoiskId || film?.filmId,
        nameRu: filmDetails?.nameRu || film?.nameRu || null,
        nameEn: filmDetails?.nameEn || film?.nameEn || null,
        nameOriginal: filmDetails?.nameOriginal || film?.nameOriginal || null,
        description: filmDetails?.description || filmDetails?.shortDescription || null,
        premiereRu: filmDetails?.premiere?.russia || null,
        year: filmDetails?.year || film?.year || null,
      },
      actors,
    });
  } catch (error) {
    console.error("[kinopoisk-trailer] request failed", error);
    const status = Number.isInteger(error?.status) ? error.status : 500;
    return res.status(status).json({
      error: "Failed to fetch Kinopoisk data",
    });
  }
}

module.exports = handler;
