// Supabase
const SUPABASE_URL = "https://shwekurmzyzivtworjup.supabase.co";
let SUPABASE_KEY;
let supabaseClient;

let isAdmin = localStorage.getItem("isAdmin") === "true";
let adminElements = [];
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

function debounce(func, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}

function showSearchLoading(containerId, listId) {
  const container = document.getElementById(containerId);
  const list = document.getElementById(listId);
  if (!container || !list) return;
  container.style.display = "block";
  list.innerHTML =
    '<div class="autocomplete-loading"><span class="loading-spinner"></span></div>';
}

// Массив фильмов будет заполняться данными из базы
let allMovies = [];
let movies = [];
// Maps for diffing movie cards
let movieCardElements = new Map();
let movieDataMap = new Map();
let hasRenderedMovies = false;
let currentSearchQuery = "";
let currentSort = "date";
let sortAscending = false;

// Список заказанных фильмов
let watchlist = [];
let gameOrders = [];
let allPlayedGames = [];
let playedGames = [];
// Maps for diffing played game cards
let playedGameCardElements = new Map();
let playedGameDataMap = new Map();
let currentGameSearch = "";
let currentGameSort = "date";
let gameSortAscending = false;
let gamePage = 1;
const gamesPerPage = 12;
let totalGamesPlayed = 0;
let ratingGameId = null;

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

const ORDER_TYPE_CLASSES = {
  Донат: "ribbon-donate",
  "Баллы канала": "ribbon-points",
  Шары: "ribbon-balls",
};

// Watchlist modal helpers
let currentWatchlistMode = "auto";
let kpOrderResults = [];
let selectedKPOrderMovie = null;

// Game modal helpers
let currentGameMode = "auto";
let currentPlayedGameMode = "auto";

let currentMode = "auto";
let currentRating = 0;
let editingMovieId = null;
let ratingMovieId = null;
let isSubmittingRating = false;
let userRatingMovieId = null;
let movieUserRatings = {};
let ratingTooltip;
let ratedMovies = JSON.parse(localStorage.getItem("ratedMovies") || "{}");
let editPosterData = null;
let editingOrderId = null;
let editOrderPosterData = null;
let editingGameId = null;
let editGamePosterData = null;
let editingPlayedGameId = null;
let editPlayedGamePosterData = null;
let deletePlayedGameId = null;
let deleteMovieId = null;
let deleteOrderId = null;
let deleteGameOrderId = null;

const REYOHOHO_BASE_URL = "https://reyohoho.github.io/reyohoho/";

const fortuneWinnerModal = document.getElementById("fortuneWinnerModal");
const fortuneWinnerFilmNameEl = document.getElementById("fortuneWinnerFilmName");
const fortuneWinnerKinopoiskBtn = document.getElementById("fortuneWinnerKinopoisk");
const fortuneWinnerReYohohoBtn = document.getElementById("fortuneWinnerReYohoho");
const fortuneWinnerCancelBtn = document.getElementById("fortuneWinnerCancel");
let fortuneWinnerMovie = null;

function normalizeFortuneText(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-z0-9а-я\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractYearValue(value) {
  if (!value) return "";
  const match = String(value).match(/(19|20)\d{2}/);
  return match ? match[0] : "";
}

function parseFortuneLabel(label) {
  const originalLabel = (label || "").trim();
  if (!originalLabel) {
    return { originalLabel: "", title: "", originalTitle: "", year: "" };
  }

  const parenthesesValues = Array.from(originalLabel.matchAll(/\(([^)]+)\)/g)).map((m) =>
    m[1].trim(),
  );
  let year = "";
  let originalTitle = "";

  for (const value of parenthesesValues) {
    if (!year && /^(19|20)\d{2}$/.test(value)) {
      year = value;
    } else if (!originalTitle && value) {
      originalTitle = value;
    }
  }

  const quotedMatch = originalLabel.match(/«([^»]+)»/);
  if (!originalTitle && quotedMatch) {
    originalTitle = quotedMatch[1].trim();
  }

  let base = originalLabel;
  if (year) {
    const yearRegex = new RegExp(`\\b${year}\\b`, "g");
    base = base.replace(yearRegex, " ");
  }

  base = base.replace(/[()«»"]/g, " ");

  if (!originalTitle) {
    const pipeParts = base.split("|").map((part) => part.trim()).filter(Boolean);
    if (pipeParts.length > 1) {
      originalTitle = pipeParts.slice(1).join(" ");
      base = pipeParts[0];
    }
  } else {
    base = base.split("|")[0];
  }

  if (!originalTitle) {
    const slashParts = base.split("/").map((part) => part.trim()).filter(Boolean);
    if (slashParts.length > 1) {
      originalTitle = slashParts.slice(1).join(" ");
      base = slashParts[0];
    }
  } else {
    base = base.split("/")[0];
  }

  const dashParts = base
    .split(/\s[-–—]\s/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (dashParts.length > 1) {
    if (!originalTitle) {
      originalTitle = dashParts.slice(1).join(" ");
    }
    base = dashParts[0];
  }

  base = base.replace(/\s+/g, " ").trim();

  return {
    originalLabel,
    title: base || originalLabel,
    originalTitle,
    year,
  };
}

function findFortuneMovieMatch(parsed) {
  const candidates = [...watchlist, ...allMovies];
  if (!candidates.length) {
    return null;
  }

  const normalizedTitle = normalizeFortuneText(parsed.title);
  const normalizedOriginal = normalizeFortuneText(parsed.originalTitle);
  const normalizedLabel = normalizeFortuneText(parsed.originalLabel);
  const targetYear = parsed.year;

  let best = null;
  let bestScore = -Infinity;

  candidates.forEach((movie) => {
    const movieTitle = normalizeFortuneText(movie.title);
    const movieOriginal = normalizeFortuneText(movie.originalTitle || movie.original_title || "");
    const movieYear = extractYearValue(movie.year);
    let score = 0;

    if (normalizedTitle && movieTitle) {
      if (movieTitle === normalizedTitle) {
        score += 6;
      } else if (movieTitle.includes(normalizedTitle) || normalizedTitle.includes(movieTitle)) {
        score += 3;
      } else if (normalizedLabel && normalizedLabel.includes(movieTitle)) {
        score += 2;
      }
    }

    if (normalizedOriginal && movieOriginal) {
      if (movieOriginal === normalizedOriginal) {
        score += 5;
      } else if (
        movieOriginal.includes(normalizedOriginal) ||
        normalizedOriginal.includes(movieOriginal)
      ) {
        score += 2;
      } else if (normalizedLabel && normalizedLabel.includes(movieOriginal)) {
        score += 2;
      }
    } else if (!normalizedTitle && normalizedLabel && movieOriginal && normalizedLabel.includes(movieOriginal)) {
      score += 2;
    }

    if (!normalizedTitle && normalizedLabel && movieTitle && normalizedLabel.includes(movieTitle)) {
      score += 2;
    }

    if (targetYear) {
      if (movieYear && movieYear === targetYear) {
        score += 3;
      } else if (movieYear && Math.abs(Number(movieYear) - Number(targetYear)) <= 1) {
        score += 1;
      } else if (movieYear) {
        score -= 2;
      }
    } else if (movieYear && parsed.originalLabel.includes(movieYear)) {
      score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      best = movie;
    }
  });

  return bestScore > 0 ? best : null;
}

function buildFortuneWinnerMovie(label) {
  const parsed = parseFortuneLabel(label);
  const match = findFortuneMovieMatch(parsed);
  const year = extractYearValue(match?.year) || parsed.year;
  const title = (match?.title || parsed.title || label || "").trim();
  const originalTitle = (
    match?.originalTitle ||
    match?.original_title ||
    parsed.originalTitle ||
    ""
  ).trim();

  const normalizedTitle = normalizeFortuneText(title);
  const normalizedOriginal = normalizeFortuneText(originalTitle);

  const displayParts = [];
  if (title) {
    displayParts.push(title);
  }
  if (year) {
    displayParts.push(`(${year})`);
  }
  if (originalTitle && normalizedOriginal && normalizedOriginal !== normalizedTitle) {
    displayParts.push(originalTitle);
  }

  return {
    label,
    title: title || label,
    originalTitle,
    year,
    displayText: displayParts.join(" ").trim() || label,
  };
}

function showFortuneWinnerModal(label) {
  if (!fortuneWinnerModal || !label) {
    return;
  }

  fortuneWinnerMovie = buildFortuneWinnerMovie(label);

  if (fortuneWinnerFilmNameEl) {
    if (fortuneWinnerMovie.displayText) {
      fortuneWinnerFilmNameEl.textContent = fortuneWinnerMovie.displayText;
      fortuneWinnerFilmNameEl.style.display = "block";
    } else {
      fortuneWinnerFilmNameEl.textContent = "";
      fortuneWinnerFilmNameEl.style.display = "none";
    }
  }

  fortuneWinnerModal.style.display = "block";
}

function closeFortuneWinnerModal() {
  fortuneWinnerMovie = null;
  if (fortuneWinnerFilmNameEl) {
    fortuneWinnerFilmNameEl.textContent = "";
    fortuneWinnerFilmNameEl.style.display = "";
  }
  closeModal("fortuneWinnerModal");
}

if (fortuneWinnerKinopoiskBtn) {
  fortuneWinnerKinopoiskBtn.addEventListener("click", () => {
    if (!fortuneWinnerMovie) {
      return;
    }
    openKinopoiskPage(
      fortuneWinnerMovie.title,
      fortuneWinnerMovie.year,
      fortuneWinnerMovie.originalTitle,
    );
  });
}

if (fortuneWinnerReYohohoBtn) {
  fortuneWinnerReYohohoBtn.addEventListener("click", () => {
    window.open(REYOHOHO_BASE_URL, "_blank");
  });
}

if (fortuneWinnerCancelBtn) {
  fortuneWinnerCancelBtn.addEventListener("click", () => {
    closeFortuneWinnerModal();
  });
}

// Pagination
let currentPage = 1;
const moviesPerPage = 12;
let totalMovies = 0;

// Mobile tabs
let activeTab = "movies";

// Utility to convert file to base64 string
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function renderEmptyState(container, message) {
  const wrapper = document.createElement("div");
  wrapper.className = "empty-state";

  const img = document.createElement("img");
  img.src = "images/Sad_Winston.webp";
  img.alt = message;
  wrapper.appendChild(img);

  const text = document.createElement("p");
  text.textContent = message;
  wrapper.appendChild(text);

  container.appendChild(wrapper);
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

function createPosterOverlay(targetImg, posters, placeBelow = false) {
  if (!targetImg || !Array.isArray(posters) || posters.length < 2) return;
  const overlay = document.createElement("div");
  overlay.className = "poster-overlay" + (placeBelow ? " below" : "");

  const prev = document.createElement("div");
  prev.className = "overlay-arrow prev";
  prev.textContent = "‹"; // ‹

  const next = document.createElement("div");
  next.className = "overlay-arrow next";
  next.textContent = "›"; // ›

  const container = document.createElement("div");
  container.className = "thumb-container";

  const maxVisible = 4;
  let startIdx = 0;

  function render() {
    container.innerHTML = "";
    const endIdx = Math.min(startIdx + maxVisible, posters.length);
    for (let i = startIdx; i < endIdx; i++) {
      const url = posters[i];
      const wrapper = document.createElement("div");
      wrapper.className = "thumb-wrapper";

      const spinner = document.createElement("div");
      spinner.className = "loading-spinner";
      wrapper.appendChild(spinner);

      const img = document.createElement("img");
      img.className = "poster-thumb";
      img.style.display = "none";
      img.onload = () => {
        spinner.remove();
        img.style.display = "";
      };
      img.onerror = () => {
        spinner.remove();
      };
      img.src = url;
      img.onclick = () => {
        steamGridPoster = url;
        targetImg.src = url;
        if (targetImg.id === "editGamePosterPreview") {
          editGamePosterData = url;
        } else if (targetImg.id === "editPlayedGamePosterPreview") {
          editPlayedGamePosterData = url;
        }
      };
      wrapper.appendChild(img);
      container.appendChild(wrapper);
    }

    prev.style.visibility = startIdx > 0 ? "visible" : "hidden";
    next.style.visibility = endIdx < posters.length ? "visible" : "hidden";
  }

  prev.onclick = () => {
    if (startIdx > 0) {
      startIdx = Math.max(0, startIdx - maxVisible);
      render();
    }
  };

  next.onclick = () => {
    if (startIdx + maxVisible < posters.length) {
      startIdx += maxVisible;
      render();
    }
  };

  overlay.appendChild(prev);
  overlay.appendChild(container);
  overlay.appendChild(next);

  if (placeBelow) {
    const parent = targetImg.parentElement;
    parent.insertAdjacentElement("afterend", overlay);
  } else {
    targetImg.parentElement.style.position = "relative";
    targetImg.parentElement.appendChild(overlay);
  }

  render();
}

// ---------- File upload helpers ----------
function initFileUpload() {
  const fileInputs = document.querySelectorAll(
    '.file-upload-wrapper input[type="file"]'
  );

  fileInputs.forEach((fileInput) => {
    const wrapper = fileInput.closest(".file-upload-wrapper");
    if (!wrapper) return;
    const label = wrapper.querySelector(".file-upload-label");
    const fileName = wrapper.parentElement.querySelector(".file-name");
    const removeBtn = wrapper.querySelector(".file-remove");
    const preview = wrapper.parentElement.querySelector(".poster-preview");

    fileInput.addEventListener("change", async function (e) {
      const file = e.target.files[0];
      if (file) {
        await showSelectedFile(file, label, fileName, removeBtn, preview);
      }
    });

    label.addEventListener("dragover", function (e) {
      e.preventDefault();
      label.classList.add("drag-over");
    });

    label.addEventListener("dragleave", function (e) {
      e.preventDefault();
      label.classList.remove("drag-over");
    });

    label.addEventListener("drop", async function (e) {
      e.preventDefault();
      label.classList.remove("drag-over");

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        if (file.type.startsWith("image/")) {
          const dt = new DataTransfer();
          dt.items.add(file);
          fileInput.files = dt.files;
          await showSelectedFile(file, label, fileName, removeBtn, preview);
        }
      }
    });

    removeBtn.addEventListener("click", function () {
      clearFile(fileInput, label, fileName, removeBtn, preview);
    });
  });
}

async function showSelectedFile(file, label, fileName, removeBtn, preview) {
  label.classList.add("has-file");
  label.querySelector(".main-text").textContent = "Файл выбран";
  label.querySelector(".sub-text").textContent = "Нажмите для замены";

  fileName.textContent = file.name;
  fileName.style.display = "block";
  removeBtn.style.display = "flex";

  if (preview) {
    try {
      const dataUrl = await readFileAsDataURL(file);
      preview.src = dataUrl;
      preview.style.display = "block";
    } catch (err) {
      console.error("Error reading file", err);
    }
  }
}

function clearFile(fileInput, label, fileName, removeBtn, preview) {
  fileInput.value = "";
  label.classList.remove("has-file");
  label.querySelector(".main-text").textContent = "Выберите файл изображения";
  label.querySelector(".sub-text").textContent = "или перетащите его сюда";

  fileName.style.display = "none";
  removeBtn.style.display = "none";

  if (preview) {
    preview.src = "https://via.placeholder.com/300x400?text=Нет+постера";
    preview.style.display = "none";
  }
}

// Загрузка фильмов из Supabase
async function loadMoviesFromSupabase() {
  try {
    const { data, error } = await supabaseClient
      .from("movies")
      .select(
        "id, title, original_title, genres, poster, year, rating_numeric, rating_OMDB, date, order_by, order_type"
      )
      .order("id", { ascending: false });

    if (error) throw error;

    const newMovies = data.map((item) => ({
      id: item.id,
      title: item.title,
      originalTitle: item.original_title,
      genre: item.genres,
      poster: item.poster,
      year: item.year,
      rating: item.rating_numeric,
      kpRating: item.rating_OMDB,
      dateAdded: item.date,
      orderBy: item.order_by && item.order_by !== "null" ? item.order_by : "",
      orderType: item.order_type,
    }));

    const current = JSON.stringify(allMovies);
    const fresh = JSON.stringify(newMovies);

      if (current !== fresh) {
        allMovies = newMovies;
        totalMovies = allMovies.length;
        localStorage.setItem("moviesCache", fresh);

        await loadUserRatingsFromSupabase();
      }
    } catch (err) {
      console.error("Error loading movies from Supabase", err);
    }
  }

// Загрузка заказов из Supabase
async function loadWatchlistFromSupabase() {
  try {
    const { data, error } = await supabaseClient
      .from("Movie_Orders")
      .select(
        "id, created_at, order_title, order_origin_title, order_type, order_by, kinopoisk_rate, order_genres, order_poster, order_year, order_length"
      )
      .order("id", { ascending: true });

    if (error) throw error;

    watchlist = data.map((item) => ({
      id: item.id,
      title: item.order_title,
      originalTitle: item.order_origin_title,
      genres: item.order_genres,
      poster: item.order_poster,
      year: item.order_year || "",
      length: item.order_length || null,
      kpRating: item.kinopoisk_rate,
      orderBy: item.order_by && item.order_by !== "null" ? item.order_by : "",
      orderType: item.order_type,
      dateAdded: item.created_at,
    }));

    renderWatchlist();
  } catch (err) {
    console.error("Error loading watchlist from Supabase", err);
  }
}

// Загрузка заказанных игр из Supabase
async function loadGamesFromSupabase() {
  try {
    const { data, error } = await supabaseClient
      .from("Game_Orders")
      .select(
        "id, created_at, game_title, game_order_type, game_order_by, game_genres, game_poster, game_year"
      )
      .order("id", { ascending: true });

    if (error) throw error;

    gameOrders = data.map((item) => ({
      id: item.id,
      title: item.game_title,
      genres: item.game_genres,
      poster: item.game_poster,
      year: item.game_year || "",
      orderBy:
        item.game_order_by && item.game_order_by !== "null"
          ? item.game_order_by
          : "",
      orderType: item.game_order_type,
      dateAdded: item.created_at,
    }));

    renderGames();
  } catch (err) {
    console.error("Error loading game orders from Supabase", err);
  }
}

// Загрузка пройденных игр из Supabase
async function loadPlayedGamesFromSupabase() {
  try {
    const { data, error } = await supabaseClient
      .from("games")
      .select("id, title, genres, poster, year, rating_numeric, date, order_by, order_type")
      .order("id", { ascending: false });

    if (error) throw error;

    allPlayedGames = data.map((item) => ({
      id: item.id,
      title: item.title,
      genres: item.genres,
      poster: item.poster,
      year: item.year,
      rating: item.rating_numeric,
      dateAdded: item.date,
      orderBy: item.order_by && item.order_by !== "null" ? item.order_by : "",
      orderType: item.order_type,
    }));
    totalGamesPlayed = allPlayedGames.length;
    localStorage.setItem("gamesCache", JSON.stringify(allPlayedGames));
    renderPlayedGames();
  } catch (err) {
    console.error("Error loading played games", err);
  }
}

// Загрузка пользовательских оценок из Supabase
async function loadUserRatingsFromSupabase() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from("movie_ratings")
      .select("movie_id, rating");
    if (error) throw error;

    movieUserRatings = {};
    data.forEach((r) => {
      if (!movieUserRatings[r.movie_id]) {
        movieUserRatings[r.movie_id] = { sum: 0, count: 0 };
      }
      movieUserRatings[r.movie_id].sum += r.rating;
      movieUserRatings[r.movie_id].count += 1;
    });

    allMovies.forEach((m) => {
      const r = movieUserRatings[m.id];
      m.userRating = r ? Math.round((r.sum / r.count) * 10) / 10 : null;
    });
  } catch (err) {
    console.error("Error loading user ratings", err);
  }
}

// Инициализация
document.addEventListener("DOMContentLoaded", async function () {
  await loadEnv();
  const kpStored = localStorage.getItem("KINOPOISK_API_KEY");
  if (kpStored) KINOPOISK_API_KEY = kpStored;
  const rawgStored = localStorage.getItem("RAWG_API_KEY");
  if (rawgStored) RAWG_API_KEY = rawgStored;
  const cached = localStorage.getItem("moviesCache");
  if (cached) {
    allMovies = JSON.parse(cached);
    totalMovies = allMovies.length;
  }
  const ratedStored = localStorage.getItem("ratedMovies");
  if (ratedStored) {
    ratedMovies = JSON.parse(ratedStored);
  }
  const gamesCached = localStorage.getItem("gamesCache");
  if (gamesCached) {
    allPlayedGames = JSON.parse(gamesCached);
    totalGamesPlayed = allPlayedGames.length;
  }

  ratingTooltip = document.createElement("div");
  ratingTooltip.className = "rating-tooltip";
  document.body.appendChild(ratingTooltip);

  adminElements = Array.from(document.querySelectorAll(".admin-only"));
  if (isAdmin) {
    showAdminControls(true);
  } else {
    hideAdminControls(true);
  }

  await loadUserRatingsFromSupabase();
  renderPlayedGames();
  setupRatingStars();
  initFileUpload();

  document
    .querySelectorAll("#mobileTabs button")
    .forEach((btn) =>
      btn.addEventListener("click", () => showTab(btn.dataset.tab))
    );
  document
    .querySelectorAll(".list-tabs button")
    .forEach((btn) => btn.addEventListener("click", () => showListTab(btn.dataset.list)));
  updateTabVisibility();
  updateListVisibility();
  showListTab(activeListTab);

  const orderBtn = document.getElementById("sortOrderBtn");
  if (orderBtn) {
    const img = document.createElement("img");
    img.src = sortAscending ? "images/up-arrow.webp" : "images/down-arrow.webp";
    img.alt = "";
    img.className = "sort-arrow";

    orderBtn.replaceChildren(img);
  }

  await Promise.all([
    loadMoviesFromSupabase(),
    loadWatchlistFromSupabase(),
    loadGamesFromSupabase(),
    loadPlayedGamesFromSupabase(),
  ]);

  renderMovies();
  renderPlayedGames();
  const headerImg = document.querySelector(
    "#headerLogo img[src='images/Pupsik_TV_Header_2.webp']"
  );
  if (headerImg)
    headerImg.addEventListener("click", () => {
      document.getElementById("adminModal").style.display = "block";
    });
  const adminForm = document.getElementById("adminLoginForm");
  if (adminForm)
    adminForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (isAdmin) {
        logoutAdmin();
      } else {
        const pw = document.getElementById("adminPassword").value;
        const ok = await verifyAdminPassword(pw);
        if (ok) {
          isAdmin = true;
          localStorage.setItem("isAdmin", "true");
          showAdminControls();
          const env = await loadEnv(pw);
          if (env.KINOPOISK_API_KEY)
            localStorage.setItem("KINOPOISK_API_KEY", env.KINOPOISK_API_KEY);
          if (env.RAWG_API_KEY)
            localStorage.setItem("RAWG_API_KEY", env.RAWG_API_KEY);
          closeModal("adminModal");
        } else {
          alert("Неверный пароль");
        }
      }
    });
  const searchBtn = document.getElementById("autoSearchBtn");
  const resultsContainer = document.getElementById("autoResults");
  const titleInput = document.getElementById("autoTitle");
  if (searchBtn) searchBtn.addEventListener("click", handleKPSearch);
  if (titleInput)
    titleInput.addEventListener("input", () => {
      const q = titleInput.value.trim();
      if (q) {
        showSearchLoading("autoResultsContainer", "autoResults");
      } else {
        document.getElementById("autoResultsContainer").style.display = "none";
      }
      debouncedKPSearch(q);
    });
  if (resultsContainer)
    resultsContainer.addEventListener("click", function (e) {
      const option = e.target.closest(".autocomplete-option");
      if (!option) return;
      const idx = parseInt(option.dataset.index, 10);
      selectedKPMovie = kpResults[idx] || null;
      if (selectedKPMovie) {
        titleInput.value =
          selectedKPMovie.nameRu || selectedKPMovie.nameEn || "";
      }
      showKPPreview();
      document.getElementById("autoResultsContainer").style.display = "none";
    });

  const watchSearchBtn = document.getElementById("watchAutoSearchBtn");
  const watchResultsContainer = document.getElementById("watchAutoResults");
  const watchTitleInput = document.getElementById("watchAutoTitle");
  if (watchSearchBtn)
    watchSearchBtn.addEventListener("click", handleWatchlistSearch);
  if (watchTitleInput)
    watchTitleInput.addEventListener("input", () => {
      const q = watchTitleInput.value.trim();
      if (q) {
        showSearchLoading(
          "watchAutoResultsContainer",
          "watchAutoResults"
        );
      } else {
        document.getElementById("watchAutoResultsContainer").style.display =
          "none";
      }
      debouncedWatchlistKPSearch(q);
    });
  if (watchResultsContainer)
    watchResultsContainer.addEventListener("click", function (e) {
      const option = e.target.closest(".autocomplete-option");
      if (!option) return;
      const idx = parseInt(option.dataset.index, 10);
      selectedKPOrderMovie = kpOrderResults[idx] || null;
      if (selectedKPOrderMovie) {
        watchTitleInput.value =
          selectedKPOrderMovie.nameRu || selectedKPOrderMovie.nameEn || "";
      }
      showWatchlistKPPreview();
      document.getElementById("watchAutoResultsContainer").style.display = "none";
    });

  const gameSearchBtn = document.getElementById("gameAutoSearchBtn");
  const gameResultsContainer = document.getElementById("gameAutoResults");
  const gameTitleInput = document.getElementById("gameAutoTitle");
  if (gameSearchBtn) gameSearchBtn.addEventListener("click", handleGameSearch);
  if (gameTitleInput)
    gameTitleInput.addEventListener("input", () => {
      const q = gameTitleInput.value.trim();
      if (q) {
        showSearchLoading("gameAutoResultsContainer", "gameAutoResults");
      } else {
        document.getElementById("gameAutoResultsContainer").style.display =
          "none";
      }
      debouncedRAWGSearch(q);
    });
  if (gameResultsContainer)
    gameResultsContainer.addEventListener("click", async function (e) {
      const option = e.target.closest(".autocomplete-option");
      if (!option) return;
      const idx = parseInt(option.dataset.index, 10);
      selectedRAWGGame = rawgResults[idx] || null;
      if (selectedRAWGGame) {
        gameTitleInput.value = selectedRAWGGame.name || "";
        await fetchSteamGridPosters(selectedRAWGGame.name);
      }
      showRAWGPreview();
      document.getElementById("gameAutoResultsContainer").style.display = "none";
    });

  const playedSearchBtn = document.getElementById("playedGameAutoSearchBtn");
  const playedResultsContainer = document.getElementById("playedGameAutoResults");
  const playedTitleInput = document.getElementById("playedGameAutoTitle");
  if (playedSearchBtn)
    playedSearchBtn.addEventListener("click", handlePlayedGameSearch);
  if (playedTitleInput)
    playedTitleInput.addEventListener("input", () => {
      const q = playedTitleInput.value.trim();
      if (q) {
        showSearchLoading(
          "playedGameAutoResultsContainer",
          "playedGameAutoResults"
        );
      } else {
        document.getElementById("playedGameAutoResultsContainer").style.display =
          "none";
      }
      debouncedPlayedRAWGSearch(q);
    });
  if (playedResultsContainer)
    playedResultsContainer.addEventListener("click", async function (e) {
      const option = e.target.closest(".autocomplete-option");
      if (!option) return;
      const idx = parseInt(option.dataset.index, 10);
      selectedRAWGGame = rawgResults[idx] || null;
      if (selectedRAWGGame) {
        playedTitleInput.value = selectedRAWGGame.name || "";
        await fetchSteamGridPosters(selectedRAWGGame.name);
      }
      showPlayedGamePreview();
      document.getElementById("playedGameAutoResultsContainer").style.display = "none";
    });

  const preview = document.getElementById("editPosterPreview");
  const input = document.getElementById("editPoster");
  if (preview && input) {
    preview.addEventListener("click", () => input.click());
    input.addEventListener("change", async function () {
      if (this.files && this.files[0]) {
        try {
          editPosterData = await readFileAsDataURL(this.files[0]);
          preview.src = editPosterData;
        } catch (err) {
          console.error("Error reading file", err);
        }
      }
    });
  }

  const orderPreview = document.getElementById("editOrderPosterPreview");
  const orderInput = document.getElementById("editOrderPoster");
  if (orderPreview && orderInput) {
    orderPreview.addEventListener("click", () => orderInput.click());
    orderInput.addEventListener("change", async function () {
      if (this.files && this.files[0]) {
        try {
          editOrderPosterData = await readFileAsDataURL(this.files[0]);
          orderPreview.src = editOrderPosterData;
        } catch (err) {
          console.error("Error reading file", err);
        }
      }
    });
  }

  const gamePreview = document.getElementById("editGamePosterPreview");
  const gameInput = document.getElementById("editGamePoster");
  if (gamePreview && gameInput) {
    gamePreview.addEventListener("click", () => gameInput.click());
    gameInput.addEventListener("change", async function () {
      if (this.files && this.files[0]) {
        try {
          editGamePosterData = await readFileAsDataURL(this.files[0]);
          gamePreview.src = editGamePosterData;
        } catch (err) {
          console.error("Error reading file", err);
        }
      }
    });
  }

  const gameEditBtn = document.getElementById("editGamePosterBtn");
  if (gameEditBtn && gamePreview) {
    gameEditBtn.addEventListener("click", async () => {
      const title = document.getElementById("editGameTitle").value.trim();
      if (!title) {
        alert("Введите название игры");
        return;
      }
      await fetchSteamGridPosters(title);
      if (!steamGridPoster) {
        alert("Постеры не найдены");
        return;
      }
      const overlay = gamePreview.parentElement.nextElementSibling;
      if (overlay && overlay.classList.contains("poster-overlay")) overlay.remove();
      gamePreview.src = steamGridPoster;
      editGamePosterData = steamGridPoster;
      createPosterOverlay(gamePreview, steamGridPosters, true);
    });
  }

  const playedPreview = document.getElementById("editPlayedGamePosterPreview");
  const playedInput = document.getElementById("editPlayedGamePoster");
  if (playedPreview && playedInput) {
    playedPreview.addEventListener("click", () => playedInput.click());
    playedInput.addEventListener("change", async function () {
      if (this.files && this.files[0]) {
        try {
          editPlayedGamePosterData = await readFileAsDataURL(this.files[0]);
          playedPreview.src = editPlayedGamePosterData;
        } catch (err) {
          console.error("Error reading file", err);
        }
      }
    });
  }

  const playedEditBtn = document.getElementById("editPlayedGamePosterBtn");
  if (playedEditBtn && playedPreview) {
    playedEditBtn.addEventListener("click", async () => {
      const title = document.getElementById("editPlayedGameTitle").value.trim();
      if (!title) {
        alert("Введите название игры");
        return;
      }
      await fetchSteamGridPosters(title);
      if (!steamGridPoster) {
        alert("Постеры не найдены");
        return;
      }
      const overlay = playedPreview.parentElement.nextElementSibling;
      if (overlay && overlay.classList.contains("poster-overlay")) overlay.remove();
      playedPreview.src = steamGridPoster;
      editPlayedGamePosterData = steamGridPoster;
      createPosterOverlay(playedPreview, steamGridPosters, true);
    });
  }
});

