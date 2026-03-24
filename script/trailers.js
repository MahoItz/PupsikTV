const TRAILER_API_URL = "/api/trailer-watchlist";
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
let trailers = [];
let selectedTrailerId = null;
let kinopoiskRequestId = 0;
let trailerTitleSearchResults = [];
let selectedTrailerSearchMovie = null;
let trailerTitleRequestId = 0;

function getAdminAuthHeaders() {
  const token = localStorage.getItem("adminToken") || "";
  return token ? { Authorization: `Bearer ${token}` } : {};
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
  kinopoiskApiKey =
    env.KINOPOISK_API_KEY || env.KINOPOISK_API_KEY2 || env.KINOPOISK_API_KEY3 || "";
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
    ? `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?rel=0`
    : "about:blank";
}

function buildYoutubeWatchUrl(videoId) {
  return videoId
    ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
    : "#";
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
  poster.src = item.poster || POSTER_PLACEHOLDER;
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
      ? `Оценка: ${item.streamer_rating}/10`
      : "Ещё не оценён";

  body.append(title, meta, rating);

  const badge = document.createElement("span");
  badge.className = "trailer-item__badge";
  if (item.status === "watched") {
    badge.classList.add("trailer-item__badge--watched");
    badge.textContent = item.streamer_rating ? `${item.streamer_rating}/10` : "OK";
  } else {
    badge.textContent = "План";
  }

  button.append(poster, body, badge);
  return button;
}

function renderTrailerLists() {
  const plannedList = document.getElementById("plannedTrailerList");
  const watchedList = document.getElementById("watchedTrailerList");
  const plannedEmpty = document.getElementById("plannedTrailerEmpty");
  const watchedEmpty = document.getElementById("watchedTrailerEmpty");
  const plannedCount = document.getElementById("plannedCount");
  const watchedCount = document.getElementById("watchedCount");

  if (!plannedList || !watchedList) return;

  const planned = trailers.filter((item) => item.status !== "watched");
  const watched = trailers.filter((item) => item.status === "watched");

  plannedList.innerHTML = "";
  watchedList.innerHTML = "";

  planned.forEach((item) => plannedList.appendChild(renderTrailerItem(item)));
  watched.forEach((item) => watchedList.appendChild(renderTrailerItem(item)));

  if (plannedEmpty) plannedEmpty.hidden = planned.length > 0;
  if (watchedEmpty) watchedEmpty.hidden = watched.length > 0;
  if (plannedCount) plannedCount.textContent = String(planned.length);
  if (watchedCount) watchedCount.textContent = String(watched.length);
}

function toggleInfoVisibility(hasContent) {
  const empty = document.getElementById("trailerInfoEmpty");
  const content = document.getElementById("trailerInfoContent");
  if (empty) empty.hidden = Boolean(hasContent);
  if (content) content.hidden = !hasContent;
}

function resetKinopoiskInfo(message) {
  toggleInfoVisibility(false);
  const matches = document.getElementById("trailerKinopoiskMatches");
  const link = document.getElementById("trailerKinopoiskLink");
  if (matches) matches.innerHTML = "";
  if (link) {
    link.hidden = true;
    link.href = "#";
  }
  setStatusText(
    "trailerKinopoiskStatus",
    message || "Выберите трейлер для поиска информации."
  );
}

