const TRAILER_API_URL = "/api/trailer-watchlist";
const TRAILER_RATINGS_API_URL = "/api/trailer-ratings";
const KP_API_SELECTION_URL = "/api/kp-api-selection";
const VERIFY_ADMIN_URL = "/api/verify-admin";
const ENV_URL = "/api/env";
const KINOPOISK_SEARCH_URL =
  "https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword";
const KINOPOISK_FILM_URL =
  "https://kinopoiskapiunofficial.tech/api/v2.2/films";
const KINOPOISK_STAFF_URL =
  "https://kinopoiskapiunofficial.tech/api/v1/staff";
const YOUTUBE_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;
const POSTER_PLACEHOLDER = "/images/placeholder-poster.webp";

let kinopoiskApiKey = "";
let selectedKinopoiskApi = "API 1";
let kinopoiskApiKeys = {
  "API 1": "",
  "API 2": "",
  "API 3": "",
};
let trailers = [];
let selectedTrailerId = null;
let kinopoiskRequestId = 0;
let trailerTitleSearchResults = [];
let selectedTrailerSearchMovie = null;
let trailerTitleRequestId = 0;
let isCreatingTrailer = false;
let trailerRatingTooltip = null;
let userRatingTrailerId = null;
let isSubmittingTrailerUserRating = false;
let isSwitchingKinopoiskApi = false;
let kinopoiskQuotaDialogOpen = false;
let hasAdminAccess = false;
let watchedTrailersSearchQuery = "";
const TRAILER_RATING_MEANINGS = {
  0: "Абсолютный провал",
  1: "Кошмар",
  2: "Очень плохо",
  3: "Плохо",
  4: "Ниже среднего",
  5: "Среднее",
  6: "Неплохо",
  7: "Хорошо",
  8: "Очень хорошо",
  9: "Отлично",
  10: "Великолепно",
  11: "Легенда",
};

function normalizeKpApiValue(value) {
  if (value === "API 2" || value === "API 3") {
    return value;
  }
  return "API 1";
}

function getSelectedKinopoiskApiKey(env) {
  const selectedApi = normalizeKpApiValue(env?.KINOPOISK_API_SELECTED);
  if (selectedApi === "API 2") {
    return env?.KINOPOISK_API_KEY2 || env?.KINOPOISK_API_KEY || "";
  }
  if (selectedApi === "API 3") {
    return env?.KINOPOISK_API_KEY3 || env?.KINOPOISK_API_KEY || "";
  }
  return env?.KINOPOISK_API_KEY || env?.KINOPOISK_API_KEY2 || env?.KINOPOISK_API_KEY3 || "";
}

function showToastNotification(message, type = "success") {
  const normalizedType = ["success", "warning", "error"].includes(type) ? type : "success";
  let container = document.getElementById("toastContainer");

  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast-notification toast-${normalizedType}`;
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("visible");
  });

  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => {
      toast.remove();
      if (!container.hasChildNodes()) {
        container.remove();
      }
    }, 280);
  }, 2600);
}

function applySelectedKinopoiskApi(value) {
  selectedKinopoiskApi = normalizeKpApiValue(value);
  kinopoiskApiKey = kinopoiskApiKeys[selectedKinopoiskApi] || "";
}

function getAvailableKinopoiskApis() {
  return ["API 1", "API 2", "API 3"].filter((api) => Boolean(kinopoiskApiKeys[api]));
}

function getNextAvailableKinopoiskApi(currentApi) {
  const orderedApis = getAvailableKinopoiskApis();
  if (!orderedApis.length) return null;

  const startIndex = orderedApis.indexOf(normalizeKpApiValue(currentApi));
  if (startIndex < 0) {
    return orderedApis[0];
  }

  if (orderedApis.length === 1) {
    return orderedApis[0];
  }

  return orderedApis[(startIndex + 1) % orderedApis.length];
}

async function persistSelectedKinopoiskApi(nextApi) {
  const response = await fetch(KP_API_SELECTION_URL, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...getAdminAuthHeaders(),
    },
    body: JSON.stringify({ kp_api: normalizeKpApiValue(nextApi) }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || `Failed to update kp_api: ${response.status}`);
  }

  return payload?.kp_api || normalizeKpApiValue(nextApi);
}

async function switchToNextKinopoiskApi() {
  if (isSwitchingKinopoiskApi) return false;

  const nextApi = getNextAvailableKinopoiskApi(selectedKinopoiskApi);
  if (!nextApi || nextApi === selectedKinopoiskApi) {
    showToastNotification("Нет другого доступного API Кинопоиска для переключения.", "warning");
    return false;
  }

  isSwitchingKinopoiskApi = true;
  try {
    const persistedApi = await persistSelectedKinopoiskApi(nextApi);
    applySelectedKinopoiskApi(persistedApi);
    showToastNotification(`Кинопоиск переключен на ${persistedApi}.`, "success");
    return true;
  } catch (error) {
    console.error("Failed to switch Kinopoisk API", error);
    showToastNotification("Не удалось переключить API Кинопоиска.", "error");
    return false;
  } finally {
    isSwitchingKinopoiskApi = false;
  }
}

async function handleKinopoiskErrorResponse(response) {
  if (!response || response.ok) {
    return { handled: false, switched: false };
  }

  if (response.status === 402) {
    showToastNotification("Превышен дневной лимит запросов к Кинопоиску 500 в день.", "error");

    if (kinopoiskQuotaDialogOpen) {
      return { handled: true, switched: false };
    }

    const nextApi = getNextAvailableKinopoiskApi(selectedKinopoiskApi);
    if (!nextApi || nextApi === selectedKinopoiskApi) {
      return { handled: true, switched: false };
    }

    kinopoiskQuotaDialogOpen = true;
    let switched = false;
    try {
      const shouldSwitch = window.confirm(
        `Превышен дневной лимит ${selectedKinopoiskApi}. Переключить Кинопоиск на ${nextApi}?`
      );
      if (shouldSwitch) {
        switched = await switchToNextKinopoiskApi();
      }
    } finally {
      kinopoiskQuotaDialogOpen = false;
    }

    return { handled: true, switched };
  }

  return { handled: false, switched: false };
}

async function fetchKinopoiskJson(url, requestLabel) {
  const response = await fetch(url, {
    headers: {
      "X-API-KEY": kinopoiskApiKey,
      "Content-Type": "application/json",
    },
  });

  if (response.ok) {
    return response.json();
  }

  const handled = await handleKinopoiskErrorResponse(response);
  if (handled.switched) {
    return fetchKinopoiskJson(url, requestLabel);
  }

  throw new Error(`${requestLabel} failed: ${response.status}`);
}

function getGuestId() {
  let guestId = localStorage.getItem("guest_id");
  if (!guestId) {
    guestId = `guest_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    localStorage.setItem("guest_id", guestId);
  }
  return guestId;
}