// Отображение фильмов
function getFilteredSortedMovies() {
  let result = [...allMovies];

  if (currentSearchQuery) {
    const q = currentSearchQuery.toLowerCase();
    result = result.filter(
      (movie) =>
        movie.title.toLowerCase().includes(q) ||
        movie.year.toString().includes(q)
    );
  }

  switch (currentSort) {
    case "title":
      result.sort((a, b) =>
        sortAscending
          ? a.title.localeCompare(b.title)
          : b.title.localeCompare(a.title)
      );
      break;
    case "year":
      result.sort((a, b) =>
        sortAscending ? a.year - b.year : b.year - a.year
      );
      break;
    case "rating":
      result.sort((a, b) =>
        sortAscending ? a.rating - b.rating : b.rating - a.rating
      );
      break;
    case "date":
    default:
      result.sort((a, b) => (sortAscending ? a.id - b.id : b.id - a.id));
      break;
  }

  return result;
}

function renderMovies() {
  const grid = document.getElementById("moviesGrid");
  if (!grid) return;

  const filtered = getFilteredSortedMovies();
  totalMovies = filtered.length;
  const countEl = document.getElementById("moviesCount");
  if (countEl) {
    countEl.textContent = totalMovies;
  }
  const start = (currentPage - 1) * moviesPerPage;
  movies = filtered.slice(start, start + moviesPerPage);

  const newElements = new Map();
  const newData = new Map();
  const orderedCards = [];

  movies.forEach((movie) => {
    const dataKey = JSON.stringify(movie) + isAdmin;
    let card = movieCardElements.get(movie.id);
    const prevData = movieDataMap.get(movie.id);
    if (!card || prevData !== dataKey) {
      if (card) card.remove();
      card = createMovieCard(movie);
    }
    newElements.set(movie.id, card);
    newData.set(movie.id, dataKey);
    orderedCards.push(card);
  });

  if (!hasRenderedMovies) {
    grid.replaceChildren(...orderedCards);
    grid.classList.add("no-animation");
    hasRenderedMovies = true;
  } else {
    orderedCards.forEach((card) => grid.appendChild(card));
    movieCardElements.forEach((card, id) => {
      if (!newElements.has(id)) card.remove();
    });
  }

  movieCardElements = newElements;
  movieDataMap = newData;

  renderPagination();
}

function renderPagination() {
  const container = document.getElementById("pagination");
  if (!container) return;
  container.innerHTML = "";

  const totalPages = Math.ceil(totalMovies / moviesPerPage);
  if (totalPages <= 1) return;

  const addBtn = (label, page, opts = {}) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.className = opts.class || "page-btn";
    btn.disabled = opts.disabled || false;
    if (opts.active) btn.classList.add("active");
    if (page)
      btn.onclick = () => {
        currentPage = page;
        renderMovies();
      };
    container.appendChild(btn);
  };

  addBtn("«", currentPage - 1, { disabled: currentPage === 1 });

  addBtn("1", 1, { active: currentPage === 1 });

  let start = Math.max(2, currentPage - 1);
  let end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) {
    const span = document.createElement("span");
    span.textContent = "...";
    span.className = "ellipsis";
    container.appendChild(span);
  }

  for (let i = start; i <= end; i++) {
    addBtn(String(i), i, { active: i === currentPage });
  }

  if (end < totalPages - 1) {
    const span = document.createElement("span");
    span.textContent = "...";
    span.className = "ellipsis";
    container.appendChild(span);
  }

  if (totalPages > 1) {
    addBtn(String(totalPages), totalPages, {
      active: currentPage === totalPages,
    });
  }

  addBtn("»", currentPage + 1, { disabled: currentPage === totalPages });
}

