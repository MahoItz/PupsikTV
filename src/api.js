// Supabase
const SUPABASE_URL = "https://shwekurmzyzivtworjup.supabase.co";
let SUPABASE_KEY;
let supabaseClient;

// Kinopoisk (unofficial API)
let KINOPOISK_API_KEY;
const KINOPOISK_SEARCH_URL =
  "https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword";
const KINOPOISK_FILM_URL =
  "https://kinopoiskapiunofficial.tech/api/v2.2/films";
let kpResults = [];
let selectedKPMovie = null;

// RAWG
let RAWG_API_KEY;
const RAWG_SEARCH_URL = "https://api.rawg.io/api/games";
let rawgResults = [];
let selectedRAWGGame = null;
let steamGridPoster = null;
let steamGridPosters = [];
async function loadEnv(password) {
  try {
    const headers = {};
    if (password) headers["x-admin-password"] = password;
    const res = await fetch("/api/env", { headers });
    const env = await res.json();
    SUPABASE_KEY = env.SUPABASE_KEY;
    if (env.KINOPOISK_API_KEY) KINOPOISK_API_KEY = env.KINOPOISK_API_KEY;
    if (env.RAWG_API_KEY) RAWG_API_KEY = env.RAWG_API_KEY;
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    return env;
  } catch (err) {
    console.error("Failed to load environment variables", err);
    return {};
  }
}

async function verifyAdminPassword(password) {
  try {
    const res = await fetch("/api/verify-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.ok;
  } catch (err) {
    console.error("Failed to verify admin password", err);
    return false;
  }
}
async function fetchKPFilmLength(filmId) {
  if (!filmId) return null;
  try {
    const res = await fetch(`${KINOPOISK_FILM_URL}/${filmId}`, {
      headers: {
        "X-API-KEY": KINOPOISK_API_KEY,
        "Content-Type": "application/json",
      },
    });
    const data = await res.json();
    return data.filmLength || null;
  } catch (err) {
    console.error("Failed to fetch film details", err);
    return null;
  }
}

async function fetchSteamGridPosters(title) {
  steamGridPoster = null;
  steamGridPosters = [];
  if (!title) return;
  try {
    const res = await fetch(`/api/steamgriddb?search=${encodeURIComponent(title)}`);
    if (!res.ok) return;
    const data = await res.json();
    const posters = Array.isArray(data.posters) ? data.posters : [];
    steamGridPosters = posters.map((g) => (typeof g === "string" ? g : g.url));
    steamGridPoster = steamGridPosters[0] || null;
  } catch (err) {
    console.error("SteamGridDB fetch error", err);
  }
}