function getRatedTrailersMap() {
  try {
    const raw = localStorage.getItem("ratedTrailers");
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function hasRatedTrailer(trailerId) {
  const ratedTrailers = getRatedTrailersMap();
  return Object.prototype.hasOwnProperty.call(ratedTrailers, String(trailerId));
}

function rememberRatedTrailer(trailerId, rating) {
  const ratedTrailers = getRatedTrailersMap();
  ratedTrailers[String(trailerId)] = rating;
  localStorage.setItem("ratedTrailers", JSON.stringify(ratedTrailers));
}

function formatViewerRating(item) {
  const ratingSum = Number(item?.viewer_rating_sum ?? 0) || 0;
  const ratingCount = Number(item?.viewer_rating_count ?? 0) || 0;
  if (!ratingCount) return "-";
  return String(Math.round((ratingSum / ratingCount) * 10) / 10).replace(".", ",");
}

function parseTrailerKinopoiskData(value) {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

function getAdminAuthHeaders() {
  const token = localStorage.getItem("adminToken") || "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function updateTrailerAdminUi() {
  const form = document.getElementById("trailerAddForm");
  const watchedButton = document.getElementById("trailerMarkWatchedButton");
  const deleteButton = document.getElementById("trailerDeleteButton");

  if (form) {
    form.hidden = !hasAdminAccess;
  }

  if (deleteButton) {
    deleteButton.hidden = !hasAdminAccess;
  }

  if (!hasAdminAccess) {
    if (watchedButton) watchedButton.disabled = false;
  }
}

async function verifyAdminAccess() {
  const token = localStorage.getItem("adminToken") || "";
  if (!token) return false;

  const verifyResponse = await fetch(VERIFY_ADMIN_URL, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!verifyResponse.ok) return false;

  const envResponse = await fetch(ENV_URL, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!envResponse.ok) return false;

  const env = await envResponse.json();
  kinopoiskApiKeys = {
    "API 1": env.KINOPOISK_API_KEY || "",
    "API 2": env.KINOPOISK_API_KEY2 || "",
    "API 3": env.KINOPOISK_API_KEY3 || "",
  };
  applySelectedKinopoiskApi(env.KINOPOISK_API_SELECTED);
  return Boolean(env.isAdmin);
}

function parseYouTubeVideoId(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";

  if (YOUTUBE_ID_PATTERN.test(raw)) {
    return raw;
  }

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      const shortId = url.pathname.split("/").filter(Boolean)[0] || "";
      return YOUTUBE_ID_PATTERN.test(shortId) ? shortId : "";
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      const videoIdFromQuery = url.searchParams.get("v") || "";
      if (YOUTUBE_ID_PATTERN.test(videoIdFromQuery)) {
        return videoIdFromQuery;
      }

      const segments = url.pathname.split("/").filter(Boolean);
      const embedIndex = segments.findIndex(
        (segment) => segment === "embed" || segment === "shorts" || segment === "live"
      );
      if (embedIndex >= 0) {
        const candidate = segments[embedIndex + 1] || "";
        return YOUTUBE_ID_PATTERN.test(candidate) ? candidate : "";
      }
    }
  } catch {
    return "";
  }

  return "";
}

function buildYoutubeEmbedUrl(videoId) {
  return videoId
    ? `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?rel=0&hl=ru&cc_lang_pref=ru&cc_load_policy=0&iv_load_policy=3&autoplay=0`
    : "about:blank";
}

function buildYoutubeWatchUrl(videoId) {
  return videoId
    ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
    : "#";
}

function buildKinopoiskSearchUrl(query) {
  return `https://www.kinopoisk.ru/index.php?kp_query=${encodeURIComponent(
    String(query || "").trim()
  )}`;
}

function buildKinopoiskFilmUrl(kinopoiskId, fallbackTitle) {
  const normalizedId = Number.parseInt(kinopoiskId, 10);
  if (Number.isFinite(normalizedId) && normalizedId > 0) {
    return `https://www.kinopoisk.ru/film/${normalizedId}/`;
  }
  return buildKinopoiskSearchUrl(fallbackTitle || "");
}

function buildKinopoiskPosterUrl(kinopoiskId) {
  const normalizedId = Number.parseInt(kinopoiskId, 10);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
    return "";
  }
  return `https://kinopoiskapiunofficial.tech/images/posters/kp_small/${normalizedId}.jpg`;
}

function resolveTrailerPosterSrc(poster, kinopoiskId) {
  return (
    buildKinopoiskPosterUrl(kinopoiskId) ||
    String(poster || "").trim() ||
    POSTER_PLACEHOLDER
  );
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
}

function formatDate(value) {
  if (!value) return "Дата пока не объявлена";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function capitalizeWords(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (!word) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function hasUppercaseLetters(value) {
  return /[A-ZА-ЯЁ]/.test(String(value || ""));
}

function getMovieLabel(movie) {
  const title = movie?.nameRu || movie?.nameEn || "Без названия";
  const year = movie?.year ? ` (${movie.year})` : "";
  return `${title}${year}`;
}

function getSelectedTrailer() {
  return (
    trailers.find((item) => Number(item.id) === Number(selectedTrailerId)) || null
  );
}

function setStatusText(elementId, message, isError = false) {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = message || "";
  element.style.color = isError ? "#ffbcbc" : "";
}

function setTrailerFormBusy(isBusy) {
  const titleInput = document.getElementById("trailerTitleInput");
  const urlInput = document.getElementById("trailerUrlInput");
  const addButton = document.getElementById("trailerAddButton");

  if (titleInput) titleInput.disabled = Boolean(isBusy);
  if (urlInput) urlInput.disabled = Boolean(isBusy);
  if (addButton) {
    addButton.disabled = Boolean(isBusy);
    addButton.setAttribute("aria-busy", String(Boolean(isBusy)));
  }
}

function ensureTrailerRatingTooltip() {
  if (trailerRatingTooltip) return trailerRatingTooltip;
  const tooltip = document.createElement("div");
  tooltip.className = "rating-tooltip";
  tooltip.style.display = "none";
  document.body.appendChild(tooltip);
  trailerRatingTooltip = tooltip;
  return tooltip;
}

function updateTrailerRatingTooltipPosition(event) {
  if (!trailerRatingTooltip || trailerRatingTooltip.style.display !== "block") return;
  trailerRatingTooltip.style.left = `${event.pageX + 10}px`;
  trailerRatingTooltip.style.top = `${event.pageY + 10}px`;
}

function showTrailerRatingValueTooltip(event, value) {
  const tooltip = ensureTrailerRatingTooltip();
  tooltip.textContent = String(value);
  tooltip.style.display = "block";
  updateTrailerRatingTooltipPosition(event);
}

function hideTrailerRatingValueTooltip() {
  if (!trailerRatingTooltip) return;
  trailerRatingTooltip.style.display = "none";
}

function parseRatingInputValue(rawValue) {
  if (typeof rawValue !== "string") return NaN;
  return parseFloat(rawValue.trim().replace(/,/g, "."));
}

function hasTooManyFractionDigits(rawValue) {
  if (typeof rawValue !== "string") return false;
  const normalized = rawValue.trim().replace(/,/g, ".");
  if (!normalized || !normalized.includes(".")) return false;
  const fraction = normalized.split(".")[1] || "";
  return fraction.length > 2;
}

function getCurrentRating(containerId) {
  const container = document.getElementById(containerId);
  const raw = container?.dataset.currentRating;
  if (raw === undefined || raw === null || raw === "") return null;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampTrailerRatingValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(11, Math.max(0, numeric));
}

function formatTrailerRatingValue(value) {
  const normalized = clampTrailerRatingValue(value);
  if (Number.isInteger(normalized)) {
    return String(normalized);
  }
  return String(Math.round(normalized * 100) / 100).replace(".", ",");
}

function getTrailerRatingMeaning(value) {
  const nearest = Math.round(clampTrailerRatingValue(value));
  return TRAILER_RATING_MEANINGS[nearest] || TRAILER_RATING_MEANINGS[0];
}

function updateTrailerRatingMeaning(value) {
  const meaning = document.querySelector(".trailer-rating-panel__meaning");
  const meaningText = document.getElementById("trailerRatingMeaningText");
  if (value === null || value === undefined || value === "") {
    if (meaning) {
      meaning.className = "trailer-rating-panel__meaning";
    }
    if (meaningText) {
      meaningText.textContent = "";
    }
    return;
  }
  const nearest = Math.round(clampTrailerRatingValue(value));
  if (meaning) {
    meaning.className = `trailer-rating-panel__meaning is-level-${nearest}`;
  }
  if (meaningText) {
    meaningText.textContent = getTrailerRatingMeaning(value);
  }
}

function syncTrailerRatingPreview(value, options = {}) {
  const { updateInput = true } = options;
  const input = document.getElementById("trailerRatingInput");
  if (updateInput && input) {
    input.value =
      value === null || value === undefined || value === ""
        ? ""
        : formatTrailerRatingValue(value);
  }
  updateTrailerRatingMeaning(value);
}

function highlightStars(containerId, rating) {
  const stars = document.querySelectorAll(`#${containerId} .rating-star`);

  stars.forEach((star) => {
    star.classList.remove("hovered");
    star.style.backgroundColor = "rgba(255, 235, 59, 0.3)";
    if (star.classList.contains("rating-label")) {
      star.style.backgroundColor = "transparent";
    }
  });

  if (rating === null || rating === undefined || Number.isNaN(Number(rating))) {
    return;
  }

  if (rating >= 1 && rating <= 10) {
    for (let i = 1; i <= rating; i += 1) {
      stars[i]?.classList.add("hovered");
      if (stars[i]) stars[i].style.backgroundColor = "#ffc107";
    }
  } else if (rating === 11) {
    for (let i = 1; i <= 10; i += 1) {
      stars[i]?.classList.add("hovered");
      if (stars[i]) stars[i].style.backgroundColor = "#ffc107";
    }
  }
}

function setRatingStars(containerId, rating, updateInput = true) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const stars = container.querySelectorAll(".rating-star");
  const hasValue = !(rating === null || rating === undefined || rating === "");
  container.dataset.currentRating = hasValue ? String(rating) : "";

  const inputId = container.dataset.input;
  if (updateInput && inputId) {
    const input = document.getElementById(inputId);
    if (input) input.value = hasValue ? String(rating).replace(".", ",") : "";
  }

  if (containerId === "trailerRatingStars") {
    syncTrailerRatingPreview(hasValue ? rating : null, { updateInput });
  }

  stars.forEach((star) => star.classList.remove("active"));

  if (!hasValue) {
    return;
  }

  if (rating === 0) {
    stars[0]?.classList.add("active");
  } else if (rating >= 1 && rating <= 10) {
    for (let i = 1; i <= rating; i += 1) {
      stars[i]?.classList.add("active");
    }
  } else if (rating === 11) {
    for (let i = 1; i <= 10; i += 1) {
      stars[i]?.classList.add("active");
    }
    stars[11]?.classList.add("active");
  }
}

function setupRatingStars(containerId) {
  const container = document.getElementById(containerId);
  if (!container || container.dataset.ready === "true") return;

  const stars = container.querySelectorAll(".rating-star");
  const inputId = container.dataset.input;
  const ratingInput = inputId ? document.getElementById(inputId) : null;

  stars.forEach((star) => {
    star.addEventListener("click", function () {
      const rating = parseInt(this.dataset.rating, 10);
      setRatingStars(containerId, rating);
    });

    star.addEventListener("mouseover", function () {
      const rating = parseInt(this.dataset.rating, 10);
      highlightStars(containerId, rating);
      if (containerId === "trailerRatingStars") {
        syncTrailerRatingPreview(rating);
      }
    });

    if (!star.classList.contains("rating-label") && containerId !== "trailerRatingStars") {
      star.addEventListener("mouseenter", function (event) {
        showTrailerRatingValueTooltip(event, this.dataset.rating);
      });
      star.addEventListener("mousemove", updateTrailerRatingTooltipPosition);
      star.addEventListener("mouseleave", hideTrailerRatingValueTooltip);
    }
  });

  container.addEventListener("mouseleave", () => {
    highlightStars(containerId, getCurrentRating(containerId));
    if (containerId === "trailerRatingStars") {
      syncTrailerRatingPreview(getCurrentRating(containerId));
    }
    hideTrailerRatingValueTooltip();
  });

  if (ratingInput) {
    ratingInput.addEventListener("input", function () {
      const value = parseRatingInputValue(this.value);
      if (!this.value.trim()) {
        this.setCustomValidity("");
        setRatingStars(containerId, null, false);
        highlightStars(containerId, null);
        if (containerId === "trailerRatingStars") {
          syncTrailerRatingPreview(null, { updateInput: false });
        }
        return;
      }
      if (hasTooManyFractionDigits(this.value)) {
        this.setCustomValidity("Можно ввести не более 2 знаков после запятой");
        this.reportValidity();
        return;
      }

      if (!Number.isNaN(value) && value >= 0 && value <= 11) {
        this.setCustomValidity("");
        setRatingStars(containerId, value, false);
        highlightStars(containerId, value);
        if (containerId === "trailerRatingStars") {
          syncTrailerRatingPreview(value, { updateInput: false });
        }
      } else {
        this.setCustomValidity("Введите число от 0 до 11");
        this.reportValidity();
      }
    });
  }

  container.dataset.ready = "true";
}

function sortTrailers(list) {
  const safeList = Array.isArray(list) ? list.slice() : [];
  return safeList.sort((a, b) => {
    const aWatched = a?.status === "watched";
    const bWatched = b?.status === "watched";
    if (aWatched !== bWatched) return aWatched ? 1 : -1;

    const aDate =
      new Date(
        aWatched ? a.watched_at || a.updated_at || a.created_at : a.created_at
      ).getTime() || 0;
    const bDate =
      new Date(
        bWatched ? b.watched_at || b.updated_at || b.created_at : b.created_at
      ).getTime() || 0;
    return bDate - aDate;
  });
}

function normalizeTrailerSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
}