// Создание карточки фильма
function createMovieCard(movie, showActions = isAdmin, showRateButton = true) {
  const card = document.createElement("div");
  card.dataset.id = movie.id;
  let cardClass = "movie-card";
  // Avoid highlighting preview cards as "worst" before a movie is saved
  if (movie.rating === 0 && movie.id !== 0) cardClass += " rating-low";
  if (movie.rating === 11 && movie.id !== 0) cardClass += " rating-high";
  card.className = cardClass;

  const poster = document.createElement("img");
  poster.src = movie.poster;
  poster.alt = movie.title;
  poster.className = "movie-poster";
  poster.loading = "lazy";
  const placeholder = document.createElement("div");
  placeholder.className = "movie-poster-placeholder";
  placeholder.style.display = "none";
  const placeholderText = document.createElement("span");
  placeholderText.textContent = "Нет постера";
  placeholder.appendChild(placeholderText);
  poster.onerror = () => {
    poster.style.display = "none";
    placeholder.style.display = "flex";
  };

  const orderByText =
    movie.orderBy && movie.orderBy !== "null" ? movie.orderBy : "";
  const ribbonClass = ORDER_TYPE_CLASSES[movie.orderType];
  let ribbon;
  if (orderByText) {
    ribbon = document.createElement("div");
    ribbon.className = `order-badge ${ribbonClass}`;
    ribbon.textContent = orderByText;
  }

  const info = document.createElement("div");
  info.className = "movie-info";

  const header = document.createElement("div");
  header.className = "movie-header";
  const title = document.createElement("div");
  title.className = "movie-title";
  title.textContent = movie.title;
  header.appendChild(title);
  info.appendChild(header);

  const originalTitle = document.createElement("div");
  originalTitle.className = "movie-original-title";
  originalTitle.textContent = movie.originalTitle;
  info.appendChild(originalTitle);

  const genres = document.createElement("div");
  genres.className = "movie-genres";
  genres.textContent = movie.genre;
  info.appendChild(genres);

  const year = document.createElement("div");
  year.className = "movie-year";
  year.textContent = movie.year;
  info.appendChild(year);

  const rating = document.createElement("div");
  rating.className = "movie-rating";

  const ratingItem1 = document.createElement("div");
  ratingItem1.className = "rating-item";
  const icon1 = document.createElement("img");
  icon1.src = "images/Pupsik_TV_Icon.webp";
  icon1.alt = "Pupsik Rate";
  const span1 = document.createElement("span");
  span1.textContent = `${movie.rating}`;
  ratingItem1.appendChild(icon1);
  ratingItem1.appendChild(span1);
  rating.appendChild(ratingItem1);

  const ratingItem2 = document.createElement("div");
  ratingItem2.className = "rating-item kp-rating-item";
  const icon2 = document.createElement("img");
  icon2.src = "images/kp_icon.webp";
  icon2.alt = "KP Rate";
  const span2 = document.createElement("span");
  span2.textContent = movie.kpRating ?? "-";
  ratingItem2.appendChild(icon2);
  ratingItem2.appendChild(span2);
  ratingItem2.addEventListener("click", () =>
    openKinopoiskPage(movie.title, movie.year, movie.originalTitle)
  );
  rating.appendChild(ratingItem2);

  const ratingItem3 = document.createElement("div");
  ratingItem3.className = "rating-item rating-user";
  const icon3 = document.createElement("i");
  icon3.className = "fa-solid fa-star";
  const span3 = document.createElement("span");
  span3.textContent = movie.userRating ?? "-";
  ratingItem3.appendChild(icon3);
  ratingItem3.appendChild(span3);
  const votes = movieUserRatings[movie.id]?.count ?? 0;
  ratingItem3.addEventListener("mouseenter", (e) => {
    if (!ratingTooltip) return;
    ratingTooltip.textContent = `Голосов: ${votes}`;
    ratingTooltip.style.display = "block";
    ratingTooltip.style.left = e.pageX + 10 + "px";
    ratingTooltip.style.top = e.pageY + 10 + "px";
  });
  ratingItem3.addEventListener("mousemove", (e) => {
    if (!ratingTooltip) return;
    ratingTooltip.style.left = e.pageX + 10 + "px";
    ratingTooltip.style.top = e.pageY + 10 + "px";
  });
  ratingItem3.addEventListener("mouseleave", () => {
    if (!ratingTooltip) return;
    ratingTooltip.style.display = "none";
  });
  rating.appendChild(ratingItem3);
  info.appendChild(rating);

  const footer = document.createElement("div");
  footer.className = "movie-footer";
  const dateDiv = document.createElement("div");
  dateDiv.className = "movie-date";
  dateDiv.textContent = `Добавлен: ${formatDate(movie.dateAdded)}`;
  footer.appendChild(dateDiv);

  const actions = document.createElement("div");
  actions.className = "movie-actions";

  if (showRateButton) {
    const rateBtn = document.createElement("button");
    rateBtn.className = "btn btn-rate btn-icon";
    rateBtn.textContent = "★";
    if (ratedMovies[movie.id]) {
      rateBtn.disabled = true;
      rateBtn.title = "Вы уже оценили";
    } else {
      rateBtn.onclick = () => openUserRateModal(movie.id);
    }
    actions.appendChild(rateBtn);
  }

  if (showActions) {
    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-edit btn-icon";
    editBtn.textContent = "✏️";
    editBtn.onclick = () => openEditModal(movie.id);
    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-delete btn-icon";
    delBtn.textContent = "🗑️";
    delBtn.onclick = () => openConfirmDeleteMovieModal(movie.id);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
  }

  footer.appendChild(actions);

  info.appendChild(footer);

  card.appendChild(poster);
  if (ribbon) card.appendChild(ribbon);
  card.appendChild(placeholder);
  card.appendChild(info);

  return card;
}

// Отображение списка к просмотру
function createOrderCard(order, showActions = isAdmin, showOrderBy = true) {
  const wrapper = document.createElement("div");
  wrapper.className = "order-wrapper";

  const card = document.createElement("div");
  card.className = "order-card";

  const poster = document.createElement("img");
  poster.src = order.poster;
  poster.alt = order.title;
  poster.className = "order-poster";
  poster.loading = "lazy";
  poster.onerror = () => {
    poster.style.display = "none";
  };
  card.appendChild(poster);

  const info = document.createElement("div");
  info.className = "order-info";

  const title = document.createElement("div");
  title.className = "order-title";
  title.textContent = order.title;
  info.appendChild(title);

  const orig = document.createElement("div");
  orig.className = "order-original-title";
  orig.textContent = order.originalTitle || "";
  info.appendChild(orig);

  const genres = document.createElement("div");
  genres.className = "order-genres";
  genres.textContent = order.genres || "";
  info.appendChild(genres);

  const meta = document.createElement("div");
  meta.className = "order-meta";
  const year = document.createElement("span");
  year.className = "order-year";
  year.textContent = order.year || "";
  meta.appendChild(year);
  if (order.length) {
    const lengthSpan = document.createElement("span");
    lengthSpan.className = "order-length";
    lengthSpan.textContent = `${order.length} мин`;
    meta.appendChild(lengthSpan);
  }
  const kpRating = document.createElement("span");
  kpRating.className = "order-kp-rating";
  const kpImg = document.createElement("img");
  kpImg.src = "images/kp_icon.webp";
  kpImg.alt = "KP Rate";
  kpRating.appendChild(kpImg);
  kpRating.appendChild(document.createTextNode(` ${order.kpRating ?? "-"}`));
  kpRating.addEventListener("click", () =>
    openKinopoiskPage(order.title, order.year, order.originalTitle)
  );
  meta.appendChild(kpRating);
  info.appendChild(meta);

  const footer = document.createElement("div");
  footer.className = "order-footer";

  const ribbonClass = ORDER_TYPE_CLASSES[order.orderType];
  const orderByText =
    order.orderBy && order.orderBy !== "null" ? order.orderBy : "";
  if (orderByText && showOrderBy) {
    const ribbon = document.createElement("div");
    ribbon.className = `order-badge ${ribbonClass}`;
    ribbon.textContent = orderByText;
    footer.appendChild(ribbon);
  }

  const row = document.createElement("div");
  row.className = "order-footer-row";

  const dateDiv = document.createElement("div");
  dateDiv.className = "order-date";
  dateDiv.textContent = formatDate(order.dateAdded);
  row.appendChild(dateDiv);

  if (showActions) {
    const actions = document.createElement("div");
    actions.className = "order-actions";
    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-edit btn-icon";
    editBtn.textContent = "✏️";
    editBtn.onclick = () => openEditOrderModal(order.id);
    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-delete btn-icon";
    delBtn.textContent = "🗑️";
    delBtn.onclick = () => openConfirmDeleteOrderModal(order.id);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    row.appendChild(actions);
  }

  footer.appendChild(row);
  info.appendChild(footer);
  card.appendChild(info);
  wrapper.appendChild(card);

  if (showActions) {
    const done = document.createElement("div");
    done.className = "order-complete";
    const doneBtn = document.createElement("button");
    doneBtn.className = "watch-complete-btn";
    doneBtn.textContent = "✓";
    doneBtn.onclick = () => openRateModal(order.id);
    done.appendChild(doneBtn);
    wrapper.appendChild(done);
  }

  return wrapper;
}

function renderWatchlist() {
  const container = document.getElementById("watchlistContainer");
  container.innerHTML = "";
  if (watchlist.length === 0) {
    renderEmptyState(container, "Заказанных фильмов пока нет");
    return;
  }

  watchlist.forEach((item) => {
    container.appendChild(createOrderCard(item));
  });
}

function createGameCard(game, showActions = isAdmin) {
  const wrapper = document.createElement("div");
  wrapper.className = "order-wrapper";

  const card = document.createElement("div");
  card.className = "order-card";

  const poster = document.createElement("img");
  poster.src = game.poster;
  poster.alt = game.title;
  poster.className = "order-poster";
  poster.loading = "lazy";
  poster.onerror = () => {
    poster.style.display = "none";
  };
  card.appendChild(poster);

  const info = document.createElement("div");
  info.className = "order-info";

  const title = document.createElement("div");
  title.className = "order-title";
  title.textContent = game.title;
  info.appendChild(title);

  const genres = document.createElement("div");
  genres.className = "order-genres";
  genres.textContent = game.genres || "";
  info.appendChild(genres);

  const meta = document.createElement("div");
  meta.className = "order-meta";
  const year = document.createElement("span");
  year.className = "order-year";
  year.textContent = game.year || "";
  meta.appendChild(year);
  info.appendChild(meta);

  const footer = document.createElement("div");
  footer.className = "order-footer";

  const ribbonClass = ORDER_TYPE_CLASSES[game.orderType];
  const orderByText =
    game.orderBy && game.orderBy !== "null" ? game.orderBy : "";
  if (orderByText) {
    const ribbon = document.createElement("div");
    ribbon.className = `order-badge ${ribbonClass}`;
    ribbon.textContent = orderByText;
    footer.appendChild(ribbon);
  }

  const row = document.createElement("div");
  row.className = "order-footer-row";

  const dateDiv = document.createElement("div");
  dateDiv.className = "order-date";
  dateDiv.textContent = formatDate(game.dateAdded);
  row.appendChild(dateDiv);

  if (showActions) {
    const actions = document.createElement("div");
    actions.className = "order-actions";
    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-edit btn-icon";
    editBtn.textContent = "✏️";
    editBtn.onclick = () => openEditGameModal(game.id);
    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-delete btn-icon";
    delBtn.textContent = "🗑️";
    delBtn.onclick = () => openConfirmDeleteGameOrderModal(game.id);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    row.appendChild(actions);
  }

  footer.appendChild(row);
  info.appendChild(footer);
  card.appendChild(info);
  wrapper.appendChild(card);

  if (showActions) {
    const done = document.createElement("div");
    done.className = "order-complete";
    const doneBtn = document.createElement("button");
    doneBtn.className = "watch-complete-btn";
    doneBtn.textContent = "✓";
    doneBtn.onclick = () => markGameDone(game.id);
    done.appendChild(doneBtn);
    wrapper.appendChild(done);
  }

  return wrapper;
}

function renderGames() {
  const container = document.getElementById("gamesContainer");
  if (!container) return;
  container.innerHTML = "";
  if (gameOrders.length === 0) {
    renderEmptyState(container, "Заказанных игр пока нет");
    return;
  }
  gameOrders.forEach((g) => container.appendChild(createGameCard(g)));
}

function getFilteredSortedPlayedGames() {
  let result = [...allPlayedGames];
  if (currentGameSearch) {
    const q = currentGameSearch.toLowerCase();
    result = result.filter(
      (g) => g.title.toLowerCase().includes(q) || g.year.toString().includes(q)
    );
  }
  switch (currentGameSort) {
    case "title":
      result.sort((a, b) =>
        gameSortAscending ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title)
      );
      break;
    case "year":
      result.sort((a, b) => (gameSortAscending ? a.year - b.year : b.year - a.year));
      break;
    case "rating":
      result.sort((a, b) => (gameSortAscending ? a.rating - b.rating : b.rating - a.rating));
      break;
    case "date":
    default:
      result.sort((a, b) => (gameSortAscending ? a.id - b.id : b.id - a.id));
      break;
  }
  return result;
}

function createPlayedGameCard(game, showActions = isAdmin) {
  const card = document.createElement("div");
  card.dataset.id = game.id;
  let cardClass = "movie-card";
  if (game.rating === 0 && game.id !== 0) cardClass += " rating-low";
  if (game.rating === 11 && game.id !== 0) cardClass += " rating-high";
  card.className = cardClass;

  const poster = document.createElement("img");
  poster.src = game.poster;
  poster.alt = game.title;
  poster.className = "movie-poster";
  poster.loading = "lazy";
  const placeholder = document.createElement("div");
  placeholder.className = "movie-poster-placeholder";
  placeholder.style.display = "none";
  const placeholderText = document.createElement("span");
  placeholderText.textContent = "Нет постера";
  placeholder.appendChild(placeholderText);
  poster.onerror = () => {
    poster.style.display = "none";
    placeholder.style.display = "flex";
  };

  const orderByText =
    game.orderBy && game.orderBy !== "null" ? game.orderBy : "";
  const ribbonClass = ORDER_TYPE_CLASSES[game.orderType];
  let ribbon;
  if (orderByText) {
    ribbon = document.createElement("div");
    ribbon.className = `order-badge ${ribbonClass}`;
    ribbon.textContent = orderByText;
  }

  const info = document.createElement("div");
  info.className = "movie-info";
  const header = document.createElement("div");
  header.className = "movie-header";
  const title = document.createElement("div");
  title.className = "movie-title";
  title.textContent = game.title;
  header.appendChild(title);
  info.appendChild(header);

  const genres = document.createElement("div");
  genres.className = "movie-genres";
  genres.textContent = game.genres || "";
  info.appendChild(genres);

  const year = document.createElement("div");
  year.className = "movie-year";
  year.textContent = game.year || "";
  info.appendChild(year);

  const ratingDiv = document.createElement("div");
  ratingDiv.className = "movie-rating";
  const item1 = document.createElement("div");
  item1.className = "rating-item";
  const icon1 = document.createElement("img");
  icon1.src = "images/Pupsik_TV_Icon.webp";
  icon1.alt = "Pupsik Rate";
  const span1 = document.createElement("span");
  span1.textContent = `${game.rating}`;
  item1.appendChild(icon1);
  item1.appendChild(span1);
  ratingDiv.appendChild(item1);
  info.appendChild(ratingDiv);

  const footer = document.createElement("div");
  footer.className = "movie-footer";
  const dateDiv = document.createElement("div");
  dateDiv.className = "movie-date";
  dateDiv.textContent = `Добавлен: ${formatDate(game.dateAdded)}`;
  footer.appendChild(dateDiv);
  if (showActions) {
    const actions = document.createElement("div");
    actions.className = "movie-actions";
    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-edit btn-icon";
    editBtn.textContent = "✏️";
    editBtn.onclick = () => openEditPlayedGameModal(game.id);
    actions.appendChild(editBtn);
    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-delete btn-icon";
    delBtn.textContent = "🗑️";
    delBtn.onclick = () => openConfirmDeletePlayedGameModal(game.id);
    actions.appendChild(delBtn);
    footer.appendChild(actions);
  }
  info.appendChild(footer);

  card.appendChild(poster);
  if (ribbon) card.appendChild(ribbon);
  card.appendChild(placeholder);
  card.appendChild(info);
  return card;
}

function renderPlayedGames() {
  const grid = document.getElementById("gamesGridPlayed");
  if (!grid) return;

  const filtered = getFilteredSortedPlayedGames();
  totalGamesPlayed = filtered.length;
  const countEl = document.getElementById("gamesCount");
  if (countEl) countEl.textContent = totalGamesPlayed;
  const start = (gamePage - 1) * gamesPerPage;
  playedGames = filtered.slice(start, start + gamesPerPage);

  const fragment = document.createDocumentFragment();
  const newElements = new Map();
  const newData = new Map();

  playedGames.forEach((game) => {
    const dataKey = JSON.stringify(game) + isAdmin;
    let card = playedGameCardElements.get(game.id);
    const prevData = playedGameDataMap.get(game.id);
    if (!card || prevData !== dataKey) {
      if (card) card.remove();
      card = createPlayedGameCard(game);
    }
    fragment.appendChild(card);
    newElements.set(game.id, card);
    newData.set(game.id, dataKey);
  });

  grid.replaceChildren(fragment);
  playedGameCardElements = newElements;
  playedGameDataMap = newData;

  renderGamesPagination();
}

