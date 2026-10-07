// Supabase
function readLocalJson(key, fallback, validate) {
  let raw;
  try {
    raw = localStorage.getItem(key);
  } catch (error) {
    console.warn("Unable to read local cache", key, error);
    return fallback;
  }
  if (raw === null) return fallback;
  try {
    const value = JSON.parse(raw);
    if (!validate(value)) throw new Error("Invalid local cache structure");
    return value;
  } catch (error) {
    console.warn("Discarding invalid local cache", key, error);
    try {
      localStorage.removeItem(key);
    } catch (storageError) {
      console.warn("Unable to remove invalid local cache", key, storageError);
    }
    return fallback;
  }
}

function isRatingCache(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([key, rating]) =>
        key.length > 0 &&
        (typeof rating === "number" ||
          (typeof rating === "string" && rating.trim() !== "")) &&
        Number.isFinite(Number(rating)) &&
        Number(rating) >= 0 &&
        Number(rating) <= 11,
    )
  );
}

function isCatalogCache(value) {
  if (!Array.isArray(value)) return false;
  const ids = new Set();
  const textFields = [
    "originalTitle",
    "genre",
    "genres",
    "poster",
    "dateAdded",
    "orderBy",
    "orderType",
    "country",
    "director",
    "watchSource",
    "gameMode",
    "platforms",
    "developers",
    "publishers",
    "released",
  ];
  const numericFields = [
    "rating",
    "kpRating",
    "rawgRating",
    "metacritic",
    "ratingSum",
    "ratingCount",
    "userRating",
    "playtime",
    "playtimeHastily",
    "playtimeNormally",
    "playtimeCompletely",
    "playtimeCount",
  ];
  return value.every((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      !Number.isSafeInteger(item.id) ||
      item.id <= 0 ||
      ids.has(item.id) ||
      typeof item.title !== "string"
    )
      return false;
    ids.add(item.id);
    if (
      !textFields.every(
        (key) => item[key] == null || typeof item[key] === "string",
      )
    )
      return false;
    if (
      !numericFields.every(
        (key) =>
          item[key] == null ||
          ((typeof item[key] === "number" || typeof item[key] === "string") &&
            Number.isFinite(Number(item[key]))),
      )
    )
      return false;
    if (
      item.year != null &&
      typeof item.year !== "string" &&
      typeof item.year !== "number"
    )
      return false;
    if (
      item.actors != null &&
      (!Array.isArray(item.actors) ||
        !item.actors.every((actor) => typeof actor === "string"))
    )
      return false;
    if (item._detailsLoaded != null && typeof item._detailsLoaded !== "boolean")
      return false;
    if (item.description != null && typeof item.description !== "string") {
      const description = item.description;
      if (
        typeof description !== "object" ||
        Array.isArray(description) ||
        !["original", "translated"].every(
          (key) =>
            description[key] == null || typeof description[key] === "string",
        )
      )
        return false;
    }
    return true;
  });
}

const SUPABASE_URL = "https://shwekurmzyzivtworjup.supabase.co";
const API_BASE_PATH = window.Pupsik.apiBase;
const EXTERNAL_API_URL = window.Pupsik.apiUrl("/api/external");
const API_PROXY_PLACEHOLDER = "server-proxy";

