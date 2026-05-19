// Supabase
const SUPABASE_URL = "https://shwekurmzyzivtworjup.supabase.co";
const API_BASE_PATH = "/api";
const EXTERNAL_API_URL = "/api/external";
const API_PROXY_PLACEHOLDER = "server-proxy";

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
          ? new URL(input.url, window.location.origin)
          : new URL(String(input), window.location.origin);
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
  return url.includes("/api/external?provider=poster-proxy&url=");
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

async function uploadGamePosterToStorage({
  poster,
  file,
  title,
  folder = "orders",
}) {
  if (
    !file &&
    (!poster ||
      (typeof poster === "string" &&
        poster.includes(PLACEHOLDER_POSTER_HOST)))
  ) {
    return poster;
  }

  let source = typeof poster === "string" ? poster : "";

  if (file instanceof File) {
    try {
      source = await readFileAsDataURL(file);
    } catch (err) {
      console.error("Error reading poster file", err);
      return poster;
    }
  } else if (!source) {
    return poster;
  }

  try {
    const token = localStorage.getItem("adminToken") || "";
    const response = await fetch("/api/admin?action=game-posters", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        source,
        title,
        folder,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || `Poster upload failed: ${response.status}`);
    }
    return payload?.publicUrl || poster;
  } catch (err) {
    console.error("Error uploading game poster", err);
    return poster;
  }
}

async function deleteGamePosterFromStorage(posterUrl) {
  const path = getGamePosterStoragePath(posterUrl);
  if (!path) return;

  try {
    const token = localStorage.getItem("adminToken") || "";
    const response = await fetch("/api/admin?action=game-posters", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ posterUrl }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || `Poster delete failed: ${response.status}`);
    }
  } catch (error) {
    console.error("Error deleting game poster from storage", error);
  }
}

const TWITCH_AUTH_SCOPES = ["user:read:chat", "user:bot", "channel:bot"];
let TWITCH_CLIENT_ID = null;
let SUPABASE_PUBLIC_KEY;
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
const SETTINGS_API_URL = "/api/admin?action=settings";
const CHECK_AI_MODELS_API_URL = "/api/admin?action=check-ai-models";
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

function getAdminAuthHeaders() {
  return adminToken ? { Authorization: `Bearer ${adminToken}` } : {};
}
let KINOPOISK_API_KEY;
const KINOPOISK_SEARCH_URL =
  "https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword";
const KINOPOISK_FILM_URL = "https://kinopoiskapiunofficial.tech/api/v2.2/films";
const KINOPOISK_ACTORS_API_URL = "/api/kinopoisk-actors";
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
    const shouldFocusTopLeftToggle =
      settingsToggleButton &&
      topLeftActionsToggle &&
      topLeftActionsMenu &&
      topLeftActionsMenu.hasAttribute("hidden") &&
      topLeftActionsMenu.contains(settingsToggleButton);

    if (shouldFocusTopLeftToggle) {
      topLeftActionsToggle.focus();
    } else if (settingsToggleButton) {
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
  if (nextState) {
    refreshKpQuota();
  }
}