function renderGamesPagination() {
  const container = document.getElementById("gamesPagination");
  if (!container) return;
  container.innerHTML = "";
  const totalPages = Math.ceil(totalGamesPlayed / gamesPerPage);
  if (totalPages <= 1) return;
  const addBtn = (label, page, opts = {}) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.className = opts.class || "page-btn";
    btn.disabled = opts.disabled || false;
    if (opts.active) btn.classList.add("active");
    if (page)
      btn.onclick = () => {
        gamePage = page;
        renderPlayedGames();
      };
    container.appendChild(btn);
  };
  addBtn("«", gamePage - 1, { disabled: gamePage === 1 });
  addBtn("1", 1, { active: gamePage === 1 });
  let start = Math.max(2, gamePage - 1);
  let end = Math.min(totalPages - 1, gamePage + 1);
  if (start > 2) {
    const span = document.createElement("span");
    span.textContent = "...";
    span.className = "ellipsis";
    container.appendChild(span);
  }
  for (let i = start; i <= end; i++) {
    addBtn(String(i), i, { active: i === gamePage });
  }
  if (end < totalPages - 1) {
    const span = document.createElement("span");
    span.textContent = "...";
    span.className = "ellipsis";
    container.appendChild(span);
  }
  if (totalPages > 1) {
    addBtn(String(totalPages), totalPages, { active: gamePage === totalPages });
  }
  addBtn("»", gamePage + 1, { disabled: gamePage === totalPages });
}

function searchPlayedGames(q) {
  currentGameSearch = q;
  gamePage = 1;
  renderPlayedGames();
}

const debouncedSearchPlayedGames = debounce(searchPlayedGames, 300);

function sortPlayedGames(sort) {
  currentGameSort = sort;
  renderPlayedGames();
}

function toggleGameSortOrder() {
  gameSortAscending = !gameSortAscending;
  const btn = document.getElementById("gameSortOrderBtn");
  if (btn) {
    const img = document.createElement("img");
    img.src = gameSortAscending ? "images/up-arrow.webp" : "images/down-arrow.webp";
    img.alt = "";
    img.className = "sort-arrow";
    btn.replaceChildren(img);
  }
  renderPlayedGames();
}

async function deletePlayedGame(id) {
  const idx = allPlayedGames.findIndex((g) => g.id === id);
  if (idx !== -1) {
    allPlayedGames.splice(idx, 1);
    try {
      await supabaseClient.from("games").delete().eq("id", id);
    } catch (err) {
      console.error("Error deleting game", err);
    }
    localStorage.setItem("gamesCache", JSON.stringify(allPlayedGames));
    renderPlayedGames();
  }
}

// Поиск фильмов
function searchMovies(query) {
  currentSearchQuery = query;
  currentPage = 1;
  renderMovies();
}

const debouncedSearchMovies = debounce(searchMovies, 300);

const debouncedKPSearch = debounce(async (query) => {
  if (!query) {
    const container = document.getElementById("autoResultsContainer");
    if (container) container.style.display = "none";
    kpResults = [];
    selectedKPMovie = null;
    showKPPreview();
    return;
  }

  try {
    const url = `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(query)}&page=1`;
    const res = await fetch(url, {
      headers: {
        "X-API-KEY": KINOPOISK_API_KEY,
        "Content-Type": "application/json",
      },
    });
    const data = await res.json();
    kpResults = data.films || [];
    const container = document.getElementById("autoResultsContainer");
    const list = document.getElementById("autoResults");
    if (!list) return;
    list.innerHTML = "";
    kpResults.forEach((m, idx) => {
      const div = document.createElement("div");
      div.className = "autocomplete-option";
      div.dataset.index = idx;
      const year = m.year || "";
      const name = m.nameRu || m.nameEn || "";
      div.textContent = `${name}${year ? ` (${year})` : ""}`;
      list.appendChild(div);
    });
    if (kpResults.length > 0) {
      container.style.display = "block";
    } else {
      container.style.display = "none";
    }
  } catch (err) {
    console.error("Kinopoisk autocomplete error", err);
  }
}, 100);

const debouncedWatchlistKPSearch = debounce(async (query) => {
  if (!query) {
    const container = document.getElementById("watchAutoResultsContainer");
    if (container) container.style.display = "none";
    kpOrderResults = [];
    selectedKPOrderMovie = null;
    showWatchlistKPPreview();
    return;
  }

  try {
    const url = `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(query)}&page=1`;
    const res = await fetch(url, {
      headers: {
        "X-API-KEY": KINOPOISK_API_KEY,
        "Content-Type": "application/json",
      },
    });
    const data = await res.json();
    kpOrderResults = data.films || [];
    const container = document.getElementById("watchAutoResultsContainer");
    const list = document.getElementById("watchAutoResults");
    if (!list) return;
    list.innerHTML = "";
    kpOrderResults.forEach((m, idx) => {
      const div = document.createElement("div");
      div.className = "autocomplete-option";
      div.dataset.index = idx;
      const year = m.year || "";
      const name = m.nameRu || m.nameEn || "";
      div.textContent = `${name}${year ? ` (${year})` : ""}`;
      list.appendChild(div);
    });
    if (kpOrderResults.length > 0) {
      container.style.display = "block";
    } else {
      container.style.display = "none";
    }
  } catch (err) {
    console.error("Kinopoisk autocomplete error", err);
  }
}, 100);

const debouncedRAWGSearch = debounce(async (query) => {
  if (!query) {
    const container = document.getElementById("gameAutoResultsContainer");
    if (container) container.style.display = "none";
    rawgResults = [];
    selectedRAWGGame = null;
    steamGridPoster = null;
    steamGridPosters = [];
    showRAWGPreview();
    return;
  }

  try {
    const url = `${RAWG_SEARCH_URL}?key=${RAWG_API_KEY}&search=${encodeURIComponent(query)}&page_size=5`;
    const res = await fetch(url);
    const data = await res.json();
    rawgResults = data.results || [];
    const container = document.getElementById("gameAutoResultsContainer");
    const list = document.getElementById("gameAutoResults");
    if (!list) return;
    list.innerHTML = "";
    rawgResults.forEach((g, idx) => {
      const div = document.createElement("div");
      div.className = "autocomplete-option";
      div.dataset.index = idx;
      const year = g.released ? g.released.split("-")[0] : "";
      div.textContent = `${g.name}${year ? ` (${year})` : ""}`;
      list.appendChild(div);
    });
    if (rawgResults.length > 0) {
      container.style.display = "block";
    } else {
      container.style.display = "none";
    }
  } catch (err) {
    console.error("RAWG autocomplete error", err);
  }
}, 100);

const debouncedPlayedRAWGSearch = debounce(async (query) => {
  if (!query) {
    const container = document.getElementById("playedGameAutoResultsContainer");
    if (container) container.style.display = "none";
    rawgResults = [];
    selectedRAWGGame = null;
    steamGridPoster = null;
    showPlayedGamePreview();
    return;
  }

  try {
    const url = `${RAWG_SEARCH_URL}?key=${RAWG_API_KEY}&search=${encodeURIComponent(query)}&page_size=5`;
    const res = await fetch(url);
    const data = await res.json();
    rawgResults = data.results || [];
    const container = document.getElementById("playedGameAutoResultsContainer");
    const list = document.getElementById("playedGameAutoResults");
    if (!list) return;
    list.innerHTML = "";
    rawgResults.forEach((g, idx) => {
      const div = document.createElement("div");
      div.className = "autocomplete-option";
      div.dataset.index = idx;
      const year = g.released ? g.released.split("-")[0] : "";
      div.textContent = `${g.name}${year ? ` (${year})` : ""}`;
      list.appendChild(div);
    });
    if (rawgResults.length > 0) {
      container.style.display = "block";
    } else {
      container.style.display = "none";
    }
  } catch (err) {
    console.error("RAWG autocomplete error", err);
  }
}, 100);

async function handleKPSearch() {
  const btn = document.getElementById("autoSearchBtn");
  const loader = document.getElementById("autoSearchLoading");
  if (loader) loader.style.display = "inline-block";
  if (btn) btn.disabled = true;
  const title = document.getElementById("autoTitle").value.trim();
  if (!title) {
    alert("Введите название фильма");
    if (loader) loader.style.display = "none";
    if (btn) btn.disabled = false;
    return;
  }

  try {
    const url = `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(
      title
    )}&page=1`;
    const res = await fetch(url, {
      headers: {
        "X-API-KEY": KINOPOISK_API_KEY,
        "Content-Type": "application/json",
      },
    });
    const data = await res.json();
    kpResults = data.films || [];
    const container = document.getElementById("autoResultsContainer");
    const list = document.getElementById("autoResults");
    list.innerHTML = "";
    kpResults.forEach((m, idx) => {
      const div = document.createElement("div");
      div.className = "autocomplete-option";
      div.dataset.index = idx;
      const year = m.year || "";
      const name = m.nameRu || m.nameEn || "";
      div.textContent = `${name}${year ? ` (${year})` : ""}`;
      list.appendChild(div);
    });
    if (kpResults.length > 0) {
      container.style.display = "block";
      selectedKPMovie = kpResults[0];
      showKPPreview();
    } else {
      container.style.display = "none";
      selectedKPMovie = null;
      showKPPreview();
      alert("Ничего не найдено");
    }
  } catch (err) {
    console.error("Kinopoisk search error", err);
  }
  if (loader) loader.style.display = "none";
  if (btn) btn.disabled = false;
}

async function handleWatchlistSearch() {
  const btn = document.getElementById("watchAutoSearchBtn");
  const loader = document.getElementById("watchAutoSearchLoading");
  if (loader) loader.style.display = "inline-block";
  if (btn) btn.disabled = true;
  const title = document.getElementById("watchAutoTitle").value.trim();
  if (!title) {
    alert("Введите название фильма");
    if (loader) loader.style.display = "none";
    if (btn) btn.disabled = false;
    return;
  }

  try {
    const url = `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(
      title
    )}&page=1`;
    const res = await fetch(url, {
      headers: {
        "X-API-KEY": KINOPOISK_API_KEY,
        "Content-Type": "application/json",
      },
    });
    const data = await res.json();
    kpOrderResults = data.films || [];
    const container = document.getElementById("watchAutoResultsContainer");
    const list = document.getElementById("watchAutoResults");
    list.innerHTML = "";
    kpOrderResults.forEach((m, idx) => {
      const div = document.createElement("div");
      div.className = "autocomplete-option";
      div.dataset.index = idx;
      const year = m.year || "";
      const name = m.nameRu || m.nameEn || "";
      div.textContent = `${name}${year ? ` (${year})` : ""}`;
      list.appendChild(div);
    });
    if (kpOrderResults.length > 0) {
      container.style.display = "block";
      selectedKPOrderMovie = kpOrderResults[0];
      showWatchlistKPPreview();
    } else {
      container.style.display = "none";
      selectedKPOrderMovie = null;
      showWatchlistKPPreview();
      alert("Ничего не найдено");
    }
  } catch (err) {
    console.error("Kinopoisk search error", err);
  }
  if (loader) loader.style.display = "none";
  if (btn) btn.disabled = false;
}

function showKPPreview() {
  const preview = document.getElementById("autoPreview");
  if (!preview) return;
  preview.innerHTML = "";
  if (!selectedKPMovie) {
    preview.style.display = "none";
    return;
  }
  const movie = {
    id: 0,
    title: selectedKPMovie.nameRu || selectedKPMovie.nameEn || "",
    originalTitle: selectedKPMovie.nameEn || "",
    year: selectedKPMovie.year || "",
    rating: getCurrentRating("ratingStars"),
    kpRating: selectedKPMovie.rating || "-",
    poster:
      selectedKPMovie.posterUrlPreview ||
      selectedKPMovie.posterUrl ||
      "https://via.placeholder.com/300x400?text=Нет+постера",
    dateAdded: new Date().toISOString().split("T")[0],
    genre: selectedKPMovie.genres?.map((g) => g.genre).join(", ") || "",
  };
  preview.appendChild(createMovieCard(movie, false, false));
  preview.style.display = "block";
}

// Preview for watchlist modal
function showWatchlistKPPreview() {
  const preview = document.getElementById("watchAutoPreview");
  if (!preview) return;
  preview.innerHTML = "";
  if (!selectedKPOrderMovie) {
    preview.style.display = "none";
    return;
  }
  if (
    selectedKPOrderMovie.filmLength === undefined &&
    selectedKPOrderMovie.filmId
  ) {
    fetchKPFilmLength(selectedKPOrderMovie.filmId).then((len) => {
      selectedKPOrderMovie.filmLength = len;
      showWatchlistKPPreview();
    });
  }
  const order = {
    title: selectedKPOrderMovie.nameRu || selectedKPOrderMovie.nameEn || "",
    originalTitle: selectedKPOrderMovie.nameEn || "",
    year: selectedKPOrderMovie.year || "",
    length: selectedKPOrderMovie.filmLength || null,
    kpRating: selectedKPOrderMovie.rating || "-",
    poster:
      selectedKPOrderMovie.posterUrlPreview ||
      selectedKPOrderMovie.posterUrl ||
      "https://via.placeholder.com/300x400?text=Нет+постера",
    genres: selectedKPOrderMovie.genres?.map((g) => g.genre).join(", ") || "",
    orderBy: document.getElementById("watchOrderBy").value || "",
    orderType: document.getElementById("watchOrderType").value || "",
    dateAdded: new Date().toISOString().split("T")[0],
  };
  preview.appendChild(createOrderCard(order, false, false));
  preview.style.display = "block";
}