function buildApiPath(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_PATH}${normalizedPath}`;
}

function buildAbsoluteApiUrl(path) {
  const apiPath = buildApiPath(path);
  if (typeof window !== "undefined" && window.location?.origin) {
    return new URL(apiPath, document.baseURI).href;
  }
  return apiPath;
}

(function installExternalApiFetchProxy() {
  if (
    typeof window === "undefined" ||
    typeof window.fetch !== "function" ||
    window.__pupsikExternalProxyInstalled
  ) {
    return;
  }

  const nativeFetch = window.fetch.bind(window);

  function rewriteExternalUrl(input) {
    let url;
    try {
      url =
        input instanceof Request
          ? new URL(input.url, document.baseURI)
          : new URL(String(input), document.baseURI);
    } catch {
      return null;
    }

    const host = url.hostname.toLowerCase();
    if (host === "kinopoiskapiunofficial.tech") {
      const params = new URLSearchParams({ provider: "kinopoisk" });
      let requiresAdmin = false;
      if (url.pathname === "/api/v2.1/films/search-by-keyword") {
        params.set("resource", "search");
        params.set("keyword", url.searchParams.get("keyword") || "");
        params.set("page", url.searchParams.get("page") || "1");
      } else if (url.pathname.startsWith("/api/v2.2/films/")) {
        params.set("resource", "film");
        params.set("id", url.pathname.split("/").pop() || "");
      } else if (url.pathname === "/api/v1/staff") {
        params.set("resource", "staff");
        params.set("filmId", url.searchParams.get("filmId") || "");
      } else if (url.pathname.startsWith("/api/v1/api_keys/")) {
        params.set("resource", "quota");
        requiresAdmin = true;
      } else {
        return null;
      }
      return {
        url: `${EXTERNAL_API_URL}?${params.toString()}`,
        requiresAdmin,
      };
    }

    if (host === "api.rawg.io") {
      const params = new URLSearchParams({ provider: "rawg" });
      if (url.pathname === "/api/games") {
        params.set("resource", "search");
        params.set("search", url.searchParams.get("search") || "");
        params.set("page_size", url.searchParams.get("page_size") || "5");
      } else if (url.pathname.startsWith("/api/games/")) {
        params.set("resource", "game");
        params.set("id", url.pathname.split("/").pop() || "");
      } else {
        return null;
      }
      return {
        url: `${EXTERNAL_API_URL}?${params.toString()}`,
        requiresAdmin: true,
      };
    }

    return null;
  }

  window.fetch = function proxiedFetch(input, init) {
    const rewritten = rewriteExternalUrl(input);
    if (rewritten) {
      const nextInit = init ? { ...init } : {};
      if (rewritten.requiresAdmin) {
        const token = localStorage.getItem("adminToken") || "";
        if (token) {
          const headers = new Headers(nextInit.headers || (input instanceof Request ? input.headers : undefined) || {});
          headers.set("Authorization", `Bearer ${token}`);
          nextInit.headers = headers;
        }
      }
      return nativeFetch(rewritten.url, nextInit);
    }
    return nativeFetch(input, init);
  };

  window.__pupsikExternalProxyInstalled = true;
})();

const GAME_POSTER_BUCKET = "game-posters";
const PLACEHOLDER_POSTER_HOST = "images/placeholder-poster.webp";

function getGamePosterStoragePath(posterUrl) {
  if (!posterUrl || typeof posterUrl !== "string") return null;
  try {
    const url = new URL(posterUrl);
    const marker = `/storage/v1/object/public/${GAME_POSTER_BUCKET}/`;
    const idx = url.pathname.indexOf(marker);
    if (idx === -1) return null;
    const path = url.pathname.slice(idx + marker.length);
    return path.replace(/^\/+/, "") || null;
  } catch (err) {
    return null;
  }
}

function isPosterProxyUrl(url) {
  if (!url || typeof url !== "string") return false;
  return url.includes(window.Pupsik.apiUrl("/api/external?provider=poster-proxy&url="));
}

function proxyPosterUrl(url) {
  if (!url || typeof url !== "string") return url;
  if (url.startsWith("data:") || isPosterProxyUrl(url)) return url;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("steamgriddb.com")) {
      return buildApiPath(
        `/external?provider=poster-proxy&url=${encodeURIComponent(url)}`
      );
    }
  } catch (err) {
    return url;
  }
  return url;
}

function normalizeGameMode(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "coop") return "Coop";
  if (normalized === "single") return "Single";
  return "";
}

function normalizeWatchSource(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized === "discord" ? "discord" : "stream";
}

function formatWatchSourceLabel(value) {
  return normalizeWatchSource(value) === "discord" ? "Дискорд" : "Стрим";
}

const TWITCH_AUTH_SCOPES = ["user:read:chat", "user:bot", "channel:bot"];
let TWITCH_CLIENT_ID = null;
let SUPABASE_PUBLIC_KEY;
let supabaseClient;
let currentSupabaseKey = null;

function initializeSupabaseClient(key) {
  if (!key) throw new Error("Missing public Supabase key");
  if (!supabaseClient || currentSupabaseKey !== key) {
    // Admin sessions use our API, not Supabase Auth.
    supabaseClient = window.supabase.createClient(SUPABASE_URL, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    currentSupabaseKey = key;
  }
  SUPABASE_PUBLIC_KEY = key;
  return supabaseClient;
}

// Make the client available before other scripts start their data loaders.
initializeSupabaseClient(window.Pupsik.supabasePublicKey);

let cachedGuestId = null;
let isSubmittingUserRating = false;
let settingsRowId = null;
let rouletteLastWinner = "";
let rouletteAutofillActive = false;
let rouletteLastWinnerPendingValue = null;
let rouletteLastWinnerHasPendingSync = false;
let settingsPanel;
let settingsToggleButton;
let settingsPanelCloseButton;
let topLeftActions;
let topLeftActionsToggle;
let topLeftActionsMenu;
let aiModelSelect;
let aiModelStatus;
let aiModelOptions = [];
let aiModelStatuses = {}; // { modelId: { status, http_status, provider, raw } }
let selectedAiModelValue = null;
let kpApiSelect;
let kpApiStatus;
let selectedKpApiValue = "API 1";
let kpApiPrimaryKey = null;
let kpApiSecondaryKey = null;
let kpApiTertiaryKey = null;
let refreshKpQuotaBtn;
let kpQuotaInfo;
let kpDailyQuota;

let victoryVolumeSlider;
let victoryVolumeValue;
let victoryVolume = 0.5;
let victoryThemeAudio = null;
const DEFAULT_VICTORY_VOLUME = 0.5;
let loseVolumeSlider;
let loseVolumeValue;
let loseVolume = 0.5;
let loseSoundAudio = null;
const DEFAULT_LOSE_VOLUME = 0.5;
let rouletteSpinVolumeSlider;
let rouletteSpinVolumeValue;
let rouletteSpinVolume = 0.5;
const DEFAULT_ROULETTE_SPIN_VOLUME = 0.5;

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
const SETTINGS_API_URL = window.Pupsik.apiUrl("/api/admin?action=settings");
const CHECK_AI_MODELS_API_URL = window.Pupsik.apiUrl("/api/admin?action=check-ai-models");
// Kinopoisk (unofficial API)

function updateAdminSession(token, expiresAt) {
  adminToken = token || null;
  adminTokenExpiresAt = expiresAt || null;
  window.PupsikAdminSession.set(adminToken, adminTokenExpiresAt);
}

function clearAdminSession() {
  isAdmin = false;
  updateAdminSession(null, null);
  localStorage.removeItem("KINOPOISK_API_KEY");
  localStorage.removeItem("KINOPOISK_API_KEY2");
  localStorage.removeItem("KINOPOISK_API_KEY3");
  localStorage.removeItem("RAWG_API_KEY");
  kpApiPrimaryKey = null;
  kpApiSecondaryKey = null;
  kpApiTertiaryKey = null;
  KINOPOISK_API_KEY = undefined;
  RAWG_API_KEY = undefined;
  applyKpApiSelection(selectedKpApiValue);
  if (typeof hideAdminControls === "function") {
    hideAdminControls(true);
  }
}

function getAdminAuthHeaders() {
  return adminToken ? { Authorization: `Bearer ${adminToken}` } : {};
}
let KINOPOISK_API_KEY;
const KINOPOISK_SEARCH_URL =
  "https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword";
const KINOPOISK_FILM_URL = "https://kinopoiskapiunofficial.tech/api/v2.2/films";
const KINOPOISK_ACTORS_API_URL = window.Pupsik.apiUrl("/api/kinopoisk-actors");
let kpResults = [];
let selectedKPMovie = null;

// TMDB
let TMDB_ENABLED = false;

function notifyKinopoiskQuotaExceeded() {
  const fullMessage =
    "Превышен дневной лимит запросов к Кинопоиску 500 в день.";

  if (typeof showToastNotification === "function") {
    showToastNotification(fullMessage, "error");
    return;
  }

  alert(fullMessage);
}

async function handleKinopoiskErrorResponse(response) {
  if (!response || response.ok) {
    return false;
  }

  if (response.status === 402) {
    notifyKinopoiskQuotaExceeded();
    return true;
  }

  return false;
}

// IGDB requests use a server proxy so Twitch credentials never reach the browser.
// Kept for legacy modal code while old RAWG-backed records remain in the database.
let RAWG_API_KEY;
const RAWG_SEARCH_URL = "https://api.rawg.io/api/games";
function buildIgdbUrl(resource, params = {}) {
  const query = new URLSearchParams({ provider: "igdb", resource });
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) query.set(key, String(value));
  });
  return `${EXTERNAL_API_URL}?${query.toString()}`;
}
function getAdminAuthorizationHeaders() {
  const token = localStorage.getItem("adminToken") || "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}
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

function closeSettingsPanel() {
  const panel = document.getElementById("settingsPanel");
  if (!panel?.classList.contains("open")) return;
  toggleSettingsPanel(false);
}

function toggleTopLeftActionsMenu(forceState) {
  if (!topLeftActionsToggle || !topLeftActionsMenu) return;

  const isOpen = !topLeftActionsMenu.hasAttribute("hidden");
  const nextState =
    typeof forceState === "boolean" ? forceState : !isOpen;

  topLeftActionsMenu.toggleAttribute("hidden", !nextState);
  topLeftActionsToggle.setAttribute(
    "aria-expanded",
    nextState ? "true" : "false"
  );
}

function closeTopLeftActionsMenu() {
  toggleTopLeftActionsMenu(false);
}

function initTopLeftActionsMenu() {
  topLeftActions = document.querySelector(".top-left-actions");
  topLeftActionsToggle = document.getElementById("topLeftActionsToggle");
  topLeftActionsMenu = document.getElementById("topLeftActionsMenu");

  const musicButton = document.getElementById("musicMenuButton");
  const settingsButton = document.getElementById("settingsToggleButton");
  const rulesButton = document.getElementById("rulesPanelToggleButton");
  if (
    !topLeftActions ||
    !topLeftActionsToggle ||
    !topLeftActionsMenu ||
    !musicButton
  ) {
    return;
  }

  const decorateMenuButton = (button, labelText) => {
    const existingLabel = button.querySelector(".top-left-actions__label");
    if (existingLabel) {
      existingLabel.textContent = labelText;
    } else {
      const label = document.createElement("span");
      label.className = "top-left-actions__label";
      label.textContent = labelText;
      button.appendChild(label);
    }
  };

  const isPinnedBar = topLeftActions.classList.contains("top-left-actions--bar");

  decorateMenuButton(musicButton, "Рулетка");
  if (musicButton.parentElement !== topLeftActionsMenu) {
    topLeftActionsMenu.prepend(musicButton);
  }

  if (settingsButton && !isPinnedBar) {
    decorateMenuButton(settingsButton, "Настройки");
    topLeftActionsMenu.appendChild(settingsButton);
  }

  if (rulesButton && !isPinnedBar) {
    decorateMenuButton(rulesButton, "Правила");
    topLeftActionsMenu.appendChild(rulesButton);
  }

  if (isPinnedBar) {
    if (topLeftActions.parentElement !== document.body) {
      document.body.prepend(topLeftActions);
    }
    if (settingsButton && settingsButton.parentElement !== topLeftActions) {
      topLeftActions.appendChild(settingsButton);
    }
    if (rulesButton && rulesButton.parentElement !== topLeftActions) {
      topLeftActions.appendChild(rulesButton);
    }
    topLeftActionsMenu.removeAttribute("hidden");
    topLeftActionsToggle.hidden = true;
    topLeftActionsToggle.setAttribute("aria-expanded", "true");
    return;
  }

  topLeftActionsToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleTopLeftActionsMenu();
  });

  topLeftActionsMenu.addEventListener("click", (event) => {
    const actionButton = event.target.closest("button, a");
    if (!actionButton) return;
    closeTopLeftActionsMenu();
  });

  document.addEventListener("click", (event) => {
    if (!topLeftActions.contains(event.target)) {
      closeTopLeftActionsMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;

    const menuIsOpen = !topLeftActionsMenu.hasAttribute("hidden");
    if (!menuIsOpen) return;

    closeTopLeftActionsMenu();
    topLeftActionsToggle.focus();
  });
}

async function persistSettingsPayload(payload) {
  if (!adminToken) {
    throw new Error("Admin token is missing");
  }

  const response = await fetch(SETTINGS_API_URL, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...getAdminAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  let result = null;
  try {
    result = await response.json();
  } catch {
    result = null;
  }

  if (response.status === 401) {
    clearAdminSession();
  }

  if (!response.ok) {
    throw new Error(
      result?.error || `Failed to persist settings: ${response.status}`
    );
  }

  if (typeof result?.id === "number") {
    settingsRowId = result.id;
  }
}

function normalizeKpApiValue(value) {
  if (value === "API 2" || value === "API 3") {
    return value;
  }
  return "API 1";
}

function setKpApiStatus(message) {
  if (kpApiStatus) {
    kpApiStatus.textContent = message || "";
  }
}

function applyKpApiSelection(value) {
  selectedKpApiValue = normalizeKpApiValue(value);

  if (kpApiSelect) {
    kpApiSelect.value = selectedKpApiValue;
    kpApiSelect.disabled = false;
  }

  let activeKey = kpApiPrimaryKey;
  if (selectedKpApiValue === "API 2") {
    activeKey = kpApiSecondaryKey;
  } else if (selectedKpApiValue === "API 3") {
    activeKey = kpApiTertiaryKey;
  }

  KINOPOISK_API_KEY = activeKey || undefined;

  const statusMessage = activeKey
    ? `Используется ${selectedKpApiValue}.`
    : `Используется ${selectedKpApiValue}, ключ не найден.`;
  setKpApiStatus(statusMessage);

  if (settingsPanel?.classList.contains("open") && typeof refreshKpQuota === "function") {
    refreshKpQuota();
  }
}

function clampVictoryVolume(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.min(1, Math.max(0, parsed));
}

function updateVictoryVolumeUI(volume) {
  if (victoryVolumeSlider) {
    victoryVolumeSlider.value = String(volume);
  }

  if (victoryVolumeValue) {
    victoryVolumeValue.textContent = `${Math.round(volume * 100)}%`;
  }
}

function applyVictoryVolume(volume) {
  const normalized =
    clampVictoryVolume(volume) ?? clampVictoryVolume(victoryVolume);
  const resolved = normalized ?? DEFAULT_VICTORY_VOLUME;

  victoryVolume = resolved;
  updateVictoryVolumeUI(resolved);
  if (victoryThemeAudio) {
    victoryThemeAudio.volume = resolved;
  }
}

function ensureVictoryThemeAudio() {
  if (victoryThemeAudio) {
    return victoryThemeAudio;
  }

  const audio = new Audio("Music/Victory_Theme.mp3");
  audio.preload = "auto";
  audio.volume = victoryVolume;
  victoryThemeAudio = audio;
  return victoryThemeAudio;
}

async function playVictoryTheme() {
  const audio = ensureVictoryThemeAudio();
  audio.currentTime = 0;
  try {
    await audio.play();
  } catch (err) {
    console.warn("Failed to play victory theme", err);
  }
}

function stopVictoryTheme() {
  if (!victoryThemeAudio) {
    return;
  }

  victoryThemeAudio.pause();
  victoryThemeAudio.currentTime = 0;
}

async function persistVictoryVolume(value) {
  const normalized = clampVictoryVolume(value) ?? DEFAULT_VICTORY_VOLUME;
  await persistSettingsPayload({ victory_volume: normalized });
}

const debouncedPersistVictoryVolume = debounce((value) => {
  persistVictoryVolume(value).catch((err) =>
    console.error("Failed to save victory volume", err)
  );
}, 300);

function handleVictoryVolumeInput(event) {
  const rawValue = event?.target?.value;
  const normalized = clampVictoryVolume(rawValue);
  if (normalized === null) {
    return;
  }

  applyVictoryVolume(normalized);
  debouncedPersistVictoryVolume(normalized);
}

function handleVictoryVolumeChange(event) {
  const rawValue = event?.target?.value;
  const normalized = clampVictoryVolume(rawValue);
  if (normalized === null) {
    return;
  }

  persistVictoryVolume(normalized).catch((err) =>
    console.error("Failed to save victory volume", err)
  );
}

function clampLoseVolume(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.min(1, Math.max(0, parsed));
}

function updateLoseVolumeUI(volume) {
  if (loseVolumeSlider) {
    loseVolumeSlider.value = String(volume);
  }

  if (loseVolumeValue) {
    loseVolumeValue.textContent = `${Math.round(volume * 100)}%`;
  }
}

function applyLoseVolume(volume) {
  const normalized = clampLoseVolume(volume) ?? clampLoseVolume(loseVolume);
  const resolved = normalized ?? DEFAULT_LOSE_VOLUME;

  loseVolume = resolved;
  updateLoseVolumeUI(resolved);
  if (loseSoundAudio) {
    loseSoundAudio.volume = resolved;
  }
}

function ensureLoseSoundAudio() {
  if (loseSoundAudio) {
    return loseSoundAudio;
  }

  const audio = new Audio("Music/lose_sound.mp3");
  audio.preload = "auto";
  audio.volume = loseVolume;
  loseSoundAudio = audio;
  return loseSoundAudio;
}

async function playLoseSound() {
  const audio = ensureLoseSoundAudio();
  audio.currentTime = 0;
  try {
    await audio.play();
  } catch (err) {
    console.warn("Failed to play lose sound", err);
  }
}

async function persistLoseVolume(value) {
  const normalized = clampLoseVolume(value) ?? DEFAULT_LOSE_VOLUME;
  await persistSettingsPayload({ lose_volume: normalized });
}

const debouncedPersistLoseVolume = debounce((value) => {
  persistLoseVolume(value).catch((err) =>
    console.error("Failed to save lose volume", err)
  );
}, 300);

function handleLoseVolumeInput(event) {
  const rawValue = event?.target?.value;
  const normalized = clampLoseVolume(rawValue);
  if (normalized === null) {
    return;
  }

  applyLoseVolume(normalized);
  debouncedPersistLoseVolume(normalized);
}

function handleLoseVolumeChange(event) {
  const rawValue = event?.target?.value;
  const normalized = clampLoseVolume(rawValue);
  if (normalized === null) {
    return;
  }

  persistLoseVolume(normalized).catch((err) =>
    console.error("Failed to save lose volume", err)
  );
}

function clampRouletteSpinVolume(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.min(1, Math.max(0, parsed));
}

function updateRouletteSpinVolumeUI(volume) {
  if (rouletteSpinVolumeSlider) {
    rouletteSpinVolumeSlider.value = String(volume);
  }

  if (rouletteSpinVolumeValue) {
    rouletteSpinVolumeValue.textContent = `${Math.round(volume * 100)}%`;
  }
}

function applyRouletteSpinVolume(volume) {
  const normalized =
    clampRouletteSpinVolume(volume) ??
    clampRouletteSpinVolume(rouletteSpinVolume);
  const resolved = normalized ?? DEFAULT_ROULETTE_SPIN_VOLUME;

  rouletteSpinVolume = resolved;
  updateRouletteSpinVolumeUI(resolved);

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("roulette:spin-volume-change", {
        detail: { volume: resolved },
      })
    );
  }
}

function getRouletteSpinVolume() {
  return rouletteSpinVolume ?? DEFAULT_ROULETTE_SPIN_VOLUME;
}

async function persistRouletteSpinVolume(value) {
  const normalized =
    clampRouletteSpinVolume(value) ?? DEFAULT_ROULETTE_SPIN_VOLUME;
  await persistSettingsPayload({ spin_volume: normalized });
}

const debouncedPersistRouletteSpinVolume = debounce((value) => {
  persistRouletteSpinVolume(value).catch((err) =>
    console.error("Failed to save roulette spin volume", err)
  );
}, 300);

function handleRouletteSpinVolumeInput(event) {
  const rawValue = event?.target?.value;
  const normalized = clampRouletteSpinVolume(rawValue);
  if (normalized === null) {
    return;
  }

  applyRouletteSpinVolume(normalized);
  debouncedPersistRouletteSpinVolume(normalized);
}

function handleRouletteSpinVolumeChange(event) {
  const rawValue = event?.target?.value;
  const normalized = clampRouletteSpinVolume(rawValue);
  if (normalized === null) {
    return;
  }

  persistRouletteSpinVolume(normalized).catch((err) =>
    console.error("Failed to save roulette spin volume", err)
  );
}

function showSearchLoading(containerId, listId) {
  const container = document.getElementById(containerId);
  const list = document.getElementById(listId);
  if (!container || !list) return;
  container.style.display = "block";
  list.innerHTML =
    '<div class="autocomplete-loading"><span class="loading-spinner"></span></div>';
}

function showSelectionLoading(previewId, label) {
  const preview = document.getElementById(previewId);
  if (!preview) return;
  const safeLabel = label || "Добавляем...";
  preview.innerHTML =
    `<div class="autocomplete-loading is-inline">` +
    `<span class="loading-spinner"></span>` +
    `<span class="loading-label">${safeLabel}</span>` +
    `</div>`;
  preview.style.display = "block";
  preview.setAttribute("aria-busy", "true");
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
let selectedMovieOrderTypes = new Set();
let selectedWatchlistOrderTypes = new Set();

// Список заказанных фильмов
let watchlist = [];
let watchlistPage = 1;
const watchlistPerPage = 5;
let gameOrders = [];
let gameOrdersPage = 1;
const gameOrdersPerPage = 4;
let allPlayedGames = [];
let playedGames = [];
// Maps for diffing played game cards
let playedGameCardElements = new Map();
let playedGameDataMap = new Map();
let currentGameSearch = "";
let currentGameSort = "date";
let gameSortAscending = false;
let selectedGameOrderTypes = new Set();
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
    const res = await fetch(window.Pupsik.apiUrl("/api/admin?action=env"), {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 401 && token && !opts._retriedWithoutToken) {
      if (window.PupsikAdminSession.getToken() === token) clearAdminSession();
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
    const key = env.SUPABASE_PUBLIC_KEY;
    if (!key) {
      const error = new Error("В ответе сервера отсутствует SUPABASE_PUBLIC_KEY.");
      error.status = 500;
      throw error;
    }
    initializeSupabaseClient(key);
    const kpOptions = Array.isArray(env.KINOPOISK_API_OPTIONS)
      ? env.KINOPOISK_API_OPTIONS
      : [];
    kpApiPrimaryKey = kpOptions.includes("API 1") ? "server-proxy:API 1" : "";
    kpApiSecondaryKey = kpOptions.includes("API 2")
      ? "server-proxy:API 2"
      : "";
    kpApiTertiaryKey = kpOptions.includes("API 3")
      ? "server-proxy:API 3"
      : "";
    localStorage.removeItem("KINOPOISK_API_KEY");
    localStorage.removeItem("KINOPOISK_API_KEY2");
    localStorage.removeItem("KINOPOISK_API_KEY3");
    applyKpApiSelection(selectedKpApiValue);
    const igdbEnabled = Boolean(env.IGDB_ENABLED);
    localStorage.removeItem("RAWG_API_KEY");
    if (env.isAdmin && !igdbEnabled) {
      console.warn("IGDB is not configured on the server.");
    }
    if (typeof env.TWITCH_CLIENT_ID === "string") {
      const trimmedClientId = env.TWITCH_CLIENT_ID.trim();
      TWITCH_CLIENT_ID = trimmedClientId ? trimmedClientId : null;
    } else if (!token) {
      TWITCH_CLIENT_ID = null;
    }
    updateTwitchConnectButtonState();
    return env;
  } catch (err) {
    console.error("Failed to load environment variables", err);
    throw err;
  }
}

function updateTwitchConnectButtonState() {
  const btn = document.getElementById("adminTwitchConnectBtn");
  if (!btn) return;
  const hasClientId = Boolean(TWITCH_CLIENT_ID);
  btn.disabled = !hasClientId;
  if (hasClientId) {
    btn.removeAttribute("title");
  } else {
    btn.title = "Настройте Twitch OAuth в переменных окружения.";
  }
}

function startTwitchAdminConnect() {
  alert("Интеграция Twitch отключена.");
}

window.addEventListener("admin-session-change", () => {
  adminToken = window.PupsikAdminSession.getToken();
  adminTokenExpiresAt = localStorage.getItem("adminTokenExpiresAt");
  if (!adminToken && isAdmin) clearAdminSession();
});

function restoreAdminSession() {
  if (!adminToken) return Promise.resolve();
  return loadFeature("admin").then(() => window.restoreAdminSession());
}

const ROULETTE_ORDER_TYPE = "Рулетка";
const ORDER_TYPE_FILTER_OPTIONS = [
  "Донат",
  "Баллы канала",
  ROULETTE_ORDER_TYPE,
  "Шары",
  "Аукцион",
];
const ORDER_TYPE_CLASSES = {
  Донат: "ribbon-donate",
  "Баллы канала": "ribbon-points",
  Аукцион: "ribbon-auction",
  Шары: "ribbon-balls",
  [ROULETTE_ORDER_TYPE]: "ribbon-roulette",
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
let ratedMovies = readLocalJson("ratedMovies", {}, isRatingCache);
let ratedGames = readLocalJson("ratedGames", {}, isRatingCache);
let editPosterData = null;
let planDateOrderId = null;
let planDateOrderType = "movie";
let editingPlayedGameId = null;
let editPlayedGamePosterData = null;
let deletePlayedGameId = null;
let deleteMovieId = null;
let deleteOrderId = null;
let deleteGameOrderId = null;

function findMovieRatingTargetById(id) {
  if (id === null || id === undefined) return null;
  return (
    watchlist.find((item) => String(item.id) === String(id)) ||
    allMovies.find((item) => String(item.id) === String(id)) ||
    null
  );
}

function getMovieRatingStorageKey(target) {
  if (!target || typeof target !== "object") return "";

  const kinopoiskId = String(
    target.kinopoiskId ?? target.kp_id ?? target.kpId ?? ""
  ).trim();
  if (kinopoiskId) return `kp:${kinopoiskId}`;

  const imdbId = String(target.imdbId ?? target.imdb_id ?? "").trim().toLowerCase();
  if (imdbId) return `imdb:${imdbId}`;

  const title = String(target.title ?? target.order_title ?? "")
    .trim()
    .toLowerCase();
  const year = String(target.year ?? target.order_year ?? "").trim();
  if (title) {
    return `title:${title}|year:${year}`;
  }

  return "";
}

function getRatedMovieValue(targetOrId) {
  if (
    targetOrId !== null &&
    typeof targetOrId === "object" &&
    Object.prototype.hasOwnProperty.call(targetOrId, "id")
  ) {
    const stableKey = getMovieRatingStorageKey(targetOrId);
    if (stableKey && Object.prototype.hasOwnProperty.call(ratedMovies, stableKey)) {
      return ratedMovies[stableKey];
    }
    const legacyId = String(targetOrId.id);
    if (Object.prototype.hasOwnProperty.call(ratedMovies, legacyId)) {
      return ratedMovies[legacyId];
    }
    return undefined;
  }

  const target = findMovieRatingTargetById(targetOrId);
  if (target) return getRatedMovieValue(target);

  const idKey = String(targetOrId ?? "");
  if (!idKey) return undefined;
  return Object.prototype.hasOwnProperty.call(ratedMovies, idKey)
    ? ratedMovies[idKey]
    : undefined;
}

function hasRatedMovie(targetOrId) {
  return getRatedMovieValue(targetOrId) !== undefined;
}

function rememberRatedMovie(targetOrId, rating) {
  const target =
    targetOrId && typeof targetOrId === "object"
      ? targetOrId
      : findMovieRatingTargetById(targetOrId);
  const stableKey = getMovieRatingStorageKey(target);

  if (stableKey) {
    ratedMovies[stableKey] = rating;
  }
  if (target && target.id !== null && target.id !== undefined) {
    ratedMovies[String(target.id)] = rating;
  } else if (
    targetOrId !== null &&
    targetOrId !== undefined &&
    typeof targetOrId !== "object"
  ) {
    ratedMovies[String(targetOrId)] = rating;
  }

  localStorage.setItem("ratedMovies", JSON.stringify(ratedMovies));
}

function normalizeOrderTypeValue(value) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (!normalized) return "";
  const lowered = normalized.toLowerCase();
  if (lowered === "null" || lowered === "undefined") return "";
  return normalized;
}

function getOrderTypeFilterState(kind) {
  if (kind === "games") return selectedGameOrderTypes;
  if (kind === "watchlist") return selectedWatchlistOrderTypes;
  return selectedMovieOrderTypes;
}

function getOrderTypeFilterElements(kind) {
  if (kind === "games") {
    return {
      button: document.getElementById("gameOrderTypeFilterBtn"),
      menu: document.getElementById("gameOrderTypeFilterMenu"),
      count: document.getElementById("gameOrderTypeFilterCount"),
    };
  }

  if (kind === "watchlist") {
    return {
      button: document.getElementById("movieOrderTypeFilterBtnAction"),
      menu: document.getElementById("movieOrderTypeFilterMenuAction"),
      count: document.getElementById("movieOrderTypeFilterCountAction"),
    };
  }

  return {
    button: document.getElementById("movieOrderTypeFilterBtn"),
    menu: document.getElementById("movieOrderTypeFilterMenu"),
    count: document.getElementById("movieOrderTypeFilterCount"),
  };
}

function syncOrderTypeFilterButton(kind) {
  const state = getOrderTypeFilterState(kind);
  const { count, extraCounts = [] } = getOrderTypeFilterElements(kind);
  [count, ...extraCounts].filter(Boolean).forEach((item) => {
    item.textContent = String(state.size);
    item.hidden = state.size === 0;
  });
}

function syncOrderTypeFilterCheckboxes(kind) {
  const state = getOrderTypeFilterState(kind);
  document
    .querySelectorAll(`input[data-filter-kind="${kind}"]`)
    .forEach((input) => {
      input.checked = state.has(normalizeOrderTypeValue(input.value));
    });
}

function closeOrderTypeFilterMenu(kind, source = "all") {
  const { button, menu, extraButtons = [], extraMenus = [] } =
    getOrderTypeFilterElements(kind);
  const groups = [];
  if (button || menu) groups.push({ source: "toolbar", button, menu });
  extraButtons.forEach((extraButton, index) => {
    groups.push({
      source: "actions",
      button: extraButton,
      menu: extraMenus[index] || null,
    });
  });

  groups.forEach((group) => {
    if (source !== "all" && group.source !== source) return;
    if (group.button) group.button.setAttribute("aria-expanded", "false");
    if (group.menu) group.menu.hidden = true;
  });
}

function closeAllOrderTypeFilterMenus() {
  closeOrderTypeFilterMenu("movies");
  closeOrderTypeFilterMenu("games");
  closeOrderTypeFilterMenu("watchlist");
}

function toggleOrderTypeFilterMenu(kind, source = "toolbar") {
  const { button, menu, extraButtons = [], extraMenus = [] } =
    getOrderTypeFilterElements(kind);
  const activeGroup =
    source === "actions"
      ? {
          button: extraButtons[0] || null,
          menu: extraMenus[0] || null,
        }
      : { button, menu };
  if (!activeGroup.button || !activeGroup.menu) return;

  const shouldOpen = activeGroup.menu.hidden;
  closeAllOrderTypeFilterMenus();
  if (!shouldOpen) return;

  syncOrderTypeFilterCheckboxes(kind);
  activeGroup.menu.hidden = false;
  activeGroup.button.setAttribute("aria-expanded", "true");
}

function handleOrderTypeFilterChange(input) {
  if (!input) return;

  const rawKind = input.dataset.filterKind;
  const kind =
    rawKind === "games"
      ? "games"
      : rawKind === "watchlist"
      ? "watchlist"
      : "movies";
  const normalizedValue = normalizeOrderTypeValue(input.value);
  if (!normalizedValue || !ORDER_TYPE_FILTER_OPTIONS.includes(normalizedValue)) {
    input.checked = false;
    return;
  }

  const state = getOrderTypeFilterState(kind);
  if (input.checked) state.add(normalizedValue);
  else state.delete(normalizedValue);

  syncOrderTypeFilterButton(kind);

  if (kind === "games") {
    gamePage = 1;
    renderPlayedGames();
    return;
  }

  if (kind === "watchlist") {
    watchlistPage = 1;
    renderWatchlist();
    return;
  }

  currentPage = 1;
  renderMovies();
}

function clearOrderTypeFilters(kind) {
  const state = getOrderTypeFilterState(kind);
  state.clear();
  syncOrderTypeFilterCheckboxes(kind);
  syncOrderTypeFilterButton(kind);

  if (kind === "games") {
    gamePage = 1;
    renderPlayedGames();
    return;
  }

  if (kind === "watchlist") {
    watchlistPage = 1;
    renderWatchlist();
    return;
  }

  currentPage = 1;
  renderMovies();
}

function matchesSelectedOrderTypes(item, kind) {
  const state = getOrderTypeFilterState(kind);
  if (state.size === 0) return true;
  return state.has(normalizeOrderTypeValue(item?.orderType));
}

const REYOHOHO_BASE_URL = "https://reyohoho.github.io/reyohoho/";

const DEFAULT_POSTER_PLACEHOLDER =
  "images/placeholder-poster.webp";
const rouletteAutofillHint = document.getElementById("rouletteAutofillHint");
const rouletteAutofillClearBtn = document.getElementById("rouletteAutofillClear");
const rouletteOrderGroup = document.getElementById("rouletteOrderGroup");
const rouletteOrderByInput = document.getElementById("rouletteOrderBy");

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

function containsNormalizedPhrase(haystack, needle) {
  const normalizedHaystack = normalizeFortuneText(haystack);
  const normalizedNeedle = normalizeFortuneText(needle);

  if (!normalizedHaystack || !normalizedNeedle) {
    return false;
  }

  if (normalizedHaystack === normalizedNeedle) {
    return true;
  }

  return ` ${normalizedHaystack} `.includes(` ${normalizedNeedle} `);
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
  const tokens = normalizedValue.split(/\s+/).filter(Boolean);
  if (!tokens.length) return 0;

  let bestScore = 0;
  const queryClean = normalizedQuery.replace(/\s+/g, "");
  if (!queryClean) return 0;

  for (const token of tokens) {
    const tokenClean = token.replace(/\s+/g, "");
    if (!tokenClean) continue;

    if (tokenClean === queryClean) {
      bestScore = Math.max(bestScore, 80);
      continue;
    }

    if (tokenClean.startsWith(queryClean)) {
      bestScore = Math.max(bestScore, 75);
      continue;
    }

    // Нечеткое совпадение только по отдельным словам
    const lengthDiff = Math.abs(tokenClean.length - queryClean.length);
    if (lengthDiff > 1) continue;

    const minLength = Math.min(tokenClean.length, queryClean.length);
    const allowedDistance = minLength >= 4 ? 1 : 0;
    if (allowedDistance === 0) continue;

    const distance = levenshteinDistance(queryClean, tokenClean);
    if (distance <= allowedDistance) {
      const score = 70 - distance * 10; // 70 или 60
      bestScore = Math.max(bestScore, score);
    }
  }

  return bestScore;
}

function scoreStrictIdentifierMatch(normalizedQuery, value) {
  const normalizedValue = normalizeSearchText(value);
  if (!normalizedQuery || !normalizedValue) return 0;

  if (normalizedValue === normalizedQuery) return 100;
  if (normalizedValue.startsWith(normalizedQuery)) return 90;
  if (normalizedValue.includes(normalizedQuery)) return 85;

  const tokens = normalizedValue.split(/\s+/).filter(Boolean);
  if (!tokens.length) return 0;

  for (const token of tokens) {
    if (token === normalizedQuery) return 88;
    if (token.startsWith(normalizedQuery)) return 82;
  }

  return 0;
}

function shouldUseYearSearch(normalizedQuery, queryDigits) {
  if (!normalizedQuery || !queryDigits) return false;

  if (/^\d{4}$/.test(normalizedQuery)) return true;
  if (normalizedQuery === queryDigits && queryDigits.length >= 3) return true;

  return false;
}

function extractYearValue(value) {
  if (!value) return "";
  const match = String(value).match(/(19|20)\d{2}/);
  return match ? match[0] : "";
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

function getAutoTitleInput() {
  return document.getElementById("autoTitle");
}

function isAddMovieModalOpen() {
  const modal = document.getElementById("addMovieModal");
  return !!modal && modal.style.display === "block";
}

function toggleRouletteOrderInput(visible) {
  if (!rouletteOrderGroup) {
    return;
  }

  rouletteOrderGroup.style.display = visible ? "block" : "none";

  if (rouletteOrderByInput) {
    if (visible) {
      rouletteOrderByInput.required = true;
      rouletteOrderByInput.classList.add("roulette-order-attention");
    } else {
      rouletteOrderByInput.required = false;
      rouletteOrderByInput.classList.remove("roulette-order-attention");
      rouletteOrderByInput.value = "";
    }
  }
}

function toggleRouletteAutofillVisibility(visible) {
  const isVisible = Boolean(visible);

  if (rouletteAutofillHint) {
    rouletteAutofillHint.classList.toggle("is-visible", isVisible);
  }

  toggleRouletteOrderInput(isVisible);
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

  if (!adminToken) {
    rouletteLastWinnerHasPendingSync = true;
    rouletteLastWinnerPendingValue = normalizedValue;
    return;
  }

  try {
    await persistSettingsPayload({ roulette_last_winner: normalizedValue });
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

if (rouletteAutofillClearBtn) {
  rouletteAutofillClearBtn.addEventListener("click", () => {
    clearRouletteLastWinner();
  });
}

document.addEventListener("click", (e) => {
  if (e.target && (e.target.id === "checkAiModelsBtn" || e.target.closest("#checkAiModelsBtn"))) {
    void runFeatureAction("admin", "checkAiModelsStatus", []);
  }

  if (!e.target || !e.target.closest(".order-type-filter")) {
    closeAllOrderTypeFilterMenus();
  }
});

// Pagination
let currentPage = 1;
const moviesPerPage = 12;
let totalMovies = 0;

// Mobile tabs
let activeTab = "movies";

// Utility to convert file or remote image to optimized base64 string (poster-friendly)

const POSTER_LOAD_TIMEOUT_MS = 12000;
const POSTER_MAX_RETRIES = 2;

function withCacheBuster(url, attempt) {
  if (!url) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}retry=${attempt}_${Date.now()}`;
}

