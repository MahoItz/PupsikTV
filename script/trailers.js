const TRAILER_API_URL = "/api/trailer-watchlist";
const TRAILER_RATINGS_API_URL = "/api/trailer-ratings";
const BOOSTY_REVIEWS_API_URL = "/api/boosty-reviews";
const KP_API_SELECTION_URL = "/api/kp-api-selection";
const VERIFY_ADMIN_URL = "/api/verify-admin";
const ENV_URL = "/api/env";
const KINOPOISK_ACTORS_API_URL = "/api/kinopoisk-actors";
const KINOPOISK_SEARCH_URL =
  "https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword";
const KINOPOISK_FILM_URL =
  "https://kinopoiskapiunofficial.tech/api/v2.2/films";
const KINOPOISK_STAFF_URL =
  "https://kinopoiskapiunofficial.tech/api/v1/staff";
const YOUTUBE_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;
const TRAILER_PLAYER_FALLBACK_HIDE_DELAY_MS = 1200;
const POSTER_PLACEHOLDER = "/images/placeholder-poster.webp";
const DEFAULT_TRAILER_BOOSTY_CONTENT = {
  profileUrl: "https://boosty.to/papsik",
  title: "Полные разборы трейлеров",
  description:
    "Полные записи стримов с обзорами трейлеров и разбором новинок теперь доступны на Boosty.",
  buttonLabel: "Смотреть на Boosty",
  streamsTitle: "Разборы стримов",
  emptyText:
    "Список сохранённых стримов пока пуст. Когда на Boosty появятся первые разборы, они будут отображаться здесь.",
  streams: [],
};

let kinopoiskApiKey = "";
let selectedKinopoiskApi = "API 1";
let kinopoiskApiKeys = {
  "API 1": "",
  "API 2": "",
  "API 3": "",
};
let trailers = [];
let boostyReviews = [];
let boostyReviewsLoaded = false;
let selectedTrailerId = null;
let kinopoiskRequestId = 0;
let trailerTitleSearchResults = [];
let selectedTrailerSearchMovie = null;
let trailerTitleRequestId = 0;
let isCreatingTrailer = false;
let trailerRatingTooltip = null;
let userRatingTrailerId = null;
let trailerPlayerLoadHideTimer = null;
let trailerPlayerLoadRequestId = 0;
let isSubmittingTrailerUserRating = false;
let isSwitchingKinopoiskApi = false;
let kinopoiskQuotaDialogOpen = false;
let hasAdminAccess = false;
let watchedTrailersSearchQuery = "";
let trailerReleaseDateTrailerId = null;
let trailerReleaseCalendarYear = null;
let trailerReleaseCalendarMonth = null;
let trailerActorTooltip = null;
let trailerSidebarMode = "trailers";
let isCreatingBoostyReview = false;
let boostyReviewPendingDeleteId = null;
let isDeletingBoostyReview = false;
const trailerActorCache = new Map();
const trailerActorPending = new Map();
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

function getRatedTrailerValue(trailerId) {
  const ratedTrailers = getRatedTrailersMap();
  const raw = ratedTrailers[String(trailerId)];
  if (raw === undefined || raw === null || raw === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
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

function getVisibleTrailers() {
  return hasAdminAccess
    ? trailers
    : trailers.filter((item) => item.status === "watched");
}

function getTrailerBoostyContent() {
  const source =
    window.TRAILER_BOOSTY_CONTENT &&
    typeof window.TRAILER_BOOSTY_CONTENT === "object" &&
    !Array.isArray(window.TRAILER_BOOSTY_CONTENT)
      ? window.TRAILER_BOOSTY_CONTENT
      : {};

  const streams = Array.isArray(source.streams)
    ? source.streams
        .map((item) => ({
          title: String(item?.title || "").trim(),
          href: String(item?.href || "").trim(),
          image: String(item?.image || "").trim() || POSTER_PLACEHOLDER,
          meta: String(item?.meta || "").trim(),
        }))
        .filter((item) => item.title && item.href)
    : [];

  return {
    profileUrl: String(source.profileUrl || DEFAULT_TRAILER_BOOSTY_CONTENT.profileUrl).trim(),
    title: String(source.title || DEFAULT_TRAILER_BOOSTY_CONTENT.title).trim(),
    description: String(
      source.description || DEFAULT_TRAILER_BOOSTY_CONTENT.description
    ).trim(),
    buttonLabel: String(
      source.buttonLabel || DEFAULT_TRAILER_BOOSTY_CONTENT.buttonLabel
    ).trim(),
    streamsTitle: String(
      source.streamsTitle || DEFAULT_TRAILER_BOOSTY_CONTENT.streamsTitle
    ).trim(),
    emptyText: String(
      source.emptyText || DEFAULT_TRAILER_BOOSTY_CONTENT.emptyText
    ).trim(),
    streams,
  };
}

function getRenderableBoostyStreams() {
  if (boostyReviewsLoaded) {
    return boostyReviews.map((item) => ({
      id: item?.id,
      title: String(item?.title || "").trim(),
      href: String(item?.url || "").trim(),
      image: String(item?.image || "").trim() || POSTER_PLACEHOLDER,
      meta: String(item?.meta || "").trim(),
    }));
  }

  return getTrailerBoostyContent().streams;
}

function renderBoostyStreamCard(item) {
  const card = document.createElement("div");
  card.className = "trailer-saved-stream-card";

  const link = document.createElement("a");
  link.className = "trailer-saved-stream-card__link";
  link.href = item.href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";

  const image = document.createElement("img");
  image.className = "trailer-saved-stream-card__image";
  image.src = item.image || POSTER_PLACEHOLDER;
  image.alt = item.title;
  image.loading = "lazy";
  image.onerror = () => {
    image.onerror = null;
    image.src = POSTER_PLACEHOLDER;
  };

  const body = document.createElement("div");
  body.className = "trailer-saved-stream-card__body";

  const title = document.createElement("div");
  title.className = "trailer-saved-stream-card__title";
  title.textContent = item.title;
  body.appendChild(title);

  if (item.meta) {
    const meta = document.createElement("div");
    meta.className = "trailer-saved-stream-card__meta";
    meta.innerHTML = '<i class="fa-solid fa-fire" aria-hidden="true"></i>';

    const text = document.createElement("span");
    text.textContent = item.meta;
    meta.appendChild(text);
    body.appendChild(meta);
  }

  if (hasAdminAccess && item?.id) {
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "trailer-saved-stream-card__delete";
    removeButton.dataset.reviewId = String(item.id);
    removeButton.setAttribute("aria-label", "Удалить обзор");
    removeButton.innerHTML = "&times;";
    removeButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openBoostyDeleteModal(item.id, item.title);
    });
    card.appendChild(removeButton);
  }

  link.append(image, body);
  card.appendChild(link);
  return card;
}