async function fetchKinopoiskFilm(title, year, originalTitle = "") {
  if (!KINOPOISK_API_KEY) {
    return null;
  }
  const query = (originalTitle || title || "").trim();
  if (!query) {
    return null;
  }
  try {
    const res = await fetch(
      `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(query)}&page=1`,
      {
        headers: {
          "X-API-KEY": KINOPOISK_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );
    if (!res.ok) {
      console.error("Kinopoisk search error", res.status, res.statusText);
      return null;
    }
    const data = await res.json();
    const films = data.films || [];
    if (!films.length) {
      return null;
    }
    const targetYear = Number(year);
    let film = null;
    if (targetYear) {
      film =
        films.find((f) => Number(f.year) === targetYear) ||
        films.find((f) => {
          const filmYear = Number(f.year);
          return filmYear && Math.abs(filmYear - targetYear) <= 1;
        });
    }
    if (!film && title) {
      const normalizedTitle = title.trim().toLowerCase();
      film = films.find((f) => (f.nameRu || f.nameEn || "").trim().toLowerCase() === normalizedTitle) || null;
    }
    return film || films[0] || null;
  } catch (err) {
    console.error("Kinopoisk search error", err);
    return null;
  }
}

async function openKinopoiskPage(title, year, originalTitle = "") {
  const query = (originalTitle || title || "").trim();
  if (!query) {
    return;
  }
  if (!KINOPOISK_API_KEY) {
    window.open(
      `https://www.kinopoisk.ru/index.php?kp_query=${encodeURIComponent(query)}`,
      "_blank"
    );
    return;
  }
  const film = await fetchKinopoiskFilm(title, year, originalTitle);
  if (film && film.filmId) {
    window.open(`https://www.kinopoisk.ru/film/${film.filmId}/`, "_blank");
    return;
  }
  window.open(
    `https://www.kinopoisk.ru/index.php?kp_query=${encodeURIComponent(query)}`,
    "_blank"
  );
}

async function handleGameSearch() {
  const btn = document.getElementById("gameAutoSearchBtn");
  const loader = document.getElementById("gameAutoSearchLoading");
  if (loader) loader.style.display = "inline-block";
  if (btn) btn.disabled = true;
  const title = document.getElementById("gameAutoTitle").value.trim();
  if (!title) {
    alert("Введите название игры");
    if (loader) loader.style.display = "none";
    if (btn) btn.disabled = false;
    return;
  }

  try {
    const url = `${RAWG_SEARCH_URL}?key=${RAWG_API_KEY}&search=${encodeURIComponent(
      title
    )}&page_size=5`;
    const res = await fetch(url);
    const data = await res.json();
    rawgResults = data.results || [];
    const container = document.getElementById("gameAutoResultsContainer");
    const list = document.getElementById("gameAutoResults");
    list.innerHTML = "";
    rawgResults.forEach((g, idx) => {
      const div = document.createElement("div");
      div.className = "autocomplete-option";
      div.dataset.index = idx;
      const year = g.released ? g.released.split("-")[0] : "";
      div.textContent = `${g.name}${year ? ` (${year})` : ""}`;
      list.appendChild(div);
    });
    if (rawgResults.length > 0) {
      container.style.display = "block";
      selectedRAWGGame = rawgResults[0];
      await fetchSteamGridPosters(selectedRAWGGame.name);
      showRAWGPreview();
    } else {
      container.style.display = "none";
      selectedRAWGGame = null;
      steamGridPoster = null;
      steamGridPosters = [];
      showRAWGPreview();
      alert("Ничего не найдено");
    }
  } catch (err) {
    console.error("RAWG search error", err);
  }
  if (loader) loader.style.display = "none";
  if (btn) btn.disabled = false;
}

function showRAWGPreview() {
  const preview = document.getElementById("gameAutoPreview");
  if (!preview) return;
  preview.innerHTML = "";
  if (!selectedRAWGGame) {
    preview.style.display = "none";
    return;
  }
  const game = {
    title: selectedRAWGGame.name || "",
    genres: selectedRAWGGame.genres?.map((g) => g.name).join(", ") || "",
    year: selectedRAWGGame.released
      ? selectedRAWGGame.released.split("-")[0]
      : "",
    poster:
      steamGridPoster ||
      selectedRAWGGame.background_image ||
      "https://via.placeholder.com/300x400?text=Нет+постера",
    orderBy: document.getElementById("gameOrderBy").value || "",
    orderType: document.getElementById("gameOrderType").value || "",
    dateAdded: new Date().toISOString().split("T")[0],
  };
  const card = createGameCard(game, false);
  preview.appendChild(card);
  createPosterOverlay(card.querySelector(".order-poster"), steamGridPosters, true);
  preview.style.display = "block";
}

async function handlePlayedGameSearch() {
  const btn = document.getElementById("playedGameAutoSearchBtn");
  const loader = document.getElementById("playedGameAutoSearchLoading");
  if (loader) loader.style.display = "inline-block";
  if (btn) btn.disabled = true;
  const title = document.getElementById("playedGameAutoTitle").value.trim();
  if (!title) {
    alert("Введите название игры");
    if (loader) loader.style.display = "none";
    if (btn) btn.disabled = false;
    return;
  }

  try {
    const url = `${RAWG_SEARCH_URL}?key=${RAWG_API_KEY}&search=${encodeURIComponent(
      title
    )}&page_size=5`;
    const res = await fetch(url);
    const data = await res.json();
    rawgResults = data.results || [];
    const container = document.getElementById("playedGameAutoResultsContainer");
    const list = document.getElementById("playedGameAutoResults");
    list.innerHTML = "";
    rawgResults.forEach((g, idx) => {
      const div = document.createElement("div");
      div.className = "autocomplete-option";
      div.dataset.index = idx;
      const year = g.released ? g.released.split("-")[0] : "";
      div.textContent = `${g.name}${year ? ` (${year})` : ""}`;
      list.appendChild(div);
    });
    if (rawgResults.length > 0) {
      container.style.display = "block";
      selectedRAWGGame = rawgResults[0];
      await fetchSteamGridPosters(selectedRAWGGame.name);
      showPlayedGamePreview();
    } else {
      container.style.display = "none";
      selectedRAWGGame = null;
      steamGridPoster = null;
      showPlayedGamePreview();
      alert("Ничего не найдено");
    }
  } catch (err) {
    console.error("RAWG search error", err);
  }
  if (loader) loader.style.display = "none";
  if (btn) btn.disabled = false;
}

function showPlayedGamePreview() {
  const preview = document.getElementById("playedGameAutoPreview");
  if (!preview) return;
  preview.innerHTML = "";
  if (!selectedRAWGGame) {
    preview.style.display = "none";
    return;
  }
  const game = {
    title: selectedRAWGGame.name || "",
    genres: selectedRAWGGame.genres?.map((g) => g.name).join(", ") || "",
    year: selectedRAWGGame.released
      ? selectedRAWGGame.released.split("-")[0]
      : "",
    poster:
      steamGridPoster ||
      selectedRAWGGame.background_image ||
      "https://via.placeholder.com/300x400?text=Нет+постера",
    rating: getCurrentRating("playedGameRatingStars"),
    orderBy: document.getElementById("playedGameOrderBy").value || "",
    orderType: document.getElementById("playedGameOrderType").value || "",
    dateAdded: new Date().toISOString().split("T")[0],
  };
  const card = createPlayedGameCard(game, false);
  preview.appendChild(card);
  createPosterOverlay(card.querySelector(".movie-poster"), steamGridPosters, true);
  preview.style.display = "block";
}

// Сортировка фильмов
function sortMovies(criteria) {
  currentSort = criteria;
  currentPage = 1;
  renderMovies();
}

function toggleSortOrder() {
  sortAscending = !sortAscending;
  const orderBtn = document.getElementById("sortOrderBtn");
  if (orderBtn) {
    const img = document.createElement("img");
    img.src = sortAscending ? "images/up-arrow.webp" : "images/down-arrow.webp";
    img.alt = "";
    img.className = "sort-arrow";

    orderBtn.replaceChildren(img);
  }
  currentPage = 1;
  renderMovies();
}

// Модальные окна
function openAddMovieModal() {
  document.getElementById("addMovieModal").style.display = "block";
}

function openAddToWatchlistModal() {
  document.getElementById("addWatchlistModal").style.display = "block";
}

function showDuplicateModal() {
  document.getElementById("duplicateModal").style.display = "block";
}

function showSearchReminderModal() {
  document.getElementById("searchReminderModal").style.display = "block";
}

function openRateModal(id) {
  ratingMovieId = id;
  const item = watchlist.find((w) => w.id === id);
  if (item) {
    document.getElementById("rateMovieTitle").textContent = item.title;
    document.getElementById("rateMoviePoster").src = item.poster;
  } else {
    document.getElementById("rateMovieTitle").textContent = "";
    document.getElementById("rateMoviePoster").src = "https://via.placeholder.com/300x400?text=Нет+постера";
  }
  document.getElementById("rateMovieModal").style.display = "block";
  setRatingStars("rateMovieStars", 0);
  setupRatingStars("rateMovieStars");
  const confirmBtn = document.querySelector("#rateMovieModal .btn-primary");
  if (confirmBtn) confirmBtn.disabled = isSubmittingRating;
}

function openRateGameModal(id) {
  ratingGameId = id;
  const item = gameOrders.find((g) => g.id === id);
  if (item) {
    document.getElementById("rateGameTitle").textContent = item.title;
    document.getElementById("rateGamePoster").src = item.poster;
  } else {
    document.getElementById("rateGameTitle").textContent = "";
    document.getElementById("rateGamePoster").src = "https://via.placeholder.com/300x400?text=Нет+постера";
  }
  document.getElementById("rateGameModal").style.display = "block";
  setRatingStars("rateGameStars", 0);
  setupRatingStars("rateGameStars");
}

function openUserRateModal(id) {
  if (ratedMovies[id]) {
    alert("Вы уже оценили этот фильм");
    return;
  }
  userRatingMovieId = id;
  const movie = allMovies.find((m) => m.id === id);
  if (movie) {
    document.getElementById("userRateMovieTitle").textContent = movie.title;
    document.getElementById("userRateMoviePoster").src = movie.poster;
    setRatingStars("userRateStars", 0);
  }
  document.getElementById("userRateModal").style.display = "block";
  setupRatingStars("userRateStars");
}

function openEditModal(id) {
  editingMovieId = id;
  const movie = allMovies.find((m) => m.id === id);

  document.getElementById("editTitle").value = movie.title;
  document.getElementById("editYear").value = movie.year;
  document.getElementById("editGenre").value = movie.genre || "";
  document.getElementById("editMovieOrderBy").value = movie.orderBy || "";
  document.getElementById("editPosterPreview").src = movie.poster;
  document.getElementById("editPoster").value = "";
  editPosterData = null;

  // Установка рейтинга
  setRatingStars("editRatingStars", movie.rating);
  setupRatingStars("editRatingStars");

  document.getElementById("editMovieModal").style.display = "block";
}

async function performDeleteMovie(id) {
  const index = allMovies.findIndex((m) => m.id === id);
  if (index !== -1) {
    allMovies.splice(index, 1);
    localStorage.setItem("moviesCache", JSON.stringify(allMovies));
    renderMovies();
    try {
      await supabaseClient.from("movies").delete().eq("id", id);
    } catch (err) {
      console.error("Error deleting movie from Supabase", err);
    }
  }
}

async function performDeleteOrder(id) {

  const index = watchlist.findIndex((o) => o.id === id);
  if (index !== -1) {
    watchlist.splice(index, 1);
    renderWatchlist();
    try {
      await supabaseClient.from("Movie_Orders").delete().eq("id", id);
    } catch (err) {
      console.error("Error deleting order from Supabase", err);
    }
  }
}

async function performDeleteGameOrder(id) {

  const index = gameOrders.findIndex((g) => g.id === id);
  if (index !== -1) {
    gameOrders.splice(index, 1);
    renderGames();
    try {
      await supabaseClient.from("Game_Orders").delete().eq("id", id);
    } catch (err) {
      console.error("Error deleting game order from Supabase", err);
    }
  }
}

function markGameDone(id) {
  openRateGameModal(id);
}

function openEditGameModal(id) {
  editingGameId = id;
  const game = gameOrders.find((g) => g.id === id);
  if (!game) return;
  const preview = document.getElementById("editGamePosterPreview");
  const overlay = preview.parentElement.nextElementSibling;
  if (overlay && overlay.classList.contains("poster-overlay")) overlay.remove();
  steamGridPoster = null;
  steamGridPosters = [];
  document.getElementById("editGameTitle").value = game.title;
  document.getElementById("editGameYear").value = game.year || "";
  document.getElementById("editGameGenres").value = game.genres || "";
  document.getElementById("editGameOrderBy").value = game.orderBy || "";
  document.getElementById("editGameOrderType").value = game.orderType || "";
  preview.src = game.poster;
  document.getElementById("editGamePoster").value = "";
  editGamePosterData = null;
  document.getElementById("editGameModal").style.display = "block";
}

function openEditPlayedGameModal(id) {
  editingPlayedGameId = id;
  const game = allPlayedGames.find((g) => g.id === id);
  if (!game) return;
  const preview = document.getElementById("editPlayedGamePosterPreview");
  const overlay = preview.parentElement.nextElementSibling;
  if (overlay && overlay.classList.contains("poster-overlay")) overlay.remove();
  steamGridPoster = null;
  steamGridPosters = [];
  document.getElementById("editPlayedGameTitle").value = game.title;
  document.getElementById("editPlayedGameYear").value = game.year || "";
  document.getElementById("editPlayedGameGenres").value = game.genres || "";
  document.getElementById("editPlayedGameOrderBy").value = game.orderBy || "";
  document.getElementById("editPlayedGameOrderType").value = game.orderType || "";
  preview.src = game.poster;
  document.getElementById("editPlayedGamePoster").value = "";
  setRatingStars("editPlayedGameRatingStars", game.rating);
  setupRatingStars("editPlayedGameRatingStars");
  editPlayedGamePosterData = null;
  document.getElementById("editPlayedGameModal").style.display = "block";
}

function openAddGameModal() {
  document.getElementById("addGameModal").style.display = "block";
}

function openAddPlayedGameModal() {
  document.getElementById("addPlayedGameModal").style.display = "block";
  setRatingStars("playedGameRatingStars", 0);
  setupRatingStars("playedGameRatingStars");
}

function openConfirmDeleteMovieModal(id) {
  deleteMovieId = id;
  document.getElementById("confirmDeleteMovieModal").style.display = "block";
}

async function confirmDeleteMovie() {
  if (deleteMovieId !== null) {
    await performDeleteMovie(deleteMovieId);
    deleteMovieId = null;
  }
  closeModal("confirmDeleteMovieModal");
}

function openConfirmDeletePlayedGameModal(id) {
  deletePlayedGameId = id;
  document.getElementById("confirmDeletePlayedGameModal").style.display = "block";
}

async function confirmDeletePlayedGame() {
  if (deletePlayedGameId !== null) {
    await deletePlayedGame(deletePlayedGameId);
    deletePlayedGameId = null;
  }
  closeModal("confirmDeletePlayedGameModal");
}

function openConfirmDeleteOrderModal(id) {
  deleteOrderId = id;
  document.getElementById("confirmDeleteOrderModal").style.display = "block";
}

async function confirmDeleteOrder() {
  if (deleteOrderId !== null) {
    await performDeleteOrder(deleteOrderId);
    deleteOrderId = null;
  }
  closeModal("confirmDeleteOrderModal");
}

function openConfirmDeleteGameOrderModal(id) {
  deleteGameOrderId = id;
  document.getElementById("confirmDeleteGameOrderModal").style.display = "block";
}

async function confirmDeleteGameOrder() {
  if (deleteGameOrderId !== null) {
    await performDeleteGameOrder(deleteGameOrderId);
    deleteGameOrderId = null;
  }
  closeModal("confirmDeleteGameOrderModal");
}

function openEditOrderModal(id) {
  editingOrderId = id;
  const order = watchlist.find((o) => o.id === id);
  if (!order) return;
  document.getElementById("editOrderTitle").value = order.title;
  document.getElementById("editOrderOriginTitle").value =
    order.originalTitle || "";
  document.getElementById("editOrderYear").value = order.year || "";
  document.getElementById("editOrderGenre").value = order.genres || "";
  document.getElementById("editOrderBy").value = order.orderBy || "";
  document.getElementById("editOrderType").value = order.orderType || "";
  document.getElementById("editOrderPosterPreview").src = order.poster;
  document.getElementById("editOrderPoster").value = "";
  editOrderPosterData = null;
  document.getElementById("editOrderModal").style.display = "block";
}

function closeModal(modalId, shouldReset = false) {
  document.getElementById(modalId).style.display = "none";
  if (shouldReset) {
    resetForm();
  }
}

// Переключение режимов
function switchMode(mode) {
  currentMode = mode;

  // Обновление кнопок
  document
    .querySelectorAll("#addMovieModal .mode-btn")
    .forEach((btn) => btn.classList.remove("active"));
  event.target.classList.add("active");

  // Показ/скрытие форм
  if (mode === "auto") {
    document.getElementById("autoMode").style.display = "block";
    document.getElementById("manualMode").style.display = "none";
  } else {
    document.getElementById("autoMode").style.display = "none";
    document.getElementById("manualMode").style.display = "block";
  }
}

function switchWatchlistMode(mode) {
  currentWatchlistMode = mode;

  document
    .querySelectorAll("#addWatchlistModal .mode-btn")
    .forEach((btn) => btn.classList.remove("active"));
  event.target.classList.add("active");

  if (mode === "auto") {
    document.getElementById("watchAutoMode").style.display = "block";
    document.getElementById("watchManualMode").style.display = "none";
  } else {
    document.getElementById("watchAutoMode").style.display = "none";
    document.getElementById("watchManualMode").style.display = "block";
  }
}

function switchGameMode(mode) {
  currentGameMode = mode;

  document
    .querySelectorAll("#addGameModal .mode-btn")
    .forEach((btn) => btn.classList.remove("active"));
  event.target.classList.add("active");

  if (mode === "auto") {
    document.getElementById("gameAutoMode").style.display = "block";
    document.getElementById("gameManualMode").style.display = "none";
  } else {
    document.getElementById("gameAutoMode").style.display = "none";
    document.getElementById("gameManualMode").style.display = "block";
  }
}

function switchPlayedGameMode(mode) {
  currentPlayedGameMode = mode;

  document
    .querySelectorAll("#addPlayedGameModal .mode-btn")
    .forEach((btn) => btn.classList.remove("active"));
  event.target.classList.add("active");

  if (mode === "auto") {
    document.getElementById("playedGameAutoMode").style.display = "block";
    document.getElementById("playedGameManualMode").style.display = "none";
  } else {
    document.getElementById("playedGameAutoMode").style.display = "none";
    document.getElementById("playedGameManualMode").style.display = "block";
  }
}

// Настройка звездного рейтинга
function setupRatingStars(containerId = "ratingStars") {
  const container = document.getElementById(containerId);
  const stars = container.querySelectorAll(".rating-star");
  const inputId = container.dataset.input;
  const ratingInput = inputId ? document.getElementById(inputId) : null;

  stars.forEach((star) => {
    star.addEventListener("click", function () {
      const rating = parseInt(this.dataset.rating);
      setRatingStars(containerId, rating);
    });

    star.addEventListener("mouseover", function () {
      const rating = parseInt(this.dataset.rating);
      highlightStars(containerId, rating);
    });
  });

  container.addEventListener("mouseleave", function () {
    const currentRating = getCurrentRating(containerId);
    highlightStars(containerId, currentRating);
  });

  if (ratingInput) {
    ratingInput.addEventListener("input", function () {
      const value = parseFloat(this.value.replace(/,/, "."));
      if (!isNaN(value) && value >= 0 && value <= 11) {
        this.setCustomValidity("");
        setRatingStars(containerId, value, false);
      } else {
        this.setCustomValidity("Введите число от 0 до 11");
        this.reportValidity();
      }
    });
  }
}

function setRatingStars(containerId, rating, updateInput = true) {
  const container = document.getElementById(containerId);
  const stars = container.querySelectorAll(".rating-star");
  container.dataset.currentRating = rating;
  const inputId = container.dataset.input;
  if (updateInput && inputId) {
    const inp = document.getElementById(inputId);
    if (inp) inp.value = String(rating).replace(".", ",");
  }
  stars.forEach((star) => star.classList.remove("active"));

  if (rating === 0) {
    stars[0]?.classList.add("active");
  } else if (rating >= 1 && rating <= 10) {
    for (let i = 1; i <= rating; i++) {
      stars[i]?.classList.add("active");
    }
  } else if (rating === 11) {
    for (let i = 1; i <= 10; i++) {
      stars[i]?.classList.add("active");
    }
    stars[11]?.classList.add("active");
  }
  if (containerId === "ratingStars") {
    showKPPreview();
  }
}

function highlightStars(containerId, rating) {
  const stars = document.querySelectorAll(`#${containerId} .rating-star`);
  
  stars.forEach((star, index) => {
    // Удаляем маску и цвет
    star.classList.remove("hovered");
    star.style.backgroundColor = "rgba(255, 235, 59, 0.3)";
    
    if (star.classList.contains("rating-label")) {
      star.style.backgroundColor = "transparent";
    }
  });

  if (rating >= 1 && rating <= 10) {
    for (let i = 1; i <= rating; i++) {
      stars[i].style.backgroundColor = "#ffc107";
      stars[i].classList.add("hovered");
    }
  } else if (rating === 11) {
    for (let i = 1; i <= 10; i++) {
      stars[i].style.backgroundColor = "#ffc107";
      stars[i].classList.add("hovered");
    }
  }
}


function getCurrentRating(containerId) {
  const container = document.getElementById(containerId);
  return parseFloat(container.dataset.currentRating) || 0;
}

function isRatingValid(r) {
  return typeof r === "number" && !isNaN(r) && r >= 0 && r <= 11;
}

function getRatingValue(inputId) {
  const el = document.getElementById(inputId);
  return el ? parseFloat(el.value.replace(/,/, ".")) : NaN;
}



// Обработка форм
document
  .getElementById("addMovieForm")
  .addEventListener("submit", async function (e) {
    e.preventDefault();

  const rating = getRatingValue("ratingInput");
  if (!isRatingValid(rating)) {
    alert("Неверная оценка");
    document.getElementById("ratingInput").reportValidity();
    return;
  }

    let movieData;

    if (currentMode === "auto") {
      const title = document.getElementById("autoTitle").value;
      if (!title) {
        alert("Введите название фильма");
        return;
      }

      if (!selectedKPMovie) {
        showSearchReminderModal();
        return;
      }

      if (selectedKPMovie) {
        const sel = selectedKPMovie;
        movieData = {
          title: sel.nameRu || sel.nameEn || "",
          originalTitle: sel.nameEn || "",
          year: sel.year || new Date().getFullYear(),
          rating: rating,
          kpRating: sel.rating || "-",
          poster:
            sel.posterUrlPreview ||
            sel.posterUrl ||
            "https://via.placeholder.com/300x400?text=Нет+постера",
          dateAdded: new Date().toISOString().split("T")[0],
          genre: sel.genres?.map((g) => g.genre).join(", ") || "",
          description: sel.description || "",
        };
      } else {
        movieData = {
          title: title,
          year: new Date().getFullYear(),
          rating: rating,
          kpRating: "-",
          poster: "https://via.placeholder.com/300x400?text=Постер",
          dateAdded: new Date().toISOString().split("T")[0],
          genre: "Неизвестно",
          description: "",
        };
      }
    } else {
      const fileInput = document.getElementById("manualPoster");
      let poster = "https://via.placeholder.com/300x400?text=Нет+постера";
      if (fileInput.files && fileInput.files[0]) {
        try {
          poster = await readFileAsDataURL(fileInput.files[0]);
        } catch (err) {
          console.error("Error reading file", err);
        }
      }
      movieData = {
        title: document.getElementById("manualTitle").value,
        originalTitle: document.getElementById("manuaOriginTitle").value,
        year:
          parseInt(document.getElementById("manualYear").value) ||
          new Date().getFullYear(),
        rating: rating,
        kpRating: "-",
        poster: poster,
        dateAdded: new Date().toISOString().split("T")[0],
        genre: document.getElementById("manualGenre").value || "Неизвестно",
      };
    }

    const duplicate =
      allMovies.some(
        (m) =>
          m.title.trim().toLowerCase() ===
            movieData.title.trim().toLowerCase() &&
          Number(m.year) === Number(movieData.year)
      ) ||
      watchlist.some(
        (o) =>
          o.title.trim().toLowerCase() ===
            movieData.title.trim().toLowerCase() &&
          Number(o.year) === Number(movieData.year)
      );
    if (duplicate) {
      showDuplicateModal();
      return;
    }

    try {
      const { data, error } = await supabaseClient
        .from("movies")
        .insert({
          title: movieData.title,
          original_title: movieData.originalTitle || "",
          genres: movieData.genre,
          poster: movieData.poster,
          year: movieData.year,
          rating_numeric: movieData.rating,
          rating_OMDB: movieData.kpRating,
          date: movieData.dateAdded,
        })
        .select()
        .single();

      if (error) throw error;

      allMovies.unshift({
        id: data.id,
        title: data.title,
        originalTitle: data.original_title,
        genre: data.genres,
        poster: data.poster,
        year: data.year,
        rating: data.rating_numeric,
        kpRating: data.rating_OMDB,
        dateAdded: data.date,
        orderBy: data.order_by && data.order_by !== "null" ? data.order_by : "",
        orderType: data.order_type,
        userRating: null,
      });
      localStorage.setItem("moviesCache", JSON.stringify(allMovies));
    } catch (err) {
      console.error("Error adding movie to Supabase", err);
    }

    currentPage = 1;
    renderMovies();
    closeModal("addMovieModal", true);
  });

document
  .getElementById("addWatchlistForm")
  .addEventListener("submit", async function (e) {
    e.preventDefault();

    const orderBy = document.getElementById("watchOrderBy").value;
    const orderType = document.getElementById("watchOrderType").value;

    let orderData;
    let filmLength = null;

    if (currentWatchlistMode === "auto") {
      const titleInput = document.getElementById("watchAutoTitle").value;
      if (!titleInput) {
        alert("Введите название фильма");
        return;
      }

      if (!selectedKPOrderMovie) {
        showSearchReminderModal();
        return;
      }

      if (selectedKPOrderMovie) {
        const sel = selectedKPOrderMovie;
        if (sel.filmLength === undefined && sel.filmId) {
          sel.filmLength = await fetchKPFilmLength(sel.filmId);
        }
        filmLength = sel.filmLength || null;
        orderData = {
          title: sel.nameRu || sel.nameEn || "",
          originalTitle: sel.nameEn || "",
          year: sel.year || "",
          kpRating: sel.rating || "-",
          poster:
            sel.posterUrlPreview ||
            sel.posterUrl ||
            "https://via.placeholder.com/300x400?text=Нет+постера",
          genres: sel.genres?.map((g) => g.genre).join(", ") || "",
          orderBy: orderBy,
          orderType: orderType,
          length: filmLength,
        };
      } else {
        orderData = {
          title: titleInput,
          originalTitle: "",
          year: "",
          kpRating: "-",
          poster: "https://via.placeholder.com/300x400?text=Нет+постера",
          genres: "",
          orderBy: orderBy,
          orderType: orderType,
          length: filmLength,
        };
      }
    } else {
      const fileInput = document.getElementById("watchManualPoster");
      let poster = "https://via.placeholder.com/300x400?text=Нет+постера";
      if (fileInput.files && fileInput.files[0]) {
        try {
          poster = await readFileAsDataURL(fileInput.files[0]);
        } catch (err) {
          console.error("Error reading file", err);
        }
      }
      orderData = {
        title: document.getElementById("watchManualTitle").value,
        originalTitle: document.getElementById("watchManualOriginTitle").value,
        year: document.getElementById("watchManualYear").value || "",
        kpRating: "-",
        poster: poster,
        genres: document.getElementById("watchManualGenre").value || "",
        orderBy: orderBy,
        orderType: orderType,
        length: filmLength,
      };
    }

    const duplicateOrder =
      watchlist.some(
        (o) =>
          o.title.trim().toLowerCase() ===
            orderData.title.trim().toLowerCase() &&
          Number(o.year) === Number(orderData.year)
      ) ||
      allMovies.some(
        (m) =>
          m.title.trim().toLowerCase() ===
            orderData.title.trim().toLowerCase() &&
          Number(m.year) === Number(orderData.year)
      );
    if (duplicateOrder) {
      showDuplicateModal();
      return;
    }

    try {
      const { data, error } = await supabaseClient
        .from("Movie_Orders")
        .insert({
          order_title: orderData.title,
          order_origin_title: orderData.originalTitle || "",
          order_year: orderData.year,
          order_genres: orderData.genres,
          order_poster: orderData.poster,
          order_by: orderData.orderBy,
          order_type: orderData.orderType,
          kinopoisk_rate: orderData.kpRating,
          order_length: orderData.length,
        })
        .select()
        .single();

      if (error) throw error;

      watchlist.push({
        id: data.id,
        title: data.order_title,
        originalTitle: data.order_origin_title,
        genres: data.order_genres,
        poster: data.order_poster,
        year: data.order_year || "",
        length: data.order_length || null,
        kpRating: data.kinopoisk_rate,
        orderBy: data.order_by,
        orderType: data.order_type,
        dateAdded: data.created_at,
      });
      renderWatchlist();
    } catch (err) {
      console.error("Error adding order", err);
    }

    closeModal("addWatchlistModal", true);
    this.reset();
    selectedKPOrderMovie = null;
    kpOrderResults = [];
    showWatchlistKPPreview();
  });

document
  .getElementById("addGameForm")
  ?.addEventListener("submit", async function (e) {
    e.preventDefault();

    const orderBy = document.getElementById("gameOrderBy").value;
    const orderType = document.getElementById("gameOrderType").value;

    let gameData;

    if (currentGameMode === "auto") {
      const titleInput = document.getElementById("gameAutoTitle").value;
      if (!titleInput) {
        alert("Введите название игры");
        return;
      }

      if (selectedRAWGGame) {
        const g = selectedRAWGGame;
        gameData = {
          title: g.name || titleInput,
          year: g.released ? g.released.split("-")[0] : "",
          genres: g.genres?.map((x) => x.name).join(", ") || "",
          poster:
            steamGridPoster ||
            g.background_image ||
            "https://via.placeholder.com/300x400?text=Нет+постера",
          orderBy: orderBy,
          orderType: orderType,
        };
      } else {
        gameData = {
          title: titleInput,
          year: "",
          genres: "",
          poster: "https://via.placeholder.com/300x400?text=Нет+постера",
          orderBy: orderBy,
          orderType: orderType,
        };
      }
    } else {
      const fileInput = document.getElementById("gamePoster");
      let poster = "https://via.placeholder.com/300x400?text=Нет+постера";
      if (fileInput.files && fileInput.files[0]) {
        try {
          poster = await readFileAsDataURL(fileInput.files[0]);
        } catch (err) {
          console.error("Error reading file", err);
        }
      }

      gameData = {
        title: document.getElementById("gameTitle").value,
        year: document.getElementById("gameYear").value || "",
        genres: document.getElementById("gameGenres").value || "",
        poster: poster,
        orderBy: orderBy,
        orderType: orderType,
      };
    }

    try {
      const { data, error } = await supabaseClient
        .from("Game_Orders")
        .insert({
          game_title: gameData.title,
          game_year: gameData.year,
          game_genres: gameData.genres,
          game_poster: gameData.poster,
          game_order_by: gameData.orderBy,
          game_order_type: gameData.orderType,
        })
        .select()
        .single();

      if (error) throw error;

      gameOrders.push({
        id: data.id,
        title: data.game_title,
        genres: data.game_genres,
        poster: data.game_poster,
        year: data.game_year || "",
        orderBy: data.game_order_by,
        orderType: data.game_order_type,
        dateAdded: data.created_at,
      });
      renderGames();
    } catch (err) {
      console.error("Error adding game", err);
    }

    closeModal("addGameModal", true);
    this.reset();
    selectedRAWGGame = null;
    steamGridPoster = null;
    steamGridPosters = [];
    rawgResults = [];
    showRAWGPreview();
  });

document
  .getElementById("addPlayedGameForm")
  ?.addEventListener("submit", async function (e) {
    e.preventDefault();

  const orderBy = document.getElementById("playedGameOrderBy").value;
  const orderType = document.getElementById("playedGameOrderType").value;
  const rating = getRatingValue("playedGameRatingInput");
  if (!isRatingValid(rating)) {
    alert("Неверная оценка");
    document.getElementById("playedGameRatingInput").reportValidity();
    return;
  }

    let gameData;

    if (currentPlayedGameMode === "auto") {
      const titleInput = document.getElementById("playedGameAutoTitle").value;
      if (!titleInput) {
        alert("Введите название игры");
        return;
      }

      if (!selectedRAWGGame) {
        showSearchReminderModal();
        return;
      }

      const g = selectedRAWGGame;
      gameData = {
        title: g.name || titleInput,
        year: g.released ? g.released.split("-")[0] : "",
        genres: g.genres?.map((x) => x.name).join(", ") || "",
        poster:
          steamGridPoster ||
          g.background_image ||
          "https://via.placeholder.com/300x400?text=Нет+постера",
        rating: rating,
        orderBy: orderBy,
        orderType: orderType,
      };
    } else {
      const fileInput = document.getElementById("playedGamePoster");
      let poster = "https://via.placeholder.com/300x400?text=Нет+постера";
      if (fileInput.files && fileInput.files[0]) {
        try {
          poster = await readFileAsDataURL(fileInput.files[0]);
        } catch (err) {
          console.error("Error reading file", err);
        }
      }

      gameData = {
        title: document.getElementById("playedGameTitle").value,
        year: document.getElementById("playedGameYear").value || "",
        genres: document.getElementById("playedGameGenres").value || "",
        poster: poster,
        rating: rating,
        orderBy: orderBy,
        orderType: orderType,
      };
    }

    const duplicate = allPlayedGames.some(
      (g) => g.title.trim().toLowerCase() === gameData.title.trim().toLowerCase()
    );
    if (duplicate) {
      showDuplicateModal();
      return;
    }

    try {
      const { data, error } = await supabaseClient
        .from("games")
        .insert({
          title: gameData.title,
          genres: gameData.genres,
          poster: gameData.poster,
          year: gameData.year,
          rating_numeric: gameData.rating,
          date: new Date().toISOString().split("T")[0],
          order_by: gameData.orderBy,
          order_type: gameData.orderType,
        })
        .select()
        .single();

      if (error) throw error;

      allPlayedGames.unshift({
        id: data.id,
        title: data.title,
        genres: data.genres,
        poster: data.poster,
        year: data.year,
        rating: data.rating_numeric,
        dateAdded: data.date,
        orderBy: data.order_by && data.order_by !== "null" ? data.order_by : "",
        orderType: data.order_type,
      });
      localStorage.setItem("gamesCache", JSON.stringify(allPlayedGames));
    } catch (err) {
      console.error("Error adding game", err);
    }

    gamePage = 1;
    renderPlayedGames();
    closeModal("addPlayedGameModal", true);
    this.reset();
    selectedRAWGGame = null;
    steamGridPoster = null;
    steamGridPosters = [];
    rawgResults = [];
    showPlayedGamePreview();
  });

// Оценка фильма из watchlist
async function submitRating() {
  if (isSubmittingRating) return;
  const rating = getRatingValue("rateMovieInput");
  if (!isRatingValid(rating)) {
    alert("Неверная оценка");
    document.getElementById("rateMovieInput").reportValidity();
    return;
  }

  // Находим фильм в watchlist по id
  const itemIndex = watchlist.findIndex((item) => item.id === ratingMovieId);
  if (itemIndex !== -1) {
    // Создаём новый объект фильма для основного списка
    const source = watchlist[itemIndex];
    const watchedMovie = {
      title: source.title,
      originalTitle: source.originalTitle || "",
      year: source.year,
      rating: rating,
      kpRating: source.kpRating,
      poster:
        source.poster || "https://via.placeholder.com/300x400?text=Нет+постера",
      dateAdded: new Date().toISOString().split("T")[0],
      genre: source.genres || "",
      description: "",
      orderBy: source.orderBy || "",
      orderType: source.orderType || "",
    };
    const confirmBtn = document.querySelector("#rateMovieModal .btn-primary");
    isSubmittingRating = true;
    if (confirmBtn) confirmBtn.disabled = true;
    try {
      const { data, error } = await supabaseClient
        .from("movies")
        .insert({
          title: watchedMovie.title,
          original_title: watchedMovie.originalTitle,
          genres: watchedMovie.genre,
          poster: watchedMovie.poster,
          year: watchedMovie.year,
          rating_numeric: watchedMovie.rating,
          rating_OMDB: watchedMovie.kpRating,
          date: watchedMovie.dateAdded,
          order_by: watchedMovie.orderBy,
          order_type: watchedMovie.orderType,
        })
        .select()
        .single();

      if (error) throw error;

      allMovies.unshift({
        id: data.id,
        title: data.title,
        originalTitle: data.original_title,
        genre: data.genres,
        poster: data.poster,
        year: data.year,
        rating: data.rating_numeric,
        kpRating: data.rating_OMDB,
        dateAdded: data.date,
        orderBy: data.order_by && data.order_by !== "null" ? data.order_by : "",
        orderType: data.order_type,
        userRating: null,
      });
      localStorage.setItem("moviesCache", JSON.stringify(allMovies));
      await supabaseClient
        .from("Movie_Orders")
        .delete()
        .eq("id", ratingMovieId);
    } catch (err) {
      console.error("Error adding rated movie to Supabase", err);
    } finally {
      isSubmittingRating = false;
      if (confirmBtn) confirmBtn.disabled = false;
    }
    currentPage = 1;
    watchlist.splice(itemIndex, 1);
    renderMovies();
    renderWatchlist();
  }
  closeModal("rateMovieModal", true);
}

async function submitGameRating() {
  const rating = getRatingValue("rateGameInput");
  if (!isRatingValid(rating)) {
    alert("Неверная оценка");
    document.getElementById("rateGameInput").reportValidity();
    return;
  }
  const idx = gameOrders.findIndex((g) => g.id === ratingGameId);
  if (idx !== -1) {
    const source = gameOrders[idx];
    const played = {
      title: source.title,
      year: source.year,
      rating: rating,
      genres: source.genres || "",
      poster: source.poster || "https://via.placeholder.com/300x400?text=Нет+постера",
      dateAdded: new Date().toISOString().split("T")[0],
      orderBy: source.orderBy || "",
      orderType: source.orderType || "",
    };
    try {
      const { data, error } = await supabaseClient
        .from("games")
        .insert({
          title: played.title,
          genres: played.genres,
          poster: played.poster,
          year: played.year,
          rating_numeric: played.rating,
          date: played.dateAdded,
          order_by: played.orderBy,
          order_type: played.orderType,
        })
        .select()
        .single();

      if (error) throw error;

      allPlayedGames.unshift({
        id: data.id,
        title: data.title,
        genres: data.genres,
        poster: data.poster,
        year: data.year,
        rating: data.rating_numeric,
        dateAdded: data.date,
        orderBy: data.order_by && data.order_by !== "null" ? data.order_by : "",
        orderType: data.order_type,
      });
      localStorage.setItem("gamesCache", JSON.stringify(allPlayedGames));
      await supabaseClient.from("Game_Orders").delete().eq("id", ratingGameId);
    } catch (err) {
      console.error("Error adding rated game", err);
    }
    gameOrders.splice(idx, 1);
    renderPlayedGames();
    renderGames();
  }
  closeModal("rateGameModal", true);
}

async function submitUserMovieRating() {
  const rating = getRatingValue("userRateInput");
  if (!isRatingValid(rating)) {
    alert("Неверная оценка");
    document.getElementById("userRateInput").reportValidity();
    return;
  }
  if (!userRatingMovieId) return;
  if (ratedMovies[userRatingMovieId]) {
    alert("Вы уже оценили этот фильм");
    closeModal("userRateModal", true);
    return;
  }
  try {
    await supabaseClient.from("movie_ratings").insert({
      movie_id: userRatingMovieId,
      rating: rating,
    });
    await loadUserRatingsFromSupabase();
    ratedMovies[userRatingMovieId] = rating;
    localStorage.setItem("ratedMovies", JSON.stringify(ratedMovies));
    renderMovies();
  } catch (err) {
    console.error("Error submitting user rating", err);
  }
  closeModal("userRateModal", true);
}

// Редактирование фильма
document
  .getElementById("editMovieForm")
  .addEventListener("submit", async function (e) {
    e.preventDefault();

    const movie = allMovies.find((m) => m.id === editingMovieId);
    if (movie) {
      movie.title = document.getElementById("editTitle").value;
      movie.year =
        parseInt(document.getElementById("editYear").value) || movie.year;
      movie.genre = document.getElementById("editGenre").value || movie.genre;
      movie.orderBy =
        document.getElementById("editMovieOrderBy").value || movie.orderBy;
      const rating = getRatingValue("editRatingInput");
      if (!isRatingValid(rating)) {
        alert("Неверная оценка");
        document.getElementById("editRatingInput").reportValidity();
        return;
      }
      movie.rating = rating;
      movie.poster = editPosterData || movie.poster;
      movie.dateAdded =
        movie.dateAdded || new Date().toISOString().split("T")[0];

      try {
        await supabaseClient
          .from("movies")
          .update({
            title: movie.title,
            genres: movie.genre,
            poster: movie.poster,
            year: movie.year,
            rating_numeric: movie.rating,
            rating_OMDB: movie.kpRating,
            order_by: movie.orderBy,
          })
          .eq("id", editingMovieId);
      } catch (err) {
        console.error("Error updating movie in Supabase", err);
      }
    }
    localStorage.setItem("moviesCache", JSON.stringify(allMovies));
    renderMovies();
    closeModal("editMovieModal", true);
  });

document
  .getElementById("editOrderForm")
  .addEventListener("submit", async function (e) {
    e.preventDefault();

    const order = watchlist.find((o) => o.id === editingOrderId);
    if (order) {
      order.title = document.getElementById("editOrderTitle").value;
      order.originalTitle = document.getElementById(
        "editOrderOriginTitle"
      ).value;
      order.year = document.getElementById("editOrderYear").value;
      order.genres = document.getElementById("editOrderGenre").value;
      order.orderBy = document.getElementById("editOrderBy").value;
      order.orderType = document.getElementById("editOrderType").value;
      order.poster = editOrderPosterData || order.poster;

      try {
        await supabaseClient
          .from("Movie_Orders")
          .update({
            order_title: order.title,
            order_origin_title: order.originalTitle,
            order_year: order.year,
            order_genres: order.genres,
            order_poster: order.poster,
            order_by: order.orderBy,
            order_type: order.orderType,
          })
          .eq("id", editingOrderId);
      } catch (err) {
        console.error("Error updating order in Supabase", err);
      }
    }

    renderWatchlist();
    closeModal("editOrderModal", true);
  });

document
  .getElementById("editGameForm")
  ?.addEventListener("submit", async function (e) {
    e.preventDefault();

    const game = gameOrders.find((g) => g.id === editingGameId);
    if (game) {
      game.title = document.getElementById("editGameTitle").value;
      game.year = document.getElementById("editGameYear").value;
      game.genres = document.getElementById("editGameGenres").value;
      game.orderBy = document.getElementById("editGameOrderBy").value;
      game.orderType = document.getElementById("editGameOrderType").value;
      game.poster = editGamePosterData || game.poster;

      try {
        await supabaseClient
          .from("Game_Orders")
          .update({
            game_title: game.title,
            game_year: game.year,
            game_genres: game.genres,
            game_poster: game.poster,
            game_order_by: game.orderBy,
            game_order_type: game.orderType,
          })
          .eq("id", editingGameId);
      } catch (err) {
        console.error("Error updating game", err);
      }
    }

    renderGames();
    closeModal("editGameModal", true);
  });

document
  .getElementById("editPlayedGameForm")
  ?.addEventListener("submit", async function (e) {
    e.preventDefault();

    const game = allPlayedGames.find((g) => g.id === editingPlayedGameId);
    if (game) {
      game.title = document.getElementById("editPlayedGameTitle").value;
      game.year = document.getElementById("editPlayedGameYear").value;
      game.genres = document.getElementById("editPlayedGameGenres").value;
      const rating = getRatingValue("editPlayedGameRatingInput");
      if (!isRatingValid(rating)) {
        alert("Неверная оценка");
        document.getElementById("editPlayedGameRatingInput").reportValidity();
        return;
      }
      game.rating = rating;
      game.orderBy = document.getElementById("editPlayedGameOrderBy").value;
      game.orderType = document.getElementById("editPlayedGameOrderType").value;
      game.poster = editPlayedGamePosterData || game.poster;

      try {
        await supabaseClient
          .from("games")
          .update({
            title: game.title,
            genres: game.genres,
            poster: game.poster,
            year: game.year,
            rating_numeric: game.rating,
            order_by: game.orderBy,
            order_type: game.orderType,
          })
          .eq("id", editingPlayedGameId);
      } catch (err) {
        console.error("Error updating played game", err);
      }
    }

    localStorage.setItem("gamesCache", JSON.stringify(allPlayedGames));
    renderPlayedGames();
    closeModal("editPlayedGameModal", true);
  });

// Форматирование даты
function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru-RU");
}

// Сброс форм и рейтингов
function resetForm() {
  document.getElementById("addMovieForm").reset();
  document.getElementById("addWatchlistForm").reset();
  document.getElementById("addGameForm")?.reset();
  document.getElementById("addPlayedGameForm")?.reset();
  document.getElementById("editGameForm")?.reset();
  document.getElementById("editPlayedGameForm")?.reset();
  setRatingStars("ratingStars", 0);
  setRatingStars("editRatingStars", 0);
  setRatingStars("editPlayedGameRatingStars", 0);
  setRatingStars("playedGameRatingStars", 0);
  setRatingStars("rateMovieStars", 0);
}

// Клик вне модалки закрывает её
window.onclick = function (event) {
  document.querySelectorAll(".modal").forEach((modal) => {
    if (event.target === modal) {
      if (modal.id === "fortuneWinnerModal") {
        closeFortuneWinnerModal();
      } else {
        closeModal(modal.id);
      }
    }
  });
};

function showAdminControls(skipRender = false) {
  adminElements.forEach((el) => el.classList.remove("admin-only"));
  const btn = document.getElementById("adminLoginBtn");
  const group = document.getElementById("adminPasswordGroup");
  const input = document.getElementById("adminPassword");
  if (btn) btn.textContent = "Выйти";
  if (group) group.style.display = "none";
  if (input) {
    input.required = false;
    input.value = "";
  }
  if (!skipRender) {
    renderMovies();
    renderWatchlist();
    renderGames();
    renderPlayedGames();
  }
}

function hideAdminControls(skipRender = false) {
  adminElements.forEach((el) => el.classList.add("admin-only"));
  const btn = document.getElementById("adminLoginBtn");
  const group = document.getElementById("adminPasswordGroup");
  const input = document.getElementById("adminPassword");
  if (btn) btn.textContent = "Войти";
  if (group) group.style.display = "";
  if (input) input.required = true;
  if (!skipRender) {
    renderMovies();
    renderWatchlist();
    renderGames();
    renderPlayedGames();
  }
}

function logoutAdmin() {
  isAdmin = false;
  localStorage.removeItem("isAdmin");
  localStorage.removeItem("KINOPOISK_API_KEY");
  localStorage.removeItem("RAWG_API_KEY");
  hideAdminControls();
  closeModal("adminModal");
}

function showTab(tab) {
  activeTab = tab;
  document.querySelectorAll("#mobileTabs button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  updateTabVisibility();
}

function updateTabVisibility() {
  const isMobile = window.innerWidth <= 768;
  const movies = document.getElementById("moviesSection");
  const leftPanel = document.querySelector(".left-panel");
  const watch = document.getElementById("watchlistSection");
  const games = document.getElementById("gamesSection");
  const tabs = document.getElementById("mobileTabs");
  if (isMobile) {
    if (tabs) tabs.style.display = "flex";
    if (leftPanel)
      leftPanel.style.display = activeTab === "movies" ? "block" : "none";
    if (movies)
      movies.style.display = activeTab === "movies" ? "block" : "none";
    if (watch)
      watch.style.display = activeTab === "watchlist" ? "block" : "none";
    if (games) games.style.display = activeTab === "games" ? "block" : "none";
  } else {
    if (tabs) tabs.style.display = "none";
    if (leftPanel) leftPanel.style.display = "block";
    if (movies) movies.style.display = "block";
    if (watch) watch.style.display = "block";
    if (games) games.style.display = "block";
  }
}

let activeListTab = "movies";

function showListTab(tab) {
  activeListTab = tab;
  document.querySelectorAll(".list-tabs button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.list === tab);
  });
  updateListVisibility();
}

function updateListVisibility() {
  const movies = document.getElementById("moviesSection");
  const games = document.getElementById("gamesListSection");
  if (movies) movies.style.display = activeListTab === "movies" ? "block" : "none";
  if (games) games.style.display = activeListTab === "games" ? "block" : "none";
}

window.addEventListener("resize", updateTabVisibility);

// Play header video on load and then at random intervals
window.addEventListener("load", () => {
  const headerVideos = document.querySelectorAll(".rats-video");
  if (headerVideos.length === 0) return;

  // Function to get random delay within a range (in milliseconds)
  function getRandomDelay() {
    const min = 5;
    const max = 40;
    return (Math.floor(Math.random() * (max - min + 1)) + min) * 1000;
  }

  // Function to get a random video element from the list
  function getRandomVideo() {
    const randomIndex = Math.floor(Math.random() * headerVideos.length);
    return headerVideos[randomIndex];
  }

  // Function to schedule next play for a random video
  function scheduleNextPlay(videoElement) {
    setTimeout(() => {
      videoElement.play().catch(() => {});
    }, getRandomDelay());
  }

  // Start playing a random video on page load
  const firstVideo = getRandomVideo();
  firstVideo.play().catch(() => {});

  // Add event listener to all videos to schedule the next random video
  headerVideos.forEach((video) => {
    video.addEventListener("ended", () => {
      const nextVideo = getRandomVideo();
      scheduleNextPlay(nextVideo);
    });
  });
});

const musicMenu = document.getElementById("musicMenu");
const musicMenuButton = document.getElementById("musicMenuButton");
const closeMusicMenu = document.getElementById("closeMusicMenu");
const collapseMusicMenuButton = document.getElementById("collapseMusicMenu");
const musicMenuContent = musicMenu ? musicMenu.querySelector(".music-menu-content") : null;
const musicList = document.getElementById("musicList");
const audioPlayer = document.getElementById("audioPlayer");
const playPauseBtn = document.getElementById("playPauseBtn");
const loopBtn = document.getElementById("loopBtn");
const volumeSlider = document.getElementById("volumeSlider");
const volumeValue = document.getElementById("volumeValue");
const fortuneTipButton = document.getElementById("fortuneTipButton");
const fortuneTipAudio = document.getElementById("fortuneTipAudio");
let fortuneWheelApi = null;

if (audioPlayer) {
  audioPlayer.loop = true;
}

if (playPauseBtn && audioPlayer) {
  playPauseBtn.addEventListener("click", () => {
    if (audioPlayer.paused) {
      audioPlayer.play().catch(() => {});
    } else {
      audioPlayer.pause();
    }
  });

  audioPlayer.addEventListener("play", () => {
    playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
  });

  audioPlayer.addEventListener("pause", () => {
    playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
  });
}

if (loopBtn && audioPlayer) {
  loopBtn.classList.add("active");
  loopBtn.addEventListener("click", () => {
    audioPlayer.loop = !audioPlayer.loop;
    loopBtn.classList.toggle("active", audioPlayer.loop);
  });
}

if (volumeSlider && audioPlayer) {
  const updateVolumeText = () => {
    if (volumeValue) {
      volumeValue.textContent = Math.round(audioPlayer.volume * 100) + "%";
    }
  };

  const updateFromSlider = () => {
    audioPlayer.volume = parseFloat(volumeSlider.value);
    updateVolumeText();
  };

  volumeSlider.addEventListener("input", updateFromSlider);

  audioPlayer.addEventListener("volumechange", () => {
    volumeSlider.value = String(audioPlayer.volume);
    updateVolumeText();
  });

  volumeSlider.value = String(audioPlayer.volume);
  updateVolumeText();
}


if (musicMenu && musicMenuButton && closeMusicMenu) {
  const setMenuCollapsed = (shouldCollapse) => {
    musicMenu.classList.toggle("collapsed", shouldCollapse);
    musicMenu.setAttribute("aria-expanded", shouldCollapse ? "false" : "true");
    if (musicMenuContent) {
      if (shouldCollapse) {
        musicMenuContent.setAttribute("inert", "");
        musicMenuContent.setAttribute("aria-hidden", "true");
      } else {
        musicMenuContent.removeAttribute("inert");
        musicMenuContent.removeAttribute("aria-hidden");
      }
    }
    if (collapseMusicMenuButton) {
      collapseMusicMenuButton.setAttribute(
        "aria-label",
        shouldCollapse ? "Развернуть панель" : "Свернуть панель",
      );
      const collapseLabel = collapseMusicMenuButton.querySelector(".collapse-music-menu-label");
      if (collapseLabel) {
        collapseLabel.textContent = shouldCollapse ? "Развернуть" : "Свернуть";
      }
    }
  };

  const closeMenu = () => {
    musicMenu.classList.remove("open");
    setMenuCollapsed(false);
    if (audioPlayer) audioPlayer.pause();
    if (musicList) {
      musicList.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
    }
  };

  setMenuCollapsed(false);

  musicMenuButton.addEventListener("click", () => {
    musicMenu.classList.add("open");
    setMenuCollapsed(false);
    if (fortuneWheelApi && typeof fortuneWheelApi.handleMenuOpen === "function") {
      fortuneWheelApi.handleMenuOpen();
    }
  });

  closeMusicMenu.addEventListener("click", () => {
    closeMenu();
  });

  if (collapseMusicMenuButton) {
    collapseMusicMenuButton.addEventListener("click", () => {
      const shouldCollapse = !musicMenu.classList.contains("collapsed");
      setMenuCollapsed(shouldCollapse);
      if (!shouldCollapse && fortuneWheelApi && typeof fortuneWheelApi.handleMenuOpen === "function") {
        fortuneWheelApi.handleMenuOpen();
      }
    });
  }

  if (musicList) {
    musicList.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-src]");
      if (!btn || !audioPlayer) return;

      const src = btn.getAttribute("data-src");
      if (!src) return;

      audioPlayer.src = src;
      audioPlayer.play().catch(() => {});
      musicList.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  }
}