function setupPosterLoading(img, options = {}) {
  if (!img) return;
  const { placeholder, hideOnFail = true } = options;
  const src = img.getAttribute("src");
  if (!src || !/^https?:\/\//i.test(src)) return;

  img.decoding = "async";
  img.fetchPriority = "low";
  img.referrerPolicy = "no-referrer";

  let retries = 0;
  let timeoutId = null;
  let observer = null;
  let hasStarted = false;

  const clearTimer = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const showFallback = () => {
    if (placeholder) {
      img.style.display = "none";
      placeholder.style.display = "flex";
    } else if (hideOnFail) {
      img.style.display = "none";
    }
  };

  const scheduleTimeout = () => {
    clearTimer();
    timeoutId = setTimeout(() => {
      if (img.complete && img.naturalWidth) {
        clearTimer();
        return;
      }
      handleRetry();
    }, POSTER_LOAD_TIMEOUT_MS);
  };

  const handleRetry = () => {
    if (retries >= POSTER_MAX_RETRIES) {
      clearTimer();
      showFallback();
      return;
    }
    retries += 1;
    img.src = withCacheBuster(src, retries);
    scheduleTimeout();
  };

  const handleLoad = () => {
    clearTimer();
    if (placeholder) {
      placeholder.style.display = "none";
      img.style.display = "";
    }
  };

  const handleError = () => {
    handleRetry();
  };

  const startLoading = () => {
    if (hasStarted) return;
    hasStarted = true;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    img.addEventListener("load", handleLoad);
    img.addEventListener("error", handleError);
    if (img.complete && img.naturalWidth) {
      handleLoad();
      return;
    }
    scheduleTimeout();
  };

  const isVisible = () =>
    img.offsetParent !== null && img.getClientRects().length > 0;

  const checkVisibility = () => {
    if (isVisible()) {
      startLoading();
    }
  };

  if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            startLoading();
            break;
          }
        }
      },
      { rootMargin: "0px", threshold: 0.01 },
    );
    observer.observe(img);
    checkVisibility();
  } else {
    checkVisibility();
    if (!hasStarted) {
      requestAnimationFrame(checkVisibility);
    }
  }
}