function searchWatchedTrailers(query) {
  watchedTrailersSearchQuery = String(query || "");
  renderTrailerLists();
}

const debouncedSearchWatchedTrailers = debounce(searchWatchedTrailers, 300);

function getFilteredWatchedTrailers(list) {
  const watched = Array.isArray(list) ? list : [];
  const normalizedQuery = normalizeTrailerSearchText(watchedTrailersSearchQuery);

  if (!normalizedQuery) {
    return watched;
  }

  const queryDigits = normalizedQuery.replace(/\D+/g, "");

  return watched.filter((item) => {
    const title = normalizeTrailerSearchText(item?.title || "");
    const year = String(item?.year || "");
    const normalizedYear = normalizeTrailerSearchText(year);
    const titleMatch = title.includes(normalizedQuery);
    const yearMatch =
      (normalizedYear && normalizedYear.includes(normalizedQuery)) ||
      (queryDigits && year.includes(queryDigits));

    return titleMatch || yearMatch;
  });
}

function applyTrailerList(nextList) {
  trailers = sortTrailers(nextList);
  if (!trailers.length) {
    selectedTrailerId = null;
  } else if (!getSelectedTrailer()) {
    selectedTrailerId = trailers[0].id;
  }
  renderTrailerLists();
  renderSelectedTrailer();
}

function renderTrailerItem(item) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "trailer-item";
  if (Number(item.id) === Number(selectedTrailerId)) {
    button.classList.add("is-active");
  }
  button.dataset.id = String(item.id);

  const poster = document.createElement("img");
  poster.className = "trailer-item__poster";
  poster.src = resolveTrailerPosterSrc(item.poster, item.kinopoisk_id);
  poster.alt = item.title ? `Постер: ${item.title}` : "Постер трейлера";
  poster.loading = "lazy";
  poster.onerror = () => {
    poster.onerror = null;
    poster.src = POSTER_PLACEHOLDER;
  };

  const body = document.createElement("div");
  body.className = "trailer-item__body";

  const title = document.createElement("p");
  title.className = "trailer-item__title";
  title.textContent = item.title || "Без названия";

  const meta = document.createElement("p");
  meta.className = "trailer-item__meta";
  meta.textContent = item.year ? String(item.year) : "Год не указан";

  const rating = document.createElement("p");
  rating.className = "trailer-item__rating";
  rating.textContent =
    item.status === "watched" && item.streamer_rating
      ? "Просмотрен"
      : "Ещё не оценён";

  body.append(title, meta, rating);

  const actions = document.createElement("div");
  actions.className = "trailer-item__actions";

  const kpLink = document.createElement("a");
  kpLink.className = "trailer-item__kp-link";
  kpLink.href = buildKinopoiskFilmUrl(item.kinopoisk_id, item.title);
  kpLink.target = "_blank";
  kpLink.rel = "noopener noreferrer";
  kpLink.setAttribute("aria-label", "Открыть фильм на Кинопоиске");
  kpLink.innerHTML = '<img src="/images/kinopoisk-icon-main.svg" alt="Kinopoisk">';
  kpLink.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  const badge = document.createElement("span");
  badge.className = "trailer-item__badge";
  if (item.status === "watched") {
    badge.classList.add("trailer-item__badge--watched");
    badge.textContent = item.streamer_rating ? `${item.streamer_rating}/10` : "OK";
    actions.append(kpLink, badge);
  } else {
    actions.append(kpLink);
  }
  button.append(poster, body, actions);
  return button;
}

function renderTrailerLists() {
  const plannedList = document.getElementById("plannedTrailerList");
  const plannedEmpty = document.getElementById("plannedTrailerEmpty");
  const plannedLoading = document.getElementById("plannedTrailerLoading");
  const plannedCount = document.getElementById("plannedCount");
  const plannedModalCount = document.getElementById("plannedModalCount");
  const watchedLoading = document.getElementById("watchedTrailersLoading");
  const watchedCount = document.getElementById("watchedCount");
  const watchedTrailersCount = document.getElementById("watchedTrailersCount");

  if (!plannedList) return;

  const planned = trailers.filter((item) => item.status !== "watched");
  const watched = trailers.filter((item) => item.status === "watched");
  const filteredWatched = getFilteredWatchedTrailers(watched);

  plannedList.innerHTML = "";
  planned.forEach((item) => plannedList.appendChild(renderTrailerItem(item)));

  if (plannedLoading) plannedLoading.hidden = true;
  if (watchedLoading) watchedLoading.hidden = true;
  if (plannedList) plannedList.hidden = false;
  if (plannedEmpty) plannedEmpty.hidden = planned.length > 0;
  if (plannedCount) plannedCount.textContent = String(planned.length);
  if (plannedModalCount) plannedModalCount.textContent = String(planned.length);
  if (watchedCount) watchedCount.textContent = String(watched.length);
  if (watchedTrailersCount) {
    watchedTrailersCount.textContent = String(filteredWatched.length);
  }

  renderPlannedTrailerModalList(planned);
  renderWatchedTrailersGrid(filteredWatched);
  syncTrailerSidebarHeight();
}