if (fortuneTipButton && fortuneTipAudio) {
  fortuneTipAudio.loop = false;
  fortuneTipAudio.volume = 0.25;

  const ensureTipAudioSource = () => {
    const configuredSrc = fortuneTipButton.getAttribute("data-audio-src");
    if (configuredSrc && !fortuneTipAudio.getAttribute("src")) {
      fortuneTipAudio.src = configuredSrc;
    }
    return fortuneTipAudio.getAttribute("src");
  };

  const resetTipButtonState = () => {
    fortuneTipButton.disabled = false;
    fortuneTipButton.classList.remove("is-playing");
  };

  fortuneTipButton.addEventListener("click", () => {
    const src = ensureTipAudioSource();
    if (!src) {
      console.warn("No audio source configured for the fortune tip button.");
      return;
    }

    fortuneTipButton.disabled = true;
    fortuneTipButton.classList.add("is-playing");

    try {
      fortuneTipAudio.pause();
      fortuneTipAudio.currentTime = 0;
    } catch (err) {
      console.warn("Unable to reset fortune tip audio state.", err);
    }

    fortuneTipAudio
      .play()
      .catch((err) => {
        console.warn("Failed to play fortune tip audio.", err);
        resetTipButtonState();
      });
  });

  fortuneTipAudio.addEventListener("ended", resetTipButtonState);
  fortuneTipAudio.addEventListener("error", resetTipButtonState);
}

