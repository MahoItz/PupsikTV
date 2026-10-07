const KINOPOISK_SEARCH_URL =
  "https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword";
const ORDER_PLAYER_API_URL = "https://fbphdplay.top/api/players?kinopoisk=";
const ORDER_PLAYER_DEFAULT_TYPE = "Alloha";
const ORDER_PLAYER_EXTERNAL_BASE_URL = "https://fbfree.site/film/";
const MAX_PLAYER_HISTORY = 15;
const ADMIN_PLAYER_HISTORY_CACHE_KEY = "adminPlayerHistoryCache";
const ADMIN_PLAYER_HISTORY_TTL_MS = 60 * 1000;

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

    if (url.hostname.toLowerCase() !== "kinopoiskapiunofficial.tech") {
      return null;
    }

    const params = new URLSearchParams({ provider: "kinopoisk" });
    if (url.pathname === "/api/v2.1/films/search-by-keyword") {
      params.set("resource", "search");
      params.set("keyword", url.searchParams.get("keyword") || "");
      params.set("page", url.searchParams.get("page") || "1");
    } else {
      return null;
    }

    return window.Pupsik.apiUrl(`/api/external?${params.toString()}`);
  }

  window.fetch = function proxiedFetch(input, init) {
    const rewrittenUrl = rewriteExternalUrl(input);
    if (rewrittenUrl) {
      return nativeFetch(rewrittenUrl, init);
    }
    return nativeFetch(input, init);
  };

  window.__pupsikExternalProxyInstalled = true;
})();

let kinopoiskApiKey = "";
let selectedMovie = null;
let currentHistory = [];
let historyLoading = false;
let historyLoaded = false;
let historyRequest = null;
let historyNeedsRender = true;

function readHistoryCache({ allowStale = false } = {}) {
  try {
    const raw = localStorage.getItem(ADMIN_PLAYER_HISTORY_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const timestamp = Number(parsed?.timestamp);
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    const etag = typeof parsed?.etag === "string" ? parsed.etag : "";

    if (!timestamp || Number.isNaN(timestamp)) return null;
    if (!items.length) return null;
    if (!allowStale && Date.now() - timestamp > ADMIN_PLAYER_HISTORY_TTL_MS) return null;

    return { items, etag };
  } catch (error) {
    console.warn("Failed to read admin player history cache", error);
    return null;
  }
}

function writeHistoryCache(list, etag = "") {
  const safeList = Array.isArray(list) ? list.slice(0, MAX_PLAYER_HISTORY) : [];
  const safeEtag = typeof etag === "string" ? etag : "";

  try {
    localStorage.setItem(
      ADMIN_PLAYER_HISTORY_CACHE_KEY,
      JSON.stringify({
        timestamp: Date.now(),
        items: safeList,
        etag: safeEtag,
      })
    );
  } catch (error) {
    console.warn("Failed to write admin player history cache", error);
  }

  return safeList;
}

function updateHistoryState(list, options = {}) {
  const { shouldRender = false, etag = "" } = options;
  const safeList = writeHistoryCache(list, etag);
  currentHistory = safeList;
  historyNeedsRender = true;
  if (shouldRender) renderHistory(safeList);
  return safeList;
}

function isSameHistoryList(nextList, prevList) {
  const next = Array.isArray(nextList) ? nextList : [];
  const prev = Array.isArray(prevList) ? prevList : [];

  if (next.length !== prev.length) return false;

  return next.every((item, index) => {
    const candidate = prev[index] || {};
    return (
      Number(item?.kp_id) === Number(candidate?.kp_id) &&
      String(item?.title || "") === String(candidate?.title || "") &&
      String(item?.year || "") === String(candidate?.year || "") &&
      String(item?.poster || "") === String(candidate?.poster || "") &&
      String(item?.watched_at || "") === String(candidate?.watched_at || "")
    );
  });
}

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
    const cache = readHistoryCache();
    const cachedEtag = cache?.etag || "";

    const response = await fetch(window.Pupsik.apiUrl("/api/admin?action=player-history"), {
      headers: {
        ...getAdminAuthHeaders(),
        ...(cachedEtag ? { "If-None-Match": cachedEtag } : {}),
      },
    });

    if (response.status === 304) {
      return currentHistory;
    }

    if (!response.ok) throw new Error(`Failed to fetch history: ${response.status}`);
    const payload = await response.json();
    const etag = response.headers.get("ETag") || "";
    const list = Array.isArray(payload?.items) ? payload.items : [];
    const normalized = list.map((item) => ({ ...item, watched_at: item.created_at || item.watched_at }));
    return updateHistoryState(normalized, { shouldRender: true, etag });
  } catch (error) {
    console.error("Failed to load admin player history", error);
    throw error;
  }
}