function renderPlannedTrailerModalList(plannedList) {
  const modalList = document.getElementById("plannedTrailerModalList");
  const modalEmpty = document.getElementById("plannedTrailerModalEmpty");
  if (!modalList) return;

  const planned = Array.isArray(plannedList) ? plannedList : [];
  modalList.innerHTML = "";
  planned.forEach((item) => modalList.appendChild(renderTrailerItem(item)));

  if (modalEmpty) modalEmpty.hidden = planned.length > 0;
}

function renderWatchedTrailerCard(item) {
  const card = document.createElement("div");
  card.className = "movie-card trailer-watched-card";
  card.tabIndex = 0;
  card.dataset.id = String(item.id);

  const poster = document.createElement("img");
  poster.src = resolveTrailerPosterSrc(item.poster, item.kinopoisk_id);
  poster.alt = item.title || "Постер трейлера";
  poster.className = "movie-poster";
  poster.loading = "lazy";
  poster.onerror = () => {
    poster.onerror = null;
    poster.src = POSTER_PLACEHOLDER;
  };

  const info = document.createElement("div");
  info.className = "movie-info";

  const title = document.createElement("div");
  title.className = "movie-title";
  title.textContent = item.title || "Без названия";

  const year = document.createElement("div");
  year.className = "movie-year";
  year.textContent = item.year ? String(item.year) : "Год не указан";

  const ratingDiv = document.createElement("div");
  ratingDiv.className = "movie-rating";

  const streamerItem = document.createElement("div");
  streamerItem.className = "rating-item";
  streamerItem.innerHTML = `
    <img src="/images/Pupsik_TV_Icon.webp" alt="Pupsik Rate">
    <span>${item.streamer_rating ?? "-"}</span>
  `;

  const viewerItem = document.createElement("div");
  viewerItem.className = "rating-item rating-user";
  viewerItem.innerHTML = `
    <i class="fa-solid fa-star" aria-hidden="true"></i>
    <span>${formatViewerRating(item)}</span>
  `;

  ratingDiv.append(streamerItem, viewerItem);
  info.append(title, year, ratingDiv);
  card.append(poster, info);

  const footer = document.createElement("div");
  footer.className = "movie-footer";

  const actions = document.createElement("div");
  actions.className = "movie-actions";

  const rateButton = document.createElement("button");
  rateButton.type = "button";
  rateButton.className = "btn btn-rate btn-icon";
  rateButton.textContent = hasRatedTrailer(item.id) ? "Оценено" : "Оценить";

  if (hasRatedTrailer(item.id)) {
    rateButton.disabled = true;
    rateButton.title = "Вы уже оценили этот трейлер";
  } else {
    rateButton.addEventListener("click", (event) => {
      event.stopPropagation();
      openTrailerUserRateModal(item.id);
    });
  }

  actions.appendChild(rateButton);
  footer.appendChild(actions);
  card.appendChild(footer);

  const handleOpen = () => {
    selectedTrailerId = Number(item.id);
    renderSelectedTrailer();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  card.addEventListener("click", handleOpen);
  card.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleOpen();
  });

  return card;
}

function renderWatchedTrailersGrid(watchedList) {
  const grid = document.getElementById("watchedTrailersGrid");
  const empty = document.getElementById("watchedTrailersEmpty");
  if (!grid) return;

  const watched = Array.isArray(watchedList) ? watchedList : [];
  grid.innerHTML = "";
  grid.hidden = false;
  watched.forEach((item) => grid.appendChild(renderWatchedTrailerCard(item)));

  if (empty) {
    empty.hidden = watched.length > 0;
    empty.textContent = normalizeTrailerSearchText(watchedTrailersSearchQuery)
      ? "Ничего не найдено."
      : "Оценённых трейлеров ещё нет.";
  }
}

function setTrailerListsLoading(isLoading) {
  const plannedLoading = document.getElementById("plannedTrailerLoading");
  const plannedList = document.getElementById("plannedTrailerList");
  const plannedEmpty = document.getElementById("plannedTrailerEmpty");
  const watchedLoading = document.getElementById("watchedTrailersLoading");
  const watchedGrid = document.getElementById("watchedTrailersGrid");
  const watchedEmpty = document.getElementById("watchedTrailersEmpty");

  if (plannedLoading) plannedLoading.hidden = !isLoading;
  if (watchedLoading) watchedLoading.hidden = !isLoading;
  if (plannedList) plannedList.hidden = Boolean(isLoading);
  if (plannedEmpty) plannedEmpty.hidden = true;
  if (watchedGrid) watchedGrid.hidden = Boolean(isLoading);
  if (watchedEmpty) watchedEmpty.hidden = true;
}

function syncTrailerSidebarHeight() {
  const sidebar = document.querySelector(".trailer-sidebar");
  const infoPanel = document.querySelector(".trailer-info");
  const main = document.querySelector(".trailer-main");
  if (!sidebar || !infoPanel || !main) return;

  if (window.innerWidth <= 1280) {
    sidebar.style.removeProperty("--trailer-sidebar-max-height");
    infoPanel.style.removeProperty("--trailer-sidebar-max-height");
    return;
  }

  const nextHeight = `${Math.ceil(main.offsetHeight)}px`;
  sidebar.style.setProperty("--trailer-sidebar-max-height", nextHeight);
  infoPanel.style.setProperty("--trailer-sidebar-max-height", nextHeight);
}

function toggleInfoVisibility(hasContent) {
  const empty = document.getElementById("trailerInfoEmpty");
  const loading = document.getElementById("trailerInfoLoading");
  const content = document.getElementById("trailerInfoContent");
  if (empty) empty.hidden = Boolean(hasContent);
  if (loading) loading.hidden = true;
  if (content) content.hidden = !hasContent;
}

function resetKinopoiskInfo(message) {
  toggleInfoVisibility(false);
  const link = document.getElementById("trailerKinopoiskLink");
  if (link) {
    link.hidden = true;
    link.href = "#";
  }
}

function setTrailerInfoLoading(isLoading, message = "Загружаю информацию о фильме...") {
  const empty = document.getElementById("trailerInfoEmpty");
  const loading = document.getElementById("trailerInfoLoading");
  const content = document.getElementById("trailerInfoContent");
  const text =
    loading?.querySelector(".section-loader__text") || loading?.querySelector("p");

  if (text) {
    text.textContent = message;
  }

  if (empty) empty.hidden = Boolean(isLoading);
  if (loading) loading.hidden = !isLoading;
  if (content) content.hidden = Boolean(isLoading);
}

function setTrailerPlayerLoading(isLoading) {
  const placeholder = document.getElementById("trailerPlayerPlaceholder");
  if (!placeholder) return;
  placeholder.hidden = !isLoading;
}

function renderSelectedTrailer() {
  const trailer = getSelectedTrailer();
  const title = document.getElementById("trailerPlayerTitle");
  const frame = document.getElementById("trailerPlayerFrame");
  const placeholder = document.getElementById("trailerPlayerPlaceholder");
  const openYoutube = document.getElementById("trailerOpenYoutube");
  const ratingInput = document.getElementById("trailerRatingInput");
  const watchedButton = document.getElementById("trailerMarkWatchedButton");
  const deleteButton = document.getElementById("trailerDeleteButton");

  renderTrailerLists();

  if (!trailer) {
    if (title) title.textContent = "Выберите трейлер из списка";
    if (frame) frame.src = "about:blank";
    setTrailerPlayerLoading(false);
    if (openYoutube) {
      openYoutube.href = "#";
      openYoutube.setAttribute("aria-disabled", "true");
    }
    setRatingStars("trailerRatingStars", null);
    updateTrailerRatingMeaning(null);
    if (watchedButton) watchedButton.disabled = true;
    if (deleteButton) deleteButton.disabled = true;
    resetKinopoiskInfo("Выберите трейлер для поиска информации.");
    return;
  }

  if (title) title.textContent = trailer.title || "Без названия";
  setTrailerPlayerLoading(true);
  if (frame) {
    frame.onload = () => {
      setTrailerPlayerLoading(false);
    };
    frame.src = buildYoutubeEmbedUrl(trailer.youtube_video_id);
  }
  if (openYoutube) {
    openYoutube.href = buildYoutubeWatchUrl(trailer.youtube_video_id);
    openYoutube.setAttribute("aria-disabled", "false");
  }
  if (ratingInput) {
    const nextRating =
      trailer.streamer_rating === null || trailer.streamer_rating === undefined
        ? null
        : Number(trailer.streamer_rating);
    const normalizedRating = Number.isFinite(nextRating) ? nextRating : null;
    setRatingStars("trailerRatingStars", normalizedRating);
    highlightStars("trailerRatingStars", normalizedRating);
    syncTrailerRatingPreview(normalizedRating);
  }
  if (watchedButton) {
    watchedButton.disabled = hasAdminAccess ? false : hasRatedTrailer(trailer.id);
  }
  if (deleteButton) {
    deleteButton.disabled = !hasAdminAccess;
    deleteButton.hidden = !hasAdminAccess;
  }

  setStatusText("trailerActionStatus", "");
  loadKinopoiskInfoCached(trailer);
}

