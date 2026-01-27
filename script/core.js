// Supabase
const SUPABASE_URL = "https://shwekurmzyzivtworjup.supabase.co";
const API_BASE_PATH = "/api";

function buildApiPath(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_PATH}${normalizedPath}`;
}

function buildAbsoluteApiUrl(path) {
  const apiPath = buildApiPath(path);
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${apiPath}`;
  }
  return apiPath;
}

const GAME_POSTER_BUCKET = "game-posters";
const PLACEHOLDER_POSTER_HOST = "via.placeholder.com";

function buildGamePosterFileName(title) {
  const safeTitle = (title || "game")
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${safeTitle || "game"}-${suffix}`;
}

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
  return url.includes("/api/poster-proxy?url=");
}

function proxyPosterUrl(url) {
  if (!url || typeof url !== "string") return url;
  if (url.startsWith("data:") || isPosterProxyUrl(url)) return url;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("steamgriddb.com")) {
      return buildApiPath(`/poster-proxy?url=${encodeURIComponent(url)}`);
    }
  } catch (err) {
    return url;
  }
  return url;
}

async function uploadGamePosterToStorage({
  poster,
  file,
  title,
  folder = "orders",
}) {
  if (!supabaseClient || !supabaseClient.storage) return poster;

  if (
    !file &&
    (!poster ||
      (typeof poster === "string" &&
        poster.includes(PLACEHOLDER_POSTER_HOST)))
  ) {
    return poster;
  }

  let blob;
  let contentType;

  if (file instanceof File) {
    blob = file;
    contentType = file.type;
  } else if (typeof poster === "string") {
    try {
      const fetchUrl = poster.startsWith("http")
        ? buildApiPath(`/poster-proxy?url=${encodeURIComponent(poster)}`)
        : poster;
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        throw new Error(`Poster fetch failed with ${response.status}`);
      }
      blob = await response.blob();
      contentType = blob.type;
    } catch (err) {
      console.error("Error fetching poster for upload", err);
      return poster;
    }
  } else {
    return poster;
  }

  const ext =
    contentType && contentType.includes("/")
      ? contentType.split("/")[1]
      : "jpg";
  const fileName = buildGamePosterFileName(title);
  const path = `${folder}/${fileName}.${ext}`;

  const { error: uploadError } = await supabaseClient.storage
    .from(GAME_POSTER_BUCKET)
    .upload(path, blob, {
      contentType: contentType || "image/jpeg",
      upsert: false,
    });

  if (uploadError) {
    console.error("Error uploading game poster", uploadError);
    return poster;
  }

  const { data } = supabaseClient.storage
    .from(GAME_POSTER_BUCKET)
    .getPublicUrl(path);

  return data?.publicUrl || poster;
}

async function deleteGamePosterFromStorage(posterUrl) {
  if (!supabaseClient || !supabaseClient.storage) return;
  const path = getGamePosterStoragePath(posterUrl);
  if (!path) return;

  const { error } = await supabaseClient.storage
    .from(GAME_POSTER_BUCKET)
    .remove([path]);

  if (error) {
    console.error("Error deleting game poster from storage", error);
  }
}

const TWITCH_REDIRECT_URI = buildAbsoluteApiUrl("/twitch-connect");
const TWITCH_AUTH_SCOPES = ["user:read:chat", "user:bot", "channel:bot"];
let TWITCH_CLIENT_ID = null;
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
let settingsPanel;
let settingsToggleButton;
let settingsPanelCloseButton;
let aiModelSelect;
let aiModelStatus;
let aiModelOptions = [];
let selectedAiModelValue = null;
let kpApiSelect;
let kpApiStatus;
let selectedKpApiValue = "API 1";
let kpApiPrimaryKey = null;
let kpApiSecondaryKey = null;
let kpApiTertiaryKey = null;
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
let KINOPOISK_API_KEY;
const KINOPOISK_SEARCH_URL =
  "https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword";
const KINOPOISK_FILM_URL = "https://kinopoiskapiunofficial.tech/api/v2.2/films";
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

// RAWG
let RAWG_API_KEY;
const RAWG_SEARCH_URL = "https://api.rawg.io/api/games";
let rawgResults = [];
let selectedRAWGGame = null;
let steamGridPoster = null;
let steamGridPosters = [];
let rawgOptimizedPoster = null;
let rawgOptimizedPosterSource = null;
let rawgOptimizedPosterPromise = null;

function debounce(func, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}

function toggleSettingsPanel(forceState) {
  if (!settingsPanel) return;

  const isOpen = settingsPanel.classList.contains("open");
  const nextState =
    typeof forceState === "boolean" ? forceState : !isOpen;

  settingsPanel.classList.toggle("open", nextState);
  settingsPanel.setAttribute("aria-hidden", nextState ? "false" : "true");
  settingsPanel.toggleAttribute("inert", !nextState);

  if (!nextState && settingsPanel.contains(document.activeElement)) {
    if (settingsToggleButton) {
      settingsToggleButton.focus();
    } else {
      document.activeElement.blur();
    }
  }
  if (settingsToggleButton) {
    settingsToggleButton.classList.toggle("is-active", nextState);
    settingsToggleButton.setAttribute(
      "aria-expanded",
      nextState ? "true" : "false"
    );
  }
}

function closeSettingsPanel() {
  toggleSettingsPanel(false);
}

function setAiModelStatus(message) {
  if (!aiModelStatus) {
    aiModelStatus = document.getElementById("aiModelStatus");
  }
  if (aiModelStatus) {
    aiModelStatus.textContent = message;
  }
}

function renderAiModelOptions(options = [], selectedValue = null) {
  if (!aiModelSelect) {
    aiModelSelect = document.getElementById("aiModelSelect");
  }
  if (!aiModelSelect) return;

  const validOptions = Array.isArray(options)
    ? options.filter(
        (option) => option?.ai_model && option?.ai_model_name
      )
    : [];

  aiModelOptions = validOptions;

  aiModelSelect.innerHTML = "";

  if (!validOptions.length) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Модели не найдены";
    aiModelSelect.appendChild(placeholder);
    aiModelSelect.disabled = true;
    setAiModelStatus("Не удалось загрузить модели OpenRouter.");
    return;
  }

  validOptions.forEach((option) => {
    const el = document.createElement("option");
    el.value = option.ai_model;
    el.textContent = option.ai_model_name;
    aiModelSelect.appendChild(el);
  });

  const preferredValue =
    selectedValue || selectedAiModelValue || validOptions[0].ai_model;

  aiModelSelect.value = preferredValue;
  if (!aiModelSelect.value && validOptions.length > 0) {
    aiModelSelect.value = validOptions[0].ai_model;
  }
  selectedAiModelValue = aiModelSelect.value || null;
  aiModelSelect.disabled = false;

  const selectedOption = validOptions.find(
    (option) => option.ai_model === aiModelSelect.value
  );
  if (selectedOption) {
    setAiModelStatus(
      `Текущая модель: ${selectedOption.ai_model_name || selectedOption.ai_model}`
    );
  }
}

async function persistSettingsPayload(payload) {
  if (!supabaseClient) {
    throw new Error("Supabase client is not initialized");
  }

  if (settingsRowId) {
    const { error } = await supabaseClient
      .from("settings")
      .update(payload)
      .eq("id", settingsRowId);
    if (error) throw error;
    return;
  }

  const { data, error } = await supabaseClient
    .from("settings")
    .select("id")
    .order("id", { ascending: true })
    .limit(1);

  if (error) throw error;

  const existing = Array.isArray(data) && data.length > 0 ? data[0] : null;

  if (existing) {
    settingsRowId = existing.id ?? settingsRowId;
    const { error: updateError } = await supabaseClient
      .from("settings")
      .update(payload)
      .eq("id", settingsRowId);
    if (updateError) throw updateError;
    return;
  }

  const { data: inserted, error: insertError } = await supabaseClient
    .from("settings")
    .insert(payload)
    .select("id")
    .single();

  if (insertError) throw insertError;

  settingsRowId = inserted?.id ?? settingsRowId;
}

async function persistAiModelSelection(modelValue, modelName) {
  if (!supabaseClient) {
    throw new Error("Supabase client is not initialized");
  }

  const payload = {
    selected_ai_model: modelValue || null,
    selected_ai_model_name: modelName || null,
  };

  await persistSettingsPayload(payload);
}

async function handleAiModelChange(event) {
  const selectEl = event?.target;
  if (!selectEl) return;

  const modelValue = selectEl.value || null;
  const option = aiModelOptions.find((item) => item.ai_model === modelValue);
  const modelName = option?.ai_model_name || modelValue;

  selectedAiModelValue = modelValue;

  selectEl.disabled = true;
  setAiModelStatus("Сохраняем выбранную модель...");

  try {
    await persistAiModelSelection(modelValue, modelName || null);
    if (modelName) {
      setAiModelStatus(`Текущая модель: ${modelName}`);
    } else {
      setAiModelStatus("Модель обновлена.");
    }
  } catch (err) {
    console.error("Failed to save OpenRouter model", err);
    setAiModelStatus("Не удалось сохранить модель. Попробуйте ещё раз.");
  } finally {
    selectEl.disabled = false;
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
}

async function persistKpApiSelection(value) {
  const normalizedValue = normalizeKpApiValue(value);
  await persistSettingsPayload({ kp_api: normalizedValue });
}

async function handleKpApiChange(event) {
  const selectEl = event?.target;
  if (!selectEl) return;

  const normalizedValue = normalizeKpApiValue(selectEl.value || "API 1");

  selectEl.disabled = true;
  setKpApiStatus("Сохраняем выбранный API...");

  try {
    await persistKpApiSelection(normalizedValue);
    applyKpApiSelection(normalizedValue);
  } catch (err) {
    console.error("Failed to save Kinopoisk API selection", err);
    setKpApiStatus("Не удалось сохранить API. Попробуйте ещё раз.");
  } finally {
    selectEl.disabled = false;
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
    if (env.KINOPOISK_API_KEY) {
      kpApiPrimaryKey = env.KINOPOISK_API_KEY;
      localStorage.setItem("KINOPOISK_API_KEY", env.KINOPOISK_API_KEY);
    }
    if (env.KINOPOISK_API_KEY2) {
      kpApiSecondaryKey = env.KINOPOISK_API_KEY2;
      localStorage.setItem("KINOPOISK_API_KEY2", env.KINOPOISK_API_KEY2);
    }
    if (env.KINOPOISK_API_KEY3) {
      kpApiTertiaryKey = env.KINOPOISK_API_KEY3;
      localStorage.setItem("KINOPOISK_API_KEY3", env.KINOPOISK_API_KEY3);
    }
    applyKpApiSelection(selectedKpApiValue);
    if (env.RAWG_API_KEY) RAWG_API_KEY = env.RAWG_API_KEY;
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
  if (!isAdmin || !adminToken) {
    alert("Сначала войдите как админ с паролем.");
    return;
  }
  if (!TWITCH_CLIENT_ID) {
    alert("Не настроен Twitch Client ID.");
    return;
  }
  const params = new URLSearchParams({
    client_id: TWITCH_CLIENT_ID,
    redirect_uri: TWITCH_REDIRECT_URI,
    response_type: "code",
    scope: TWITCH_AUTH_SCOPES.join(" "),
  });
  const authUrl = `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
  const popupFeatures = [
    "width=600",
    "height=720",
    "menubar=no",
    "toolbar=no",
    "status=no",
    "resizable=yes",
    "scrollbars=yes",
  ].join(",");
  const popup = window.open(authUrl, "_blank", popupFeatures);
  if (!popup) {
    window.location.href = authUrl;
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

const ROULETTE_ORDER_TYPE = "Рулетка";
const ORDER_TYPE_CLASSES = {
  Донат: "ribbon-donate",
  "Баллы канала": "ribbon-points",
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
let ratedMovies = JSON.parse(localStorage.getItem("ratedMovies") || "{}");
let ratedGames = JSON.parse(localStorage.getItem("ratedGames") || "{}");
let editPosterData = null;
let editingOrderId = null;
let planDateOrderId = null;
let planDateOrderType = "movie";
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
const fortuneWinnerPosterEl = document.getElementById("fortuneWinnerPoster");
const fortuneWinnerOriginalTitleEl = document.getElementById(
  "fortuneWinnerOriginalTitle"
);
const fortuneWinnerYearEl = document.getElementById("fortuneWinnerYear");
const fortuneWinnerWatchBtn = document.getElementById("fortuneWinnerWatch");
const fortuneWinnerCancelBtn = document.getElementById("fortuneWinnerCancel");
let fortuneWinnerMovie = null;
const DEFAULT_POSTER_PLACEHOLDER =
  "https://via.placeholder.com/300x450?text=Нет+постера";
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

function normalizeStudiosValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    const studios = value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    return studios.length ? { studios } : { studios: [] };
  }

  if (typeof value === "object") {
    const studios = Array.isArray(value.studios)
      ? value.studios.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const homepage =
      typeof value.homepage === "string" && value.homepage.trim()
        ? value.homepage.trim()
        : null;
    if (studios.length || homepage) {
      return { studios, homepage };
    }
    return { studios: [] };
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    try {
      const parsed = JSON.parse(trimmed);
      return normalizeStudiosValue(parsed);
    } catch (err) {
      const studios = trimmed
        .split(/[,;|]+/)
        .map((item) => item.trim())
        .filter(Boolean);
      return studios.length ? { studios } : null;
    }
  }

  return null;
}

function serializeStudiosValue(value) {
  const normalized = normalizeStudiosValue(value);
  if (!normalized) {
    return null;
  }
  return JSON.stringify({
    studios: Array.isArray(normalized.studios) ? normalized.studios : [],
    homepage: normalized.homepage || null,
  });
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

function getFortuneWinnerMetadata(label) {
  const normalizedLabel = (label || "").trim();
  if (!normalizedLabel || typeof fortuneItemMetadata === "undefined") {
    return {};
  }

  return fortuneItemMetadata.get(normalizedLabel) || {};
}

function getFortuneWinnerPosterSource(candidate) {
  if (!candidate) {
    return null;
  }

  return (
    candidate.poster ||
    candidate.posterUrlPreview ||
    candidate.posterUrl ||
    candidate.coverUrl ||
    candidate.cover ||
    candidate.img ||
    candidate.image ||
    candidate.preview ||
    null
  );
}

function resolveFortuneWinnerPoster(movie) {
  if (!movie) {
    return DEFAULT_POSTER_PLACEHOLDER;
  }

  const metadata = getFortuneWinnerMetadata(movie.label);
  const sources = [metadata.movie, movie.match, movie];

  const poster = sources
    .map((candidate) => getFortuneWinnerPosterSource(candidate))
    .find(Boolean);

  return poster || DEFAULT_POSTER_PLACEHOLDER;
}

function getStoredFortuneKinopoiskId(label) {
  const normalizedLabel = (label || "").trim();
  if (!normalizedLabel || typeof fortuneItemMetadata === "undefined") {
    return null;
  }

  const metadata = fortuneItemMetadata.get(normalizedLabel);
  return metadata?.kinopoiskId || null;
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

function toggleRouletteOrderInput(visible) {
  if (!rouletteOrderGroup) {
    return;
  }

  rouletteOrderGroup.style.display = visible ? "block" : "none";

  if (!visible && rouletteOrderByInput) {
    rouletteOrderByInput.value = "";
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

  if (fortuneWinnerPosterEl) {
    fortuneWinnerPosterEl.src = resolveFortuneWinnerPoster(fortuneWinnerMovie);
    fortuneWinnerPosterEl.alt = fortuneWinnerMovie.displayText
      ? `Постер: ${fortuneWinnerMovie.displayText}`
      : "Постер выигравшего фильма";
  }

  const normalizedTitle = normalizeFortuneText(fortuneWinnerMovie.title);
  const normalizedOriginal = normalizeFortuneText(
    fortuneWinnerMovie.originalTitle,
  );

  const shouldShowOriginalTitle =
    fortuneWinnerMovie.originalTitle &&
    normalizedOriginal &&
    normalizedOriginal !== normalizedTitle;

  if (fortuneWinnerOriginalTitleEl) {
    if (shouldShowOriginalTitle) {
      fortuneWinnerOriginalTitleEl.textContent =
        fortuneWinnerMovie.originalTitle;
      fortuneWinnerOriginalTitleEl.style.display = "block";
    } else {
      fortuneWinnerOriginalTitleEl.textContent = "";
      fortuneWinnerOriginalTitleEl.style.display = "none";
    }
  }

  if (fortuneWinnerYearEl) {
    if (fortuneWinnerMovie.year) {
      fortuneWinnerYearEl.textContent = fortuneWinnerMovie.year;
      fortuneWinnerYearEl.style.display = "inline-flex";
    } else {
      fortuneWinnerYearEl.textContent = "";
      fortuneWinnerYearEl.style.display = "none";
    }
  }

  const modalAudioPlayer = document.getElementById("audioPlayer");
  if (modalAudioPlayer && !modalAudioPlayer.paused) {
    modalAudioPlayer.pause();
    modalAudioPlayer.currentTime = 0;
  }

  playVictoryTheme();
  fortuneWinnerModal.style.display = "block";
}

function closeFortuneWinnerModal() {
  stopVictoryTheme();
  fortuneWinnerMovie = null;
  if (fortuneWinnerFilmNameEl) {
    fortuneWinnerFilmNameEl.textContent = "";
    fortuneWinnerFilmNameEl.style.display = "";
  }
  if (fortuneWinnerOriginalTitleEl) {
    fortuneWinnerOriginalTitleEl.textContent = "";
    fortuneWinnerOriginalTitleEl.style.display = "";
  }
  if (fortuneWinnerYearEl) {
    fortuneWinnerYearEl.textContent = "";
    fortuneWinnerYearEl.style.display = "";
  }
  if (fortuneWinnerPosterEl) {
    fortuneWinnerPosterEl.src = DEFAULT_POSTER_PLACEHOLDER;
    fortuneWinnerPosterEl.alt = "Постер выигравшего фильма";
  }
  closeModal("fortuneWinnerModal");
}

if (fortuneWinnerWatchBtn) {
  fortuneWinnerWatchBtn.addEventListener("click", () => {
    stopVictoryTheme();
    const baseUrl = REYOHOHO_BASE_URL;

    if (!fortuneWinnerMovie) {
      window.open(baseUrl, "_blank");
      return;
    }

    const storedKinopoiskId = getStoredFortuneKinopoiskId(
      fortuneWinnerMovie.label
    );
    const kinopoiskId =
      storedKinopoiskId ||
      getKinopoiskIdFromMovie(fortuneWinnerMovie) ||
      getKinopoiskIdFromMovie(fortuneWinnerMovie.match) ||
      fortuneWinnerMovie.kinopoiskId;

    const targetUrl = kinopoiskId ? `${baseUrl}#${kinopoiskId}` : baseUrl;
    const newWindow = window.open(targetUrl, "_blank");

    if (!newWindow) {
      console.warn("ReYohoho window was blocked by the browser");
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

// Utility to convert file or remote image to optimized base64 string (poster-friendly)
const POSTER_MAX_WIDTH = 440;
const POSTER_MAX_HEIGHT = 660;
const POSTER_OUTPUT_QUALITY = 0.78;
const SUPPORTS_WEBP = (() => {
  try {
    const canvas = document.createElement("canvas");
    return canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
})();

const POSTER_LOAD_TIMEOUT_MS = 12000;
const POSTER_MAX_RETRIES = 2;

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function optimizeImageBlobToDataURL(blob) {
  const img = new Image();
  const objectUrl = URL.createObjectURL(blob);

  await new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = (err) => reject(err);
    img.src = objectUrl;
  });

  URL.revokeObjectURL(objectUrl);

  const srcWidth = img.naturalWidth || img.width;
  const srcHeight = img.naturalHeight || img.height;

  if (!srcWidth || !srcHeight) {
    return fileToDataUrl(blob);
  }

  const scale = Math.min(
    POSTER_MAX_WIDTH / srcWidth,
    POSTER_MAX_HEIGHT / srcHeight,
    1
  );
  const targetWidth = Math.round(srcWidth * scale);
  const targetHeight = Math.round(srcHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) {
    return fileToDataUrl(blob);
  }

  if (!SUPPORTS_WEBP) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetWidth, targetHeight);
  }

  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  const outputType = SUPPORTS_WEBP ? "image/webp" : "image/jpeg";
  const blobResult = await new Promise((resolve) =>
    canvas.toBlob(resolve, outputType, POSTER_OUTPUT_QUALITY)
  );

  if (!blobResult) {
    return canvas.toDataURL(outputType, POSTER_OUTPUT_QUALITY);
  }

  return await fileToDataUrl(blobResult);
}

async function readFileAsDataURL(file) {
  if (!file || !file.type || !file.type.startsWith("image/")) {
    return fileToDataUrl(file);
  }

  try {
    return await optimizeImageBlobToDataURL(file);
  } catch (err) {
    return fileToDataUrl(file);
  }
}

async function readRemoteImageAsOptimizedDataURL(url) {
  if (!url || typeof url !== "string") {
    return url;
  }
  if (url.startsWith("data:")) {
    return url;
  }
  try {
    const fetchUrl = proxyPosterUrl(url);
    const res = await fetch(fetchUrl, { mode: "cors", credentials: "omit" });
    if (!res.ok) return url;
    const blob = await res.blob();
    if (!blob.type || !blob.type.startsWith("image/")) return url;
    return await optimizeImageBlobToDataURL(blob);
  } catch (err) {
    return url;
  }
}

function resetRawgPosterCache() {
  rawgOptimizedPoster = null;
  rawgOptimizedPosterSource = null;
  rawgOptimizedPosterPromise = null;
}

function ensureRawgOptimizedPoster(url, onUpdate) {
  if (!url) {
    resetRawgPosterCache();
    return null;
  }
  if (rawgOptimizedPosterSource === url && rawgOptimizedPoster) {
    return rawgOptimizedPoster;
  }
  if (rawgOptimizedPosterPromise && rawgOptimizedPosterSource === url) {
    return rawgOptimizedPosterPromise;
  }

  rawgOptimizedPosterSource = url;
  rawgOptimizedPoster = null;

  rawgOptimizedPosterPromise = readRemoteImageAsOptimizedDataURL(url)
    .then((optimized) => {
      if (rawgOptimizedPosterSource !== url) return null;
      rawgOptimizedPoster = optimized || url;
      rawgOptimizedPosterPromise = null;
      if (typeof onUpdate === "function") onUpdate(rawgOptimizedPoster);
      return rawgOptimizedPoster;
    })
    .catch(() => {
      if (rawgOptimizedPosterSource !== url) return null;
      rawgOptimizedPoster = url;
      rawgOptimizedPosterPromise = null;
      if (typeof onUpdate === "function") onUpdate(rawgOptimizedPoster);
      return url;
    });

  return rawgOptimizedPosterPromise;
}

function getRawgOptimizedPosterFor(url) {
  if (!url) return null;
  if (rawgOptimizedPosterSource === url && rawgOptimizedPoster) {
    return rawgOptimizedPoster;
  }
  return null;
}

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

  img.addEventListener("load", () => {
    clearTimer();
    if (placeholder) {
      placeholder.style.display = "none";
      img.style.display = "";
    }
  });

  img.addEventListener("error", () => {
    handleRetry();
  });

  scheduleTimeout();
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
    const actors = [];
    const directors = [];
    const isActorRole = (person) => {
      const key = (person?.professionKey || "").toString().toUpperCase();
      if (key === "ACTOR") return true;
      const text = (person?.professionText || "").toString().toLowerCase();
      return text.includes("актер") || text.includes("актёр") || text.includes("actor");
    };

    (Array.isArray(data) ? data : []).forEach((person) => {
      const name = (person?.nameRu || person?.nameEn || "").trim();
      if (!name) {
        return;
      }
      if (isActorRole(person)) {
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
    steamGridPosters = posters
      .map((g) => {
        if (typeof g === "string") {
          const proxied = proxyPosterUrl(g);
          return { url: proxied, thumb: proxied };
        }
        if (!g) return null;
        const url = g.url || g.thumb || null;
        const thumb = g.thumb || g.url || url;
        if (!url) return null;
        return {
          url: proxyPosterUrl(url),
          thumb: proxyPosterUrl(thumb),
        };
      })
      .filter(Boolean);
    steamGridPoster =
      steamGridPosters[0]?.thumb || steamGridPosters[0]?.url || null;
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
  let selectedPoster = targetImg.src;

  function render() {
    container.innerHTML = "";
    const endIdx = Math.min(startIdx + maxVisible, posters.length);
    for (let i = startIdx; i < endIdx; i++) {
      const entry = posters[i];
      const poster =
        typeof entry === "string"
          ? { url: entry, thumb: entry }
          : {
              url: entry?.url || entry?.thumb,
              thumb: entry?.thumb || entry?.url || null,
            };
      if (!poster.url) continue;
      const wrapper = document.createElement("div");
      wrapper.className = "thumb-wrapper";
      const thumbUrl = poster.thumb || poster.url;
      if (selectedPoster === thumbUrl) {
        wrapper.classList.add("active");
      }

      const spinner = document.createElement("div");
      spinner.className = "loading-spinner";
      wrapper.appendChild(spinner);

      const img = document.createElement("img");
      img.className = "poster-thumb";
      if (selectedPoster === thumbUrl) {
        img.classList.add("selected");
      }
      img.style.display = "none";
      img.onload = () => {
        spinner.remove();
        img.style.display = "";
      };
      img.onerror = () => {
        spinner.remove();
      };
      img.src = thumbUrl;
      img.onclick = () => {
        steamGridPoster = thumbUrl;
        targetImg.src = steamGridPoster;
        selectedPoster = steamGridPoster;
        if (targetImg.id === "editGamePosterPreview") {
          editGamePosterData = steamGridPoster;
        } else if (targetImg.id === "editPlayedGamePosterPreview") {
          editPlayedGamePosterData = steamGridPoster;
        }
        if (
          targetImg.id === "editGamePosterPreview" ||
          targetImg.id === "editPlayedGamePosterPreview"
        ) {
          const selection = steamGridPoster;
          readRemoteImageAsOptimizedDataURL(selection)
            .then((optimized) => {
              if (!optimized || selection !== selectedPoster) return;
              if (targetImg.id === "editGamePosterPreview") {
                editGamePosterData = optimized;
              } else if (targetImg.id === "editPlayedGamePosterPreview") {
                editPlayedGamePosterData = optimized;
              }
              if (targetImg.src === selection) {
                targetImg.src = optimized;
              }
            })
            .catch((err) => {
              console.error("Error optimizing SteamGrid poster", err);
            });
        }
        render();
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