function renderTrailerPublicSidebar() {
  const section = document.getElementById("trailerBoostySection");
  const title = document.getElementById("trailerBoostyTitle");
  const description = document.getElementById("trailerBoostyDescription");
  const link = document.getElementById("trailerBoostyLink");
  const streamsTitle = document.getElementById("trailerSavedStreamsTitle");
  const list = document.getElementById("trailerSavedStreamsList");
  const empty = document.getElementById("trailerSavedStreamsEmpty");

  if (!section || !title || !description || !link || !streamsTitle || !list || !empty) {
    return;
  }

  const content = getTrailerBoostyContent();
  const streams = getRenderableBoostyStreams();
  title.textContent = content.title;
  description.textContent = content.description;
  link.href = content.profileUrl || DEFAULT_TRAILER_BOOSTY_CONTENT.profileUrl;
  link.textContent = content.buttonLabel;
  streamsTitle.textContent = content.streamsTitle;

  list.innerHTML = "";
  streams.forEach((item) => list.appendChild(renderBoostyStreamCard(item)));

  list.hidden = streams.length === 0;
  empty.textContent = content.emptyText;
  empty.hidden = streams.length > 0;
}

function setBoostyReviewFormBusy(isBusy) {
  const fields = [
    "boostyReviewTitleInput",
    "boostyReviewUrlInput",
    "boostyReviewImageInput",
    "boostyReviewMetaInput",
  ];

  fields.forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.disabled = Boolean(isBusy);
    }
  });

  const submit = document.getElementById("boostyReviewSubmitButton");
  if (submit) {
    submit.disabled = Boolean(isBusy);
    submit.setAttribute("aria-busy", String(Boolean(isBusy)));
  }
}

function setBoostyDeleteBusy(isBusy) {
  const confirmButton = document.getElementById("boostyDeleteConfirmButton");
  const cancelButton = document.getElementById("boostyDeleteCancelButton");

  if (confirmButton) {
    confirmButton.disabled = Boolean(isBusy);
    confirmButton.setAttribute("aria-busy", String(Boolean(isBusy)));
  }
  if (cancelButton) {
    cancelButton.disabled = Boolean(isBusy);
  }
}

function closeBoostyDeleteModal() {
  const modal = document.getElementById("boostyDeleteModal");
  if (modal) {
    modal.style.display = "none";
  }
  boostyReviewPendingDeleteId = null;
  isDeletingBoostyReview = false;
  setBoostyDeleteBusy(false);
  setStatusText("boostyDeleteStatus", "");
}

function openBoostyDeleteModal(id, title) {
  const modal = document.getElementById("boostyDeleteModal");
  const text = document.getElementById("boostyDeleteModalText");
  if (!modal) return;

  boostyReviewPendingDeleteId = Number(id);
  if (text) {
    text.textContent = title
      ? `Удалить обзор "${title}"? Это действие нельзя отменить.`
      : "Это действие нельзя отменить.";
  }
  setStatusText("boostyDeleteStatus", "");
  setBoostyDeleteBusy(false);
  modal.style.display = "block";
}

function setTrailerSidebarMode(mode) {
  const nextMode = mode === "boosty" ? "boosty" : "trailers";
  trailerSidebarMode = nextMode;

  const trailersTab = document.getElementById("trailerAdminTabTrailers");
  const boostyTab = document.getElementById("trailerAdminTabBoosty");
  const form = document.getElementById("trailerAddForm");
  const plannedSection = document.querySelector(".trailer-list-section--planned");
  const boostySection = document.getElementById("trailerBoostySection");
  const boostyReviewForm = document.getElementById("boostyReviewForm");

  if (trailersTab) {
    trailersTab.classList.toggle("is-active", nextMode === "trailers");
  }
  if (boostyTab) {
    boostyTab.classList.toggle("is-active", nextMode === "boosty");
  }

  if (hasAdminAccess) {
    if (form) {
      form.hidden = nextMode !== "trailers";
    }
    if (plannedSection) {
      plannedSection.hidden = nextMode !== "trailers";
    }
    if (boostySection) {
      boostySection.hidden = nextMode !== "boosty";
    }
    if (boostyReviewForm && nextMode !== "boosty") {
      boostyReviewForm.hidden = true;
      setStatusText("boostyReviewFormStatus", "");
    }
  }

  syncTrailerSidebarHeight();
}

async function fetchBoostyReviews() {
  boostyReviewsLoaded = false;

  try {
    const response = await fetch(BOOSTY_REVIEWS_API_URL, {
      headers: getAdminAuthHeaders(),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || `Failed to load Boosty reviews: ${response.status}`);
    }

    boostyReviews = Array.isArray(payload?.items) ? payload.items : [];
    boostyReviewsLoaded = true;
  } catch (error) {
    console.error("Failed to load Boosty reviews", error);
    boostyReviews = [];
    boostyReviewsLoaded = false;
  }

  renderTrailerPublicSidebar();
}