function renderEmptyState(container, message) {
  const wrapper = document.createElement("div");
  wrapper.className = "empty-state";

  const img = document.createElement("img");
  img.src = "images/cloak_and_dagger.webp";
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
    if (!res.ok) {
      await handleKinopoiskErrorResponse(res);
      return null;
    }
    const data = await res.json();
    return data.filmLength || null;
  } catch (err) {
    console.error("Failed to fetch film details", err);
    return null;
  }
}

const kinopoiskActorsCache = new Map();
const kinopoiskActorsPending = new Map();

function normalizeKinopoiskActorRole(text = "") {
  return text.toString().trim().toLowerCase();
}

function isKinopoiskActorPerson(person) {
  const key = (person?.professionKey || "").toString().toUpperCase();
  if (key === "ACTOR") return true;
  const text = normalizeKinopoiskActorRole(
    person?.professionText || person?.profession_text || ""
  );
  return text.includes("актер") || text.includes("актёр") || text.includes("actor");
}

function normalizeKinopoiskActorRecord(person, filmId) {
  const normalizedFilmId = Number.parseInt(filmId, 10);
  const staffId = Number.parseInt(person?.staffId ?? person?.staff_id, 10);
  const actorName = String(
    person?.nameRu || person?.nameEn || person?.actor_name || ""
  ).trim();
  const professionText = String(
    person?.professionText || person?.profession_text || ""
  ).trim();
  const posterUrl = String(person?.posterUrl || person?.poster_url || "").trim();

  if (!Number.isFinite(normalizedFilmId) || !Number.isFinite(staffId) || !actorName) {
    return null;
  }

  if (!isKinopoiskActorPerson(person)) {
    return null;
  }

  return {
    kinopoisk_film_id: normalizedFilmId,
    staff_id: staffId,
    actor_name: actorName,
    poster_url: posterUrl || null,
    profession_text: professionText || null,
  };
}

