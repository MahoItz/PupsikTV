const KINOPOISK_SEARCH_URL =
  "https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword";
const ORDER_PLAYER_API_URL = "https://fbphdplay.top/api/players?kinopoisk=";
const ORDER_PLAYER_DEFAULT_TYPE = "Alloha";
const ORDER_PLAYER_EXTERNAL_BASE_URL = "https://flcksbr.xyz/film/";
const MAX_PLAYER_HISTORY = 15;

let kinopoiskApiKey = "";
let searchResults = [];
let selectedMovie = null;
let searchRequestId = 0;

function getAdminAuthHeaders() {
  const token = localStorage.getItem("adminToken") || "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function normalizeHistoryItem(movie) {
  const kpId = movie?.kp_id || movie?.filmId;
  if (!kpId) return null;

  return {
    kp_id: Number(kpId),
    title: getMovieTitle(movie),
    year: movie?.year || null,
    poster: movie?.posterUrlPreview || movie?.posterUrl || movie?.poster || "",
    watched_at: new Date().toISOString(),
  };
}

function upsertHistoryItem(list, item) {
  if (!item?.kp_id) return Array.isArray(list) ? list.slice(0, MAX_PLAYER_HISTORY) : [];
  const baseList = Array.isArray(list) ? list : [];
  const deduped = baseList.filter((entry) => Number(entry?.kp_id) !== Number(item.kp_id));
  return [item, ...deduped].slice(0, MAX_PLAYER_HISTORY);
}

async function loadHistory() {
  try {
    const response = await fetch("/api/admin-player-history", {
      headers: getAdminAuthHeaders(),
    });
    if (!response.ok) throw new Error(`Failed to fetch history: ${response.status}`);
    const payload = await response.json();
    const list = Array.isArray(payload?.items) ? payload.items : [];
    return list.map((item) => ({ ...item, watched_at: item.created_at || item.watched_at }));
  } catch (error) {
    console.error("Failed to load admin player history", error);
    return [];
  }
}

async function saveHistoryItem(movie) {
  const item = normalizeHistoryItem(movie);
  if (!item) return [];

  try {
    const response = await fetch("/api/admin-player-history", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAdminAuthHeaders(),
      },
      body: JSON.stringify(item),
    });

    if (!response.ok) throw new Error(`Failed to save history: ${response.status}`);
    const payload = await response.json();
    const list = Array.isArray(payload?.items) ? payload.items : [];
    return list.map((entry) => ({ ...entry, watched_at: entry.created_at || entry.watched_at }));
  } catch (error) {
    console.error("Failed to save admin player history", error);
    return [];
  }
}

async function deleteHistoryItem(kpId) {
  if (!kpId) return [];

  try {
    const response = await fetch(`/api/admin-player-history?kp_id=${encodeURIComponent(kpId)}`, {
      method: "DELETE",
      headers: getAdminAuthHeaders(),
    });

    if (!response.ok) throw new Error(`Failed to delete history: ${response.status}`);
    const payload = await response.json();
    const list = Array.isArray(payload?.items) ? payload.items : [];
    return list.map((entry) => ({ ...entry, watched_at: entry.created_at || entry.watched_at }));
  } catch (error) {
    console.error("Failed to delete admin player history", error);
    return [];
  }
}



function setHistoryLoading(isLoading) {
  const loader = document.getElementById("adminPlayerHistoryLoader");
  const historyList = document.getElementById("adminPlayerHistoryList");
  const emptyState = document.querySelector(".admin-player-history__empty");

  if (loader) loader.hidden = !isLoading;
  if (historyList) historyList.setAttribute("aria-busy", String(Boolean(isLoading)));
  if (emptyState && isLoading) emptyState.hidden = true;
}

function formatWatchedAt(isoDate) {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ru-RU");
}