function closeSettingsPanel() {
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
    ? options.filter((option) => option?.ai_model && option?.ai_model_name)
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

    const statusInfo = aiModelStatuses[option.ai_model];
    let indicator = "";
    let tooltip = "";

    if (statusInfo) {
      if (statusInfo.status === "active") indicator = "🟢 ";
      else if (statusInfo.status === "rate_limited") indicator = "🟠 ";
      else indicator = "🔴 ";

      tooltip = `Status: ${statusInfo.status}\nHTTP: ${statusInfo.http_status}\nProvider: ${statusInfo.provider}\nRaw: ${statusInfo.raw}`;
    }

    el.textContent = `${indicator}${option.ai_model_name}`;
    if (tooltip) el.title = tooltip;

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

async function checkAiModelsStatus() {
  const btn = document.getElementById("checkAiModelsBtn");
  const label = document.getElementById("aiModelStatusLabel");

  if (!btn || !aiModelOptions.length) return;

  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  if (label) label.textContent = "Проверка моделей...";

  try {
    const response = await fetch(CHECK_AI_MODELS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAdminAuthHeaders(),
      },
      body: JSON.stringify({
        models: aiModelOptions.map((modelInfo) => modelInfo.ai_model),
      }),
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
        result?.error || `Failed to check models: ${response.status}`
      );
    }

    aiModelStatuses = result?.statuses && typeof result.statuses === "object"
      ? result.statuses
      : {};

    renderAiModelOptions(aiModelOptions, selectedAiModelValue);
    await persistAiModelStatuses();

    const summary = Object.values(aiModelStatuses).reduce(
      (acc, statusInfo) => {
        if (statusInfo?.status === "active") acc.active += 1;
        else if (statusInfo?.status === "rate_limited") acc.rateLimited += 1;
        else acc.unavailable += 1;
        return acc;
      },
      { active: 0, rateLimited: 0, unavailable: 0 }
    );

    if (label) {
      label.textContent = `Проверено: ${summary.active} доступно, ${summary.rateLimited} с лимитом, ${summary.unavailable} недоступно`;
      setTimeout(() => {
        label.textContent = "Проверка завершена";
      }, 5000);
    }
  } catch (error) {
    console.error("Failed to check AI models", error);
    if (label) {
      label.textContent = `Ошибка проверки: ${error.message || error}`;
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

async function persistAiModelStatuses() {
  if (!adminToken) {
    console.warn("Cannot persist AI statuses: admin token missing");
    return;
  }

  try {
    await persistSettingsPayload({ ai_model_statuses: aiModelStatuses });
    console.log("AI model statuses persisted to Supabase");
  } catch (err) {
    console.error("Failed to persist AI statuses", err);
  }
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

async function persistAiModelSelection(modelValue, modelName) {
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
  await updateActiveAiModel(modelValue);
}

async function updateActiveAiModel(modelValue) {
  const option = aiModelOptions.find((item) => item.ai_model === modelValue);
  const modelName = option?.ai_model_name || modelValue;

  selectedAiModelValue = modelValue;

  // Update dropdown if it exists
  if (aiModelSelect) {
    aiModelSelect.value = modelValue || "";
  }

  setAiModelStatus("Сохраняем выбранную модель...");

  try {
    await persistAiModelSelection(modelValue, modelName || null);
    if (modelName) {
      setAiModelStatus(`Текущая модель: ${modelName}`);
    } else {
      setAiModelStatus("Модель обновлена.");
    }
    console.log(`AI system successfully switched to: ${modelName}`);
  } catch (err) {
    console.error("Failed to persist model switch", err);
    setAiModelStatus("Не удалось сохранить модель. Попробуйте ещё раз.");
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

async function refreshKpQuota() {
  if (!KINOPOISK_API_KEY) {
    if (kpQuotaInfo) kpQuotaInfo.style.display = "none";
    return;
  }

  const btn = document.getElementById("refreshKpQuotaBtn");
  const icon = btn?.querySelector("i");
  const originalHtml = btn?.innerHTML;

  if (btn) btn.disabled = true;
  if (icon) icon.classList.add("fa-spin");

  try {
    const url = `https://kinopoiskapiunofficial.tech/api/v1/api_keys/${KINOPOISK_API_KEY}`;
    const res = await fetch(url, {
      headers: {
        "X-API-KEY": KINOPOISK_API_KEY,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Quota fetch failed with ${res.status}`);
    }

    const data = await res.json();
    
    if (kpQuotaInfo) kpQuotaInfo.style.display = "flex";
    if (kpDailyQuota) {
      const daily = data.dailyQuota || { value: 0, used: 0 };
      kpDailyQuota.textContent = `${daily.value - daily.used} / ${daily.value}`;
    }
  } catch (err) {
    console.error("Error refreshing Kinopoisk quota", err);
    if (kpQuotaInfo) kpQuotaInfo.style.display = "none";
  } finally {
    if (btn) btn.disabled = false;
    if (icon) icon.classList.remove("fa-spin");
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

  // Refresh quota statistics
  refreshKpQuota();
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
    const res = await fetch("/api/admin?action=env", { headers });
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
    const key = env.SUPABASE_PUBLIC_KEY;
    if (!key) {
      const error = new Error("В ответе сервера отсутствует SUPABASE_PUBLIC_KEY.");
      error.status = 500;
      throw error;
    }
    if (!supabaseClient || currentSupabaseKey !== key) {
      SUPABASE_PUBLIC_KEY = key;
      supabaseClient = window.supabase.createClient(SUPABASE_URL, key);
      currentSupabaseKey = key;
    } else {
      SUPABASE_PUBLIC_KEY = key;
    }
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
    RAWG_API_KEY = env.RAWG_ENABLED ? API_PROXY_PLACEHOLDER : undefined;
    localStorage.removeItem("RAWG_API_KEY");
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

async function verifyAdminPassword(password) {
  if (!password) {
    return { ok: false };
  }
  try {
    const res = await fetch("/api/admin?action=verify-admin", {
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
    const res = await fetch("/api/admin?action=verify-admin", {
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

async function refreshAdminTokenRequest(token) {
  if (!token) {
    return { ok: false };
  }
  try {
    const res = await fetch("/api/admin?action=verify-admin", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return { ok: false, expired: res.status === 401 };
    }
    const data = await res.json();
    const refreshedToken = typeof data.token === "string" ? data.token : null;
    const expiresAt =
      typeof data.expiresAt === "string" ? data.expiresAt : null;
    return { ok: !!data.ok && !!refreshedToken, token: refreshedToken, expiresAt };
  } catch (err) {
    console.error("Failed to refresh admin token", err);
    return { ok: false };
  }
}

function isAdminTokenExpiringSoon(expiresAt, thresholdMs = 1000 * 60 * 60 * 24) {
  if (!expiresAt || typeof expiresAt !== "string") return true;
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) return true;
  return expiresAtMs - Date.now() <= thresholdMs;
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
let ratedMovies = JSON.parse(localStorage.getItem("ratedMovies") || "{}");
let ratedGames = JSON.parse(localStorage.getItem("ratedGames") || "{}");
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

const fortuneWinnerModal = document.getElementById("fortuneWinnerModal");
const fortuneWinnerFilmNameEl = document.getElementById(
  "fortuneWinnerFilmName"
);
const fortuneWinnerPosterEl = document.getElementById("fortuneWinnerPoster");
const fortuneWinnerOriginalTitleEl = document.getElementById(
  "fortuneWinnerOriginalTitle"
);
const fortuneWinnerYearEl = document.getElementById("fortuneWinnerYear");
const fortuneWinnerOrderByInput = document.getElementById(
  "fortuneWinnerOrderBy"
);
const fortuneWinnerSaveBtn = document.getElementById("fortuneWinnerSave");
const fortuneWinnerSaveStatusEl = document.getElementById(
  "fortuneWinnerSaveStatus"
);
const fortuneWinnerWatchBtn = document.getElementById("fortuneWinnerWatch");
const fortuneWinnerCancelBtn = document.getElementById("fortuneWinnerCancel");
let fortuneWinnerMovie = null;
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
        containsNormalizedPhrase(movieTitle, normalizedTitle) ||
        containsNormalizedPhrase(normalizedTitle, movieTitle)
      ) {
        score += 3;
      } else if (
        normalizedLabel &&
        containsNormalizedPhrase(normalizedLabel, movieTitle)
      ) {
        score += 2;
      }
    }

    if (normalizedOriginal && movieOriginal) {
      if (movieOriginal === normalizedOriginal) {
        score += 5;
      } else if (
        containsNormalizedPhrase(movieOriginal, normalizedOriginal) ||
        containsNormalizedPhrase(normalizedOriginal, movieOriginal)
      ) {
        score += 2;
      } else if (
        normalizedLabel &&
        containsNormalizedPhrase(normalizedLabel, movieOriginal)
      ) {
        score += 2;
      }
    } else if (
      !normalizedTitle &&
      normalizedLabel &&
      movieOriginal &&
      containsNormalizedPhrase(normalizedLabel, movieOriginal)
    ) {
      score += 2;
    }

    if (
      !normalizedTitle &&
      normalizedLabel &&
      movieTitle &&
      containsNormalizedPhrase(normalizedLabel, movieTitle)
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

function resolveFortuneWinnerValue(...values) {
  for (const value of values) {
    if (value === null || value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      const normalizedArray = value
        .map((item) => String(item || "").trim())
        .filter(Boolean);
      if (normalizedArray.length) {
        return normalizedArray.join(", ");
      }
      continue;
    }

    const normalizedValue = String(value).trim();
    if (normalizedValue) {
      return normalizedValue;
    }
  }

  return "";
}

function buildFortuneWinnerOrderData(orderBy) {
  if (!fortuneWinnerMovie) {
    return null;
  }

  const metadata = getFortuneWinnerMetadata(fortuneWinnerMovie.label);
  const metadataMovie = metadata.movie || {};
  const matchedMovie = fortuneWinnerMovie.match || {};
  const metadataGenres = Array.isArray(metadataMovie.genres)
    ? metadataMovie.genres.map((item) => item?.genre).filter(Boolean)
    : [];
  const metadataCountries = Array.isArray(metadataMovie.countries)
    ? metadataMovie.countries.map((item) => item?.country).filter(Boolean)
    : [];

  const title = resolveFortuneWinnerValue(
    fortuneWinnerMovie.title,
    matchedMovie.title,
    metadataMovie.title,
    fortuneWinnerMovie.label
  );
  if (!title) {
    return null;
  }

  return {
    title,
    originalTitle: resolveFortuneWinnerValue(
      fortuneWinnerMovie.originalTitle,
      matchedMovie.originalTitle,
      matchedMovie.original_title,
      metadataMovie.originalTitle,
      metadataMovie.original_title,
      metadataMovie.nameEn,
      metadataMovie.nameOriginal
    ),
    year: resolveFortuneWinnerValue(
      fortuneWinnerMovie.year,
      matchedMovie.year,
      metadataMovie.year
    ),
    kinopoiskId:
      fortuneWinnerMovie.kinopoiskId ||
      metadata.kinopoiskId ||
      getKinopoiskIdFromMovie(metadataMovie) ||
      getKinopoiskIdFromMovie(matchedMovie) ||
      null,
    imdbId: resolveFortuneWinnerValue(
      metadata.imdbId,
      fortuneWinnerMovie.imdbId,
      matchedMovie.imdbId,
      matchedMovie.imdb_id,
      metadataMovie.imdbId,
      metadataMovie.imdb_id
    ) || null,
    kpRating: resolveFortuneWinnerValue(
      matchedMovie.kpRating,
      matchedMovie.rating_OMDB,
      matchedMovie.rating,
      metadataMovie.rating,
      metadataMovie.ratingKinopoisk
    ) || "-",
    poster: resolveFortuneWinnerPoster(fortuneWinnerMovie),
    genres: resolveFortuneWinnerValue(
      matchedMovie.genre,
      matchedMovie.genres,
      metadataMovie.genre,
      metadataGenres
    ),
    description: resolveFortuneWinnerValue(
      matchedMovie.description,
      metadataMovie.description,
      metadataMovie.shortDescription
    ),
    country: resolveFortuneWinnerValue(
      matchedMovie.country,
      metadataMovie.country,
      metadataCountries
    ),
    actors: Array.isArray(matchedMovie.actors)
      ? matchedMovie.actors
      : Array.isArray(metadataMovie.actors)
        ? metadataMovie.actors
        : [],
    director: resolveFortuneWinnerValue(
      matchedMovie.director,
      metadataMovie.director
    ),
    orderBy: String(orderBy || "").trim(),
    orderType: ROULETTE_ORDER_TYPE,
    length: resolveFortuneWinnerValue(
      matchedMovie.length,
      metadataMovie.length,
      metadataMovie.filmLength
    ) || null,
  };
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

function showFortuneWinnerModal(label) {
  if (!fortuneWinnerModal || !label) {
    return;
  }

  fortuneWinnerMovie = buildFortuneWinnerMovie(label);
  rouletteLastWinner = "";
  rouletteAutofillActive = false;
  toggleRouletteAutofillVisibility(false);
  persistRouletteLastWinner(null);

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

  if (fortuneWinnerOrderByInput) {
    fortuneWinnerOrderByInput.value = "";
  }
  if (fortuneWinnerSaveStatusEl) {
    fortuneWinnerSaveStatusEl.textContent = "";
  }

  playVictoryTheme();
  fortuneWinnerModal.style.display = "block";
  if (fortuneWinnerOrderByInput) {
    setTimeout(() => fortuneWinnerOrderByInput.focus(), 0);
  }
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
  if (fortuneWinnerOrderByInput) {
    fortuneWinnerOrderByInput.value = "";
  }
  if (fortuneWinnerSaveStatusEl) {
    fortuneWinnerSaveStatusEl.textContent = "";
  }
  closeModal("fortuneWinnerModal");
}

if (fortuneWinnerWatchBtn) {
  fortuneWinnerWatchBtn.addEventListener("click", async () => {
    stopVictoryTheme();

    if (!fortuneWinnerMovie) {
      return;
    }

    const watchOrder =
      buildFortuneWinnerOrderData(
        fortuneWinnerOrderByInput?.value || ""
      ) || {
        title: fortuneWinnerMovie.title || fortuneWinnerMovie.label || "",
        kinopoiskId: null,
        poster: resolveFortuneWinnerPoster(fortuneWinnerMovie),
      };

    const resolvedKinopoiskId =
      getStoredFortuneKinopoiskId(fortuneWinnerMovie.label) ||
      getKinopoiskIdFromMovie(fortuneWinnerMovie) ||
      getKinopoiskIdFromMovie(fortuneWinnerMovie.match) ||
      fortuneWinnerMovie.kinopoiskId ||
      (await resolveFortuneMovieKinopoiskId(fortuneWinnerMovie));

    if (resolvedKinopoiskId) {
      watchOrder.kinopoiskId = resolvedKinopoiskId;
    }

    closeFortuneWinnerModal();

    if (typeof openOrderOnReyohoho === "function") {
      await openOrderOnReyohoho(watchOrder);
    }
  });
}

if (fortuneWinnerCancelBtn) {
  fortuneWinnerCancelBtn.addEventListener("click", () => {
    closeFortuneWinnerModal();
  });
}

if (fortuneWinnerSaveBtn) {
  fortuneWinnerSaveBtn.addEventListener("click", async () => {
    if (!fortuneWinnerMovie || !fortuneWinnerOrderByInput) {
      return;
    }

    const orderBy = fortuneWinnerOrderByInput.value.trim();
    if (!orderBy) {
      fortuneWinnerOrderByInput.reportValidity();
      fortuneWinnerOrderByInput.focus();
      return;
    }

    if (fortuneWinnerSaveStatusEl) {
      fortuneWinnerSaveStatusEl.textContent = "";
    }

    const originalButtonText = fortuneWinnerSaveBtn.textContent;
    fortuneWinnerSaveBtn.disabled = true;
    fortuneWinnerSaveBtn.textContent = "Сохраняем...";

    try {
      const resolvedKinopoiskId =
        (await resolveFortuneMovieKinopoiskId(fortuneWinnerMovie)) ||
        fortuneWinnerMovie.kinopoiskId ||
        null;

      const orderData = buildFortuneWinnerOrderData(orderBy);
      if (!orderData) {
        throw new Error("Fortune winner order data is incomplete");
      }

      if (resolvedKinopoiskId) {
        orderData.kinopoiskId = resolvedKinopoiskId;
      }

      if (typeof saveMovieOrder !== "function") {
        throw new Error("saveMovieOrder is not available");
      }

      const result = await saveMovieOrder(orderData);
      if (result?.ok) {
        fortuneWinnerSaveBtn.blur();
        if (fortuneWinnerSaveStatusEl) {
          fortuneWinnerSaveStatusEl.textContent =
            "Фильм сохранён в список заказанных.";
        }
      }
    } catch (err) {
      console.error("Failed to save roulette winner to watchlist", err);
      alert(
        "Не удалось сохранить победивший фильм в заказанные. Попробуйте ещё раз."
      );
    } finally {
      fortuneWinnerSaveBtn.disabled = false;
      fortuneWinnerSaveBtn.textContent = originalButtonText;
    }
  });
}

if (rouletteAutofillClearBtn) {
  rouletteAutofillClearBtn.addEventListener("click", () => {
    clearRouletteLastWinner();
  });
}

document.addEventListener("click", (e) => {
  if (e.target && (e.target.id === "checkAiModelsBtn" || e.target.closest("#checkAiModelsBtn"))) {
    checkAiModelsStatus();
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

async function fetchSteamGridPostersForTitle(title) {
  if (!title) {
    return {
      selectedPoster: null,
      posters: [],
    };
  }
  try {
    const res = await fetch(
      `/api/external?provider=steamgriddb&search=${encodeURIComponent(title)}`
    );
    if (!res.ok) {
      return {
        selectedPoster: null,
        posters: [],
      };
    }
    const data = await res.json();
    const posters = Array.isArray(data.posters) ? data.posters : [];
    const normalizedPosters = posters
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
    return {
      selectedPoster:
        normalizedPosters[0]?.thumb || normalizedPosters[0]?.url || null,
      posters: normalizedPosters,
    };
  } catch (err) {
    console.error("SteamGridDB fetch error", err);
    return {
      selectedPoster: null,
      posters: [],
    };
  }
}

async function fetchSteamGridPosters(title) {
  steamGridPoster = null;
  steamGridPosters = [];
  const result = await fetchSteamGridPostersForTitle(title);
  steamGridPoster = result.selectedPoster;
  steamGridPosters = result.posters;
}

function createPosterOverlay(targetImg, posters, placeBelow = false, options = {}) {
  if (!targetImg || !Array.isArray(posters) || posters.length < 2) return;
  const overlay = document.createElement("div");
  overlay.className = "poster-overlay" + (placeBelow ? " below" : "");
  if (options.absoluteBelow) {
    overlay.classList.add("poster-overlay--absolute-below");
  }

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
  let selectedPoster = options.selectedPoster || targetImg.src;
  const onSelect =
    typeof options.onSelect === "function" ? options.onSelect : null;
  const syncGlobalSelection = options.syncGlobalSelection !== false;

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
        if (syncGlobalSelection) {
          steamGridPoster = thumbUrl;
        }
        targetImg.src = thumbUrl;
        selectedPoster = thumbUrl;
        if (!onSelect && targetImg.id === "editPlayedGamePosterPreview") {
          editPlayedGamePosterData = thumbUrl;
        }
        if (!onSelect && targetImg.id === "editPlayedGamePosterPreview") {
          const selection = thumbUrl;
          readRemoteImageAsOptimizedDataURL(selection)
            .then((optimized) => {
              if (!optimized || selection !== selectedPoster) return;
              if (targetImg.id === "editPlayedGamePosterPreview") {
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
        if (onSelect) {
          onSelect({
            selectedPoster: thumbUrl,
            poster,
            targetImg,
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

  if (options.absoluteBelow) {
    const parent = targetImg.parentElement;
    parent.style.position = "relative";
    parent.appendChild(overlay);
  } else if (placeBelow) {
    const parent = targetImg.parentElement;
    parent.insertAdjacentElement("afterend", overlay);
  } else {
    targetImg.parentElement.style.position = "relative";
    targetImg.parentElement.appendChild(overlay);
  }

  render();
  return overlay;
}