async function createBoostyReview(payload) {
  const response = await fetch(BOOSTY_REVIEWS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAdminAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || `Failed to create Boosty review: ${response.status}`);
  }

  if (data?.item) {
    boostyReviews = [data.item, ...boostyReviews];
    boostyReviewsLoaded = true;
    renderTrailerPublicSidebar();
  }

  return data?.item || null;
}

async function deleteBoostyReview(id) {
  const response = await fetch(`${BOOSTY_REVIEWS_API_URL}?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getAdminAuthHeaders(),
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.error || `Failed to delete Boosty review: ${response.status}`);
  }

  boostyReviews = boostyReviews.filter((item) => Number(item.id) !== Number(id));
  boostyReviewsLoaded = true;
  renderTrailerPublicSidebar();
}

function normalizeTrailerActorName(name = "") {
  return name.toString().trim().toLowerCase();
}

function isTrailerActorPerson(person) {
  const key = (person?.professionKey || "").toString().toUpperCase();
  if (key === "ACTOR") return true;
  const text = (person?.professionText || person?.profession_text || "")
    .toString()
    .trim()
    .toLowerCase();
  return text.includes("актер") || text.includes("актёр") || text.includes("actor");
}

function normalizeTrailerActorRecord(item, filmId) {
  const normalizedFilmId = Number.parseInt(filmId, 10);
  const staffId = Number.parseInt(item?.staffId ?? item?.staff_id, 10);
  const actorName = String(
    item?.nameRu || item?.nameEn || item?.actor_name || ""
  ).trim();
  const posterUrl = String(item?.posterUrl || item?.poster_url || "").trim();
  const professionText = String(
    item?.professionText || item?.profession_text || ""
  ).trim();

  if (!Number.isFinite(normalizedFilmId) || !Number.isFinite(staffId) || !actorName) {
    return null;
  }

  if (!isTrailerActorPerson(item)) {
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

function primeTrailerActorCache(filmId, staff) {
  const normalizedFilmId = Number.parseInt(filmId, 10);
  if (!Number.isFinite(normalizedFilmId)) {
    return [];
  }

  const items = [];
  const seen = new Set();

  (Array.isArray(staff) ? staff : []).forEach((person) => {
    const row = normalizeTrailerActorRecord(person, normalizedFilmId);
    if (!row) return;
    const key = `${row.kinopoisk_film_id}:${row.staff_id}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(row);
  });

  trailerActorCache.set(String(normalizedFilmId), items);
  return items;
}

function convertStoredActorToTrailerStaff(item) {
  return {
    staffId: item?.staff_id,
    nameRu: item?.actor_name || "",
    nameEn: "",
    posterUrl: item?.poster_url || "",
    professionText: item?.profession_text || "",
    professionKey: "ACTOR",
  };
}

async function loadStoredTrailerActors(filmId, options = {}) {
  const normalizedFilmId = Number.parseInt(filmId, 10);
  if (!Number.isFinite(normalizedFilmId)) {
    return [];
  }

  const cacheKey = String(normalizedFilmId);
  if (!options.force && trailerActorCache.has(cacheKey)) {
    return trailerActorCache.get(cacheKey) || [];
  }
  if (!options.force && trailerActorPending.has(cacheKey)) {
    return trailerActorPending.get(cacheKey);
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
      trailerActorCache.set(cacheKey, items);
      return items;
    })
    .catch((error) => {
      console.error("Failed to load stored trailer actors", error);
      return trailerActorCache.get(cacheKey) || [];
    })
    .finally(() => {
      trailerActorPending.delete(cacheKey);
    });

  trailerActorPending.set(cacheKey, request);
  return request;
}

async function saveTrailerActors(filmId, staff) {
  const normalizedFilmId = Number.parseInt(filmId, 10);
  const token = localStorage.getItem("adminToken") || "";
  const items = primeTrailerActorCache(normalizedFilmId, staff);

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
    trailerActorCache.set(String(normalizedFilmId), savedItems);
    return savedItems;
  } catch (error) {
    console.error("Failed to persist trailer actors", error);
    return items;
  }
}

function ensureTrailerActorTooltip() {
  if (trailerActorTooltip && document.body.contains(trailerActorTooltip)) {
    return trailerActorTooltip;
  }

  const tooltip = document.createElement("div");
  tooltip.className = "actor-photo-tooltip";
  tooltip.hidden = true;

  const image = document.createElement("img");
  image.className = "actor-photo-tooltip__image";
  image.alt = "";

  const textWrap = document.createElement("div");
  textWrap.className = "actor-photo-tooltip__text";

  const title = document.createElement("div");
  title.className = "actor-photo-tooltip__name";

  const subtitle = document.createElement("div");
  subtitle.className = "actor-photo-tooltip__role";

  textWrap.append(title, subtitle);
  tooltip.append(image, textWrap);
  tooltip._image = image;
  tooltip._title = title;
  tooltip._subtitle = subtitle;
  document.body.appendChild(tooltip);
  trailerActorTooltip = tooltip;
  return tooltip;
}

function positionTrailerActorTooltip(event) {
  const tooltip = ensureTrailerActorTooltip();
  const offset = 16;
  const width = tooltip.offsetWidth || 220;
  const height = tooltip.offsetHeight || 84;
  let left = event.clientX + offset;
  let top = event.clientY + offset;

  if (left + width > window.innerWidth - 12) {
    left = event.clientX - width - offset;
  }
  if (top + height > window.innerHeight - 12) {
    top = event.clientY - height - offset;
  }

  tooltip.style.left = `${Math.max(12, left)}px`;
  tooltip.style.top = `${Math.max(12, top)}px`;
}

function showTrailerActorTooltip(event, actor) {
  if (!actor?.poster_url) return;
  const tooltip = ensureTrailerActorTooltip();
  tooltip._image.src = actor.poster_url;
  tooltip._image.alt = actor.actor_name || "";
  tooltip._title.textContent = actor.actor_name || "";
  tooltip._subtitle.textContent = actor.profession_text || "";
  tooltip.hidden = false;
  positionTrailerActorTooltip(event);
}