function renderHistory(list) {
  const historyList = document.getElementById("adminPlayerHistoryList");
  const emptyState = document.querySelector(".admin-player-history__empty");
  if (!historyList) return;

  const safeList = Array.isArray(list) ? list : [];
  historyList.innerHTML = "";

  safeList.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "admin-player-history-item";
    button.dataset.kpId = String(item.kp_id);

    const posterWrap = document.createElement("span");
    posterWrap.className = "admin-player-history-item__poster";
    const poster = document.createElement("img");
    poster.src = item.poster || "images/placeholder-poster.webp";
    poster.alt = item.title ? `Постер: ${item.title}` : "Постер фильма";
    poster.loading = "lazy";
    posterWrap.appendChild(poster);

    const content = document.createElement("span");
    content.className = "admin-player-history-item__content";

    const title = document.createElement("span");
    title.className = "admin-player-history-item__title";
    title.textContent = item.title || "Без названия";

    const meta = document.createElement("span");
    meta.className = "admin-player-history-item__meta";
    const year = document.createElement("span");
    year.className = "admin-player-history-item__year";
    year.textContent = item.year ? String(item.year) : "—";

    const watchedAt = document.createElement("span");
    watchedAt.className = "admin-player-history-item__watched-at";
    watchedAt.textContent = formatWatchedAt(item.watched_at) || "—";

    meta.append(year, watchedAt);

    const remove = document.createElement("span");
    remove.className = "admin-player-history-item__remove";
    remove.setAttribute("role", "button");
    remove.setAttribute("tabindex", "0");
    remove.setAttribute("aria-label", "Удалить из истории");
    remove.textContent = "×";

    content.append(title, meta);
    button.append(posterWrap, content, remove);
    historyList.appendChild(button);
  });

  if (emptyState) {
    emptyState.hidden = safeList.length > 0;
  }
}


function buildMovieFromHistoryItem(item) {
  return {
    filmId: item.kp_id,
    nameRu: item.title,
    year: item.year,
    posterUrlPreview: item.poster,
  };
}

function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

function normalizeOrderPlayerProviders(payload) {
  if (!payload) return [];
  const data = payload.data ?? payload;
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.players)) return data.players;
  if (data && Array.isArray(data.items)) return data.items;
  return [];
}

function normalizeOrderPlayerTranslations(provider) {
  if (!provider) return [];
  const translations = provider.translations ?? [];
  if (Array.isArray(translations)) return translations;
  if (translations && Array.isArray(translations.items)) return translations.items;
  return [];
}

function pickDefaultOrderTranslation(translations) {
  if (!translations.length) return null;
  const preferred = translations.find((item) =>
    /рус|дуб|дублирован|russian/i.test(item?.name || "")
  );
  return preferred || translations[0];
}

function buildOrderExternalPlayerUrl(kpId) {
  return kpId ? `${ORDER_PLAYER_EXTERNAL_BASE_URL}${kpId}` : "#";
}

function setPlayerLoading(isLoading, message) {
  const loader = document.getElementById("adminPlayerLoader");
  if (!loader) return;
  if (typeof message === "string") {
    const textEl = loader.querySelector(".order-player-loader-text");
    if (textEl) textEl.textContent = message;
  }
  loader.classList.toggle("is-visible", Boolean(isLoading));
}

function applyPlayerUrl(url) {
  const frame = document.getElementById("adminPlayerFrame");
  if (frame) {
    frame.src = url || "about:blank";
  }
}

function populateSelect(select, items, getLabel) {
  if (!select) return;
  select.innerHTML = "";
  items.forEach((item, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = getLabel(item, index);
    select.appendChild(option);
  });
}

async function verifyAdminAccess() {
  const token = localStorage.getItem("adminToken") || "";
  if (!token) return false;

  const verifyRes = await fetch("/api/verify-admin", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!verifyRes.ok) return false;

  const envRes = await fetch("/api/env", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!envRes.ok) return false;
  const env = await envRes.json();
  kinopoiskApiKey =
    env.KINOPOISK_API_KEY || env.KINOPOISK_API_KEY2 || env.KINOPOISK_API_KEY3 || "";
  return Boolean(env.isAdmin && kinopoiskApiKey);
}

function getMovieTitle(movie) {
  return movie?.nameRu || movie?.nameEn || "Без названия";
}

function renderResults() {
  const list = document.getElementById("adminPlayerResults");
  const container = document.getElementById("adminPlayerResultsContainer");
  if (!list || !container) return;

  list.innerHTML = "";
  searchResults.forEach((movie, idx) => {
    const option = document.createElement("div");
    option.className = "autocomplete-option";
    option.dataset.index = String(idx);
    const year = movie?.year ? ` (${movie.year})` : "";
    option.textContent = `${getMovieTitle(movie)}${year}`;
    list.appendChild(option);
  });

  container.style.display = searchResults.length ? "block" : "none";
}