function primeKinopoiskActorsCache(filmId, staff) {
  const normalizedFilmId = Number.parseInt(filmId, 10);
  if (!Number.isFinite(normalizedFilmId)) {
    return [];
  }

  const items = [];
  const seen = new Set();

  (Array.isArray(staff) ? staff : []).forEach((person) => {
    const row = normalizeKinopoiskActorRecord(person, normalizedFilmId);
    if (!row) return;
    const key = `${row.kinopoisk_film_id}:${row.staff_id}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(row);
  });

  kinopoiskActorsCache.set(String(normalizedFilmId), items);
  return items;
}

async function loadStoredKinopoiskActors(filmId, options = {}) {
  const normalizedFilmId = Number.parseInt(filmId, 10);
  if (!Number.isFinite(normalizedFilmId)) {
    return [];
  }

  const cacheKey = String(normalizedFilmId);
  if (!options.force && kinopoiskActorsCache.has(cacheKey)) {
    return kinopoiskActorsCache.get(cacheKey) || [];
  }
  if (!options.force && kinopoiskActorsPending.has(cacheKey)) {
    return kinopoiskActorsPending.get(cacheKey);
  }

  const request = fetch(
    `${KINOPOISK_ACTORS_API_URL}?filmId=${encodeURIComponent(normalizedFilmId)}`
  )
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load actors: ${response.status}`);
      }
      const payload = await response.json();
      const items = Array.isArray(payload?.items) ? payload.items : [];
      kinopoiskActorsCache.set(cacheKey, items);
      return items;
    })
    .catch((error) => {
      console.error("Failed to load stored Kinopoisk actors", error);
      return kinopoiskActorsCache.get(cacheKey) || [];
    })
    .finally(() => {
      kinopoiskActorsPending.delete(cacheKey);
    });

  kinopoiskActorsPending.set(cacheKey, request);
  return request;
}