async function fetchTrailers() {
  const response = await fetch(TRAILER_API_URL);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || `Failed to load trailers: ${response.status}`);
  }
  if (payload?.setupRequired) {
    setStatusText("trailerFormStatus", payload.message || "Нужно применить SQL-миграцию для страницы трейлеров.", true);
  }
  applyTrailerList(Array.isArray(payload?.items) ? payload.items : []);
}

async function createTrailer(payload) {
  const response = await fetch(TRAILER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAdminAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || `Failed to create trailer: ${response.status}`);
  }
  const item = data?.item;
  if (!item) {
    throw new Error("Missing item in create response");
  }
  applyTrailerList([item, ...trailers]);
  selectedTrailerId = item.id;
  renderSelectedTrailer();
}

async function patchTrailer(id, changes) {
  const response = await fetch(TRAILER_API_URL, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...getAdminAuthHeaders(),
    },
    body: JSON.stringify({ id, ...changes }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || `Failed to update trailer: ${response.status}`);
  }
  const updated = data?.item;
  if (!updated) {
    throw new Error("Missing item in update response");
  }

  trailers = sortTrailers(
    trailers.map((item) => (Number(item.id) === Number(updated.id) ? updated : item))
  );
  renderSelectedTrailer();
  return updated;
}