async function loadPlayerForMovie(movie) {
  const kpId = movie?.filmId;
  if (!kpId) return;

  const sourceSelect = document.getElementById("adminPlayerSourceSelect");
  const translationSelect = document.getElementById("adminPlayerTranslationSelect");
  const sourceControl = sourceSelect?.closest(".order-player-control") || null;
  const translationControl = translationSelect?.closest(".order-player-control") || null;
  const titleEl = document.getElementById("adminPlayerTitle");
  const externalLink = document.getElementById("adminPlayerOpenExternal");

  if (titleEl) titleEl.textContent = `Смотреть: ${getMovieTitle(movie)}`;
  if (externalLink) externalLink.href = buildOrderExternalPlayerUrl(kpId);

  setPlayerLoading(true, "Загрузка плеера…");
  applyPlayerUrl("");

  try {
    const response = await fetch(`${ORDER_PLAYER_API_URL}${kpId}`);
    if (!response.ok) {
      throw new Error(`Player request failed: ${response.status}`);
    }

    const payload = await response.json();
    const providers = normalizeOrderPlayerProviders(payload);
    if (!providers.length) throw new Error("No providers in response");

    populateSelect(sourceSelect, providers, (item, index) => item?.type || `Источник ${index + 1}`);
    if (sourceControl) sourceControl.style.display = providers.length > 1 ? "" : "none";

    const defaultProviderIndex = providers.findIndex(
      (item) => (item?.type || "").toLowerCase() === ORDER_PLAYER_DEFAULT_TYPE.toLowerCase()
    );
    const initialProviderIndex = defaultProviderIndex >= 0 ? defaultProviderIndex : 0;

    function setProvider(index) {
      const provider = providers[index] || providers[0];
      const translations = normalizeOrderPlayerTranslations(provider);

      populateSelect(translationSelect, translations, (item, tIndex) =>
        item?.name
          ? `${item.name}${item.quality ? ` (${item.quality})` : ""}`
          : `Перевод ${tIndex + 1}`
      );

      if (translationSelect) {
        translationSelect.disabled = translations.length <= 1;
      }
      if (translationControl) {
        translationControl.style.display = translations.length ? "" : "none";
      }

      const defaultTranslation = pickDefaultOrderTranslation(translations);
      if (translationSelect && translations.length) {
        const idx = Math.max(0, translations.indexOf(defaultTranslation || translations[0]));
        translationSelect.selectedIndex = idx;
      }

      const targetUrl = defaultTranslation?.iframeUrl || provider?.iframeUrl || "";
      if (targetUrl) setPlayerLoading(true, "Загрузка фильма…");
      applyPlayerUrl(targetUrl);
    }

    if (sourceSelect) {
      sourceSelect.selectedIndex = initialProviderIndex;
      sourceSelect.onchange = () => {
        const idx = Number(sourceSelect.value || sourceSelect.selectedIndex);
        setProvider(Number.isNaN(idx) ? 0 : idx);
      };
    }

    if (translationSelect) {
      translationSelect.onchange = () => {
        const providerIndex = sourceSelect
          ? Number(sourceSelect.value || sourceSelect.selectedIndex)
          : 0;
        const provider = providers[Number.isNaN(providerIndex) ? 0 : providerIndex];
        const translations = normalizeOrderPlayerTranslations(provider);
        const tIndex = Number(translationSelect.value || translationSelect.selectedIndex);
        const translation = translations[Number.isNaN(tIndex) ? 0 : tIndex];
        const targetUrl = translation?.iframeUrl || provider?.iframeUrl || "";
        if (targetUrl) setPlayerLoading(true, "Загрузка фильма…");
        applyPlayerUrl(targetUrl);
      };
    }

    const frame = document.getElementById("adminPlayerFrame");
    if (frame) {
      frame.onload = () => setPlayerLoading(false);
    }

    setProvider(initialProviderIndex);
  } catch (error) {
    console.error("Failed to load order player:", error);
    setPlayerLoading(false);
    const titleElement = document.getElementById("adminPlayerTitle");
    if (titleElement) {
      titleElement.textContent = "Не удалось загрузить плеер для выбранного фильма";
    }
  }
}

