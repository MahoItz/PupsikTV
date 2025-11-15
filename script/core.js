// Supabase
const SUPABASE_URL = "https://shwekurmzyzivtworjup.supabase.co";
let SUPABASE_KEY;
let supabaseClient;
let currentSupabaseKey = null;

let cachedGuestId = null;
let isSubmittingUserRating = false;
let settingsRowId = null;
let rouletteLastWinner = "";
let rouletteAutofillActive = false;
let rouletteLastWinnerPendingValue = null;
let rouletteLastWinnerHasPendingSync = false;

function getGuestId() {
  if (cachedGuestId) return cachedGuestId;
  let guestId = localStorage.getItem("guest_id");
  if (!guestId) {
    guestId = `guest_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    localStorage.setItem("guest_id", guestId);
  }
  cachedGuestId = guestId;
  return guestId;
}

let adminToken = localStorage.getItem("adminToken") || null;
let adminTokenExpiresAt = localStorage.getItem("adminTokenExpiresAt") || null;
let isAdmin = false;
let adminElements = [];
// Kinopoisk (unofficial API)

function updateAdminSession(token, expiresAt) {
  adminToken = token || null;
  if (adminToken) {
    localStorage.setItem("adminToken", adminToken);
    if (expiresAt) {
      adminTokenExpiresAt = expiresAt;
      localStorage.setItem("adminTokenExpiresAt", expiresAt);
    } else {
      adminTokenExpiresAt = null;
      localStorage.removeItem("adminTokenExpiresAt");
    }
  } else {
    adminTokenExpiresAt = null;
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminTokenExpiresAt");
  }
}

function clearAdminSession() {
  updateAdminSession(null, null);
  isAdmin = false;
  localStorage.removeItem("KINOPOISK_API_KEY");
  localStorage.removeItem("RAWG_API_KEY");
  KINOPOISK_API_KEY = undefined;
  RAWG_API_KEY = undefined;
  if (typeof hideAdminControls === "function") {
    hideAdminControls(true);
  }
}
let KINOPOISK_API_KEY;
const KINOPOISK_SEARCH_URL =
  "https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword";
const KINOPOISK_FILM_URL = "https://kinopoiskapiunofficial.tech/api/v2.2/films";
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
let fatalErrorBannerShown = false;

let moviesLoading = false;
let watchlistLoading = false;
let gameOrdersLoading = false;
let playedGamesLoading = false;

const sectionLoaderRegistry = new WeakMap();

function toggleSectionLoading(container, isLoading, options = {}) {
  if (!container) return;

  const existing = sectionLoaderRegistry.get(container);

  const config = {
    message: "Загружаем данные...",
    compact: false,
    overlayWhenFilled: true,
    mode: null,
    ...options,
  };

  if (isLoading) {
    if (existing) {
      if (config.message && existing.textNode) {
        existing.textNode.textContent = config.message;
      }
      return;
    }

    const hasContent = container.children.length > 0;
    const mode =
      config.mode ||
      (hasContent && config.overlayWhenFilled !== false ? "overlay" : "replace");

    const loader = document.createElement("div");
    loader.className = "section-loader";
    if (config.compact) loader.classList.add("section-loader--compact");
    if (mode === "overlay") loader.classList.add("section-loader--overlay");
    loader.setAttribute("role", "status");
    loader.setAttribute("aria-live", "polite");

    const spinner = document.createElement("div");
    spinner.className = "section-loader__spinner";

    const ringPrimary = document.createElement("span");
    ringPrimary.className = "section-loader__ring";
    const ringSecondary = document.createElement("span");
    ringSecondary.className =
      "section-loader__ring section-loader__ring--delay";
    spinner.appendChild(ringPrimary);
    spinner.appendChild(ringSecondary);
    loader.appendChild(spinner);

    let textNode = null;
    if (config.message !== null) {
      const text = document.createElement("p");
      text.className = "section-loader__text";
      text.textContent = config.message || "Загружаем...";
      loader.appendChild(text);
      textNode = text;
    }

    container.classList.add("is-loading");
    if (mode === "overlay") {
      container.classList.add("section-loader-parent");
      container.appendChild(loader);
    } else {
      container.replaceChildren(loader);
    }

    sectionLoaderRegistry.set(container, { element: loader, mode, textNode });
  } else {
    if (!existing) return;

    const { element, mode } = existing;
    if (mode === "overlay") {
      if (element.parentNode === container) {
        container.removeChild(element);
      }
      container.classList.remove("section-loader-parent");
    } else if (element.parentNode === container) {
      container.removeChild(element);
    }
    container.classList.remove("is-loading");
    sectionLoaderRegistry.delete(container);
  }
}

function showFatalErrorBanner(message, error) {
  if (error) {
    console.error(message, error);
  } else {
    console.error(message);
  }
  if (fatalErrorBannerShown) return;
  fatalErrorBannerShown = true;

  const banner = document.createElement("div");
  banner.className = "fatal-error-banner";
  banner.textContent = message;
  banner.style.position = "fixed";
  banner.style.left = "0";
  banner.style.right = "0";
  banner.style.top = "0";
  banner.style.padding = "16px";
  banner.style.backgroundColor = "#8b0b0b";
  banner.style.color = "#ffffff";
  banner.style.textAlign = "center";
  banner.style.fontSize = "16px";
  banner.style.fontWeight = "600";
  banner.style.zIndex = "9999";

  const appendBanner = () => {
    if (!document.body) {
      window.addEventListener("DOMContentLoaded", appendBanner, { once: true });
      return;
    }
    document.body.appendChild(banner);
  };

  appendBanner();
}

async function loadEnv(options = {}) {
  let opts;
  if (typeof options === "string") {
    opts = { password: options };
  } else if (options && typeof options === "object") {
    opts = { ...options };
  } else {
    opts = {};
  }

  const headers = {};
  const token = opts.token || null;
  const password = opts.password || null;

  if (password) {
    headers["x-admin-password"] = password;
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch("/api/env", { headers });
    if (res.status === 401 && token && !opts._retriedWithoutToken) {
      clearAdminSession();
      return loadEnv({
        ...opts,
        token: null,
        _retriedWithoutToken: true,
      });
    }
    if (!res.ok) {
      let errorPayload = null;
      let errorMessage = `Не удалось загрузить конфигурацию (код ${res.status})`;
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        try {
          errorPayload = await res.json();
          if (errorPayload && typeof errorPayload.error === "string") {
            errorMessage = errorPayload.error;
          }
        } catch (parseErr) {
          console.error("Failed to parse env error payload", parseErr);
        }
      } else {
        try {
          const text = await res.text();
          if (text) {
            errorMessage = text;
          }
        } catch (textErr) {
          console.error("Failed to read env error text", textErr);
        }
      }
      const error = new Error(errorMessage);
      error.status = res.status;
      error.payload = errorPayload;
      throw error;
    }
    const env = await res.json();
    if (!env || typeof env !== "object") {
      const error = new Error(
        "Некорректный ответ сервера при загрузке конфигурации."
      );
      error.status = 500;
      throw error;
    }
    const key = env.SUPABASE_KEY;
    if (!key) {
      const error = new Error("В ответе сервера отсутствует SUPABASE_KEY.");
      error.status = 500;
      throw error;
    }
    if (!supabaseClient || currentSupabaseKey !== key) {
      SUPABASE_KEY = key;
      supabaseClient = window.supabase.createClient(SUPABASE_URL, key);
      currentSupabaseKey = key;
    } else {
      SUPABASE_KEY = key;
    }
    if (env.KINOPOISK_API_KEY) KINOPOISK_API_KEY = env.KINOPOISK_API_KEY;
    if (env.RAWG_API_KEY) RAWG_API_KEY = env.RAWG_API_KEY;
    return env;
  } catch (err) {
    console.error("Failed to load environment variables", err);
    throw err;
  }
}

async function verifyAdminPassword(password) {
  if (!password) {
    return { ok: false };
  }
  try {
    const res = await fetch("/api/verify-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      return { ok: false };
    }
    const data = await res.json();
    const token = typeof data.token === "string" ? data.token : null;
    const expiresAt =
      typeof data.expiresAt === "string" ? data.expiresAt : null;
    return { ok: !!data.ok && !!token, token, expiresAt };
  } catch (err) {
    console.error("Failed to verify admin password", err);
    return { ok: false };
  }
}

async function verifyAdminTokenRequest(token) {
  if (!token) {
    return { ok: false };
  }
  try {
    const res = await fetch("/api/verify-admin", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return { ok: false, expired: res.status === 401 };
    }
    const data = await res.json();
    const expiresAt =
      typeof data.expiresAt === "string" ? data.expiresAt : null;
    return { ok: !!data.ok, expiresAt };
  } catch (err) {
    console.error("Failed to validate admin token", err);
    return { ok: false };
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
let userRatingGameId = null;
let ratingTooltip;
let ratedMovies = JSON.parse(localStorage.getItem("ratedMovies") || "{}");
let ratedGames = JSON.parse(localStorage.getItem("ratedGames") || "{}");
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
const fortuneWinnerFilmNameEl = document.getElementById(
  "fortuneWinnerFilmName"
);
const fortuneWinnerKinopoiskBtn = document.getElementById(
  "fortuneWinnerKinopoisk"
);
const fortuneWinnerReYohohoBtn = document.getElementById(
  "fortuneWinnerReYohoho"
);
const fortuneWinnerCancelBtn = document.getElementById("fortuneWinnerCancel");
let fortuneWinnerMovie = null;
const reyohohoPickerModal = document.getElementById("reyohohoPickerModal");
const reyohohoPickerSubtitle = document.getElementById(
  "reyohohoPickerSubtitle"
);
const reyohohoPickerLoading = document.getElementById(
  "reyohohoPickerLoading"
);
const reyohohoOptionsContainer = document.getElementById("reyohohoOptions");
const reyohohoPickerCancelBtn = document.getElementById(
  "reyohohoPickerCancel"
);
const DEFAULT_POSTER_PLACEHOLDER =
  "https://via.placeholder.com/300x450?text=Нет+постера";
let reyohohoPickerContext = null;
const rouletteAutofillHint = document.getElementById("rouletteAutofillHint");
const rouletteAutofillClearBtn = document.getElementById("rouletteAutofillClear");

function normalizeFortuneText(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-z0-9а-я\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSearchText(str) {
  return normalizeFortuneText(str);
}

function levenshteinDistance(a, b) {
  const strA = String(a || "");
  const strB = String(b || "");
  const lenA = strA.length;
  const lenB = strB.length;

  if (!lenA) return lenB;
  if (!lenB) return lenA;

  const dp = Array.from({ length: lenA + 1 }, () =>
    new Array(lenB + 1).fill(0)
  );

  for (let i = 0; i <= lenA; i++) dp[i][0] = i;
  for (let j = 0; j <= lenB; j++) dp[0][j] = j;

  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = strA[i - 1] === strB[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[lenA][lenB];
}

function fuzzyMatchNormalized(normalizedQuery, value) {
  if (!normalizedQuery) return false;

  const normalizedValue = normalizeSearchText(value);
  if (!normalizedValue) return false;

  if (normalizedValue.includes(normalizedQuery)) return true;

  const queryClean = normalizedQuery.replace(/\s+/g, "");
  const valueClean = normalizedValue.replace(/\s+/g, "");

  if (!queryClean || !valueClean) return false;

  if (queryClean.length <= 2) {
    return valueClean.includes(queryClean);
  }

  if (Math.abs(valueClean.length - queryClean.length) > queryClean.length) {
    return false;
  }

  const allowedDistance =
    queryClean.length <= 4 ? 1 : queryClean.length <= 8 ? 2 : 3;

  if (valueClean.length < queryClean.length) {
    const dist = levenshteinDistance(queryClean, valueClean);
    const norm = dist / queryClean.length;
    return dist <= allowedDistance && norm <= 0.35;
  }

  let best = Infinity;

  for (let i = 0; i <= valueClean.length - queryClean.length; i++) {
    const segment = valueClean.slice(i, i + queryClean.length);
    const dist = levenshteinDistance(queryClean, segment);
    if (dist < best) best = dist;
    if (dist === 0) break;
  }

  const normalizedDistance = best / queryClean.length;

  return best <= allowedDistance && normalizedDistance <= 0.35;
}

function scoreMatch(normalizedQuery, value) {
  const normalizedValue = normalizeSearchText(value);
  if (!normalizedQuery || !normalizedValue) return 0;

  // Идеальное совпадение
  if (normalizedValue === normalizedQuery) return 100;
  // Начало строки — очень хорошо
  if (normalizedValue.startsWith(normalizedQuery)) return 90;
  // Вхождение где-то в середине
  if (normalizedValue.includes(normalizedQuery)) return 80;

  const queryClean = normalizedQuery.replace(/\s+/g, "");
  const valueClean = normalizedValue.replace(/\s+/g, "");
  if (!queryClean || !valueClean) return 0;

  const allowedDistance = queryClean.length <= 4 ? 1 : 2;
  let best = Infinity;

  if (valueClean.length <= queryClean.length) {
    best = levenshteinDistance(queryClean, valueClean);
  } else {
    const lenDiff = valueClean.length - queryClean.length;
    for (let i = 0; i <= lenDiff; i++) {
      const segment = valueClean.slice(i, i + queryClean.length);
      const d = levenshteinDistance(queryClean, segment);
      if (d < best) best = d;
      if (best === 0) break;
    }
  }

  if (best > allowedDistance) return 0;

  // Чем меньше расстояние — тем выше балл
  return 70 - best * 10; // 70, 60, 50...
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

  const parenthesesValues = Array.from(
    originalLabel.matchAll(/\(([^)]+)\)/g)
  ).map((m) => m[1].trim());
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
    const pipeParts = base
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);
    if (pipeParts.length > 1) {
      originalTitle = pipeParts.slice(1).join(" ");
      base = pipeParts[0];
    }
  } else {
    base = base.split("|")[0];
  }

  if (!originalTitle) {
    const slashParts = base
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
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

function findFortuneMovieMatch(parsed, candidateList = null) {
  const candidates = candidateList ? [...candidateList] : [...watchlist, ...allMovies];
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
    const movieOriginal = normalizeFortuneText(
      movie.originalTitle || movie.original_title || ""
    );
    const movieYear = extractYearValue(movie.year);
    let score = 0;

    if (normalizedTitle && movieTitle) {
      if (movieTitle === normalizedTitle) {
        score += 6;
      } else if (
        movieTitle.includes(normalizedTitle) ||
        normalizedTitle.includes(movieTitle)
      ) {
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
    } else if (
      !normalizedTitle &&
      normalizedLabel &&
      movieOriginal &&
      normalizedLabel.includes(movieOriginal)
    ) {
      score += 2;
    }

    if (
      !normalizedTitle &&
      normalizedLabel &&
      movieTitle &&
      normalizedLabel.includes(movieTitle)
    ) {
      score += 2;
    }

    if (targetYear) {
      if (movieYear && movieYear === targetYear) {
        score += 3;
      } else if (
        movieYear &&
        Math.abs(Number(movieYear) - Number(targetYear)) <= 1
      ) {
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

  const MIN_SCORE = 5;
  return bestScore >= MIN_SCORE ? best : null;
}

function extractKinopoiskIdFromValue(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const numeric = Math.abs(Math.trunc(value));
    return numeric ? String(numeric) : null;
  }
  const str = String(value).trim();
  if (!str) {
    return null;
  }
  const directMatch = str.match(/^\d{5,}$/);
  if (directMatch) {
    return directMatch[0];
  }
  const urlMatch = str.match(/(?:film|series|watch)\/(\d{5,})/i);
  if (urlMatch) {
    return urlMatch[1];
  }
  const hashMatch = str.match(/#(\d{5,})/);
  if (hashMatch) {
    return hashMatch[1];
  }
  const genericMatch = str.match(/\b(\d{5,})\b/);
  if (genericMatch) {
    return genericMatch[1];
  }
  return null;
}

function getKinopoiskIdFromMovie(candidate) {
  if (!candidate) {
    return null;
  }
  if (typeof candidate !== "object") {
    return extractKinopoiskIdFromValue(candidate);
  }

  const directKeys = [
    "kinopoiskId",
    "kinopoisk_id",
    "kpId",
    "kp_id",
    "kpFilmId",
    "kpFilmID",
    "filmId",
    "film_id",
    "kinopoisk",
    "kp",
  ];

  for (const key of directKeys) {
    if (key in candidate) {
      const id = extractKinopoiskIdFromValue(candidate[key]);
      if (id) {
        return id;
      }
    }
  }

  const urlKeys = [
    "kinopoiskUrl",
    "kinopoisk_url",
    "kpUrl",
    "kp_url",
    "url",
    "link",
    "kpLink",
    "kp_link",
    "kinopoiskLink",
    "kinopoisk_link",
  ];

  for (const key of urlKeys) {
    if (key in candidate) {
      const id = extractKinopoiskIdFromValue(candidate[key]);
      if (id) {
        return id;
      }
    }
  }

  if (Array.isArray(candidate.links)) {
    for (const link of candidate.links) {
      const id = extractKinopoiskIdFromValue(link);
      if (id) {
        return id;
      }
    }
  }

  if (Array.isArray(candidate.urls)) {
    for (const url of candidate.urls) {
      const id = extractKinopoiskIdFromValue(url);
      if (id) {
        return id;
      }
    }
  }

  if ("label" in candidate) {
    const id = extractKinopoiskIdFromValue(candidate.label);
    if (id) {
      return id;
    }
  }

  if ("displayText" in candidate) {
    const id = extractKinopoiskIdFromValue(candidate.displayText);
    if (id) {
      return id;
    }
  }

  return null;
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
  if (
    originalTitle &&
    normalizedOriginal &&
    normalizedOriginal !== normalizedTitle
  ) {
    displayParts.push(originalTitle);
  }

  const kinopoiskId =
    getKinopoiskIdFromMovie(match) ||
    extractKinopoiskIdFromValue(parsed.originalLabel) ||
    extractKinopoiskIdFromValue(label);

  return {
    label,
    title: title || label,
    originalTitle,
    year,
    displayText: displayParts.join(" ").trim() || label,
    kinopoiskId: kinopoiskId || null,
    match: match || null,
  };
}

async function resolveFortuneMovieKinopoiskId(movie) {
  if (!movie) {
    return null;
  }

  const directId = getKinopoiskIdFromMovie(movie);
  if (directId) {
    movie.kinopoiskId = directId;
    return directId;
  }

  if (movie.match) {
    const matchId = getKinopoiskIdFromMovie(movie.match);
    if (matchId) {
      movie.kinopoiskId = matchId;
      return matchId;
    }
  }

  if (!KINOPOISK_API_KEY) {
    return null;
  }

  try {
    const film = await fetchKinopoiskFilm(
      movie.title,
      movie.year,
      movie.originalTitle
    );
    const filmId = extractKinopoiskIdFromValue(film?.filmId);
    if (filmId) {
      movie.kinopoiskId = filmId;
      return filmId;
    }
  } catch (err) {
    console.error("Failed to resolve Kinopoisk ID for fortune winner", err);
  }

  return null;
}

function getAutoTitleInput() {
  return document.getElementById("autoTitle");
}

function isAddMovieModalOpen() {
  const modal = document.getElementById("addMovieModal");
  return !!modal && modal.style.display === "block";
}

function toggleRouletteAutofillVisibility(visible) {
  if (!rouletteAutofillHint) {
    return;
  }
  rouletteAutofillHint.classList.toggle("is-visible", Boolean(visible));
}

function triggerAutoTitleSuggestions() {
  if (!isAddMovieModalOpen()) {
    return;
  }

  const input = getAutoTitleInput();
  if (!input) {
    return;
  }

  const query = input.value.trim();
  if (!query) {
    return;
  }

  showSearchLoading("autoResultsContainer", "autoResults");
  debouncedKPSearch(query);
}

function syncRouletteAutofillState() {
  const input = getAutoTitleInput();

  if (!input) {
    rouletteAutofillActive = false;
    toggleRouletteAutofillVisibility(false);
    return;
  }

  if (rouletteLastWinner) {
    const matches = input.value.trim() === rouletteLastWinner;
    rouletteAutofillActive = matches;
    toggleRouletteAutofillVisibility(matches);
  } else {
    rouletteAutofillActive = false;
    toggleRouletteAutofillVisibility(false);
    if (input.value.trim()) {
      rouletteLastWinner = "";
    }
  }
}

function applyRouletteAutofill(options = {}) {
  const { force = false, triggerSuggestions = false } = options;
  const input = getAutoTitleInput();
  const winner = rouletteLastWinner;

  if (!input) {
    rouletteAutofillActive = false;
    toggleRouletteAutofillVisibility(false);
    return;
  }

  if (!winner) {
    if (force) {
      input.value = "";
    }
    rouletteAutofillActive = false;
    toggleRouletteAutofillVisibility(false);
    return;
  }

  if (force || !input.value.trim()) {
    input.value = winner;
  }

  syncRouletteAutofillState();

  if (triggerSuggestions && rouletteAutofillActive && isAddMovieModalOpen()) {
    triggerAutoTitleSuggestions();
  }
}

async function persistRouletteLastWinner(value) {
  const normalizedValue =
    value === null || value === undefined
      ? null
      : String(value).trim() || null;

  if (!supabaseClient) {
    rouletteLastWinnerHasPendingSync = true;
    rouletteLastWinnerPendingValue = normalizedValue;
    return;
  }

  try {
    if (settingsRowId) {
      const { error } = await supabaseClient
        .from("settings")
        .update({ roulette_last_winner: normalizedValue })
        .eq("id", settingsRowId);
      if (error) throw error;
      rouletteLastWinnerHasPendingSync = false;
      rouletteLastWinnerPendingValue = null;
      return;
    }

    const { data, error } = await supabaseClient
      .from("settings")
      .select("id")
      .limit(1);

    if (error) throw error;

    const existing = Array.isArray(data) && data.length > 0 ? data[0] : null;

    if (existing) {
      settingsRowId = existing.id ?? settingsRowId;
      const { error: updateError } = await supabaseClient
        .from("settings")
        .update({ roulette_last_winner: normalizedValue })
        .eq("id", settingsRowId);
      if (updateError) throw updateError;
      rouletteLastWinnerHasPendingSync = false;
      rouletteLastWinnerPendingValue = null;
      return;
    }

    if (normalizedValue === null) {
      rouletteLastWinnerHasPendingSync = false;
      rouletteLastWinnerPendingValue = null;
      return;
    }

    const { data: inserted, error: insertError } = await supabaseClient
      .from("settings")
      .insert({ roulette_last_winner: normalizedValue })
      .select("id")
      .single();

    if (insertError) throw insertError;

    settingsRowId = inserted?.id ?? settingsRowId;
    rouletteLastWinnerHasPendingSync = false;
    rouletteLastWinnerPendingValue = null;
  } catch (err) {
    rouletteLastWinnerHasPendingSync = true;
    rouletteLastWinnerPendingValue = normalizedValue;
    console.error("Error saving roulette last winner", err);
  }
}

async function clearRouletteLastWinner(options = {}) {
  const { updateInput = true, persist = true } = options;

  rouletteLastWinner = "";
  const input = getAutoTitleInput();

  if (updateInput && input) {
    input.value = "";
  }

  syncRouletteAutofillState();
  debouncedKPSearch("");

  if (persist) {
    await persistRouletteLastWinner(null);
  }
}

function showFortuneWinnerModal(label) {
  if (!fortuneWinnerModal || !label) {
    return;
  }

  fortuneWinnerMovie = buildFortuneWinnerMovie(label);

  const storageValue =
    (fortuneWinnerMovie?.title || fortuneWinnerMovie?.label || label || "").trim();

  if (storageValue) {
    rouletteLastWinner = storageValue;
    rouletteAutofillActive = false;
    if (isAddMovieModalOpen()) {
      applyRouletteAutofill({ force: true, triggerSuggestions: true });
    } else {
      toggleRouletteAutofillVisibility(false);
    }
    persistRouletteLastWinner(storageValue);
  }

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
  closeReyohohoPicker();
}

function getReyohohoDisplayTitle(movie) {
  if (!movie) {
    return "";
  }

  if (movie.displayText) {
    return movie.displayText;
  }

  const parts = [];

  if (movie.title) {
    parts.push(movie.title);
  }

  const movieYear =
    movie.year ||
    extractYearValue(movie.match?.year) ||
    extractYearValue(movie.match?.releaseDate);

  if (movieYear) {
    parts.push(`(${movieYear})`);
  }

  const normalizedTitle = normalizeFortuneText(movie.title);
  const normalizedOriginal = normalizeFortuneText(movie.originalTitle);

  if (
    movie.originalTitle &&
    normalizedOriginal &&
    normalizedOriginal !== normalizedTitle
  ) {
    parts.push(movie.originalTitle);
  }

  return parts.join(" ").trim();
}

function setReyohohoPickerSubtitle(movie) {
  if (!reyohohoPickerSubtitle) {
    return;
  }

  const displayTitle = getReyohohoDisplayTitle(movie);

  if (displayTitle) {
    reyohohoPickerSubtitle.textContent = `Выберите нужный фильм для "${displayTitle}"`;
  } else {
    reyohohoPickerSubtitle.textContent = "Выберите нужный фильм";
  }
}

function openReyohohoPickerLoading(movie) {
  if (!reyohohoPickerModal || !reyohohoOptionsContainer) {
    return false;
  }

  reyohohoPickerContext = { movie: movie || null, options: [] };
  setReyohohoPickerSubtitle(movie);

  if (reyohohoPickerLoading) {
    reyohohoPickerLoading.style.display = "flex";
  }

  reyohohoOptionsContainer.innerHTML = "";
  reyohohoPickerModal.style.display = "block";

  return true;
}

function renderReyohohoPickerOptions(movie, options) {
  if (!reyohohoPickerModal || !reyohohoOptionsContainer) {
    return;
  }

  if (!reyohohoPickerContext || reyohohoPickerContext.movie !== movie) {
    reyohohoPickerContext = { movie: movie || null, options: [] };
  }

  reyohohoPickerContext.options = Array.isArray(options) ? options : [];

  setReyohohoPickerSubtitle(movie);

  if (reyohohoPickerLoading) {
    reyohohoPickerLoading.style.display = "none";
  }

  reyohohoOptionsContainer.innerHTML = "";

  if (!reyohohoPickerContext.options.length) {
    return;
  }

  const fragment = document.createDocumentFragment();
  const limitedOptions = reyohohoPickerContext.options.slice(0, 9);

  for (const option of limitedOptions) {
    fragment.appendChild(createReyohohoOptionButton(option));
  }

  reyohohoOptionsContainer.appendChild(fragment);
}

function createReyohohoOptionButton(option) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "reyohoho-option-card";
  button.addEventListener("click", () => handleReyohohoOptionSelect(option));

  const posterWrapper = document.createElement("div");
  posterWrapper.className = "reyohoho-option-poster";

  const posterImg = document.createElement("img");
  posterImg.src =
    option.posterUrlPreview ||
    option.posterUrl ||
    DEFAULT_POSTER_PLACEHOLDER;
  posterImg.alt = option.nameRu || option.nameEn || "Постер";
  posterImg.loading = "lazy";

  posterWrapper.appendChild(posterImg);
  button.appendChild(posterWrapper);

  const infoWrapper = document.createElement("div");
  infoWrapper.className = "reyohoho-option-info";

  const titleEl = document.createElement("div");
  titleEl.className = "reyohoho-option-title";
  titleEl.textContent =
    option.nameRu || option.nameEn || option.nameOriginal || "Без названия";
  infoWrapper.appendChild(titleEl);

  const metaValues = [];

  if (option.year) {
    metaValues.push(String(option.year));
  }

  const countries = Array.isArray(option.countries)
    ? option.countries
        .map((country) => country?.country)
        .filter(Boolean)
    : [];

  if (countries.length) {
    metaValues.push(countries.slice(0, 2).join(", "));
  }

  if (
    option.nameEn &&
    option.nameRu &&
    option.nameEn.trim().toLowerCase() !== option.nameRu.trim().toLowerCase()
  ) {
    metaValues.push(option.nameEn);
  } else if (option.nameEn && !option.nameRu) {
    metaValues.push(option.nameEn);
  }

  if (metaValues.length) {
    const metaEl = document.createElement("div");
    metaEl.className = "reyohoho-option-meta";
    metaEl.textContent = metaValues.join(" • ");
    infoWrapper.appendChild(metaEl);
  }

  const ratingValue =
    option.rating && option.rating !== "null" ? String(option.rating).trim() : "";

  if (ratingValue) {
    const ratingEl = document.createElement("div");
    ratingEl.className = "reyohoho-option-rating";
    ratingEl.textContent = `Рейтинг КП: ${ratingValue}`;
    infoWrapper.appendChild(ratingEl);
  }

  button.appendChild(infoWrapper);

  return button;
}

function closeReyohohoPicker(shouldReturnFocus = false) {
  if (reyohohoPickerModal) {
    reyohohoPickerModal.style.display = "none";
  }
  if (reyohohoPickerLoading) {
    reyohohoPickerLoading.style.display = "none";
  }
  if (reyohohoOptionsContainer) {
    reyohohoOptionsContainer.innerHTML = "";
  }
  if (reyohohoPickerSubtitle) {
    reyohohoPickerSubtitle.textContent = "";
  }

  reyohohoPickerContext = null;

  if (shouldReturnFocus && fortuneWinnerReYohohoBtn) {
    fortuneWinnerReYohohoBtn.focus();
  }
}

function handleReyohohoOptionSelect(option) {
  const baseUrl = REYOHOHO_BASE_URL;

  if (!option) {
    closeReyohohoPicker();
    window.open(baseUrl, "_blank");
    return;
  }

  const targetId = extractKinopoiskIdFromValue(
    option.filmId || option.kinopoiskId
  );
  const targetUrl = targetId ? `${baseUrl}#${targetId}` : baseUrl;

  if (reyohohoPickerContext?.movie) {
    const contextMovie = reyohohoPickerContext.movie;

    if (targetId) {
      contextMovie.kinopoiskId = targetId;
    }

    const optionYear =
      option.year ||
      extractYearValue(option.premiereRu) ||
      extractYearValue(option.premiereWorld) ||
      extractYearValue(option.releaseDate);

    if (optionYear) {
      contextMovie.year = optionYear;
    }

    if (option.nameRu) {
      contextMovie.title = option.nameRu;
    } else if (option.nameEn && !contextMovie.title) {
      contextMovie.title = option.nameEn;
    }

    if (option.nameEn) {
      contextMovie.originalTitle = option.nameEn;
    } else if (option.nameOriginal) {
      contextMovie.originalTitle = option.nameOriginal;
    }

    contextMovie.match = option;

    const normalizedTitle = normalizeFortuneText(contextMovie.title);
    const normalizedOriginal = normalizeFortuneText(contextMovie.originalTitle);

    const displayParts = [];
    if (contextMovie.title) {
      displayParts.push(contextMovie.title);
    }
    if (contextMovie.year) {
      displayParts.push(`(${contextMovie.year})`);
    }
    if (
      contextMovie.originalTitle &&
      normalizedOriginal &&
      normalizedOriginal !== normalizedTitle
    ) {
      displayParts.push(contextMovie.originalTitle);
    }

    contextMovie.displayText =
      displayParts.join(" ").trim() ||
      contextMovie.displayText ||
      contextMovie.title ||
      "";

    if (fortuneWinnerFilmNameEl && fortuneWinnerMovie === contextMovie) {
      if (contextMovie.displayText) {
        fortuneWinnerFilmNameEl.textContent = contextMovie.displayText;
        fortuneWinnerFilmNameEl.style.display = "block";
      } else {
        fortuneWinnerFilmNameEl.textContent = "";
        fortuneWinnerFilmNameEl.style.display = "none";
      }
    }
  }

  closeReyohohoPicker();

  const newWindow = window.open(targetUrl, "_blank");
  if (!newWindow) {
    console.warn("ReYohoho window was blocked by the browser");
  }
}

async function openReyohohoFallback(baseUrl, movie) {
  let openedWindow = window.open("about:blank", "_blank");

  if (!openedWindow) {
    openedWindow = window.open(baseUrl, "_blank");
  } else {
    try {
      openedWindow.document.write(
        "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Открываем ReYohoho...</title></head><body style='font-family:sans-serif;font-size:16px;margin:20px;'><p>Открываем страницу ReYohoho...</p></body></html>"
      );
      openedWindow.document.close();
    } catch (err) {
      console.error("Failed to prepare ReYohoho window", err);
    }
  }

  try {
    const resolvedId = await resolveFortuneMovieKinopoiskId(movie);
    const targetUrl = resolvedId ? `${baseUrl}#${resolvedId}` : baseUrl;

    if (resolvedId) {
      movie.kinopoiskId = resolvedId;
    }

    if (openedWindow && !openedWindow.closed) {
      try {
        openedWindow.location.replace(targetUrl);
        return;
      } catch (err) {
        console.error("Failed to redirect ReYohoho window", err);
      }
    }

    window.open(targetUrl, "_blank");
  } catch (err) {
    console.error("Failed to resolve Kinopoisk ID for ReYohoho link", err);

    if (openedWindow && !openedWindow.closed) {
      try {
        openedWindow.location.replace(baseUrl);
      } catch (redirectErr) {
        console.error("Failed to open fallback ReYohoho page", redirectErr);
      }
    }
  }
}

if (reyohohoPickerCancelBtn) {
  reyohohoPickerCancelBtn.addEventListener("click", () => {
    closeReyohohoPicker(true);
  });
}

if (reyohohoPickerModal) {
  reyohohoPickerModal.addEventListener("click", (event) => {
    if (event.target === reyohohoPickerModal) {
      closeReyohohoPicker(true);
    }
  });
}

if (fortuneWinnerKinopoiskBtn) {
  fortuneWinnerKinopoiskBtn.addEventListener("click", () => {
    if (!fortuneWinnerMovie) {
      return;
    }
    openKinopoiskPage(
      fortuneWinnerMovie.title,
      fortuneWinnerMovie.year,
      fortuneWinnerMovie.originalTitle
    );
  });
}

if (fortuneWinnerReYohohoBtn) {
  fortuneWinnerReYohohoBtn.addEventListener("click", async () => {
    const baseUrl = REYOHOHO_BASE_URL;

    if (!fortuneWinnerMovie) {
      window.open(baseUrl, "_blank");
      return;
    }

    const immediateId =
      getKinopoiskIdFromMovie(fortuneWinnerMovie) ||
      getKinopoiskIdFromMovie(fortuneWinnerMovie.match);

    if (immediateId) {
      fortuneWinnerMovie.kinopoiskId = immediateId;
      window.open(`${baseUrl}#${immediateId}`, "_blank");
      return;
    }

    if (!KINOPOISK_API_KEY) {
      await openReyohohoFallback(baseUrl, fortuneWinnerMovie);
      return;
    }

    const targetMovie = fortuneWinnerMovie;
    const pickerOpened = openReyohohoPickerLoading(targetMovie);

    if (pickerOpened === false) {
      await openReyohohoFallback(baseUrl, targetMovie);
      return;
    }

    try {
      const options = await fetchKinopoiskFilmOptions(targetMovie, 9);

      if (fortuneWinnerMovie !== targetMovie) {
        closeReyohohoPicker();
        return;
      }

      if (!options.length) {
        closeReyohohoPicker();
        await openReyohohoFallback(baseUrl, targetMovie);
        return;
      }

      renderReyohohoPickerOptions(targetMovie, options);
    } catch (err) {
      console.error("Failed to fetch ReYohoho suggestions", err);
      closeReyohohoPicker();
      await openReyohohoFallback(baseUrl, targetMovie);
    }
  });
}

if (fortuneWinnerCancelBtn) {
  fortuneWinnerCancelBtn.addEventListener("click", () => {
    closeFortuneWinnerModal();
  });
}

if (rouletteAutofillClearBtn) {
  rouletteAutofillClearBtn.addEventListener("click", () => {
    clearRouletteLastWinner();
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
    const res = await fetch(
      `/api/steamgriddb?search=${encodeURIComponent(title)}`
    );
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