function hideTrailerActorTooltip() {
  if (!trailerActorTooltip) return;
  trailerActorTooltip.hidden = true;
}

function renderTrailerActors(container, actorNames, filmId) {
  if (!container) return;

  const names = Array.isArray(actorNames)
    ? actorNames.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  if (!names.length) {
    container.textContent = "Список актёров не найден.";
    return;
  }

  container.innerHTML = "";
  const normalizedFilmId = Number.parseInt(filmId, 10);
  const requestKey = Number.isFinite(normalizedFilmId) ? String(normalizedFilmId) : "";
  container.dataset.actorPhotoKey = requestKey;

  names.forEach((name, index) => {
    const actor = document.createElement("span");
    actor.className = "trailer-actor-name";
    actor.dataset.actorName = name;
    actor.textContent = name;
    container.appendChild(actor);
    if (index < names.length - 1) {
      container.appendChild(document.createTextNode(", "));
    }
  });

  if (!Number.isFinite(normalizedFilmId)) {
    return;
  }

  loadStoredTrailerActors(normalizedFilmId).then((items) => {
    if (container.dataset.actorPhotoKey !== requestKey) {
      return;
    }

    const actorMap = new Map(
      (Array.isArray(items) ? items : []).map((item) => [
        normalizeTrailerActorName(item?.actor_name),
        item,
      ])
    );

    container.querySelectorAll(".trailer-actor-name").forEach((actorEl) => {
      const actor = actorMap.get(normalizeTrailerActorName(actorEl.dataset.actorName));
      if (!actor?.poster_url || actorEl.dataset.photoBound === "true") {
        return;
      }

      actorEl.dataset.photoBound = "true";
      actorEl.classList.add("trailer-actor-name--has-photo");
      actorEl.addEventListener("mouseenter", (event) => showTrailerActorTooltip(event, actor));
      actorEl.addEventListener("mousemove", positionTrailerActorTooltip);
      actorEl.addEventListener("mouseleave", hideTrailerActorTooltip);
    });
  });
}