fortuneWheelApi = initFortuneWheel();

function initFortuneWheel() {
  const canvas = document.getElementById("wheelCanvas");
  const legendEl = document.getElementById("legend");
  const statusEl = document.getElementById("status");
  const input = document.getElementById("itemsInput");
  const clearBtn = document.getElementById("clearBtn");
  const resetBtn = document.getElementById("resetBtn");
  const shuffleBtn = document.getElementById("shuffleBtn");
  const durationSlider = document.getElementById("spinDurationSlider");
  const durationValue = document.getElementById("spinDurationValue");
  const resultOverlay = document.getElementById("fortuneResultOverlay");
  const resultNameEl = document.getElementById("fortuneResultName");

  if (!canvas || !legendEl || !statusEl || !input) {
    return null;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  let items = [];
  let eliminatedItems = new Set();

  let rotation = 0;
  let spinning = false;
  let startRotation = 0;
  let targetRotation = 0;
  let spinStartTime = 0;
  let spinDurationMs = 12000;
  const pointerAngle = 0;
  let resultOverlayTimeoutId = null;
  let pendingEliminationItem = null;
  const placeholderColors = [
    "hsl(0deg 84% 55%)",
    "hsl(24deg 86% 57%)",
    "hsl(44deg 88% 58%)",
    "hsl(126deg 45% 50%)",
    "hsl(173deg 55% 46%)",
    "hsl(196deg 68% 52%)",
    "hsl(230deg 60% 55%)",
    "hsl(286deg 55% 58%)",
  ];
  const placeholderSegmentsCount = placeholderColors.length;
  const idleAngularVelocity = (Math.PI * 2) / 24000;
  let idleRotation = 0;
  let idleAnimationId = null;
  let idleLastTimestamp = null;
  let idleActive = false;

  function applyPendingElimination() {
    if (pendingEliminationItem !== null) {
      eliminatedItems.add(pendingEliminationItem);
      pendingEliminationItem = null;
    }
    drawWheel();
  }

  function clearPendingElimination() {
    pendingEliminationItem = null;
  }

  function setResultOverlayVisible(visible) {
    if (!resultOverlay) {
      if (!visible) {
        applyPendingElimination();
      }
      return;
    }
    const wasVisible = resultOverlay.classList.contains("visible");
    resultOverlay.classList.toggle("visible", visible);
    resultOverlay.setAttribute("aria-hidden", String(!visible));
    if (wasVisible && !visible) {
      applyPendingElimination();
    }
  }

  function hideResultOverlay() {
    if (resultOverlayTimeoutId) {
      window.clearTimeout(resultOverlayTimeoutId);
      resultOverlayTimeoutId = null;
    }
    setResultOverlayVisible(false);
  }

  function showResultOverlay(text) {
    if (!resultOverlay || !resultNameEl) {
      return;
    }

    resultNameEl.textContent = text;
    setResultOverlayVisible(true);

    if (resultOverlayTimeoutId) {
      window.clearTimeout(resultOverlayTimeoutId);
    }
    resultOverlayTimeoutId = window.setTimeout(() => {
      setResultOverlayVisible(false);
      resultOverlayTimeoutId = null;
    }, 4000);
  }

  if (resultOverlay) {
    resultOverlay.addEventListener("click", hideResultOverlay);
  }

  const updateDurationLabel = (value) => {
    if (durationValue) {
      durationValue.textContent = `${value}\u00A0с`;
    }
  };

  if (durationSlider) {
    const initialSeconds = Number(durationSlider.value) || Math.round(spinDurationMs / 1000);
    spinDurationMs = Math.max(1, initialSeconds) * 1000;
    updateDurationLabel(initialSeconds);
    durationSlider.addEventListener("input", (event) => {
      const seconds = Number(event.target.value) || 0;
      const clamped = Math.max(1, seconds);
      spinDurationMs = clamped * 1000;
      updateDurationLabel(clamped);
    });
  } else if (durationValue) {
    updateDurationLabel(Math.round(spinDurationMs / 1000));
  }

  function normalizeAngle(angle) {
    const tau = Math.PI * 2;
    return ((angle % tau) + tau) % tau;
  }

  function stepIdleAnimation(timestamp) {
    if (!idleActive) {
      idleAnimationId = null;
      idleLastTimestamp = null;
      return;
    }

    if (typeof timestamp === "number") {
      if (idleLastTimestamp !== null) {
        const delta = timestamp - idleLastTimestamp;
        idleRotation = normalizeAngle(idleRotation + delta * idleAngularVelocity);
      }
      idleLastTimestamp = timestamp;
    }

    drawWheel();

    if (idleActive) {
      idleAnimationId = requestAnimationFrame(stepIdleAnimation);
    }
  }

  function startIdleAnimation() {
    if (idleActive) {
      return;
    }
    idleActive = true;
    idleLastTimestamp = null;
    idleAnimationId = requestAnimationFrame(stepIdleAnimation);
  }

  function stopIdleAnimation() {
    if (!idleActive) {
      return;
    }
    idleActive = false;
    if (idleAnimationId !== null) {
      cancelAnimationFrame(idleAnimationId);
      idleAnimationId = null;
    }
    idleLastTimestamp = null;
  }

  function easeOutCubic(t) {
    const clamped = Math.min(1, Math.max(0, t));
    return 1 - Math.pow(1 - clamped, 3);
  }

  function dprScaleCanvas(cnv) {
    const rect = cnv.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width || cnv.width || 1));
    const height = Math.max(1, Math.round(rect.height || cnv.height || 1));
    cnv.width = width * dpr;
    cnv.height = height * dpr;
    const context = cnv.getContext("2d");
    if (context) {
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return { width, height };
  }

  function normalizeFortuneItemText(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) {
      return "";
    }

    const letterMatch = trimmed.match(/^(.*?)(\p{L})(.*)$/u);
    if (!letterMatch) {
      return trimmed;
    }

    const [, prefix, letter, suffix] = letterMatch;
    const uppercased =
      typeof letter.toLocaleUpperCase === "function"
        ? letter.toLocaleUpperCase()
        : letter.toUpperCase();
    return `${prefix}${uppercased}${suffix}`;
  }

  function normalizeTextareaValue(value) {
    const text = String(value || "");
    if (!text) {
      return "";
    }

    const segmentRegex = /([^\n,]+)/g;
    let result = "";
    let lastIndex = 0;
    let match;

    while ((match = segmentRegex.exec(text)) !== null) {
      const segment = match[0];
      const start = match.index;
      const end = segmentRegex.lastIndex;
      let separator = text.slice(lastIndex, start);
      const normalized = normalizeFortuneItemText(segment);

      if (normalized) {
        if (separator.endsWith(",") && !/[\r\n]/.test(separator)) {
          separator = separator.replace(/,(\s*)$/u, ", ");
        }
        result += separator + normalized;
      } else {
        result += separator;
      }

      lastIndex = end;
    }

    if (lastIndex < text.length) {
      result += text.slice(lastIndex);
    }

    return result;
  }

  function parseInput(text) {
    return String(text || "")
      .split(/\n|,/)
      .map((segment) => normalizeFortuneItemText(segment))
      .filter(Boolean);
  }

  function shuffleArray(array) {
    const cloned = [...array];
    for (let i = cloned.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
    }
    return cloned;
  }

  function colorForIndex(i, n) {
    const hue = Math.round((360 * i) / Math.max(1, n));
    return `hsl(${hue}deg 75% 55%)`;
  }

  function drawWheel() {
    const { width: w, height: h } = dprScaleCanvas(canvas);
    const size = Math.min(w, h);
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.max(40, size / 2 - 12);

    ctx.clearRect(0, 0, w, h);

    const activeItems = items.filter((item) => !eliminatedItems.has(item));
    const usePlaceholder = items.length === 0;
    const segmentCount = usePlaceholder ? placeholderSegmentsCount : Math.max(1, activeItems.length);
    const segAngle = (Math.PI * 2) / segmentCount;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(usePlaceholder ? idleRotation : rotation);

    for (let i = 0; i < segmentCount; i += 1) {
      const start = i * segAngle;
      const end = start + segAngle;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = usePlaceholder
        ? placeholderColors[i % placeholderColors.length]
        : colorForIndex(i, segmentCount);
      ctx.fill();

      if (segmentCount > 1) {
        ctx.strokeStyle = usePlaceholder ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.35)";
        ctx.lineWidth = usePlaceholder ? 2 : 1.5;
        ctx.stroke();
      }

      if (!usePlaceholder) {
        const mid = start + segAngle / 2;
        ctx.save();
        ctx.rotate(mid);
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        const fontSize = Math.max(
          10,
          Math.min(18, Math.floor(radius * 0.095 * (8 / Math.sqrt(segmentCount)))),
        );
        ctx.font = `600 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Inter, Arial`;
        ctx.fillStyle = "#fff";
        ctx.shadowColor = "rgba(0,0,0,0.55)";
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;

        const label = String(activeItems[i] ?? "");
        const maxTextWidth = radius * 0.8;
        let display = label;
        while (ctx.measureText(display).width > maxTextWidth && display.length > 3) {
          display = display.slice(0, -2);
        }
        if (display !== label) {
          display = `${display.slice(0, -1)}…`;
        }

        ctx.fillText(display, radius * 0.25, 0);
        ctx.restore();
      }
    }

    ctx.beginPath();
    ctx.arc(0, 0, Math.max(18, radius * 0.09), 0, Math.PI * 2);
    ctx.fillStyle = "#10132c";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.stroke();

    ctx.restore();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.arc(0, 0, radius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.restore();

    if (usePlaceholder) {
      if (legendEl && legendEl.firstChild) {
        legendEl.innerHTML = "";
      }
    } else {
      renderLegend();
    }
  }

  function renderLegend() {
    legendEl.innerHTML = "";
    const activeItems = items.filter((item) => !eliminatedItems.has(item));

    items.forEach((label) => {
      const div = document.createElement("div");
      div.className = "fortune-legend-item";
      if (eliminatedItems.has(label)) {
        div.classList.add("eliminated");
      }

      const sw = document.createElement("span");
      sw.className = "fortune-legend-swatch";

      if (!eliminatedItems.has(label)) {
        const activeIndex = activeItems.indexOf(label);
        if (activeIndex >= 0) {
          sw.style.background = colorForIndex(activeIndex, activeItems.length);
        }
      } else {
        sw.style.background = "#4a4a4a";
      }

      const txt = document.createElement("span");
      txt.textContent = label;

      div.appendChild(sw);
      div.appendChild(txt);
      legendEl.appendChild(div);
    });
  }

  function pickCurrentIndex() {
    const activeItems = items.filter((item) => !eliminatedItems.has(item));
    const n = Math.max(1, activeItems.length);
    const seg = (Math.PI * 2) / n;
    const normalized = normalizeAngle(pointerAngle - rotation);
    let idx = Math.floor(normalized / seg);
    if (idx < 0) idx += n;
    return idx % n;
  }

  function announceWinner(index) {
    const activeItems = items.filter((item) => !eliminatedItems.has(item));
    const text = activeItems[index];
    if (!text) {
      return;
    }

    const remainingItems = activeItems.filter((item) => item !== text);

    if (remainingItems.length === 0) {
      statusEl.innerHTML = `Результат: <b>${escapeHtml(text)}</b><br><span class="fortune-status-success">🎉 Игра завершена! Все элементы были выбраны.</span>`;
    } else {
      statusEl.innerHTML = `Результат: <b>${escapeHtml(text)}</b><br><span class="fortune-status-remaining">Осталось элементов: ${remainingItems.length}</span>`;
    }

    if (remainingItems.length === 1) {
      eliminatedItems.add(text);
      pendingEliminationItem = null;
      drawWheel();
      showFortuneWinnerModal(remainingItems[0]);
      return;
    }

    if (resultOverlay && resultNameEl) {
      pendingEliminationItem = text;
    } else {
      eliminatedItems.add(text);
      pendingEliminationItem = null;
      drawWheel();
    }
    showResultOverlay(text);

    const pointer = document.querySelector(".fortune-pointer");
    if (pointer && pointer.animate) {
      pointer.animate(
        [
          { filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.45))" },
          { filter: "drop-shadow(0 0 14px rgba(40,199,111,0.9))" },
          { filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.45))" },
        ],
        { duration: 900, easing: "ease" }
      );
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function animate(now) {
    if (!spinning) {
      return;
    }

    const current = typeof now === "number" ? now : performance.now();
    const elapsed = current - spinStartTime;
    const duration = Math.max(1, spinDurationMs);
    const progress = Math.min(1, elapsed / duration);
    const eased = easeOutCubic(progress);

    rotation = startRotation + (targetRotation - startRotation) * eased;

    if (progress >= 1) {
      rotation = normalizeAngle(rotation);
      spinning = false;
      if (durationSlider) {
        durationSlider.disabled = false;
      }
      drawWheel();
      const winner = pickCurrentIndex();
      announceWinner(winner);
      return;
    }

    drawWheel();
    requestAnimationFrame(animate);
  }

  function spin() {
    const activeItems = items.filter((item) => !eliminatedItems.has(item));
    if (spinning || activeItems.length === 0) {
      return;
    }

    stopIdleAnimation();

    hideResultOverlay();
    const segmentAngle = (Math.PI * 2) / activeItems.length;
    const winnerIndex = Math.floor(Math.random() * activeItems.length);
    const randomOffset = 0.15 + Math.random() * 0.7;
    const finalRotation = normalizeAngle(
      pointerAngle - (winnerIndex + randomOffset) * segmentAngle,
    );

    const currentRotation = normalizeAngle(rotation);
    let delta = finalRotation - currentRotation;
    if (delta <= 0) {
      delta += Math.PI * 2;
    }

    const extraTurns = Math.max(3, Math.round(spinDurationMs / 1000) + 2) + Math.floor(Math.random() * 2);
    delta += extraTurns * Math.PI * 2;

    startRotation = currentRotation;
    targetRotation = startRotation + delta;
    spinStartTime = performance.now();
    spinning = true;
    rotation = startRotation;
    statusEl.textContent = "Вращение… Удачи!";
    if (durationSlider) {
      durationSlider.disabled = true;
    }
    requestAnimationFrame(animate);
  }

  function updateFromInput() {
    if (spinning) {
      return;
    }

    const normalizedText = normalizeTextareaValue(input.value);
    if (input.value !== normalizedText) {
      input.value = normalizedText;
    }

    const parsedItems = parseInput(input.value);
    const newItems = parsedItems.slice(0, 128);

    let formattedText = normalizedText;
    if (newItems.length === 0) {
      formattedText = "";
    } else if (/[\r\n]/.test(normalizedText)) {
      formattedText = newItems.join("\n");
    } else if (normalizedText.includes(",")) {
      formattedText = newItems.join(", ");
    } else {
      formattedText = newItems.join("\n");
    }

    if (input.value !== formattedText) {
      input.value = formattedText;
    }
    if (JSON.stringify(items) === JSON.stringify(newItems)) {
      return;
    }

    const updatedEliminated = new Set();
    eliminatedItems.forEach((item) => {
      if (newItems.includes(item)) {
        updatedEliminated.add(item);
      }
    });

    items = newItems;
    eliminatedItems = updatedEliminated;
    if (items.length === 0) {
      startIdleAnimation();
    } else {
      stopIdleAnimation();
    }
    drawWheel();
    hideResultOverlay();

    const activeItems = items.filter((item) => !eliminatedItems.has(item));
    if (items.length === 0) {
      statusEl.textContent = "Добавьте элементы в список для создания колеса.";
    } else if (activeItems.length === 0) {
      statusEl.innerHTML = '<span class="fortune-status-success">🎉 Все элементы были исключены! Добавьте новые или очистите список.</span>';
    } else if (activeItems.length === 1) {
      statusEl.textContent = "Добавьте больше активных элементов или нажмите на колесо для вращения.";
    } else {
      statusEl.textContent = "Нажмите на колесо, чтобы запустить вращение.";
    }
  }

  function clearInput() {
    input.value = "";
    eliminatedItems.clear();
    clearPendingElimination();
    hideResultOverlay();
    updateFromInput();
  }

  function reshuffle() {
    if (!items.length) {
      return;
    }
    items = shuffleArray(items);
    input.value = items.join("\n");
    drawWheel();
    hideResultOverlay();
    statusEl.textContent = "Порядок пунктов перемешан.";
  }

  function resetEliminated() {
    eliminatedItems.clear();
    drawWheel();
    clearPendingElimination();
    hideResultOverlay();
    const activeItems = items.filter((item) => !eliminatedItems.has(item));
    if (activeItems.length > 1) {
      statusEl.textContent = "Все элементы восстановлены. Нажмите на колесо для вращения.";
    } else if (activeItems.length === 1) {
      statusEl.textContent = "Добавьте больше активных элементов или нажмите на колесо для вращения.";
    }
  }

  input.addEventListener("input", updateFromInput);
  input.addEventListener("paste", () => {
    setTimeout(updateFromInput, 10);
  });

  if (typeof ResizeObserver === "function") {
    const resizeObserver = new ResizeObserver(() => {
      drawWheel();
    });
    resizeObserver.observe(canvas);
  } else {
    window.addEventListener("resize", drawWheel);
  }

  canvas.addEventListener("click", spin);
  if (clearBtn) {
    clearBtn.addEventListener("click", clearInput);
  }
  if (resetBtn) {
    resetBtn.addEventListener("click", resetEliminated);
  }
  if (shuffleBtn) {
    shuffleBtn.addEventListener("click", reshuffle);
  }

  input.value = items.join("\n");
  drawWheel();
  if (items.length === 0) {
    startIdleAnimation();
  }

  return {
    handleMenuOpen() {
      drawWheel();
      setTimeout(drawWheel, 320);
    },
  };
}