function ensureHistoryLoaded() {
  if (historyLoaded) {
    renderHistory(currentHistory);
    return Promise.resolve(currentHistory);
  }
  if (historyRequest) return historyRequest;
  const errorMessage = document.getElementById("adminPlayerHistoryError");
  if (errorMessage) errorMessage.hidden = true;
  setHistoryLoading(true);
  historyRequest = loadHistory()
    .then(history => {
      historyLoaded = true;
      renderHistory(history);
      return history;
    })
    .catch(error => {
      console.error("Failed to expand player history", error);
      if (errorMessage) errorMessage.hidden = false;
    })
    .finally(() => {
      historyRequest = null;
      setHistoryLoading(false);
    });
  return historyRequest;
}

async function saveHistoryItem(movie) {
  const item = normalizeHistoryItem(movie);
  if (!item) return currentHistory;

  updateHistoryState(upsertHistoryItem(currentHistory, item), { shouldRender: true });

  try {
    const response = await fetch(window.Pupsik.apiUrl("/api/admin?action=player-history"), {
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
    const normalized = list.map((entry) => ({ ...entry, watched_at: entry.created_at || entry.watched_at }));
    const etag = response.headers.get("ETag") || "";
    return updateHistoryState(normalized, { shouldRender: true, etag });
  } catch (error) {
    console.error("Failed to save admin player history", error);
    return currentHistory;
  }
}

async function deleteHistoryItem(kpId) {
  if (!kpId) return currentHistory;

  updateHistoryState(
    currentHistory.filter((entry) => Number(entry?.kp_id) !== Number(kpId)),
    { shouldRender: true }
  );

  try {
    const response = await fetch(window.Pupsik.apiUrl(`/api/admin?action=player-history&kp_id=${encodeURIComponent(kpId)}`), {
      method: "DELETE",
      headers: getAdminAuthHeaders(),
    });

    if (!response.ok) throw new Error(`Failed to delete history: ${response.status}`);
    const payload = await response.json();
    const list = Array.isArray(payload?.items) ? payload.items : [];
    const normalized = list.map((entry) => ({ ...entry, watched_at: entry.created_at || entry.watched_at }));
    const etag = response.headers.get("ETag") || "";
    return updateHistoryState(normalized, { shouldRender: true, etag });
  } catch (error) {
    console.error("Failed to delete admin player history", error);
    return currentHistory;
  }
}



function setHistoryLoading(isLoading) {
  const loader = document.getElementById("adminPlayerHistoryLoader");
  const historyList = document.getElementById("adminPlayerHistoryList");
  const emptyState = document.querySelector(".admin-player-history__empty");
  const active = Boolean(isLoading);
  historyLoading = active;
  updateWelcomeStatus();

  if (loader) {
    loader.hidden = !active;
    loader.setAttribute("aria-hidden", String(!active));
    loader.classList.toggle("is-visible", active);
  }
  if (historyList) historyList.setAttribute("aria-busy", String(active));
  if (emptyState && active) emptyState.hidden = true;
}

function setHistoryLoaderMessage(message) {
  const loaderText = document.querySelector("#adminPlayerHistoryLoader .section-loader__text");
  if (loaderText && typeof message === "string") {
    loaderText.textContent = message;
  }
}

function formatWatchedAt(isoDate) {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ru-RU");
}

function renderHistory(list) {
  renderRecentMovies(list);
  if (!document.getElementById("adminPlayerHistory")?.open) return;
  if (!historyNeedsRender) return;
  const historyList = document.getElementById("adminPlayerHistoryList");
  const emptyState = document.querySelector(".admin-player-history__empty");
  if (!historyList) return;
  historyNeedsRender = false;

  const safeList = Array.isArray(list) ? list : [];
  historyList.innerHTML = "";

  safeList.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "admin-player-history-item";
    button.dataset.kpId = String(item.kp_id);
    button.dataset.title = item.title || "";
    button.dataset.year = item.year ? String(item.year) : "";
    button.dataset.poster = item.poster || "";

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

function updateWelcomeStatus() {
  const status = document.getElementById("adminPlayerWelcomeStatus");
  const movies = document.getElementById("adminPlayerRecentMovies");
  const hint = document.getElementById("adminPlayerWelcomeHint");
  if (!status || !movies || !hint) return;
  const hasMovies = movies.children.length > 0;
  status.hidden = hasMovies;
  status.textContent = historyLoading
    ? "Загружаем последние фильмы…"
    : "Здесь появятся ваши последние фильмы. Начните с поиска по названию.";
  hint.textContent = hasMovies
    ? "Ещё один просмотр? Выберите один из последних фильмов."
    : "Найдите фильм для своего следующего киновечера.";
}

function renderRecentMovies(list) {
  const container = document.getElementById("adminPlayerRecentMovies");
  if (!container || selectedMovie) return;
  container.replaceChildren();
  const seen = new Set();
  const recent = (Array.isArray(list) ? list : []).filter(item => {
    const id = Number(item?.kp_id);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, 4);
  recent.forEach(item => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "admin-player-recent";
    button.setAttribute("aria-label", `Смотреть: ${item.title || "Без названия"}${item.year ? ` (${item.year})` : ""}`);
    const artwork = document.createElement("span");
    artwork.className = "admin-player-recent__artwork";
    const poster = document.createElement("img");
    poster.src = item.poster || "images/placeholder-poster.webp";
    poster.alt = "";
    poster.loading = "lazy";
    poster.addEventListener("error", () => {
      poster.src = "images/placeholder-poster.webp";
    }, { once: true });
    const play = document.createElement("span");
    play.className = "admin-player-recent__play";
    play.setAttribute("aria-hidden", "true");
    const icon = document.createElement("i");
    icon.className = "fa-solid fa-play";
    play.append(icon);
    artwork.append(poster, play);
    const title = document.createElement("span");
    title.className = "admin-player-recent__title";
    title.textContent = item.title || "Без названия";
    const year = document.createElement("span");
    year.className = "admin-player-recent__year";
    year.textContent = item.year ? String(item.year) : "";
    button.append(artwork, title, year);
    button.addEventListener("click", () => {
      openPlayerMovie(buildMovieFromHistoryItem(item)).catch(error => console.error("Failed to open recent movie", error));
    });
    container.append(button);
  });
  updateWelcomeStatus();
}

async function openPlayerMovie(movie) {
  if (!movie?.filmId) return;
  selectedMovie = movie;
  const input = document.getElementById("adminPlayerSearchInput");
  if (input) input.value = getMovieTitle(movie);
  await loadPlayerForMovie(movie);
  await saveHistoryItem(movie);
}


function buildMovieFromHistoryItem(item) {
  return {
    filmId: item.kp_id,
    nameRu: item.title,
    year: item.year,
    posterUrlPreview: item.poster,
  };
}

function buildMovieFromHistoryDataset(dataset) {
  const filmId = Number(dataset?.kpId);
  if (!filmId) return null;

  return {
    filmId,
    nameRu: dataset?.title || "",
    year: dataset?.year || null,
    posterUrlPreview: dataset?.poster || "",
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
  await window.PupsikAdminSession.refresh();
  const token = localStorage.getItem("adminToken") || "";
  if (!token) return false;

  const verifyRes = await fetch(window.Pupsik.apiUrl("/api/admin?action=verify-admin"), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!verifyRes.ok) return false;

  const envRes = await fetch(window.Pupsik.apiUrl("/api/admin?action=env"), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!envRes.ok) return false;
  const env = await envRes.json();
  kinopoiskApiKey =
    Array.isArray(env.KINOPOISK_API_OPTIONS) && env.KINOPOISK_API_OPTIONS.length
      ? "server-proxy"
      : "";
  return Boolean(env.isAdmin && kinopoiskApiKey);
}

function getMovieTitle(movie) {
  return movie?.nameRu || movie?.nameEn || "Без названия";
}

async function loadPlayerForMovie(movie) {
  const kpId = movie?.filmId;
  if (!kpId) return;
  document.querySelector(".admin-player-embed")?.classList.remove("is-idle");
  const welcome = document.getElementById("adminPlayerWelcome");
  if (welcome) welcome.hidden = true;
  const playerFrame = document.getElementById("adminPlayerFrame");
  if (playerFrame) playerFrame.hidden = false;

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

function setupSearchEvents() {
  const input = document.getElementById("adminPlayerSearchInput");
  const button = document.getElementById("adminPlayerSearchButton");
  const list = document.getElementById("adminPlayerResults");
  const resultsContainer = document.getElementById("adminPlayerResultsContainer");

  if (!input || !button || !list || !resultsContainer) return;

  window.PupsikMediaSearch.create({
    input, button, container: resultsContainer, list,
    search: async (query) => {
      const response = await fetch(`${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(query)}&page=1`, {
        headers: { "X-API-KEY": kinopoiskApiKey, "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error(`Search request failed: ${response.status}`);
      const data = await response.json();
      return (data.films || []).slice(0, 8);
    },
    onSelect: openPlayerMovie,
  });
  document.getElementById("adminPlayerWelcomeSearch")?.addEventListener("click", () => {
    input.focus();
    input.scrollIntoView({ behavior: "smooth", block: "center" });
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
      await deleteHistoryItem(kpId);
      return;
    }

    const historyItem = event.target.closest(".admin-player-history-item");
    if (!historyItem) return;

    const kpId = Number(historyItem.dataset.kpId);
    if (!kpId) return;

    const item = currentHistory.find((entry) => Number(entry?.kp_id) === kpId);
    selectedMovie = buildMovieFromHistoryDataset(historyItem.dataset);
    if (!selectedMovie && item) {
      selectedMovie = buildMovieFromHistoryItem(item);
    }
    if (!selectedMovie) {
      const refreshedHistory = await loadHistory();
      const refreshedItem = refreshedHistory.find((entry) => Number(entry?.kp_id) === kpId);
      if (!refreshedItem) return;
      selectedMovie = buildMovieFromHistoryItem(refreshedItem);
    }

    await openPlayerMovie(selectedMovie);
  });

  historyList?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const removeBtn = event.target.closest(".admin-player-history-item__remove");
    if (!removeBtn) return;
    event.preventDefault();
    const historyItem = removeBtn.closest(".admin-player-history-item");
    const kpId = Number(historyItem?.dataset.kpId);
    if (!kpId) return;
    await deleteHistoryItem(kpId);
  });
}

async function initPage() {
  const app = document.getElementById("adminPlayerApp");

  try {
    const hasAccess = await verifyAdminAccess();
    if (!hasAccess) {
      return;
    }

    if (app) app.hidden = false;

    const cachedHistory = readHistoryCache({ allowStale: true });
    if (cachedHistory?.items?.length) {
      currentHistory = cachedHistory.items;
    }
    renderRecentMovies(currentHistory);

    setupSearchEvents();
    document.getElementById("adminPlayerHistory")?.addEventListener("toggle", event => {
      if (event.target.open) ensureHistoryLoaded();
    });
  } catch (error) {
    console.error("Admin player init error", error);
  }
}

document.addEventListener("DOMContentLoaded", initPage);