function updateTrailerAdminUi() {
  const page = document.querySelector(".trailer-page");
  const eyebrow = document.getElementById("trailerSectionEyebrow");
  const tabs = document.getElementById("trailerAdminTabs");
  const form = document.getElementById("trailerAddForm");
  const boostySection = document.getElementById("trailerBoostySection");
  const addBoostyReviewButton = document.getElementById("openBoostyReviewFormButton");
  const boostyReviewForm = document.getElementById("boostyReviewForm");
  const watchedButton = document.getElementById("trailerMarkWatchedButton");
  const deleteButton = document.getElementById("trailerDeleteButton");

  if (eyebrow) {
    eyebrow.hidden = hasAdminAccess;
  }

  if (tabs) {
    tabs.hidden = !hasAdminAccess;
  }

  if (page) {
    page.classList.toggle("is-public-view", !hasAdminAccess);
  }

  if (deleteButton) {
    deleteButton.hidden = !hasAdminAccess;
  }

  if (addBoostyReviewButton) {
    addBoostyReviewButton.hidden = !hasAdminAccess;
  }

  if (boostyReviewForm && !hasAdminAccess) {
    boostyReviewForm.hidden = true;
  }

  renderTrailerPublicSidebar();

  if (hasAdminAccess) {
    if (boostySection) {
      boostySection.hidden = false;
    }
    setTrailerSidebarMode(trailerSidebarMode);
  } else {
    if (form) {
      form.hidden = true;
    }
    if (boostySection) {
      boostySection.hidden = false;
    }
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

function formatDateLocal(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isReleaseDateMissing(value) {
  return !value || formatDate(value) === "Дата пока не объявлена";
}

function renderTrailerReleaseValue(element, value) {
  if (!element) return;

  element.textContent = "";
  element.classList.add("trailer-info__description--release");

  const text = document.createElement("span");
  text.textContent = formatDate(value);
  element.appendChild(text);

  if (!hasAdminAccess || !isReleaseDateMissing(value)) {
    return;
  }

  const trailer = getSelectedTrailer();
  if (!trailer) {
    return;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "trailer-release-add-button";
  button.textContent = "Добавить дату";
  button.addEventListener("click", () => openTrailerReleaseDateModal(trailer.id));
  element.appendChild(button);
}

const TRAILER_RELEASE_MONTH_NAMES = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

function renderTrailerReleaseCalendar(selectedDateStr = "") {
  const grid = document.getElementById("trailerReleaseCalendarGrid");
  const label = document.getElementById("trailerReleaseCalendarMonthLabel");
  const input = document.getElementById("trailerReleaseDateInput");

  if (!grid || trailerReleaseCalendarYear === null || trailerReleaseCalendarMonth === null) {
    return;
  }

  const today = new Date();
  const selectedDate = selectedDateStr ? new Date(selectedDateStr) : null;
  const firstDay = new Date(trailerReleaseCalendarYear, trailerReleaseCalendarMonth, 1);
  const daysInMonth = new Date(trailerReleaseCalendarYear, trailerReleaseCalendarMonth + 1, 0).getDate();

  if (label) {
    label.textContent = `${TRAILER_RELEASE_MONTH_NAMES[trailerReleaseCalendarMonth]} ${trailerReleaseCalendarYear}`;
  }

  grid.innerHTML = "";

  ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].forEach((weekday) => {
    const cell = document.createElement("div");
    cell.className = "plan-calendar-weekday";
    cell.textContent = weekday;
    grid.appendChild(cell);
  });

  const firstWeekday = (firstDay.getDay() + 6) % 7;
  for (let i = 0; i < firstWeekday; i += 1) {
    const empty = document.createElement("div");
    empty.className = "plan-calendar-day is-outside";
    grid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "plan-calendar-day";
    cell.textContent = String(day);

    const cellDate = new Date(trailerReleaseCalendarYear, trailerReleaseCalendarMonth, day);
    const cellDateStr = formatDateLocal(cellDate);

    if (
      cellDate.getFullYear() === today.getFullYear() &&
      cellDate.getMonth() === today.getMonth() &&
      cellDate.getDate() === today.getDate()
    ) {
      cell.classList.add("is-today");
    }

    if (selectedDate && formatDateLocal(selectedDate) === cellDateStr) {
      cell.classList.add("is-selected");
    }

    cell.addEventListener("click", () => {
      if (input) {
        input.value = cellDateStr;
      }
      renderTrailerReleaseCalendar(cellDateStr);
    });

    grid.appendChild(cell);
  }
}

function closeTrailerReleaseDateModal() {
  const modal = document.getElementById("trailerReleaseDateModal");
  const submit = document.getElementById("trailerReleaseDateSubmit");

  if (modal) modal.style.display = "none";
  setStatusText("trailerReleaseDateStatus", "");
  if (submit) {
    submit.disabled = false;
    submit.removeAttribute("aria-busy");
  }
  trailerReleaseDateTrailerId = null;
}

function openTrailerReleaseDateModal(trailerId) {
  const trailer = trailers.find((item) => Number(item.id) === Number(trailerId));
  const modal = document.getElementById("trailerReleaseDateModal");
  const title = document.getElementById("trailerReleaseDateTitle");
  const input = document.getElementById("trailerReleaseDateInput");

  if (!trailer || !modal || !title || !input) {
    return;
  }

  const kinopoiskData = parseTrailerKinopoiskData(trailer.kinopoisk_data) || {};
  const initialValue = formatDateLocal(kinopoiskData.releaseDate || "");
  const baseDate = initialValue ? new Date(initialValue) : new Date();

  trailerReleaseDateTrailerId = Number(trailerId);
  trailerReleaseCalendarYear = baseDate.getFullYear();
  trailerReleaseCalendarMonth = baseDate.getMonth();
  title.textContent = trailer.title || "";
  input.value = initialValue;
  setStatusText("trailerReleaseDateStatus", "");
  renderTrailerReleaseCalendar(initialValue);
  modal.style.display = "block";
}

async function saveTrailerReleaseDate() {
  if (!hasAdminAccess || !trailerReleaseDateTrailerId) return;

  const trailer = trailers.find((item) => Number(item.id) === Number(trailerReleaseDateTrailerId));
  const input = document.getElementById("trailerReleaseDateInput");
  const submit = document.getElementById("trailerReleaseDateSubmit");
  const value = String(input?.value || "").trim();

  if (!trailer || !value) {
    setStatusText("trailerReleaseDateStatus", "Сначала выберите дату.", true);
    return;
  }

  const normalizedDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(normalizedDate.getTime())) {
    setStatusText("trailerReleaseDateStatus", "Некорректная дата.", true);
    return;
  }

  if (submit) {
    submit.disabled = true;
    submit.setAttribute("aria-busy", "true");
  }
  setStatusText("trailerReleaseDateStatus", "Сохраняю дату релиза...");

  try {
    const kinopoiskData = parseTrailerKinopoiskData(trailer.kinopoisk_data) || {};
    const updatedTrailer = await patchTrailer(trailer.id, {
      kinopoisk_data: {
        ...kinopoiskData,
        releaseDate: normalizedDate.toISOString(),
      },
      kinopoisk_cached_at: new Date().toISOString(),
    });

    renderStoredKinopoiskInfo(parseTrailerKinopoiskData(updatedTrailer?.kinopoisk_data) || {});
    closeTrailerReleaseDateModal();
  } catch (error) {
    console.error("Failed to save trailer release date", error);
    setStatusText(
      "trailerReleaseDateStatus",
      error?.message || "Не удалось сохранить дату релиза.",
      true
    );
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.removeAttribute("aria-busy");
    }
  }
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
    getVisibleTrailers().find((item) => Number(item.id) === Number(selectedTrailerId)) || null
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

function getTrailerRatingUi(containerId) {
  if (containerId === "trailerUserRateStars") {
    return {
      inputId: "trailerUserRateInput",
      meaningId: "trailerUserRateMeaning",
      meaningTextId: "trailerUserRateMeaningText",
    };
  }

  return {
    inputId: "trailerRatingInput",
    meaningId: "trailerRatingMeaning",
    meaningTextId: "trailerRatingMeaningText",
  };
}

function updateTrailerRatingMeaning(value, containerId = "trailerRatingStars") {
  const ui = getTrailerRatingUi(containerId);
  const meaning = document.getElementById(ui.meaningId);
  const meaningText = document.getElementById(ui.meaningTextId);
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
  const { containerId = "trailerRatingStars", updateInput = true } = options;
  const ui = getTrailerRatingUi(containerId);
  const input = document.getElementById(ui.inputId);

  if (updateInput && input) {
    input.value =
      value === null || value === undefined || value === ""
        ? ""
        : formatTrailerRatingValue(value);
  }
  updateTrailerRatingMeaning(value, containerId);
}

function syncTrailerRatingInputValue(containerId, value) {
  const ui = getTrailerRatingUi(containerId);
  const input = document.getElementById(ui.inputId);
  if (input) {
    input.value = value === null || value === undefined || value === ""
      ? ""
      : String(value).replace(".", ",");
  }
}

function syncTrailerRatingState(containerId, value, options = {}) {
  const { updateInput = true } = options;
  if (updateInput) {
    syncTrailerRatingInputValue(containerId, value);
  }
  syncTrailerRatingPreview(value, { containerId, updateInput: false });
}

function highlightStars(containerId, rating) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const stars = container.querySelectorAll(".rating-star");

  stars.forEach((star) => {
    star.classList.remove("hovered");
    if (star.classList.contains("rating-label")) {
      star.style.backgroundColor = "";
      return;
    }
    star.style.backgroundColor = "rgba(255, 235, 59, 0.3)";
  });

  if (rating === null || rating === undefined || Number.isNaN(Number(rating))) {
    return;
  }

  if (rating === 0) {
    stars[0]?.classList.add("hovered");
  } else if (rating >= 1 && rating <= 10) {
    for (let i = 0; i <= rating; i += 1) {
      stars[i]?.classList.add("hovered");
      if (stars[i] && !stars[i].classList.contains("rating-label")) {
        stars[i].style.backgroundColor = "#ffc107";
      }
    }
  } else if (rating === 11) {
    for (let i = 0; i <= 11; i += 1) {
      stars[i]?.classList.add("hovered");
      if (stars[i] && !stars[i].classList.contains("rating-label")) {
        stars[i].style.backgroundColor = "#ffc107";
      }
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
    syncTrailerRatingInputValue(containerId, hasValue ? rating : null);
  }

  if (containerId === "trailerRatingStars" || containerId === "trailerUserRateStars") {
    syncTrailerRatingPreview(hasValue ? rating : null, { containerId, updateInput: false });
  }

  stars.forEach((star) => {
    star.classList.remove("active");
    if (star.classList.contains("rating-label")) {
      star.style.backgroundColor = "";
    }
  });

  if (!hasValue) {
    return;
  }

  if (rating === 0) {
    stars[0]?.classList.add("active");
  } else if (rating >= 1 && rating <= 10) {
    for (let i = 0; i <= rating; i += 1) {
      stars[i]?.classList.add("active");
    }
  } else if (rating === 11) {
    for (let i = 0; i <= 11; i += 1) {
      stars[i]?.classList.add("active");
    }
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
      container.classList.add("is-hover-previewing");
      const rating = parseInt(this.dataset.rating, 10);
      highlightStars(containerId, rating);
      if (containerId === "trailerRatingStars" || containerId === "trailerUserRateStars") {
        syncTrailerRatingPreview(rating, { containerId });
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
    container.classList.remove("is-hover-previewing");
    highlightStars(containerId, getCurrentRating(containerId));
    if (containerId === "trailerRatingStars" || containerId === "trailerUserRateStars") {
      syncTrailerRatingPreview(getCurrentRating(containerId), { containerId });
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
        if (containerId === "trailerRatingStars" || containerId === "trailerUserRateStars") {
          syncTrailerRatingPreview(null, { containerId, updateInput: false });
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
        if (containerId === "trailerRatingStars" || containerId === "trailerUserRateStars") {
          syncTrailerRatingPreview(value, { containerId, updateInput: false });
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
  const visibleTrailers = getVisibleTrailers();
  if (!visibleTrailers.length) {
    selectedTrailerId = null;
  } else if (!getSelectedTrailer()) {
    selectedTrailerId = visibleTrailers[0].id;
  }
  renderTrailerLists();
  renderSelectedTrailer();
}

function getNextPlannedTrailerSelectionId(currentId) {
  const planned = trailers.filter((item) => item.status !== "watched");
  const currentIndex = planned.findIndex((item) => Number(item.id) === Number(currentId));

  if (currentIndex < 0) {
    return planned[0]?.id || null;
  }

  return planned[currentIndex + 1]?.id || planned[currentIndex - 1]?.id || null;
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
  const plannedSection = document.querySelector(".trailer-list-section--planned");
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
  if (plannedSection) {
    plannedSection.hidden = !hasAdminAccess || trailerSidebarMode !== "trailers";
  }
  if (plannedList) plannedList.hidden = !hasAdminAccess || trailerSidebarMode !== "trailers";
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
  const votes = Math.round(item?.viewer_rating_count ?? 0);
  viewerItem.addEventListener("mouseenter", (event) => {
    showTrailerRatingValueTooltip(event, `Оценок: ${votes}`);
  });
  viewerItem.addEventListener("mousemove", updateTrailerRatingTooltipPosition);
  viewerItem.addEventListener("mouseleave", hideTrailerRatingValueTooltip);

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
  const plannedSection = document.querySelector(".trailer-list-section--planned");
  const plannedLoading = document.getElementById("plannedTrailerLoading");
  const plannedList = document.getElementById("plannedTrailerList");
  const plannedEmpty = document.getElementById("plannedTrailerEmpty");
  const watchedLoading = document.getElementById("watchedTrailersLoading");
  const watchedGrid = document.getElementById("watchedTrailersGrid");
  const watchedEmpty = document.getElementById("watchedTrailersEmpty");

  if (plannedSection) {
    plannedSection.hidden = !hasAdminAccess || trailerSidebarMode !== "trailers";
  }
  if (plannedLoading) {
    plannedLoading.hidden = !isLoading || !hasAdminAccess || trailerSidebarMode !== "trailers";
  }
  if (watchedLoading) watchedLoading.hidden = !isLoading;
  if (plannedList) plannedList.hidden = Boolean(isLoading) || !hasAdminAccess;
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

function clearTrailerPlayerLoadHideTimer() {
  if (trailerPlayerLoadHideTimer) {
    clearTimeout(trailerPlayerLoadHideTimer);
    trailerPlayerLoadHideTimer = null;
  }
}

function setTrailerPlayerPlaceholder(options = {}) {
  const placeholder = document.getElementById("trailerPlayerPlaceholder");
  if (!placeholder) return;

  const {
    hidden = false,
    state = "idle",
    message = ""
  } = options;

  placeholder.hidden = Boolean(hidden);
  placeholder.dataset.state = state;

  const text = placeholder.querySelector("p");
  if (text && message) {
    text.textContent = message;
  }
}

function setTrailerPlayerLoading(isLoading, message) {
  if (isLoading) {
    setTrailerPlayerPlaceholder({
      hidden: false,
      state: "loading",
      message: message || "Загрузка трейлера…"
    });
    return;
  }

  clearTrailerPlayerLoadHideTimer();
  setTrailerPlayerPlaceholder({ hidden: true, state: "ready" });
}

function renderSelectedTrailer() {
  const trailer = getSelectedTrailer();
  const title = document.getElementById("trailerPlayerTitle");
  const frame = document.getElementById("trailerPlayerFrame");
  const placeholder = document.getElementById("trailerPlayerPlaceholder");
  const openYoutube = document.getElementById("trailerOpenYoutube");
  const panelTitle = document.getElementById("trailerRatingPanelTitle");
  const panelDescription = document.getElementById("trailerRatingPanelDescription");
  const ratingInput = document.getElementById("trailerRatingInput");
  const watchedButton = document.getElementById("trailerMarkWatchedButton");
  const deleteButton = document.getElementById("trailerDeleteButton");

  renderTrailerLists();

  if (!trailer) {
    if (title) title.textContent = "Выберите трейлер из списка";
    if (frame) frame.src = "about:blank";
    clearTrailerPlayerLoadHideTimer();
    setTrailerPlayerPlaceholder({
      hidden: false,
      state: "empty",
      message: "Здесь появится YouTube-плеер выбранного трейлера."
    });
    if (openYoutube) {
      openYoutube.href = "#";
      openYoutube.setAttribute("aria-disabled", "true");
    }
    setRatingStars("trailerRatingStars", null);
    updateTrailerRatingMeaning(null);
    if (watchedButton) watchedButton.disabled = true;
    if (panelTitle) panelTitle.textContent = "Оценка";
    if (panelDescription) panelDescription.textContent = "";
    if (deleteButton) deleteButton.disabled = true;
    resetKinopoiskInfo("Выберите трейлер для поиска информации.");
    return;
  }

  if (title) title.textContent = trailer.title || "Без названия";
  trailerPlayerLoadRequestId += 1;
  const requestId = trailerPlayerLoadRequestId;
  setTrailerPlayerLoading(true, "Подключение плеера…");
  if (frame) {
    frame.onload = () => {
      if (requestId !== trailerPlayerLoadRequestId) return;
      setTrailerPlayerLoading(false);
    };
    frame.src = buildYoutubeEmbedUrl(trailer.youtube_video_id);
  }
  clearTrailerPlayerLoadHideTimer();
  trailerPlayerLoadHideTimer = setTimeout(() => {
    if (requestId !== trailerPlayerLoadRequestId) return;
    setTrailerPlayerLoading(false);
  }, TRAILER_PLAYER_FALLBACK_HIDE_DELAY_MS);
  if (openYoutube) {
    openYoutube.href = buildYoutubeWatchUrl(trailer.youtube_video_id);
    openYoutube.setAttribute("aria-disabled", "false");
  }
  const selectedRating = hasAdminAccess
    ? trailer.streamer_rating === null ||
      trailer.streamer_rating === undefined ||
      trailer.streamer_rating === ""
      ? null
      : Number(trailer.streamer_rating)
    : getRatedTrailerValue(trailer.id);
  const normalizedSelectedRating = Number.isFinite(selectedRating) ? selectedRating : null;
  if (panelTitle) {
    panelTitle.textContent = hasAdminAccess ? "Оценка Pupsik_ow" : "Ваша оценка";
  }
  if (panelDescription) {
    panelDescription.textContent = hasAdminAccess
      ? ""
      : hasRatedTrailer(trailer.id)
        ? "Здесь показана ваша оценка. Повторно оценить этот трейлер нельзя."
        : "Здесь вы тоже можете поставить свою зрительскую оценку трейлеру.";
  }
  if (ratingInput) {
    setRatingStars("trailerRatingStars", normalizedSelectedRating);
    highlightStars("trailerRatingStars", normalizedSelectedRating);
    syncTrailerRatingPreview(normalizedSelectedRating);
  }
  if (watchedButton) {
    watchedButton.textContent = hasAdminAccess
      ? "Оценить"
      : hasRatedTrailer(trailer.id)
        ? "Оценено"
        : "Оценить";
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
  const response = await fetch(TRAILER_API_URL, {
    headers: getAdminAuthHeaders(),
  });
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
  const shouldSelectNextPlanned =
    Number(selectedTrailerId) === Number(id) && changes?.status === "watched";
  const nextSelectedId = shouldSelectNextPlanned
    ? getNextPlannedTrailerSelectionId(id)
    : null;

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
  if (shouldSelectNextPlanned) {
    selectedTrailerId = nextSelectedId;
  } else if (!getSelectedTrailer()) {
    selectedTrailerId = trailers[0]?.id || null;
  }
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
  setRatingStars("trailerUserRateStars", null);
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

  setRatingStars("trailerUserRateStars", null);
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
  const storedActors = await loadStoredTrailerActors(filmId);
  if (storedActors.length) {
    return storedActors.map(convertStoredActorToTrailerStaff);
  }

  const data = await fetchKinopoiskJson(
    `${KINOPOISK_STAFF_URL}?filmId=${encodeURIComponent(filmId)}`,
    "Kinopoisk staff"
  );
  const items = Array.isArray(data) ? data : [];
  void saveTrailerActors(filmId, items);
  return items;
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
  renderTrailerActors(actors, actorNames, info?.kinopoiskId);
  renderTrailerReleaseValue(release, info?.releaseDate || "");

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
  renderTrailerActors(actors, actorNames, details?.kinopoiskId);

  const releaseValue =
    details?.premiereRu ||
    details?.premiereWorld ||
    details?.releaseDate ||
    details?.startYear ||
    "";
  renderTrailerReleaseValue(release, releaseValue);

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
  const adminTabs = document.getElementById("trailerAdminTabs");
  const titleInput = document.getElementById("trailerTitleInput");
  const urlInput = document.getElementById("trailerUrlInput");
  const titleResults = document.getElementById("trailerTitleResults");
  const selectedMovieClear = document.getElementById("trailerSelectedMovieClear");
  const openBoostyReviewFormButton = document.getElementById("openBoostyReviewFormButton");
  const boostyReviewForm = document.getElementById("boostyReviewForm");
  const boostyReviewTitleInput = document.getElementById("boostyReviewTitleInput");
  const boostyReviewUrlInput = document.getElementById("boostyReviewUrlInput");
  const boostyReviewImageInput = document.getElementById("boostyReviewImageInput");
  const boostyReviewMetaInput = document.getElementById("boostyReviewMetaInput");
  const boostyDeleteModal = document.getElementById("boostyDeleteModal");
  const boostyDeleteModalClose = document.getElementById("boostyDeleteModalClose");
  const boostyDeleteConfirmButton = document.getElementById("boostyDeleteConfirmButton");
  const boostyDeleteCancelButton = document.getElementById("boostyDeleteCancelButton");
  const ratingInput = document.getElementById("trailerRatingInput");
  const watchedButton = document.getElementById("trailerMarkWatchedButton");
  const deleteButton = document.getElementById("trailerDeleteButton");
  const userRateModal = document.getElementById("trailerUserRateModal");
  const userRateClose = document.getElementById("trailerUserRateClose");
  const userRateSubmit = document.getElementById("trailerUserRateSubmit");
  const userRateInput = document.getElementById("trailerUserRateInput");
  const releaseDateModal = document.getElementById("trailerReleaseDateModal");
  const releaseDateClose = document.getElementById("trailerReleaseDateClose");
  const releaseDateForm = document.getElementById("trailerReleaseDateForm");
  const releaseDatePrev = document.getElementById("trailerReleaseCalendarPrev");
  const releaseDateNext = document.getElementById("trailerReleaseCalendarNext");

  adminTabs?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-sidebar-mode]");
    if (!button || !hasAdminAccess) return;
    setTrailerSidebarMode(button.dataset.sidebarMode);
  });

  openBoostyReviewFormButton?.addEventListener("click", () => {
    if (!hasAdminAccess || !boostyReviewForm) return;
    const nextHidden = !boostyReviewForm.hidden;
    boostyReviewForm.hidden = nextHidden;
    if (!nextHidden) {
      boostyReviewTitleInput?.focus();
    } else {
      setStatusText("boostyReviewFormStatus", "");
    }
  });

  boostyDeleteModalClose?.addEventListener("click", closeBoostyDeleteModal);
  boostyDeleteCancelButton?.addEventListener("click", closeBoostyDeleteModal);
  boostyDeleteModalClose?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    closeBoostyDeleteModal();
  });
  boostyDeleteModal?.addEventListener("click", (event) => {
    if (event.target === boostyDeleteModal && !isDeletingBoostyReview) {
      closeBoostyDeleteModal();
    }
  });
  boostyDeleteConfirmButton?.addEventListener("click", async () => {
    if (!hasAdminAccess || !boostyReviewPendingDeleteId || isDeletingBoostyReview) {
      return;
    }

    isDeletingBoostyReview = true;
    setBoostyDeleteBusy(true);
    setStatusText("boostyDeleteStatus", "Удаляю обзор...");

    try {
      await deleteBoostyReview(boostyReviewPendingDeleteId);
      closeBoostyDeleteModal();
    } catch (error) {
      console.error("Failed to delete Boosty review", error);
      setStatusText(
        "boostyDeleteStatus",
        error?.message || "Не удалось удалить обзор.",
        true
      );
      isDeletingBoostyReview = false;
      setBoostyDeleteBusy(false);
    }
  });

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

  boostyReviewForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!hasAdminAccess || isCreatingBoostyReview) {
      return;
    }

    const title = String(boostyReviewTitleInput?.value || "").trim();
    const url = String(boostyReviewUrlInput?.value || "").trim();
    const image = String(boostyReviewImageInput?.value || "").trim();
    const meta = String(boostyReviewMetaInput?.value || "").trim();

    if (!title) {
      setStatusText("boostyReviewFormStatus", "Укажите название обзора.", true);
      return;
    }

    if (!url) {
      setStatusText("boostyReviewFormStatus", "Укажите ссылку на Boosty.", true);
      return;
    }

    setStatusText("boostyReviewFormStatus", "Сохраняю обзор...");
    isCreatingBoostyReview = true;
    setBoostyReviewFormBusy(true);

    try {
      await createBoostyReview({
        title,
        url,
        image,
        meta,
      });

      boostyReviewForm.reset();
      setStatusText("boostyReviewFormStatus", "Обзор добавлен.");
      boostyReviewTitleInput?.focus();
    } catch (error) {
      console.error("Failed to create Boosty review", error);
      setStatusText(
        "boostyReviewFormStatus",
        error?.message || "Не удалось добавить обзор.",
        true
      );
    } finally {
      isCreatingBoostyReview = false;
      setBoostyReviewFormBusy(false);
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
  setRatingStars("trailerUserRateStars", null);

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

  releaseDateClose?.addEventListener("click", closeTrailerReleaseDateModal);
  releaseDateClose?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    closeTrailerReleaseDateModal();
  });

  releaseDateModal?.addEventListener("click", (event) => {
    if (event.target === releaseDateModal) {
      closeTrailerReleaseDateModal();
    }
  });

  releaseDatePrev?.addEventListener("click", () => {
    if (trailerReleaseCalendarYear === null || trailerReleaseCalendarMonth === null) return;
    trailerReleaseCalendarMonth -= 1;
    if (trailerReleaseCalendarMonth < 0) {
      trailerReleaseCalendarMonth = 11;
      trailerReleaseCalendarYear -= 1;
    }
    renderTrailerReleaseCalendar(document.getElementById("trailerReleaseDateInput")?.value || "");
  });

  releaseDateNext?.addEventListener("click", () => {
    if (trailerReleaseCalendarYear === null || trailerReleaseCalendarMonth === null) return;
    trailerReleaseCalendarMonth += 1;
    if (trailerReleaseCalendarMonth > 11) {
      trailerReleaseCalendarMonth = 0;
      trailerReleaseCalendarYear += 1;
    }
    renderTrailerReleaseCalendar(document.getElementById("trailerReleaseDateInput")?.value || "");
  });

  releaseDateForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveTrailerReleaseDate();
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
    renderTrailerPublicSidebar();
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
    await fetchBoostyReviews();
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