async function runSearch(query) {
  const trimmedQuery = String(query || "").trim();
  const requestId = ++searchRequestId;

  if (!trimmedQuery) {
    searchResults = [];
    renderResults();
    return;
  }

  try {
    const response = await fetch(
      `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(trimmedQuery)}&page=1`,
      {
        headers: {
          "X-API-KEY": kinopoiskApiKey,
          "Content-Type": "application/json",
        },
      }
    );

    if (requestId !== searchRequestId) return;
    if (!response.ok) {
      searchResults = [];
      renderResults();
      return;
    }

    const data = await response.json();
    if (requestId !== searchRequestId) return;

    searchResults = (data?.films || []).slice(0, 8);
    renderResults();
  } catch (error) {
    if (requestId !== searchRequestId) return;
    console.error("Kinopoisk search error", error);
    searchResults = [];
    renderResults();
  }
}

const debouncedSearch = debounce(runSearch, 180);

function setupSearchEvents() {
  const input = document.getElementById("adminPlayerSearchInput");
  const button = document.getElementById("adminPlayerSearchButton");
  const list = document.getElementById("adminPlayerResults");
  const resultsContainer = document.getElementById("adminPlayerResultsContainer");

  if (!input || !button || !list || !resultsContainer) return;

  input.addEventListener("input", () => debouncedSearch(input.value));
  button.addEventListener("click", () => runSearch(input.value));

  list.addEventListener("click", async (event) => {
    const option = event.target.closest(".autocomplete-option");
    if (!option) return;

    const idx = Number(option.dataset.index);
    selectedMovie = searchResults[Number.isNaN(idx) ? -1 : idx] || null;
    if (!selectedMovie) return;

    input.value = getMovieTitle(selectedMovie);
    resultsContainer.style.display = "none";
    await loadPlayerForMovie(selectedMovie);
    const updatedHistory = await saveHistoryItem(selectedMovie);
    renderHistory(updatedHistory);
  });

  const historyList = document.getElementById("adminPlayerHistoryList");
  historyList?.addEventListener("click", async (event) => {
    const removeBtn = event.target.closest(".admin-player-history-item__remove");
    if (removeBtn) {
      event.preventDefault();
      event.stopPropagation();
      const historyItem = removeBtn.closest(".admin-player-history-item");
      const kpId = Number(historyItem?.dataset.kpId);
      if (!kpId) return;
      const updatedHistory = await deleteHistoryItem(kpId);
      renderHistory(updatedHistory);
      return;
    }

    const historyItem = event.target.closest(".admin-player-history-item");
    if (!historyItem) return;

    const kpId = Number(historyItem.dataset.kpId);
    if (!kpId) return;

    const history = await loadHistory();
    const item = history.find((entry) => Number(entry?.kp_id) === kpId);
    if (!item) return;

    selectedMovie = buildMovieFromHistoryItem(item);
    input.value = getMovieTitle(selectedMovie);
    await loadPlayerForMovie(selectedMovie);
    const updatedHistory = await saveHistoryItem(selectedMovie);
    renderHistory(updatedHistory);
  });

  historyList?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const removeBtn = event.target.closest(".admin-player-history-item__remove");
    if (!removeBtn) return;
    event.preventDefault();
    const historyItem = removeBtn.closest(".admin-player-history-item");
    const kpId = Number(historyItem?.dataset.kpId);
    if (!kpId) return;
    const updatedHistory = await deleteHistoryItem(kpId);
    renderHistory(updatedHistory);
  });
}

async function initPage() {
  const app = document.getElementById("adminPlayerApp");
  const denied = document.getElementById("adminPlayerAccessDenied");

  try {
    const hasAccess = await verifyAdminAccess();
    if (!hasAccess) {
      if (denied) denied.hidden = false;
      return;
    }

    if (app) app.hidden = false;
    if (denied) denied.hidden = true;
    setHistoryLoading(true);
    try {
      const history = await loadHistory();
      renderHistory(history);
    } finally {
      setHistoryLoading(false);
    }
    setupSearchEvents();
  } catch (error) {
    console.error("Admin player init error", error);
    if (denied) denied.hidden = false;
  }
}

document.addEventListener("DOMContentLoaded", initPage);