function renderSelectedTrailer() {
  const trailer = getSelectedTrailer();
  const title = document.getElementById("trailerPlayerTitle");
  const frame = document.getElementById("trailerPlayerFrame");
  const placeholder = document.getElementById("trailerPlayerPlaceholder");
  const openYoutube = document.getElementById("trailerOpenYoutube");
  const ratingSelect = document.getElementById("trailerRatingSelect");
  const watchedButton = document.getElementById("trailerMarkWatchedButton");
  const returnButton = document.getElementById("trailerReturnPlannedButton");
  const deleteButton = document.getElementById("trailerDeleteButton");

  renderTrailerLists();

  if (!trailer) {
    if (title) title.textContent = "Выберите трейлер из списка";
    if (frame) frame.src = "about:blank";
    if (placeholder) placeholder.hidden = false;
    if (openYoutube) {
      openYoutube.href = "#";
      openYoutube.setAttribute("aria-disabled", "true");
    }
    if (ratingSelect) ratingSelect.value = "";
    if (watchedButton) watchedButton.disabled = true;
    if (returnButton) returnButton.disabled = true;
    if (deleteButton) deleteButton.disabled = true;
    resetKinopoiskInfo("Выберите трейлер для поиска информации.");
    return;
  }

  if (title) title.textContent = trailer.title || "Без названия";
  if (frame) frame.src = buildYoutubeEmbedUrl(trailer.youtube_video_id);
  if (placeholder) placeholder.hidden = false;
  if (frame) {
    frame.onload = () => {
      if (placeholder) placeholder.hidden = true;
    };
  }
  if (openYoutube) {
    openYoutube.href = buildYoutubeWatchUrl(trailer.youtube_video_id);
    openYoutube.setAttribute("aria-disabled", "false");
  }
  if (ratingSelect) {
    ratingSelect.value =
      trailer.streamer_rating === null || trailer.streamer_rating === undefined
        ? ""
        : String(trailer.streamer_rating).replace(/\.0$/, "");
  }
  if (watchedButton) watchedButton.disabled = false;
  if (returnButton) returnButton.disabled = false;
  if (deleteButton) deleteButton.disabled = false;

  setStatusText("trailerActionStatus", "");
  loadKinopoiskInfo(trailer);
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

async function searchKinopoiskByTitle(query) {
  const response = await fetch(
    `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(query)}&page=1`,
    {
      headers: {
        "X-API-KEY": kinopoiskApiKey,
        "Content-Type": "application/json",
      },
    }
  );
  if (!response.ok) {
    throw new Error(`Kinopoisk search failed: ${response.status}`);
  }
  const data = await response.json();
  return Array.isArray(data?.films) ? data.films : [];
}

function setTrailerTitleResultsVisible(isVisible) {
  const container = document.getElementById("trailerTitleResultsContainer");
  if (!container) return;
  container.style.display = isVisible ? "block" : "none";
}

function clearTrailerTitleSearch() {
  trailerTitleSearchResults = [];
  selectedTrailerSearchMovie = null;
  const list = document.getElementById("trailerTitleResults");
  if (list) list.innerHTML = "";
  setTrailerTitleResultsVisible(false);
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
  const response = await fetch(`${KINOPOISK_FILM_URL}/${encodeURIComponent(filmId)}`, {
    headers: {
      "X-API-KEY": kinopoiskApiKey,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Kinopoisk details failed: ${response.status}`);
  }
  return response.json();
}

async function fetchKinopoiskStaff(filmId) {
  const response = await fetch(
    `${KINOPOISK_STAFF_URL}?filmId=${encodeURIComponent(filmId)}`,
    {
      headers: {
        "X-API-KEY": kinopoiskApiKey,
        "Content-Type": "application/json",
      },
    }
  );
  if (!response.ok) {
    throw new Error(`Kinopoisk staff failed: ${response.status}`);
  }
  const data = await response.json();
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

  poster.src = details?.posterUrl || details?.posterUrlPreview || POSTER_PLACEHOLDER;
  poster.alt = resolvedTitle ? `Постер: ${resolvedTitle}` : "Постер фильма";
  poster.onerror = () => {
    poster.onerror = null;
    poster.src = POSTER_PLACEHOLDER;
  };

  kpLink.href =
    details?.webUrl ||
    (details?.kinopoiskId
      ? `https://www.kinopoisk.ru/film/${details.kinopoiskId}/`
      : "#");
  kpLink.hidden = !kpLink.href || kpLink.href === "#";

  toggleInfoVisibility(true);
}

async function applyKinopoiskSelection(trailer, filmId, searchResults) {
  const requestId = ++kinopoiskRequestId;
  setStatusText("trailerKinopoiskStatus", "Загружаю данные Кинопоиска...");
  renderKinopoiskMatches(searchResults || []);

  try {
    const [details, staff] = await Promise.all([
      fetchKinopoiskDetails(filmId),
      fetchKinopoiskStaff(filmId),
    ]);

    if (requestId !== kinopoiskRequestId) return;

    renderKinopoiskInfo(details, staff);
    setStatusText("trailerKinopoiskStatus", "Информация загружена.");

    const nextYear = Number.parseInt(details?.year, 10);
    const nextPoster = details?.posterUrlPreview || details?.posterUrl || "";
    const normalizedYear = Number.isFinite(nextYear) ? nextYear : trailer.year || null;
    const normalizedPoster = nextPoster || trailer.poster || null;
    const needsPatch =
      Number(trailer.kinopoisk_id || 0) !== Number(filmId) ||
      Number(trailer.year || 0) !== Number(normalizedYear || 0) ||
      String(trailer.poster || "") !== String(normalizedPoster || "");

    if (needsPatch) {
      await patchTrailer(trailer.id, {
        kinopoisk_id: filmId,
        year: normalizedYear,
        poster: normalizedPoster,
      });
    }
  } catch (error) {
    if (requestId !== kinopoiskRequestId) return;
    console.error("Failed to apply Kinopoisk selection", error);
    resetKinopoiskInfo("Не удалось загрузить информацию Кинопоиска.");
  }
}

async function loadKinopoiskInfo(trailer) {
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
    const searchResults = await searchKinopoiskByTitle(trailer.title);
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

function setupListEvents() {
  const clickHandler = (event) => {
    const item = event.target.closest(".trailer-item");
    if (!item) return;
    selectedTrailerId = Number(item.dataset.id);
    renderSelectedTrailer();
  };

  document
    .getElementById("plannedTrailerList")
    ?.addEventListener("click", clickHandler);
  document
    .getElementById("watchedTrailerList")
    ?.addEventListener("click", clickHandler);

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
  const ratingSelect = document.getElementById("trailerRatingSelect");
  const watchedButton = document.getElementById("trailerMarkWatchedButton");
  const returnButton = document.getElementById("trailerReturnPlannedButton");
  const deleteButton = document.getElementById("trailerDeleteButton");

  titleInput?.addEventListener("input", () => {
    const nextValue = String(titleInput.value || "").trim();
    const selectedTitle = selectedTrailerSearchMovie?.nameRu || selectedTrailerSearchMovie?.nameEn || "";
    if (selectedTitle && nextValue !== selectedTitle) {
      selectedTrailerSearchMovie = null;
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

    try {
      await createTrailer({
        title: selectedTrailerSearchMovie?.nameRu || selectedTrailerSearchMovie?.nameEn || title,
        youtube_url: youtubeUrl,
        youtube_video_id: videoId,
        kinopoisk_id: selectedTrailerSearchMovie?.filmId || null,
        year: selectedTrailerSearchMovie?.year || null,
        poster:
          selectedTrailerSearchMovie?.posterUrlPreview ||
          selectedTrailerSearchMovie?.posterUrl ||
          null,
      });
      form.reset();
      clearTrailerTitleSearch();
      setStatusText("trailerFormStatus", "Трейлер добавлен.");
    } catch (error) {
      console.error("Failed to add trailer", error);
      setStatusText(
        "trailerFormStatus",
        error?.message || "Не удалось добавить трейлер.",
        true
      );
    }
  });

  watchedButton?.addEventListener("click", async () => {
    const trailer = getSelectedTrailer();
    if (!trailer) return;

    const rating = ratingSelect?.value || "";
    if (!rating) {
      setStatusText("trailerActionStatus", "Сначала выберите оценку.", true);
      return;
    }

    setStatusText("trailerActionStatus", "Сохраняю оценку...");
    try {
      await patchTrailer(trailer.id, {
        status: "watched",
        streamer_rating: Number(rating),
        watched_at: new Date().toISOString(),
      });
      setStatusText(
        "trailerActionStatus",
        "Оценка сохранена, трейлер перемещён в просмотренные."
      );
    } catch (error) {
      console.error("Failed to save rating", error);
      setStatusText(
        "trailerActionStatus",
        error?.message || "Не удалось сохранить оценку.",
        true
      );
    }
  });

  returnButton?.addEventListener("click", async () => {
    const trailer = getSelectedTrailer();
    if (!trailer) return;

    setStatusText("trailerActionStatus", "Возвращаю трейлер в план...");
    try {
      await patchTrailer(trailer.id, {
        status: "planned",
        watched_at: null,
      });
      setStatusText("trailerActionStatus", "Трейлер снова в запланированном списке.");
    } catch (error) {
      console.error("Failed to return trailer to planned", error);
      setStatusText(
        "trailerActionStatus",
        error?.message || "Не удалось вернуть трейлер в план.",
        true
      );
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
}

async function initPage() {
  const app = document.getElementById("trailersApp");
  const denied = document.getElementById("trailersAccessDenied");

  try {
    const hasAccess = await verifyAdminAccess();
    if (!hasAccess) {
      if (denied) denied.hidden = false;
      return;
    }

    if (app) app.hidden = false;
    if (denied) denied.hidden = true;

    setupListEvents();
    setupFormEvents();
    await fetchTrailers();
  } catch (error) {
    console.error("Trailers page init error", error);
    if (denied) denied.hidden = false;
  }
}

document.addEventListener("DOMContentLoaded", initPage);