async function saveKinopoiskActors(filmId, staff) {
  const normalizedFilmId = Number.parseInt(filmId, 10);
  const token = localStorage.getItem("adminToken") || "";
  const items = primeKinopoiskActorsCache(normalizedFilmId, staff);

  if (!Number.isFinite(normalizedFilmId) || !items.length || !token) {
    return items;
  }

  try {
    const response = await fetch(KINOPOISK_ACTORS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        filmId: normalizedFilmId,
        staff: Array.isArray(staff) ? staff : [],
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to save actors: ${response.status}`);
    }

    const payload = await response.json();
    const savedItems = Array.isArray(payload?.items) ? payload.items : items;
    kinopoiskActorsCache.set(String(normalizedFilmId), savedItems);
    return savedItems;
  } catch (error) {
    console.error("Failed to persist Kinopoisk actors", error);
    return items;
  }
}

async function fetchKPFilmStaff(filmId) {
  if (!filmId || !KINOPOISK_API_KEY) {
    return { actors: [], directors: [] };
  }

  try {
    const res = await fetch(
      `https://kinopoiskapiunofficial.tech/api/v1/staff?filmId=${encodeURIComponent(
        filmId
      )}`,
      {
        headers: {
          "X-API-KEY": KINOPOISK_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );
    if (!res.ok) {
      await handleKinopoiskErrorResponse(res);
      return { actors: [], directors: [] };
    }

    const data = await res.json();
    void saveKinopoiskActors(filmId, data);
    const actors = [];
    const directors = [];

    (Array.isArray(data) ? data : []).forEach((person) => {
      const name = (person?.nameRu || person?.nameEn || "").trim();
      if (!name) {
        return;
      }
      if (isKinopoiskActorPerson(person)) {
        actors.push(name);
      } else if (person?.professionKey === "DIRECTOR") {
        directors.push(name);
      }
    });

    return {
      actors: Array.from(new Set(actors)).slice(0, 15),
      directors: Array.from(new Set(directors)),
    };
  } catch (err) {
    console.error("Failed to fetch film staff", err);
    return { actors: [], directors: [] };
  }
}