async function removeTrailer(id) {
  const response = await fetch(`${TRAILER_API_URL}?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getAdminAuthHeaders(),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(payload?.error || `Failed to delete trailer: ${response.status}`);
  }

  trailers = trailers.filter((item) => Number(item.id) !== Number(id));
  if (Number(selectedTrailerId) === Number(id)) {
    selectedTrailerId = trailers[0]?.id || null;
  }
  renderSelectedTrailer();
}

async function submitTrailerUserRating(trailerId, rating) {
  const response = await fetch(TRAILER_RATINGS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      trailer_id: trailerId,
      rating,
      user_id: getGuestId(),
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || `Failed to submit trailer rating: ${response.status}`);
  }

  return payload?.trailer || null;
}

function closeTrailerUserRateModal() {
  const modal = document.getElementById("trailerUserRateModal");
  const input = document.getElementById("trailerUserRateInput");
  const submitButton = document.getElementById("trailerUserRateSubmit");
  if (modal) modal.style.display = "none";
  if (input) {
    input.value = "";
    input.setCustomValidity("");
  }
  if (submitButton) {
    submitButton.disabled = false;
    submitButton.removeAttribute("aria-busy");
  }
  setRatingStars("trailerUserRateStars", 0);
  setStatusText("trailerUserRateStatus", "");
  userRatingTrailerId = null;
}

function openTrailerUserRateModal(trailerId) {
  if (hasRatedTrailer(trailerId)) {
    alert("Вы уже оценили этот трейлер");
    return;
  }

  const trailer = trailers.find((item) => Number(item.id) === Number(trailerId));
  const modal = document.getElementById("trailerUserRateModal");
  const title = document.getElementById("trailerUserRateTitle");
  const poster = document.getElementById("trailerUserRatePoster");
  const submitButton = document.getElementById("trailerUserRateSubmit");

  if (!modal || !title || !poster || !trailer) return;

  userRatingTrailerId = Number(trailerId);
  title.textContent = trailer.title || "Без названия";
  poster.src = resolveTrailerPosterSrc(trailer.poster, trailer.kinopoisk_id);
  poster.alt = trailer.title || "Постер трейлера";
  poster.onerror = () => {
    poster.onerror = null;
    poster.src = POSTER_PLACEHOLDER;
  };

  setRatingStars("trailerUserRateStars", 0);
  setupRatingStars("trailerUserRateStars");
  setStatusText("trailerUserRateStatus", "");
  if (submitButton) {
    submitButton.disabled = false;
    submitButton.removeAttribute("aria-busy");
  }
  modal.style.display = "block";
}

async function searchKinopoiskByTitle(query) {
  const data = await fetchKinopoiskJson(
    `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(query)}&page=1`,
    "Kinopoisk search"
  );
  return Array.isArray(data?.films) ? data.films : [];
}

function setTrailerTitleResultsVisible(isVisible) {
  const container = document.getElementById("trailerTitleResultsContainer");
  if (!container) return;
  container.style.display = isVisible ? "block" : "none";
}

function clearTrailerTitleSearch() {
  trailerTitleSearchResults = [];
  const list = document.getElementById("trailerTitleResults");
  if (list) list.innerHTML = "";
  setTrailerTitleResultsVisible(false);
}

function renderSelectedTrailerMovieCard(movie = selectedTrailerSearchMovie) {
  const card = document.getElementById("trailerSelectedMovieCard");
  const poster = document.getElementById("trailerSelectedMoviePoster");
  const title = document.getElementById("trailerSelectedMovieTitle");
  const meta = document.getElementById("trailerSelectedMovieMeta");

  if (!card || !poster || !title || !meta) return;

  if (!movie) {
    card.hidden = true;
    title.textContent = "";
    meta.textContent = "";
    poster.src = POSTER_PLACEHOLDER;
    return;
  }

  const resolvedTitle = movie?.nameRu || movie?.nameEn || "Без названия";
  const resolvedPoster =
    buildKinopoiskPosterUrl(movie?.filmId) ||
    movie?.posterUrlPreview ||
    movie?.posterUrl ||
    POSTER_PLACEHOLDER;

  title.textContent = resolvedTitle;
  meta.textContent = movie?.year ? String(movie.year) : "Год не указан";
  poster.src = resolvedPoster;
  poster.alt = `Постер: ${resolvedTitle}`;
  poster.onerror = () => {
    poster.onerror = null;
    poster.src = POSTER_PLACEHOLDER;
  };
  card.hidden = false;
}

function clearSelectedTrailerMovie() {
  selectedTrailerSearchMovie = null;
  renderSelectedTrailerMovieCard(null);
}

function renderTrailerTitleResults() {
  const list = document.getElementById("trailerTitleResults");
  if (!list) return;

  list.innerHTML = "";
  trailerTitleSearchResults.forEach((movie, index) => {
    const option = document.createElement("div");
    option.className = "autocomplete-option";
    option.dataset.index = String(index);
    option.textContent = getMovieLabel(movie);
    list.appendChild(option);
  });

  setTrailerTitleResultsVisible(trailerTitleSearchResults.length > 0);
}

function applyTrailerTitleSelection(movie) {
  const titleInput = document.getElementById("trailerTitleInput");
  if (!movie || !titleInput) return;

  selectedTrailerSearchMovie = movie;
  titleInput.value = movie?.nameRu || movie?.nameEn || titleInput.value;
  clearTrailerTitleSearch();
  selectedTrailerSearchMovie = movie;
  renderSelectedTrailerMovieCard(movie);
  setStatusText("trailerFormStatus", "Фильм выбран из Кинопоиска.");
}

async function runTrailerTitleSearch(query) {
  const trimmedQuery = String(query || "").trim();
  const requestId = ++trailerTitleRequestId;

  if (!trimmedQuery || !kinopoiskApiKey) {
    clearTrailerTitleSearch();
    return;
  }

  const fallbackQueries = hasUppercaseLetters(trimmedQuery)
    ? []
    : [capitalizeWords(trimmedQuery)];

  const queries = [trimmedQuery, ...fallbackQueries]
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index);

  try {
    for (const nextQuery of queries) {
      const results = await searchKinopoiskByTitle(nextQuery);
      if (requestId !== trailerTitleRequestId) return;
      trailerTitleSearchResults = results.slice(0, 8);
      if (trailerTitleSearchResults.length) {
        renderTrailerTitleResults();
        return;
      }
    }

    clearTrailerTitleSearch();
  } catch (error) {
    if (requestId !== trailerTitleRequestId) return;
    console.error("Trailer title autocomplete failed", error);
    clearTrailerTitleSearch();
  }
}

function debounce(fn, delay) {
  let timeoutId = null;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

const debouncedTrailerTitleSearch = debounce(runTrailerTitleSearch, 120);

async function fetchKinopoiskDetails(filmId) {
  return fetchKinopoiskJson(
    `${KINOPOISK_FILM_URL}/${encodeURIComponent(filmId)}`,
    "Kinopoisk details"
  );
}

async function fetchKinopoiskStaff(filmId) {
  const data = await fetchKinopoiskJson(
    `${KINOPOISK_STAFF_URL}?filmId=${encodeURIComponent(filmId)}`,
    "Kinopoisk staff"
  );
  return Array.isArray(data) ? data : [];
}

function scoreKinopoiskCandidate(candidate, trailer) {
  let score = 0;
  const candidateTitle = normalizeTitle(candidate?.nameRu || candidate?.nameEn || "");
  const trailerTitle = normalizeTitle(trailer?.title || "");
  if (candidateTitle && trailerTitle) {
    if (candidateTitle === trailerTitle) score += 120;
    if (
      candidateTitle.includes(trailerTitle) ||
      trailerTitle.includes(candidateTitle)
    ) {
      score += 60;
    }
  }
  if (trailer?.year && Number(candidate?.year) === Number(trailer.year)) {
    score += 25;
  }
  if (candidate?.rating) {
    score += 5;
  }
  return score;
}

function pickBestKinopoiskMatch(results, trailer) {
  const ranked = (Array.isArray(results) ? results : [])
    .map((item) => ({ item, score: scoreKinopoiskCandidate(item, trailer) }))
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.item || null;
}

function renderKinopoiskMatches(results) {
  const matches = document.getElementById("trailerKinopoiskMatches");
  if (!matches) return;
  matches.innerHTML = "";

  results.slice(0, 5).forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "trailer-kp-match";
    button.dataset.filmId = String(item.filmId || "");
    button.innerHTML = `
      <strong>${escapeHtml(item.nameRu || item.nameEn || "Без названия")}</strong><br>
      <span>${escapeHtml(item.year || "год не указан")} · ${escapeHtml(
        (item.genres || []).map((genre) => genre.genre).join(", ") ||
          "жанры не указаны"
      )}</span>
    `;
    matches.appendChild(button);
  });
}

function buildTrailerKinopoiskCache(details, staff) {
  const actorNames = (Array.isArray(staff) ? staff : [])
    .filter((person) => person?.professionKey === "ACTOR")
    .slice(0, 12)
    .map((person) => person.nameRu || person.nameEn)
    .filter(Boolean);

  return {
    title: details?.nameRu || details?.nameOriginal || details?.nameEn || "",
    year: details?.year || null,
    filmLength: details?.filmLength || null,
    countries: Array.isArray(details?.countries)
      ? details.countries.map((item) => item.country).filter(Boolean)
      : [],
    genres: Array.isArray(details?.genres)
      ? details.genres.map((item) => item.genre).filter(Boolean)
      : [],
    ratingKinopoisk: details?.ratingKinopoisk || null,
    ratingImdb: details?.ratingImdb || null,
    description: details?.description || details?.shortDescription || "",
    actors: actorNames,
    releaseDate:
      details?.premiereRu ||
      details?.premiereWorld ||
      details?.releaseDate ||
      details?.startYear ||
      null,
    posterUrl:
      buildKinopoiskPosterUrl(details?.kinopoiskId) ||
      details?.posterUrl ||
      details?.posterUrlPreview ||
      "",
    webUrl: details?.webUrl || "",
    kinopoiskId: details?.kinopoiskId || null,
  };
}

function renderStoredKinopoiskInfo(info) {
  const title = document.getElementById("trailerInfoTitle");
  const meta = document.getElementById("trailerInfoMeta");
  const badges = document.getElementById("trailerInfoBadges");
  const description = document.getElementById("trailerInfoDescription");
  const actors = document.getElementById("trailerInfoActors");
  const release = document.getElementById("trailerInfoRelease");
  const poster = document.getElementById("trailerPoster");
  const kpLink = document.getElementById("trailerKinopoiskLink");

  if (!title || !meta || !badges || !description || !actors || !release || !poster || !kpLink) {
    return;
  }

  const resolvedTitle = info?.title || "Без названия";
  const genres = Array.isArray(info?.genres) ? info.genres : [];
  const countries = Array.isArray(info?.countries) ? info.countries : [];
  const actorNames = Array.isArray(info?.actors) ? info.actors : [];

  title.textContent = resolvedTitle;
  meta.textContent = [
    info?.year || "Год не указан",
    info?.filmLength ? `${info.filmLength} мин.` : "",
    countries.join(", "),
  ]
    .filter(Boolean)
    .join(" · ");

  badges.innerHTML = "";
  [
    info?.ratingKinopoisk ? `КП ${info.ratingKinopoisk}` : "",
    info?.ratingImdb ? `IMDb ${info.ratingImdb}` : "",
    genres.length ? genres.join(", ") : "",
  ]
    .filter(Boolean)
    .forEach((label) => {
      const badge = document.createElement("span");
      badge.textContent = label;
      badges.appendChild(badge);
    });

  description.textContent = info?.description || "Описание не найдено.";
  actors.textContent = actorNames.length
    ? actorNames.join(", ")
    : "Список актёров не найден.";
  release.textContent = formatDate(info?.releaseDate || "");

  poster.src = resolveTrailerPosterSrc(info?.posterUrl, info?.kinopoiskId);
  poster.alt = resolvedTitle ? `Постер: ${resolvedTitle}` : "Постер фильма";
  poster.onerror = () => {
    poster.onerror = null;
    poster.src = POSTER_PLACEHOLDER;
  };

  kpLink.href = info?.webUrl || buildKinopoiskFilmUrl(info?.kinopoiskId, resolvedTitle);
  kpLink.hidden = !kpLink.href || kpLink.href === "#";

  toggleInfoVisibility(true);
}

function renderKinopoiskInfo(details, staff) {
  const title = document.getElementById("trailerInfoTitle");
  const meta = document.getElementById("trailerInfoMeta");
  const badges = document.getElementById("trailerInfoBadges");
  const description = document.getElementById("trailerInfoDescription");
  const actors = document.getElementById("trailerInfoActors");
  const release = document.getElementById("trailerInfoRelease");
  const poster = document.getElementById("trailerPoster");
  const kpLink = document.getElementById("trailerKinopoiskLink");

  if (!title || !meta || !badges || !description || !actors || !release || !poster || !kpLink) {
    return;
  }

  const resolvedTitle =
    details?.nameRu || details?.nameOriginal || details?.nameEn || "Без названия";
  const genres = Array.isArray(details?.genres)
    ? details.genres.map((item) => item.genre).filter(Boolean)
    : [];
  const countries = Array.isArray(details?.countries)
    ? details.countries.map((item) => item.country).filter(Boolean)
    : [];
  const actorNames = (Array.isArray(staff) ? staff : [])
    .filter((person) => person?.professionKey === "ACTOR")
    .slice(0, 12)
    .map((person) => person.nameRu || person.nameEn)
    .filter(Boolean);

  title.textContent = resolvedTitle;
  meta.textContent = [
    details?.year || "Год не указан",
    details?.filmLength ? `${details.filmLength} мин.` : "",
    countries.join(", "),
  ]
    .filter(Boolean)
    .join(" · ");

  badges.innerHTML = "";
  [
    details?.ratingKinopoisk ? `КП ${details.ratingKinopoisk}` : "",
    details?.ratingImdb ? `IMDb ${details.ratingImdb}` : "",
    genres.length ? genres.join(", ") : "",
  ]
    .filter(Boolean)
    .forEach((label) => {
      const badge = document.createElement("span");
      badge.textContent = label;
      badges.appendChild(badge);
    });

  description.textContent =
    details?.description || details?.shortDescription || "Описание не найдено.";
  actors.textContent = actorNames.length
    ? actorNames.join(", ")
    : "Список актёров не найден.";

  const releaseValue =
    details?.premiereRu ||
    details?.premiereWorld ||
    details?.releaseDate ||
    details?.startYear ||
    "";
  release.textContent = formatDate(releaseValue);

  poster.src = resolveTrailerPosterSrc(
    details?.posterUrl || details?.posterUrlPreview,
    details?.kinopoiskId
  );
  poster.alt = resolvedTitle ? `Постер: ${resolvedTitle}` : "Постер фильма";
  poster.onerror = () => {
    poster.onerror = null;
    poster.src = POSTER_PLACEHOLDER;
  };

  kpLink.href =
    details?.webUrl || buildKinopoiskFilmUrl(details?.kinopoiskId, resolvedTitle);
  kpLink.hidden = !kpLink.href || kpLink.href === "#";

  toggleInfoVisibility(true);
}

async function applyKinopoiskSelection(trailer, filmId, searchResults) {
  if (!hasAdminAccess) {
    return;
  }

  const requestId = ++kinopoiskRequestId;
  renderKinopoiskMatches(searchResults || []);
  setTrailerInfoLoading(true, "Загружаю информацию о фильме...");

  try {
    const details = await fetchKinopoiskDetails(filmId);
    const staff = await fetchKinopoiskStaff(filmId);

    if (requestId !== kinopoiskRequestId) return;

    const kinopoiskData = buildTrailerKinopoiskCache(details, staff);
    renderStoredKinopoiskInfo(kinopoiskData);

    const nextYear = Number.parseInt(details?.year, 10);
    const nextPoster =
      buildKinopoiskPosterUrl(filmId) ||
      details?.posterUrlPreview ||
      details?.posterUrl ||
      "";
    const normalizedYear = Number.isFinite(nextYear) ? nextYear : trailer.year || null;
    const normalizedPoster = nextPoster || trailer.poster || null;
    const needsPatch =
      Number(trailer.kinopoisk_id || 0) !== Number(filmId) ||
      Number(trailer.year || 0) !== Number(normalizedYear || 0) ||
      String(trailer.poster || "") !== String(normalizedPoster || "") ||
      JSON.stringify(parseTrailerKinopoiskData(trailer.kinopoisk_data) || null) !==
        JSON.stringify(kinopoiskData);

    if (needsPatch) {
      await patchTrailer(trailer.id, {
        kinopoisk_id: filmId,
        year: normalizedYear,
        poster: normalizedPoster,
        kinopoisk_data: kinopoiskData,
        kinopoisk_cached_at: new Date().toISOString(),
      });
    }
  } catch (error) {
    if (requestId !== kinopoiskRequestId) return;
    console.error("Failed to apply Kinopoisk selection", error);
    resetKinopoiskInfo("Не удалось загрузить информацию Кинопоиска.");
  }
}

/*
async function loadKinopoiskInfo(trailer) {
  const cachedKinopoiskData = parseTrailerKinopoiskData(trailer?.kinopoisk_data);
  if (cachedKinopoiskData) {
    renderStoredKinopoiskInfo(cachedKinopoiskData);
    return;
  }
  if (!trailer) {
    resetKinopoiskInfo("Выберите трейлер для поиска информации.");
    return;
  }

  if (!kinopoiskApiKey) {
    resetKinopoiskInfo(
      "API-ключ Кинопоиска не найден. Плеер и список будут работать без карточки фильма."
    );
    return;
  }

  try {
    let searchResults = [];
    let chosenId = trailer.kinopoisk_id || null;

    if (!chosenId) {
      searchResults = await searchKinopoiskByTitle(trailer.title);
      renderKinopoiskMatches(searchResults);

    if (!searchResults.length && !trailer.kinopoisk_id) {
      resetKinopoiskInfo("На Кинопоиске ничего не найдено по текущему названию.");
      return;
    }

    const chosenId =
      trailer.kinopoisk_id ||
      pickBestKinopoiskMatch(searchResults, trailer)?.filmId ||
      null;

    if (!chosenId) {
      resetKinopoiskInfo("Не удалось подобрать фильм на Кинопоиске автоматически.");
      return;
    }

    await applyKinopoiskSelection(trailer, chosenId, searchResults);
  } catch (error) {
    console.error("Kinopoisk search failed", error);
    resetKinopoiskInfo("Не удалось выполнить поиск на Кинопоиске.");
  }
}

*/
async function loadKinopoiskInfo(trailer) {
  return loadKinopoiskInfoCached(trailer);
}

async function loadKinopoiskInfoCached(trailer) {
  if (!trailer) {
    resetKinopoiskInfo("Выберите трейлер для поиска информации.");
    return;
  }

  const cachedKinopoiskData = parseTrailerKinopoiskData(trailer.kinopoisk_data);
  if (cachedKinopoiskData) {
    renderStoredKinopoiskInfo(cachedKinopoiskData);
    return;
  }

  if (!hasAdminAccess) {
    resetKinopoiskInfo(document.getElementById("trailerInfoEmpty")?.textContent || "");
    return;
  }

  if (!kinopoiskApiKey) {
    resetKinopoiskInfo(
      "API-ключ Кинопоиска не найден. Плеер и список будут работать без карточки фильма."
    );
    return;
  }

  try {
    let searchResults = [];
    let chosenId = trailer.kinopoisk_id || null;

    if (!chosenId) {
      setTrailerInfoLoading(true, "Ищу фильм на Кинопоиске...");
      searchResults = await searchKinopoiskByTitle(trailer.title);
      renderKinopoiskMatches(searchResults);

      if (!searchResults.length) {
        resetKinopoiskInfo("На Кинопоиске ничего не найдено по текущему названию.");
        return;
      }

      chosenId = pickBestKinopoiskMatch(searchResults, trailer)?.filmId || null;
    } else {
      renderKinopoiskMatches([]);
    }

    if (!chosenId) {
      resetKinopoiskInfo("Не удалось подобрать фильм на Кинопоиске автоматически.");
      return;
    }

    await applyKinopoiskSelection(trailer, chosenId, searchResults);
  } catch (error) {
    console.error("Kinopoisk search failed", error);
    resetKinopoiskInfo("Не удалось выполнить поиск на Кинопоиске.");
  }
}

function setupListEvents() {
  const plannedModal = document.getElementById("plannedTrailersModal");
  const plannedModalClose = document.getElementById("plannedTrailersModalClose");
  const openPlannedModalButton = document.getElementById("openPlannedTrailersModal");

  const clickHandler = (event) => {
    const item = event.target.closest(".trailer-item");
    if (!item) return;
    selectedTrailerId = Number(item.dataset.id);
    renderSelectedTrailer();
    if (plannedModal) {
      plannedModal.style.display = "none";
    }
  };

  document
    .getElementById("plannedTrailerList")
    ?.addEventListener("click", clickHandler);

  document
    .getElementById("plannedTrailerModalList")
    ?.addEventListener("click", clickHandler);

  openPlannedModalButton?.addEventListener("click", () => {
    if (plannedModal) {
      plannedModal.style.display = "block";
    }
  });

  const closePlannedModal = () => {
    if (plannedModal) {
      plannedModal.style.display = "none";
    }
  };

  plannedModalClose?.addEventListener("click", closePlannedModal);
  plannedModalClose?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    closePlannedModal();
  });

  plannedModal?.addEventListener("click", (event) => {
    if (event.target === plannedModal) {
      closePlannedModal();
    }
  });

  document
    .getElementById("trailerKinopoiskMatches")
    ?.addEventListener("click", async (event) => {
      const button = event.target.closest(".trailer-kp-match");
      const trailer = getSelectedTrailer();
      const filmId = Number(button?.dataset.filmId);
      if (!button || !trailer || !filmId) return;
      await applyKinopoiskSelection(trailer, filmId, []);
    });
}

function setupFormEvents() {
  const form = document.getElementById("trailerAddForm");
  const titleInput = document.getElementById("trailerTitleInput");
  const urlInput = document.getElementById("trailerUrlInput");
  const titleResults = document.getElementById("trailerTitleResults");
  const selectedMovieClear = document.getElementById("trailerSelectedMovieClear");
  const ratingInput = document.getElementById("trailerRatingInput");
  const watchedButton = document.getElementById("trailerMarkWatchedButton");
  const deleteButton = document.getElementById("trailerDeleteButton");
  const userRateModal = document.getElementById("trailerUserRateModal");
  const userRateClose = document.getElementById("trailerUserRateClose");
  const userRateSubmit = document.getElementById("trailerUserRateSubmit");
  const userRateInput = document.getElementById("trailerUserRateInput");

  titleInput?.addEventListener("input", () => {
    const nextValue = String(titleInput.value || "").trim();
    const selectedTitle = selectedTrailerSearchMovie?.nameRu || selectedTrailerSearchMovie?.nameEn || "";
    if (selectedTitle && nextValue !== selectedTitle) {
      clearSelectedTrailerMovie();
    }
    debouncedTrailerTitleSearch(nextValue);
  });

  titleInput?.addEventListener("focus", () => {
    if (titleInput.value.trim()) {
      debouncedTrailerTitleSearch(titleInput.value);
    }
  });

  titleResults?.addEventListener("click", (event) => {
    const option = event.target.closest(".autocomplete-option");
    if (!option) return;
    const index = Number(option.dataset.index);
    const movie = trailerTitleSearchResults[index];
    applyTrailerTitleSelection(movie);
  });

  selectedMovieClear?.addEventListener("click", () => {
    clearSelectedTrailerMovie();
    if (titleInput) {
      titleInput.value = "";
      titleInput.focus();
    }
    setStatusText("trailerFormStatus", "");
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (
      target instanceof Node &&
      !target.closest("#trailerTitleInput") &&
      !target.closest("#trailerTitleResultsContainer")
    ) {
      setTrailerTitleResultsVisible(false);
    }
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (isCreatingTrailer) {
      return;
    }

    const title = String(titleInput?.value || "").trim();
    const youtubeUrl = String(urlInput?.value || "").trim();
    const videoId = parseYouTubeVideoId(youtubeUrl);

    if (!title) {
      setStatusText("trailerFormStatus", "Укажите название фильма.", true);
      return;
    }
    if (!videoId) {
      setStatusText(
        "trailerFormStatus",
        "Нужна корректная ссылка на YouTube-трейлер.",
        true
      );
      return;
    }

    setStatusText("trailerFormStatus", "Сохраняю трейлер...");
    isCreatingTrailer = true;
    setTrailerFormBusy(true);
    updateTrailerAdminUi();

    try {
      await createTrailer({
        title: selectedTrailerSearchMovie?.nameRu || selectedTrailerSearchMovie?.nameEn || title,
        youtube_url: youtubeUrl,
        youtube_video_id: videoId,
        kinopoisk_id: selectedTrailerSearchMovie?.filmId || null,
        year: selectedTrailerSearchMovie?.year || null,
        poster:
          buildKinopoiskPosterUrl(selectedTrailerSearchMovie?.filmId) ||
          selectedTrailerSearchMovie?.posterUrlPreview ||
          selectedTrailerSearchMovie?.posterUrl ||
          null,
      });
      form.reset();
      clearSelectedTrailerMovie();
      clearTrailerTitleSearch();
      setStatusText("trailerFormStatus", "Трейлер добавлен.");
    } catch (error) {
      console.error("Failed to add trailer", error);
      setStatusText(
        "trailerFormStatus",
        error?.message || "Не удалось добавить трейлер.",
        true
      );
    } finally {
      isCreatingTrailer = false;
      setTrailerFormBusy(false);
    }
  });

  watchedButton?.addEventListener("click", async () => {
    const trailer = getSelectedTrailer();
    if (!trailer) return;
    if (watchedButton?.disabled) return;

    const rawRating = String(ratingInput?.value || "").trim();
    const rating = parseRatingInputValue(rawRating);
    if (
      rawRating === "" ||
      Number.isNaN(rating) ||
      rating < 0 ||
      rating > 11 ||
      hasTooManyFractionDigits(rawRating)
    ) {
      setStatusText("trailerActionStatus", "Сначала выберите оценку.", true);
      return;
    }

    if (!hasAdminAccess && hasRatedTrailer(trailer.id)) {
      setStatusText("trailerActionStatus", "Вы уже оценили этот трейлер.", true);
      return;
    }

    if (watchedButton) {
      watchedButton.disabled = true;
      watchedButton.setAttribute("aria-busy", "true");
    }
    setStatusText("trailerActionStatus", "Сохраняем оценку...");

    try {
      if (hasAdminAccess) {
        await patchTrailer(trailer.id, {
          status: "watched",
          streamer_rating: rating,
          watched_at: new Date().toISOString(),
        });
        setStatusText(
          "trailerActionStatus",
          "Оценка сохранена, трейлер перемещён в просмотренные."
        );
      } else {
        const updatedTrailer = await submitTrailerUserRating(trailer.id, rating);
        if (updatedTrailer) {
          trailers = sortTrailers(
            trailers.map((item) =>
              Number(item.id) === Number(updatedTrailer.id)
                ? {
                    ...item,
                    viewer_rating_sum: updatedTrailer.viewer_rating_sum,
                    viewer_rating_count: updatedTrailer.viewer_rating_count,
                  }
                : item
            )
          );
        }
        rememberRatedTrailer(trailer.id, rating);
        renderSelectedTrailer();
        setStatusText(
          "trailerActionStatus",
          `Ваша оценка: ${String(rating).replace(".", ",")} сохранена.`
        );
      }
    } catch (error) {
      console.error("Failed to save rating", error);
      setStatusText(
        "trailerActionStatus",
        error?.message || "Не удалось сохранить оценку.",
        true
      );
    } finally {
      if (watchedButton) {
        watchedButton.removeAttribute("aria-busy");
        watchedButton.disabled = hasAdminAccess ? false : hasRatedTrailer(trailer.id);
      }
    }
  });

  deleteButton?.addEventListener("click", async () => {
    const trailer = getSelectedTrailer();
    if (!trailer) return;

    setStatusText("trailerActionStatus", "Удаляю трейлер...");
    try {
      await removeTrailer(trailer.id);
      setStatusText("trailerActionStatus", "Трейлер удалён.");
    } catch (error) {
      console.error("Failed to delete trailer", error);
      setStatusText(
        "trailerActionStatus",
        error?.message || "Не удалось удалить трейлер.",
        true
      );
    }
  });

  setupRatingStars("trailerRatingStars");
  setRatingStars("trailerRatingStars", null);
  setupRatingStars("trailerUserRateStars");
  setRatingStars("trailerUserRateStars", 0);

  userRateClose?.addEventListener("click", closeTrailerUserRateModal);
  userRateClose?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    closeTrailerUserRateModal();
  });

  userRateModal?.addEventListener("click", (event) => {
    if (event.target === userRateModal) {
      closeTrailerUserRateModal();
    }
  });

  userRateSubmit?.addEventListener("click", async () => {
    if (!userRatingTrailerId || isSubmittingTrailerUserRating) return;

    const rawRating = String(userRateInput?.value || "").trim();
    const rating = parseRatingInputValue(rawRating);
    if (
      rawRating === "" ||
      Number.isNaN(rating) ||
      rating < 0 ||
      rating > 11 ||
      hasTooManyFractionDigits(rawRating)
    ) {
      setStatusText("trailerUserRateStatus", "Введите корректную оценку от 0 до 11.", true);
      userRateInput?.reportValidity();
      return;
    }

    isSubmittingTrailerUserRating = true;
    if (userRateSubmit) {
      userRateSubmit.disabled = true;
      userRateSubmit.setAttribute("aria-busy", "true");
    }
    setStatusText("trailerUserRateStatus", "Сохраняем оценку...");

    try {
      const updatedTrailer = await submitTrailerUserRating(userRatingTrailerId, rating);
      if (updatedTrailer) {
        trailers = sortTrailers(
          trailers.map((item) =>
            Number(item.id) === Number(updatedTrailer.id)
              ? {
                  ...item,
                  viewer_rating_sum: updatedTrailer.viewer_rating_sum,
                  viewer_rating_count: updatedTrailer.viewer_rating_count,
                }
              : item
          )
        );
      }

      rememberRatedTrailer(userRatingTrailerId, rating);
      renderSelectedTrailer();
      setStatusText(
        "trailerUserRateStatus",
        `Ваша оценка: ${String(rating).replace(".", ",")} сохранена.`
      );
      if (userRateSubmit) {
        userRateSubmit.disabled = true;
        userRateSubmit.removeAttribute("aria-busy");
      }
    } catch (error) {
      console.error("Failed to submit trailer user rating", error);
      setStatusText(
        "trailerUserRateStatus",
        error?.message || "Не удалось сохранить оценку.",
        true
      );
    } finally {
      isSubmittingTrailerUserRating = false;
      if (userRateSubmit && !hasRatedTrailer(userRatingTrailerId)) {
        userRateSubmit.disabled = false;
        userRateSubmit.removeAttribute("aria-busy");
      }
    }
  });
}

async function initPage() {
  const app = document.getElementById("trailersApp");
  const denied = document.getElementById("trailersAccessDenied");
  const watchedButton = document.getElementById("trailerMarkWatchedButton");
  const deleteButton = document.getElementById("trailerDeleteButton");

  try {
    if (app) app.hidden = false;
    if (denied) denied.hidden = true;
    setTrailerFormBusy(true);
    setTrailerListsLoading(true);
    setTrailerInfoLoading(true, "Загружаю информацию о фильме...");
    if (watchedButton) watchedButton.disabled = true;
    if (deleteButton) {
      deleteButton.disabled = true;
      deleteButton.hidden = true;
    }

    hasAdminAccess = await verifyAdminAccess();
    updateTrailerAdminUi();

    setupListEvents();
    setupFormEvents();
    setTrailerFormBusy(hasAdminAccess ? false : true);
    await fetchTrailers();
    window.addEventListener("resize", syncTrailerSidebarHeight);
    requestAnimationFrame(syncTrailerSidebarHeight);
  } catch (error) {
    console.error("Trailers page init error", error);
    if (app) app.hidden = false;
    if (denied) denied.hidden = true;
  } finally {
    setTrailerListsLoading(false);
  }
}

document.addEventListener("DOMContentLoaded", initPage);
