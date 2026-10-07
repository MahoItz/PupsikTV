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
    img.src = "images/sort_arrow.webp";
    img.alt = "";
    img.className = "sort-arrow";
    if (sortAscending) {
      img.classList.add("is-desc");
    }

    orderBtn.replaceChildren(img);
  }
  currentPage = 1;
  renderMovies();
}

// Модальные окна

let duplicateModalAction = null;

function resetDuplicateModalState() {
  const messageEl = document.getElementById("duplicateModalMessage");
  const actionsEl = document.getElementById("duplicateModalActions");
  const actionBtn = document.getElementById("duplicateModalActionBtn");
  if (messageEl) {
    messageEl.textContent = "Такой фильм уже есть в списке.";
  }
  if (actionsEl) {
    actionsEl.style.display = "none";
  }
  if (actionBtn) {
    actionBtn.textContent = "Удалить";
    actionBtn.disabled = false;
  }
  duplicateModalAction = null;
}

function showDuplicateModal(message = "Такой фильм уже есть в списке.", options = {}) {
  const messageEl = document.getElementById("duplicateModalMessage");
  const actionsEl = document.getElementById("duplicateModalActions");
  const actionBtn = document.getElementById("duplicateModalActionBtn");
  const closeBtn = document.getElementById("duplicateModalCloseBtn");

  if (messageEl) {
    messageEl.textContent = message;
  }

  duplicateModalAction =
    typeof options.onAction === "function" ? options.onAction : null;

  if (actionsEl && actionBtn && duplicateModalAction) {
    actionsEl.style.display = "flex";
    actionBtn.textContent = options.actionLabel || "Удалить";
    actionBtn.disabled = false;
  } else if (actionsEl) {
    actionsEl.style.display = "none";
  }

  if (closeBtn && !closeBtn.dataset.bound) {
    closeBtn.dataset.bound = "true";
    closeBtn.addEventListener("click", () => closeModal("duplicateModal"));
  }

  if (actionBtn && !actionBtn.dataset.bound) {
    actionBtn.dataset.bound = "true";
    actionBtn.addEventListener("click", async () => {
      if (!duplicateModalAction) return;
      actionBtn.disabled = true;
      try {
        await duplicateModalAction();
      } finally {
        actionBtn.disabled = false;
      }
    });
  }

  document.getElementById("duplicateModal").style.display = "block";
}

function showSearchReminderModal() {
  document.getElementById("searchReminderModal").style.display = "block";
}

function openUserRateModal(id) {
  const movie = allMovies.find((m) => m.id === id);
  if (hasRatedMovie(movie || id)) {
    alert("Вы уже оценили этот фильм");
    return;
  }
  userRatingMovieId = id;
  if (movie) {
    document.getElementById("userRateMovieTitle").textContent = movie.title;
    document.getElementById("userRateMoviePoster").src = movie.poster;
    setRatingStars("userRateStars", null);
  }
  document.getElementById("userRateModal").style.display = "block";
  setupRatingStars("userRateStars");
}

function openUserRateGameModal(id) {
  if (hasRatedGame(id)) {
    alert("Вы уже оценили эту игру");
    return;
  }
  userRatingGameId = id;
  const game = allPlayedGames.find((g) => g.id === id);
  if (game) {
    const titleEl = document.getElementById("userRateGameTitle");
    if (titleEl) titleEl.textContent = game.title;
    const posterEl = document.getElementById("userRateGamePoster");
    if (posterEl) posterEl.src = game.poster;
    setRatingStars("userRateGameStars", null);
  }
  const modal = document.getElementById("userRateGameModal");
  if (modal) modal.style.display = "block";
  setupRatingStars("userRateGameStars");
}

function formatMovieDetailsValue(value, fallback = "—") {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string" && value.trim() === "") return fallback;
  if (value === "null") return fallback;
  return String(value);
}

function setMovieDetailsText(id, value, fallback = "—") {
  const el = document.getElementById(id);
  if (!el) return;
  const text = formatMovieDetailsValue(value, fallback);
  el.textContent = text;
  el.classList.toggle("movie-details-muted", text === fallback);
}

function openUserRateModal(id) {
  const movie = allMovies.find((m) => m.id === id);
  const existingRating = getRatedMovieValue(movie || id);
  userRatingMovieId = id;

  if (movie) {
    document.getElementById("userRateMovieTitle").textContent = movie.title;
    document.getElementById("userRateMoviePoster").src = movie.poster;
  }

  const modal = document.getElementById("userRateModal");
  const submitButton = document.getElementById("userRateSubmitButton");
  const status = document.getElementById("userRateStatus");
  if (submitButton) {
    submitButton.textContent =
      existingRating !== undefined ? "Изменить" : "Оценить";
    submitButton.disabled = false;
    submitButton.removeAttribute("aria-busy");
  }
  if (status) {
    status.textContent = "";
    status.style.color = "";
  }
  if (modal) modal.style.display = "block";

  setupRatingStars("userRateStars");
  setRatingStars(
    "userRateStars",
    existingRating !== undefined ? Number(existingRating) : null
  );
}

function openUserRateGameModal(id) {
  const rawExistingRating = ratedGames[String(id)];
  const existingRating =
    rawExistingRating === undefined ? null : Number(rawExistingRating);

  userRatingGameId = id;
  const game = allPlayedGames.find((g) => g.id === id);
  if (game) {
    const titleEl = document.getElementById("userRateGameTitle");
    if (titleEl) titleEl.textContent = game.title;
    const posterEl = document.getElementById("userRateGamePoster");
    if (posterEl) posterEl.src = game.poster;
  }

  const modal = document.getElementById("userRateGameModal");
  const submitButton = document.getElementById("userRateGameSubmitButton");
  const status = document.getElementById("userRateGameStatus");
  if (submitButton) {
    submitButton.textContent =
      existingRating !== null ? "Изменить" : "Оценить";
    submitButton.disabled = false;
    submitButton.removeAttribute("aria-busy");
  }
  if (status) {
    status.textContent = "";
    status.style.color = "";
  }
  if (modal) modal.style.display = "block";

  setupRatingStars("userRateGameStars");
  setRatingStars("userRateGameStars", existingRating);
}

function normalizeActorsList(value, limit = 15) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (item || "").toString().trim())
      .filter(Boolean)
      .slice(0, limit);
  }
  if (typeof value === "string") {
    return value
      .split(/[,;|]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, limit);
  }
  return [];
}

let actorPhotoTooltip = null;

function normalizeActorLookupName(name = "") {
  return name.toString().trim().toLowerCase();
}

function ensureActorPhotoTooltip() {
  if (actorPhotoTooltip && document.body.contains(actorPhotoTooltip)) {
    return actorPhotoTooltip;
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
  actorPhotoTooltip = tooltip;
  return tooltip;
}

function positionActorPhotoTooltip(event) {
  const tooltip = ensureActorPhotoTooltip();
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

function showActorPhotoTooltip(event, actor) {
  if (!actor?.poster_url) return;
  const tooltip = ensureActorPhotoTooltip();
  tooltip._image.src = actor.poster_url;
  tooltip._image.alt = actor.actor_name || "";
  tooltip._title.textContent = actor.actor_name || "";
  tooltip._subtitle.textContent = actor.profession_text || "";
  tooltip.hidden = false;
  positionActorPhotoTooltip(event);
}

function hideActorPhotoTooltip() {
  if (!actorPhotoTooltip) return;
  actorPhotoTooltip.hidden = true;
}

function enhanceActorsListWithPhotos(listEl, filmId) {
  const normalizedFilmId = Number.parseInt(filmId, 10);
  if (!listEl || listEl.tagName === "SELECT") {
    return;
  }

  const actorItems = Array.from(listEl.querySelectorAll("[data-actor-name]"));
  if (!Number.isFinite(normalizedFilmId) || !actorItems.length) {
    return;
  }

  const requestKey = `${listEl.id || "actors"}:${normalizedFilmId}`;
  listEl.dataset.actorPhotoKey = requestKey;

  if (typeof loadStoredKinopoiskActors !== "function") {
    return;
  }

  loadStoredKinopoiskActors(normalizedFilmId).then((items) => {
    if (listEl.dataset.actorPhotoKey !== requestKey) {
      return;
    }

    const actorMap = new Map(
      (Array.isArray(items) ? items : []).map((item) => [
        normalizeActorLookupName(item?.actor_name),
        item,
      ])
    );

    actorItems.forEach((actorEl) => {
      const actor = actorMap.get(normalizeActorLookupName(actorEl.dataset.actorName));
      if (!actor?.poster_url || actorEl.dataset.photoBound === "true") {
        return;
      }

      actorEl.dataset.photoBound = "true";
      actorEl.classList.add("actor-name--has-photo");
      actorEl.addEventListener("mouseenter", (event) => showActorPhotoTooltip(event, actor));
      actorEl.addEventListener("mousemove", positionActorPhotoTooltip);
      actorEl.addEventListener("mouseleave", hideActorPhotoTooltip);
    });
  });
}

function renderActorsList(listId, sectionId, actorsValue, options = {}) {
  const listEl = document.getElementById(listId);
  const sectionEl = document.getElementById(sectionId);
  if (!listEl || !sectionEl) {
    return;
  }

  const actors = normalizeActorsList(actorsValue);
  listEl.innerHTML = "";

  if (actors.length === 0) {
    sectionEl.style.display = "none";
    return;
  }

  if (listEl.tagName === "SELECT") {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Выберите актера";
    placeholder.disabled = true;
    placeholder.selected = true;
    listEl.appendChild(placeholder);

    actors.forEach((actor) => {
      const option = document.createElement("option");
      option.value = actor;
      option.textContent = actor;
      listEl.appendChild(option);
    });
  } else {
    actors.forEach((actor) => {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "actor-name";
      name.dataset.actorName = actor;
      name.textContent = actor;
      li.appendChild(name);
      listEl.appendChild(li);
    });
  }

  sectionEl.style.display = "block";
  enhanceActorsListWithPhotos(listEl, options?.filmId);
}

// ====================== Студии ======================

const MOVIE_DETAILS_SPECIAL_STUDIOS = [
  { keyword: "netflix", className: "netflix", label: "Netflix" },
  { keyword: "warner bros. pictures", className: "warner", label: "Warner Bros. Pictures" },
  { keyword: "warner", className: "warner", label: "Warner Bros" },
  { keyword: "disney company", className: "disney", label: "Disney Company" },
  { keyword: "disney", className: "disney", label: "Disney" },
];

function normalizeMovieStudioName(name = "") {
  return name.toString().trim();
}

function getMovieSpecialStudioClass(studioName = "") {
  const normalized = studioName.toLowerCase();
  const match = MOVIE_DETAILS_SPECIAL_STUDIOS.find(({ keyword }) =>
    normalized.includes(keyword)
  );
  return match ? match.className : null;
}

function createMovieStudioBadge(studioName) {
  const badge = document.createElement("span");
  badge.className = "fortune-studio-badge";
  badge.textContent = normalizeMovieStudioName(studioName) || "-";

  const specialClass = getMovieSpecialStudioClass(studioName);
  if (specialClass) {
    badge.classList.add(`fortune-studio-badge--${specialClass}`);
  }

  return badge;
}

function parseMovieStudiosData(studiosRaw) {
  if (!studiosRaw) return null;

  if (typeof studiosRaw === "object" && !Array.isArray(studiosRaw)) {
    return studiosRaw;
  }

  if (typeof studiosRaw === "string") {
    try {
      const parsed = JSON.parse(studiosRaw);
      if (typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
      if (Array.isArray(parsed)) {
        return { studios: parsed, homepage: "" };
      }
    } catch (e) {
      const studios = studiosRaw.split(",").map((s) => s.trim()).filter(Boolean);
      return studios.length > 0 ? { studios, homepage: "" } : null;
    }
  }

  return null;
}

function ensureMovieStudiosSection(modal) {
  if (!modal) return null;

  let section = modal.querySelector(".movie-details-studios-section");
  if (section) return section;

  section = document.createElement("div");
  section.className = "movie-details-meta-item movie-details-studios-section";

  const label = document.createElement("span");
  label.className = "movie-details-meta-label";
  label.textContent = "Студии";

  const content = document.createElement("div");
  content.className = "movie-details-studios-content";

  const status = document.createElement("span");
  status.className = "movie-details-studios-status";
  status.textContent = "";

  const badges = document.createElement("div");
  badges.className = "movie-details-studios-badges";

  content.append(status, badges);
  section.append(label, content);

  return section;
}

function insertMovieStudiosSection(modal, section) {
  if (!modal || !section) return;

  const meta = modal.querySelector(".movie-details-meta");
  if (!meta) return;

  let directorItem = meta.querySelector("#movieDetailsDirector")?.closest(".movie-details-meta-item");
  
  if (!directorItem) {
    directorItem = meta.querySelector("#orderDetailsDirector")?.closest(".movie-details-meta-item");
  }

  if (directorItem && directorItem.parentElement === meta) {
    meta.insertBefore(section, directorItem.nextSibling);
  } else {
    meta.appendChild(section);
  }
}

function setMovieStudiosStatus(section, message) {
  if (!section) return;
  const statusEl = section.querySelector(".movie-details-studios-status");
  if (statusEl) {
    statusEl.textContent = message;
  }
}

function renderMovieStudios(section, studiosData) {
  if (!section) return;

  const badgesEl = section.querySelector(".movie-details-studios-badges");
  const statusEl = section.querySelector(".movie-details-studios-status");

  if (!studiosData || !Array.isArray(studiosData.studios) || studiosData.studios.length === 0) {
    if (badgesEl) badgesEl.innerHTML = "";
    if (statusEl) statusEl.textContent = "Нет данных";
    return;
  }

  if (statusEl) statusEl.textContent = "";
  if (badgesEl) {
    badgesEl.innerHTML = "";
    studiosData.studios.forEach((studio) => {
      badgesEl.appendChild(createMovieStudioBadge(studio));
    });
  }
}

let movieStudiosRequestId = 0;
const movieStudiosLoadCache = new Map();

async function searchKinopoiskByTitleYear(title, year) {
  if (!title || !KINOPOISK_API_KEY) return null;

  const keyword = year ? `${title} ${year}` : title;
  try {
    const response = await fetch(
      `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(keyword)}`,
      {
        headers: {
          "X-API-KEY": KINOPOISK_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      await handleKinopoiskErrorResponse(response);
      return null;
    }

    const data = await response.json();
    const films = data?.films || [];

    if (films.length === 0) return null;

    if (year) {
      const yearNum = parseInt(year, 10);
      const exactMatch = films.find((f) => {
        const filmYear = parseInt(f.year, 10);
        return filmYear === yearNum;
      });
      if (exactMatch) return exactMatch;
    }

    return films[0];
  } catch (err) {
    console.error("Failed to search Kinopoisk by title", err);
    return null;
  }
}

async function fetchImdbIdFromKinopoiskFilm(kinopoiskId) {
  if (!kinopoiskId || !KINOPOISK_API_KEY) return null;

  try {
    const response = await fetch(
      `${KINOPOISK_FILM_URL}/${encodeURIComponent(kinopoiskId)}`,
      {
        headers: {
          "X-API-KEY": KINOPOISK_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      await handleKinopoiskErrorResponse(response);
      return null;
    }

    const data = await response.json();
    return data?.imdbId || null;
  } catch (err) {
    console.error("Failed to fetch IMDb ID from Kinopoisk", err);
    return null;
  }
}

async function fetchStudiosFromTmdb(imdbId) {
  if (!imdbId || !TMDB_ENABLED) return null;

  try {
    const params = new URLSearchParams({ imdbId });
    params.set("provider", "tmdb");
    const tmdbUrl = `${buildApiPath("/external")}?${params.toString()}`;
    const response = await fetch(tmdbUrl);

    if (!response.ok) {
      throw new Error(`TMDB request failed: ${response.status}`);
    }

    const payload = await response.json();

    if (payload?.details?.production_companies) {
      const studios = payload.details.production_companies
        .map((c) => c?.name)
        .filter(Boolean);
      const homepage = payload.details.homepage || "";
      return { studios, homepage };
    }

    return null;
  } catch (err) {
    console.error("Failed to fetch studios from TMDB", err);
    return null;
  }
}

async function saveStudiosToDb(id, studiosData, tableName = "movies") {
  if (!id || !studiosData) return;

  try {
    const studiosJson = JSON.stringify(studiosData);
    const token = localStorage.getItem("adminToken") || "";
    const response = await fetch(window.Pupsik.apiUrl("/api/admin?action=media-items"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "update_item",
        table: tableName,
        id,
        changes: { studios: studiosJson },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error(
        `Failed to save studios to ${tableName}`,
        payload?.error || response.status
      );
    }
  } catch (err) {
    console.error(`Error saving studios to ${tableName}`, err);
  }
}

async function loadStudios(item, section, requestId, tableName = "movies") {
  if (!item || !section) return;

  const id = item.id;
  const title = item.title;
  const year = item.year;
  const kinopoiskId = item.kinopoiskId || item.kpId || item.kp_id || null;
  const knownImdbId = item.imdbId || item.imdb_id || null;
  const cacheKey = `${tableName}_${id}`;

  if (movieStudiosLoadCache.has(cacheKey)) {
    const cached = movieStudiosLoadCache.get(cacheKey);
    if (requestId === movieStudiosRequestId) {
      renderMovieStudios(section, cached);
    }
    return;
  }

  setMovieStudiosStatus(section, "Загружаем...");

  try {
    if (knownImdbId && TMDB_ENABLED) {
      setMovieStudiosStatus(section, "Загружаем студии...");
      const studiosData = await fetchStudiosFromTmdb(knownImdbId);

      if (requestId !== movieStudiosRequestId) return;

      if (!studiosData || studiosData.studios.length === 0) {
        setMovieStudiosStatus(section, "Студии не найдены");
        return;
      }

      movieStudiosLoadCache.set(cacheKey, studiosData);
      renderMovieStudios(section, studiosData);

      await saveStudiosToDb(id, studiosData, tableName);

      item.studios = JSON.stringify(studiosData);
      return;
    }

    let resolvedKinopoiskId = kinopoiskId;

    if (!resolvedKinopoiskId) {
      setMovieStudiosStatus(section, "Ищем на Кинопоиске...");
      const kpFilm = await searchKinopoiskByTitleYear(title, year);

      if (requestId !== movieStudiosRequestId) return;

      if (!kpFilm) {
        setMovieStudiosStatus(section, "Фильм не найден на Кинопоиске");
        return;
      }

      resolvedKinopoiskId = kpFilm.filmId || kpFilm.kinopoiskId || kpFilm.id;
    }

    setMovieStudiosStatus(section, "Получаем IMDb ID...");
    const imdbId = await fetchImdbIdFromKinopoiskFilm(resolvedKinopoiskId);

    if (requestId !== movieStudiosRequestId) return;

    if (!imdbId) {
      setMovieStudiosStatus(section, "IMDb ID не найден");
      return;
    }

    setMovieStudiosStatus(section, "Загружаем студии...");
    const studiosData = await fetchStudiosFromTmdb(imdbId);

    if (requestId !== movieStudiosRequestId) return;

    if (!studiosData || studiosData.studios.length === 0) {
      setMovieStudiosStatus(section, "Студии не найдены");
      return;
    }

    movieStudiosLoadCache.set(cacheKey, studiosData);
    renderMovieStudios(section, studiosData);

    await saveStudiosToDb(id, studiosData, tableName);

    item.studios = JSON.stringify(studiosData);
  } catch (err) {
    console.error("Error loading studios", err);
    if (requestId === movieStudiosRequestId) {
      setMovieStudiosStatus(section, "Ошибка загрузки");
    }
  }
}

function handleMovieDetailsStudios(movie, modal) {
  if (!movie || !modal) return;

  const section = ensureMovieStudiosSection(modal);
  if (!section) return;

  insertMovieStudiosSection(modal, section);

  const studiosData = parseMovieStudiosData(movie.studios);

  if (studiosData && Array.isArray(studiosData.studios) && studiosData.studios.length > 0) {
    renderMovieStudios(section, studiosData);
  } else {
    renderMovieStudios(section, { studios: [] });
    
    movieStudiosRequestId++;
    const currentRequestId = movieStudiosRequestId;
    if (movie._detailsLoaded !== false) loadStudios(movie, section, currentRequestId, "movies");
  }
}

function handleOrderDetailsStudios(order, modal) {
  if (!order || !modal) return;

  const section = ensureMovieStudiosSection(modal);
  if (!section) return;

  // Insert logic might be same or slightly different for orders?
  // Use generic insert
  insertMovieStudiosSection(modal, section);

  const studiosData = parseMovieStudiosData(order.studios);

  if (studiosData && Array.isArray(studiosData.studios) && studiosData.studios.length > 0) {
    renderMovieStudios(section, studiosData);
  } else {
    renderMovieStudios(section, { studios: [] });

    movieStudiosRequestId++;
    const currentRequestId = movieStudiosRequestId;
    if (order._detailsLoaded !== false) loadStudios(order, section, currentRequestId, "Movie_Orders");
  }
}

function setDetailsSectionLabels(options = {}) {

  const { descriptionId, countryId, directorId, actorsSectionId } = options;

  if (descriptionId) {
    const descriptionEl = document.getElementById(descriptionId);
    const section = descriptionEl?.closest(".movie-details-section");
    const titleEl = section?.querySelector(".movie-details-section-title");
    if (titleEl) {
      titleEl.textContent = "Описание";
    }
  }

  if (countryId) {
    const countryEl = document.getElementById(countryId);
    const section = countryEl?.closest(".movie-details-section");
    const titleEl = section?.querySelector(".movie-details-section-title");
    if (titleEl) {
      titleEl.textContent = "О фильме";
    }
    const labelEl = countryEl?.previousElementSibling;
    if (labelEl) {
      labelEl.textContent = "Страна";
    }
  }

  if (directorId) {
    const directorEl = document.getElementById(directorId);
    const labelEl = directorEl?.previousElementSibling;
    if (labelEl) {
      labelEl.textContent = "Режиссёр";
    }
  }

  if (actorsSectionId) {
    const actorsSection = document.getElementById(actorsSectionId);
    const titleText = "Главные роли";
    const summary = actorsSection?.querySelector(".movie-details-actors-summary");
    if (summary) {
      summary.textContent = titleText;
    }
    const titleEl = actorsSection?.querySelector(".movie-details-section-title");
    if (titleEl) {
      titleEl.textContent = titleText;
    }
  }
}

function setMetaLabel(id, text) {
  const valueEl = document.getElementById(id);
  const labelEl = valueEl?.previousElementSibling;
  if (labelEl) {
    labelEl.textContent = text;
  }
}

function setSectionTitleByValueId(valueId, text) {
  const valueEl = document.getElementById(valueId);
  const section = valueEl?.closest(".movie-details-section");
  const titleEl = section?.querySelector(".movie-details-section-title");
  if (titleEl) {
    titleEl.textContent = text;
  }
}

function alignDetailsPoster(modal) {
  if (!modal) {
    return;
  }

  const posterWrap = modal.querySelector(".movie-details-poster-wrap");
  const headingsEl = modal.querySelector(".movie-details-headings");
  const infoEl = modal.querySelector(".movie-details-info");

  const headingsInsideInfo =
    headingsEl && infoEl && infoEl.contains(headingsEl);

  if (!posterWrap || !headingsEl || !infoEl || !headingsInsideInfo) {
    if (posterWrap) {
      posterWrap.style.setProperty("--details-poster-offset", "0px");
    }
    return;
  }

  window.requestAnimationFrame(() => {
    const infoStyles = getComputedStyle(infoEl);
    const gapValue = infoStyles.rowGap || infoStyles.gap || "0px";
    const gap = parseFloat(gapValue) || 0;
    const offset = Math.max(0, headingsEl.offsetHeight + gap);
    posterWrap.style.setProperty("--details-poster-offset", `${offset}px`);
  });
}

function ensureDetailsInfoSection(infoColumn, key) {
  if (!infoColumn) {
    return null;
  }

  let section = infoColumn.querySelector(`[data-details-info="${key}"]`);
  const modal = infoColumn.closest(".modal");
  const editKey =
    key === "order" && modal?.id === "movieDetailsModal"
      ? "movieDetails-order"
      : key === "order" && modal?.id === "orderDetailsModal"
        ? "orderDetails-order"
        : null;

  if (!section) {
    section = document.createElement("div");
    section.className = "movie-details-section";
    section.dataset.detailsInfo = key;
  }

  let header = section.querySelector(".movie-details-section-header");
  if (!header) {
    header = document.createElement("div");
    header.className = "movie-details-section-header";
    section.prepend(header);
  }

  let title = header.querySelector(".movie-details-section-title");
  if (!title) {
    title = document.createElement("span");
    title.className = "movie-details-section-title";
    title.textContent = "Детали заказа";
    header.appendChild(title);
  }

  if (editKey && !header.querySelector(`[data-details-edit="${editKey}"]`)) {
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "details-edit-toggle admin-only";
    editBtn.dataset.detailsEdit = editKey;
    editBtn.setAttribute("aria-label", "Редактировать блок «Детали заказа»");
    editBtn.innerHTML = '<i class="fa-solid fa-pen" aria-hidden="true"></i>';
    header.appendChild(editBtn);
  }

  let body = section.querySelector(".movie-details-extra");
  if (!body) {
    body = document.createElement("div");
    body.className = "movie-details-extra";
    section.appendChild(body);
  }

  if (editKey && !section.querySelector(`[data-details-actions="${editKey}"]`)) {
    const actions = document.createElement("div");
    actions.className = "details-edit-actions admin-only";
    actions.dataset.detailsActions = editKey;
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn btn-primary details-edit-save";
    saveBtn.dataset.detailsSave = editKey;
    saveBtn.textContent = "Сохранить";
    actions.appendChild(saveBtn);
    section.appendChild(actions);
  }

  return section;
}

function moveMetaItems(target, ids = []) {
  if (!target) {
    return;
  }
  ids.forEach((id) => {
    const item = document.getElementById(id)?.closest(".movie-details-meta-item");
    if (item) {
      target.appendChild(item);
    }
  });
}

function reorderDetailsLayout(modal, config) {
  const {
    key,
    ids: { year, genre, country, director, orderBy, orderType, date, extra = [] },
    actorsSectionId,
  } = config;

  if (!modal) {
    return;
  }

  const infoColumn = modal.querySelector(".movie-details-info");
  const meta = infoColumn?.querySelector(".movie-details-meta");
  const ratingsSection = infoColumn?.querySelector(".movie-details-section");
  const genreItem = document.getElementById(genre)?.closest(".movie-details-meta-item");

  const countryEl = document.getElementById(country);
  const directorEl = document.getElementById(director);
  const legacyInfoSection =
    countryEl?.closest(".movie-details-section") ||
    directorEl?.closest(".movie-details-section") ||
    null;

  const countryItem = countryEl?.closest(".movie-details-meta-item");
  const directorItem = directorEl?.closest(".movie-details-meta-item");

  if (meta && genreItem) {
    if (countryItem) {
      meta.insertBefore(countryItem, genreItem.nextSibling);
    }
    if (directorItem) {
      meta.insertBefore(directorItem, countryItem ? countryItem.nextSibling : genreItem.nextSibling);
    }
  }

  const infoSection = ensureDetailsInfoSection(infoColumn, key);
  const infoBody = infoSection?.querySelector(".movie-details-extra");
  moveMetaItems(infoBody, [orderBy, orderType, date, ...extra]);

  const actorsSection = document.getElementById(actorsSectionId);
  const actorsInMeta = meta?.contains(actorsSection);
  if (!actorsInMeta) {
    if (actorsSection && legacyInfoSection && legacyInfoSection.contains(actorsSection)) {
      infoColumn?.insertBefore(actorsSection, ratingsSection?.nextSibling || null);
    } else if (ratingsSection && actorsSection && actorsSection.parentElement === infoColumn) {
      infoColumn.insertBefore(actorsSection, ratingsSection.nextSibling);
    }
  }

  if (
    legacyInfoSection &&
    legacyInfoSection !== ratingsSection &&
    legacyInfoSection.parentElement === infoColumn
  ) {
    legacyInfoSection.remove();
  }

  if (infoSection && infoColumn && infoSection.parentElement !== infoColumn) {
    infoColumn.appendChild(infoSection);
  } else if (infoSection && infoColumn) {
    infoColumn.appendChild(infoSection);
  }
}

const detailsEditConfigs = {
  "movieDetails-about": {
    modalId: "movieDetailsModal",
    recordType: "movie",
    table: "movies",
    fields: [
      { valueId: "movieDetailsYear", key: "year", localKey: "year", dbKey: "year", type: "number" },
      { valueId: "movieDetailsGenre", key: "genre", localKey: "genre", dbKey: "genres", type: "text" },
      { valueId: "movieDetailsCountry", key: "country", localKey: "country", dbKey: "country", type: "text" },
      { valueId: "movieDetailsDirector", key: "director", localKey: "director", dbKey: "director", type: "text" },
      { valueId: "movieDetailsPupsikRating", key: "rating", localKey: "rating", dbKey: "rating_numeric", type: "rating" },
    ],
  },
  "movieDetails-order": {
    modalId: "movieDetailsModal",
    recordType: "movie",
    table: "movies",
    fields: [
      { valueId: "movieDetailsOrderBy", key: "orderBy", localKey: "orderBy", dbKey: "order_by", type: "text" },
      {
        valueId: "movieDetailsOrderType",
        key: "orderType",
        localKey: "orderType",
        dbKey: "order_type",
        type: "select",
        selectSourceId: "editMovieOrderType",
      },
      {
        valueId: "movieDetailsWatchSource",
        key: "watchSource",
        localKey: "watchSource",
        dbKey: "watch_source",
        type: "select",
        selectSourceId: "movieWatchSource",
      },
    ],
  },
  "gameDetails-about": {
    modalId: "gameDetailsModal",
    recordType: "playedGame",
    table: "games",
    posterEditor: {
      imageId: "gameDetailsPoster",
      localKey: "poster",
      dbKey: "poster",
      folder: "played",
    },
    fields: [
      { valueId: "gameDetailsTitle", key: "title", localKey: "title", dbKey: "title", type: "text" },
      { valueId: "gameDetailsYear", key: "year", localKey: "year", dbKey: "year", type: "number" },
      { valueId: "gameDetailsGenre", key: "genres", localKey: "genres", dbKey: "genres", type: "text" },
      { valueId: "gameDetailsReleased", key: "released", localKey: "released", dbKey: "released", type: "date" },
      { valueId: "gameDetailsPlaytimeHastily", key: "playtimeHastily", localKey: "playtimeHastily", dbKey: "playtime_hastily", type: "number" },
      { valueId: "gameDetailsPlaytimeNormally", key: "playtimeNormally", localKey: "playtimeNormally", dbKey: "playtime_normally", type: "number" },
      { valueId: "gameDetailsPlaytimeCompletely", key: "playtimeCompletely", localKey: "playtimeCompletely", dbKey: "playtime_completely", type: "number" },
      { valueId: "gameDetailsPlaytimeCount", key: "playtimeCount", localKey: "playtimeCount", dbKey: "playtime_count", type: "number" },
      { valueId: "gameDetailsPlatforms", key: "platforms", localKey: "platforms", dbKey: "platforms", type: "text" },
      { valueId: "gameDetailsDevelopers", key: "developers", localKey: "developers", dbKey: "developers", type: "text" },
      { valueId: "gameDetailsPublishers", key: "publishers", localKey: "publishers", dbKey: "publishers", type: "text" },
      { valueId: "gameDetailsMetacritic", key: "metacritic", localKey: "metacritic", dbKey: "metacritic", type: "number" },
      { valueId: "gameDetailsRawgRating", key: "rawgRating", localKey: "rawgRating", dbKey: "rawg_rating", type: "rating" },
      { valueId: "gameDetailsPupsikRating", key: "rating", localKey: "rating", dbKey: "rating_numeric", type: "rating" },
    ],
  },
  "gameDetails-order": {
    modalId: "gameDetailsModal",
    recordType: "playedGame",
    table: "games",
    fields: [
      {
        valueId: "gameDetailsDate",
        key: "dateAdded",
        localKey: "dateAdded",
        dbKey: "date",
        type: "date",
      },
      { valueId: "gameDetailsOrderBy", key: "orderBy", localKey: "orderBy", dbKey: "order_by", type: "text" },
      {
        valueId: "gameDetailsGameMode",
        key: "gameMode",
        localKey: "gameMode",
        dbKey: "game_mode",
        type: "select",
        selectSourceId: "playedGameAutoModeSelect",
      },
      {
        valueId: "gameDetailsOrderType",
        key: "orderType",
        localKey: "orderType",
        dbKey: "order_type",
        type: "select",
        selectSourceId: "editPlayedGameOrderType",
      },
    ],
  },
  "orderDetails-about": {
    modalId: "orderDetailsModal",
    recordType: "order",
    table: "Movie_Orders",
    fields: [
      { valueId: "orderDetailsYear", key: "year", localKey: "year", dbKey: "order_year", type: "number" },
      { valueId: "orderDetailsGenre", key: "genres", localKey: "genres", dbKey: "order_genres", type: "text" },
      { valueId: "orderDetailsCountry", key: "country", localKey: "country", dbKey: "country", type: "text" },
      { valueId: "orderDetailsDirector", key: "director", localKey: "director", dbKey: "director", type: "text" },
    ],
  },
  "orderDetails-order": {
    modalId: "orderDetailsModal",
    recordType: "order",
    table: "Movie_Orders",
    fields: [
      { valueId: "orderDetailsOrderBy", key: "orderBy", localKey: "orderBy", dbKey: "order_by", type: "text" },
      {
        valueId: "orderDetailsOrderType",
        key: "orderType",
        localKey: "orderType",
        dbKey: "order_type",
        type: "select",
        selectSourceId: "editOrderType",
      },
      {
        valueId: "orderDetailsWatchSource",
        key: "watchSource",
        localKey: "watchSource",
        dbKey: "watch_source",
        type: "select",
        selectSourceId: "watchSource",
      },
    ],
  },
  "gameOrderDetails-about": {
    modalId: "gameOrderDetailsModal",
    recordType: "gameOrder",
    table: "Game_Orders",
    posterEditor: {
      imageId: "gameOrderDetailsPoster",
      localKey: "poster",
      dbKey: "game_poster",
      folder: "orders",
    },
    fields: [
      { valueId: "gameOrderDetailsTitle", key: "title", localKey: "title", dbKey: "game_title", type: "text" },
      { valueId: "gameOrderDetailsYear", key: "year", localKey: "year", dbKey: "game_year", type: "number" },
      { valueId: "gameOrderDetailsGenre", key: "genres", localKey: "genres", dbKey: "game_genres", type: "text" },
      { valueId: "gameOrderDetailsReleased", key: "released", localKey: "released", dbKey: "released", type: "date" },
      { valueId: "gameOrderDetailsPlaytimeHastily", key: "playtimeHastily", localKey: "playtimeHastily", dbKey: "playtime_hastily", type: "number" },
      { valueId: "gameOrderDetailsPlaytimeNormally", key: "playtimeNormally", localKey: "playtimeNormally", dbKey: "playtime_normally", type: "number" },
      { valueId: "gameOrderDetailsPlaytimeCompletely", key: "playtimeCompletely", localKey: "playtimeCompletely", dbKey: "playtime_completely", type: "number" },
      { valueId: "gameOrderDetailsPlaytimeCount", key: "playtimeCount", localKey: "playtimeCount", dbKey: "playtime_count", type: "number" },
      { valueId: "gameOrderDetailsPlatforms", key: "platforms", localKey: "platforms", dbKey: "platforms", type: "text" },
      { valueId: "gameOrderDetailsDevelopers", key: "developers", localKey: "developers", dbKey: "developers", type: "text" },
      { valueId: "gameOrderDetailsPublishers", key: "publishers", localKey: "publishers", dbKey: "publishers", type: "text" },
      { valueId: "gameOrderDetailsMetacritic", key: "metacritic", localKey: "metacritic", dbKey: "metacritic", type: "number" },
      { valueId: "gameOrderDetailsRawgRating", key: "rating", localKey: "rating", dbKey: "rawg_rating", type: "rating" },
    ],
  },
  "gameOrderDetails-order": {
    modalId: "gameOrderDetailsModal",
    recordType: "gameOrder",
    table: "Game_Orders",
    fields: [
      {
        valueId: "gameOrderDetailsDate",
        key: "dateAdded",
        localKey: "dateAdded",
        dbKey: "created_at",
        type: "datetime-local",
      },
      { valueId: "gameOrderDetailsOrderBy", key: "orderBy", localKey: "orderBy", dbKey: "game_order_by", type: "text" },
      {
        valueId: "gameOrderDetailsGameMode",
        key: "gameMode",
        localKey: "gameMode",
        dbKey: "game_mode",
        type: "select",
        selectSourceId: "gameAutoModeSelect",
      },
      {
        valueId: "gameOrderDetailsOrderType",
        key: "orderType",
        localKey: "orderType",
        dbKey: "game_order_type",
        type: "select",
        selectSourceId: "editGameOrderType",
      },
    ],
  },
};

function setDetailsModalContext(modal, type, id) {
  if (!modal) return;
  modal.dataset.recordType = type;
  modal.dataset.recordId = id;
  modal._catalogDetailsVersion = (modal._catalogDetailsVersion || 0) + 1;
  modal.removeAttribute("aria-busy");
}

function refreshCatalogModalDetails(catalog, item, modal, render) {
  if (item._detailsLoaded !== false) return;
  const version = modal._catalogDetailsVersion;
  const isCurrent = () =>
    modal._catalogDetailsVersion === version &&
    modal.style.display !== "none" &&
    String(modal.dataset.recordId) === String(item.id);
  modal.setAttribute("aria-busy", "true");
  void ensureCatalogItemDetails(catalog, item.id)
    .then((updated) => {
      if (updated && isCurrent()) render(updated);
    })
    .catch((error) => {
      console.warn("Unable to load catalog item details", error);
      if (isCurrent()) {
        showToastNotification(
          "Не удалось загрузить подробности. Откройте карточку повторно для новой попытки.",
          "error",
        );
      }
    })
    .finally(() => {
      if (modal._catalogDetailsVersion === version)
        modal.removeAttribute("aria-busy");
    });
}

function getRecordByType(type, id) {
  if (id === undefined || id === null) return null;
  const matchId = typeof id === "string" ? Number(id) || id : id;
  if (type === "movie") return allMovies.find((m) => m.id === matchId);
  if (type === "playedGame") return allPlayedGames.find((g) => g.id === matchId);
  if (type === "order") return watchlist.find((o) => o.id === matchId);
  if (type === "gameOrder") return gameOrders.find((g) => g.id === matchId);
  return null;
}

const detailsPosterEditState = new Map();

function getDetailsDateInputValue(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return String(value);
  }
  if (typeof formatDateLocal === "function") {
    return formatDateLocal(value);
  }
  return "";
}

function formatDetailsDisplayValue(field, value) {
  if (field?.dbKey === "watch_source" || field?.key === "watchSource") {
    return formatWatchSourceLabel(value);
  }
  if (field?.type === "date") {
    return value ? formatDate(value) : "";
  }
  if (field?.type === "datetime-local") {
    return value ? formatDateTime(value) : "";
  }
  return value;
}

function cleanupDetailsPosterEditor(key, { restorePoster = true } = {}) {
  const state = detailsPosterEditState.get(key);
  if (!state) return;

  if (state.triggerButton?.parentElement) {
    state.triggerButton.remove();
  }

  if (state.overlay?.parentElement) {
    state.overlay.remove();
  }

  if (restorePoster && state.previewEl) {
    state.previewEl.src = state.originalPoster || DEFAULT_POSTER_PLACEHOLDER;
  }

  detailsPosterEditState.delete(key);
}

function resetDetailsInlineEdits(modal) {
  if (typeof exitDetailsEdit !== "function") return;
  if (!modal) return;
  Object.keys(detailsEditConfigs).forEach((key) => {
    if (detailsEditConfigs[key].modalId === modal.id) {
      exitDetailsEdit(key, { restore: true });
    }
  });
}

let detailsInlineEditsBound = false;

function openMovieDetailsModal(id) {
  const movie = allMovies.find((m) => m.id === id);
  const modal = document.getElementById("movieDetailsModal");
  if (!movie || !modal) return;
  resetDetailsInlineEdits(modal);
  setDetailsModalContext(modal, "movie", movie.id);

  const title = formatMovieDetailsValue(movie.title, "Без названия");
  const originalTitle = movie.originalTitle || movie.original_title || "";
  const genreValue = movie.genre || movie.genres || "";
  const orderByValue =
    movie.orderBy && movie.orderBy !== "null" ? movie.orderBy : "";
  const orderTypeValue = movie.orderType || "";
  const watchSourceValue = formatWatchSourceLabel(movie.watchSource);

  const titleEl = document.getElementById("movieDetailsTitle");
  if (titleEl) titleEl.textContent = title;

  const originalEl = document.getElementById("movieDetailsOriginal");
  if (originalEl) {
    if (originalTitle) {
      originalEl.textContent = originalTitle;
      originalEl.style.display = "block";
    } else {
      originalEl.textContent = "";
      originalEl.style.display = "none";
    }
  }

  const posterEl = document.getElementById("movieDetailsPoster");
  if (posterEl) {
    const posterSrc = movie.poster || DEFAULT_POSTER_PLACEHOLDER;
    posterEl.src = posterSrc;
    posterEl.alt = title ? `Постер: ${title}` : "Постер фильма";
    posterEl.onerror = () => {
      posterEl.src = DEFAULT_POSTER_PLACEHOLDER;
      posterEl.alt = "Постер фильма";
    };
  }

  setMovieDetailsText("movieDetailsYear", movie.year);
  setMovieDetailsText("movieDetailsGenre", genreValue);
  setMovieDetailsText(
    "movieDetailsDate",
    movie.dateAdded ? formatDateTime(movie.dateAdded) : ""
  );
  setMovieDetailsText("movieDetailsOrderBy", orderByValue);
  setMovieDetailsText("movieDetailsOrderType", orderTypeValue);
  setMovieDetailsText("movieDetailsWatchSource", watchSourceValue);
  setMovieDetailsText("movieDetailsPupsikRating", movie.rating);
  setMovieDetailsText("movieDetailsKpRating", movie.kpRating ?? "-");
  setMovieDetailsText("movieDetailsUserRating", movie.userRating ?? "-");
  setMovieDetailsText("movieDetailsDescription", movie.description, "—");
  setMovieDetailsText("movieDetailsCountry", movie.country, "—");
  setMovieDetailsText("movieDetailsDirector", movie.director, "—");
  renderActorsList(
    "movieDetailsActorsList",
    "movieDetailsActorsSection",
    movie.actors,
    { filmId: movie.kinopoiskId }
  );
  setDetailsSectionLabels({
    descriptionId: "movieDetailsDescription",
    countryId: "movieDetailsCountry",
    directorId: "movieDetailsDirector",
    actorsSectionId: "movieDetailsActorsSection",
  });
  setMetaLabel("movieDetailsOrderBy", "Кто заказал");
  setMetaLabel("movieDetailsOrderType", "Способ заказа");
  setMetaLabel("movieDetailsWatchSource", "Просмотр в");
  setMetaLabel("movieDetailsDate", "Дата добавления");
  // setSectionTitleByValueId("movieDetailsPupsikRating", "Оценки");

  reorderDetailsLayout(modal, {
    key: "order",
    ids: {
      year: "movieDetailsYear",
      genre: "movieDetailsGenre",
      country: "movieDetailsCountry",
      director: "movieDetailsDirector",
      orderBy: "movieDetailsOrderBy",
      orderType: "movieDetailsOrderType",
      date: "movieDetailsDate",
      extra: ["movieDetailsWatchSource"],
    },
    actorsSectionId: "movieDetailsActorsSection",
  });

  const movieDescriptionEl = document.getElementById("movieDetailsDescription");
  const movieDescriptionSection =
    movieDescriptionEl?.closest(".movie-details-section");
  const movieBody = modal.querySelector(".movie-details-body");
  if (movieDescriptionSection && movieBody?.parentElement) {
    movieDescriptionSection.classList.add("movie-details-description-block");
    movieBody.parentElement.insertBefore(
      movieDescriptionSection,
      movieBody.nextSibling
    );
  }

  const votes = Math.round(movie.ratingCount ?? 0);
  const votesEl = document.getElementById("movieDetailsVotes");
  if (votesEl) {
    votesEl.textContent = "";
    votesEl.classList.remove("movie-details-muted");
  }

  attachRatingTooltip(
    document.getElementById("movieDetailsPupsikRating")?.closest(".movie-details-rating"),
    "Оценка Pupsik_ow"
  );
  attachRatingTooltip(
    document.getElementById("movieDetailsKpRating")?.closest(".movie-details-rating"),
    "Перейти на Кинопоиск"
  );
  attachRatingTooltip(
    document.getElementById("movieDetailsUserRating")?.closest(".movie-details-rating"),
    `Оценок: ${votes}`
  );

  const movieKpRating = document
    .getElementById("movieDetailsKpRating")
    ?.closest(".movie-details-rating");
  if (movieKpRating) {
    movieKpRating.dataset.kpId = movie?.id ?? "";
    movieKpRating.dataset.kpTable = "movies";
    movieKpRating.dataset.kpTitle = movie?.title ?? "";
    movieKpRating.dataset.kpYear = movie?.year ?? "";
    movieKpRating.dataset.kpOriginalTitle = movie?.originalTitle ?? "";
    movieKpRating.dataset.kpKinopoiskId =
      movie?.kinopoiskId ?? movie?.kpId ?? movie?.kp_id ?? "";
  }
  if (movieKpRating && movieKpRating.dataset.kpBound !== "true") {
    movieKpRating.dataset.kpBound = "true";
    movieKpRating.style.cursor = "pointer";
    movieKpRating.addEventListener("click", (event) => {
      event?.stopPropagation?.();
      if (typeof openKinopoiskPageForRecord === "function") {
        const id = movieKpRating.dataset.kpId;
        const table = movieKpRating.dataset.kpTable || "movies";
        let currentMovie = null;
        if (id && Array.isArray(allMovies)) {
          currentMovie = allMovies.find((m) => String(m.id) === String(id));
        }
        if (!currentMovie) {
          currentMovie = {
            id,
            title: movieKpRating.dataset.kpTitle || "",
            year: movieKpRating.dataset.kpYear || "",
            originalTitle: movieKpRating.dataset.kpOriginalTitle || "",
            kinopoiskId: movieKpRating.dataset.kpKinopoiskId || null,
          };
        }
        openKinopoiskPageForRecord({ item: currentMovie, table });
      }
    });
  }

  handleMovieDetailsStudios(movie, modal);

  const deleteBtn = document.getElementById("movieDetailsDeleteBtn");
  if (deleteBtn) {
    deleteBtn.onclick = () => openConfirmDeleteMovieModal(movie.id);
  }

  alignDetailsPoster(modal);
  modal.style.display = "block";
  refreshCatalogModalDetails("movies", movie, modal, () => openMovieDetailsModal(id));
}

let activeGameDetailsId = null;
const playedGameDetailsPrefetches = new Map();

function getGameDetailsDescriptionText(game) {
  if (!game) return "";
  if (typeof getGameDescriptionDisplayText === "function") {
    return getGameDescriptionDisplayText(game.description);
  }
  return typeof game.description === "string" ? game.description : "";
}

function hasGameDetailsPlatforms(game) {
  if (!game) return false;
  return typeof game.platforms === "string" && game.platforms.trim() !== "";
}

function renderGameDetailsModal(game, modal) {
  if (!game || !modal) return;

  const title = formatMovieDetailsValue(game.title, "Без названия");
  const genreValue = game.genres || "";
  const orderByValue =
    game.orderBy && game.orderBy !== "null" ? game.orderBy : "";
  const orderTypeValue = game.orderType || "";

  const titleEl = document.getElementById("gameDetailsTitle");
  if (titleEl) titleEl.textContent = title;

  const posterEl = document.getElementById("gameDetailsPoster");
  if (posterEl) {
    const posterSrc = game.poster || DEFAULT_POSTER_PLACEHOLDER;
    posterEl.src = posterSrc;
    posterEl.alt = title ? `Постер: ${title}` : "Постер игры";
    posterEl.onerror = () => {
      posterEl.src = DEFAULT_POSTER_PLACEHOLDER;
      posterEl.alt = "Постер игры";
    };
  }

  setMovieDetailsText("gameDetailsYear", game.year);
  setMovieDetailsText("gameDetailsGenre", genreValue);
  setMovieDetailsText("gameDetailsReleased", game.released, "—");
  renderGamePlaytimeDetails("gameDetails", game);
  setMovieDetailsText("gameDetailsMetacritic", game.metacritic, "—");
  setMovieDetailsText("gameDetailsRawgRating", game.rawgRating, "—");
  setMovieDetailsText("gameDetailsPlatforms", game.platforms, "—");
  setMovieDetailsText("gameDetailsDevelopers", game.developers, "—");
  setMovieDetailsText("gameDetailsPublishers", game.publishers, "—");
  setMovieDetailsText(
    "gameDetailsDate",
    game.dateAdded ? formatDateTime(game.dateAdded) : ""
  );
  setMovieDetailsText("gameDetailsOrderBy", orderByValue);
  setMovieDetailsText("gameDetailsGameMode", normalizeGameMode(game.gameMode), "—");
  setMovieDetailsText("gameDetailsOrderType", orderTypeValue);
  setMovieDetailsText("gameDetailsPupsikRating", game.rating);
  setMovieDetailsText("gameDetailsUserRating", game.userRating ?? "-");
  const descText = getGameDetailsDescriptionText(game);
  setMovieDetailsText("gameDetailsDescription", descText, "—");

  const isTranslating =
    typeof isPlayedGameDescriptionTranslating === "function" &&
    isPlayedGameDescriptionTranslating(game.id);
  if (typeof setGameDetailsDescriptionStatus === "function") {
    setGameDetailsDescriptionStatus(
      isTranslating ? "Переводим..." : "",
      { spinner: isTranslating, gameId: game.id }
    );
  }
  if (typeof syncGameDetailsTranslateButton === "function") {
    syncGameDetailsTranslateButton(game);
  }

  const votes = Math.round(game.ratingCount ?? 0);
  const votesEl = document.getElementById("gameDetailsVotes");
  if (votesEl) {
    votesEl.textContent = "";
    votesEl.classList.remove("movie-details-muted");
  }

  attachRatingTooltip(
    document.getElementById("gameDetailsPupsikRating")?.closest(".movie-details-rating"),
    "Оценка Pupsik_ow"
  );
  attachRatingTooltip(
    document.getElementById("gameDetailsUserRating")?.closest(".movie-details-rating"),
    `Оценок: ${votes}`
  );
  attachRatingTooltip(
    modal.querySelector(".order-game-rating--metacritic"),
    "Оценка Metacritic"
  );
  attachRatingTooltip(
    modal.querySelector(".order-game-rating--rawg"),
    "Оценка RAWG"
  );

  const gameDescriptionEl = document.getElementById("gameDetailsDescription");
  const gameDescriptionSection = gameDescriptionEl?.closest(".movie-details-section");
  const gameBody = modal.querySelector(".movie-details-body");
  if (gameDescriptionSection && gameBody?.parentElement) {
    gameDescriptionSection.classList.add("game-order-description-block");
    gameBody.parentElement.insertBefore(gameDescriptionSection, gameBody.nextSibling);
  }

  alignDetailsPoster(modal);
}

function formatGameTimeMinutes(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return "—";
  const hours = Math.floor(value / 60);
  const remainder = Math.round(value % 60);
  if (!hours) return `${remainder} мин.`;
  return remainder ? `${hours} ч. ${remainder} мин.` : `${hours} ч.`;
}

function renderGamePlaytimeDetails(prefix, game) {
  const hasDetailedTimes = [
    game.playtimeHastily,
    game.playtimeNormally,
    game.playtimeCompletely,
  ].some((value) => Number(value) > 0);
  const fallbackNormally = hasDetailedTimes ? null : game.playtime * 60;

  setMovieDetailsText(
    `${prefix}PlaytimeHastily`,
    formatGameTimeMinutes(game.playtimeHastily),
    "—"
  );
  setMovieDetailsText(
    `${prefix}PlaytimeNormally`,
    formatGameTimeMinutes(game.playtimeNormally ?? fallbackNormally),
    "—"
  );
  setMovieDetailsText(
    `${prefix}PlaytimeCompletely`,
    formatGameTimeMinutes(game.playtimeCompletely),
    "—"
  );
  const countElement = document.getElementById(`${prefix}PlaytimeCount`);
  const countRow = countElement?.closest(".game-playtime-count");
  const count = Number(game.playtimeCount);
  if (countElement) {
    countElement.textContent = count > 0
      ? `Время прохождения на основе ${count} прохождений.`
      : "";
  }
  if (countRow) countRow.hidden = !(count > 0);
}

async function fetchPlayedGameDetailsFromRawg(game) {
  if (!RAWG_API_KEY) {
    console.warn("RAWG_API_KEY отсутствует. Нельзя загрузить детали игры.");
    return null;
  }

  let rawgId = game.rawgId ?? null;
  if (!rawgId) {
    const searchUrl = `${RAWG_SEARCH_URL}?key=${RAWG_API_KEY}&search=${encodeURIComponent(
      game.title
    )}`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) {
      throw new Error(`RAWG search failed: ${searchRes.status}`);
    }
    const searchData = await searchRes.json();
    const match = searchData?.results?.[0];
    if (!match) return null;
    rawgId = match.id;
  }

  const detailsRes = await fetch(
    `${RAWG_SEARCH_URL}/${rawgId}?key=${RAWG_API_KEY}`
  );
  if (!detailsRes.ok) {
    throw new Error(`RAWG details failed: ${detailsRes.status}`);
  }
  const details = await detailsRes.json();
  return { rawgId, details };
}

async function fetchPlayedGameDetailsFromDb(game) {
  if (!game || !supabaseClient) return null;
  const { data, error } = await supabaseClient
    .from("games")
    .select(
      "description, rawg_rating, metacritic, released, playtime, playtime_hastily, playtime_normally, playtime_completely, playtime_count, platforms, developers, publishers, rawg_id"
    )
    .eq("id", game.id)
    .single();
  if (error) {
    throw error;
  }
  return data;
}

function applyGameDetails(game, details) {
  if (!game || !details) return game;
  return {
    ...game,
    description: details.description ?? game.description,
    rawgRating: details.rawg_rating ?? game.rawgRating,
    metacritic: details.metacritic ?? game.metacritic,
    released: details.released ?? game.released,
    playtime: details.playtime ?? game.playtime,
    playtimeHastily: details.playtime_hastily ?? game.playtimeHastily,
    playtimeNormally: details.playtime_normally ?? game.playtimeNormally,
    playtimeCompletely: details.playtime_completely ?? game.playtimeCompletely,
    playtimeCount: details.playtime_count ?? game.playtimeCount,
    platforms: details.platforms ?? game.platforms,
    developers: details.developers ?? game.developers,
    publishers: details.publishers ?? game.publishers,
    rawgId: details.rawg_id ?? game.rawgId,
  };
}

function updateLocalPlayedGame(game) {
  const idx = allPlayedGames.findIndex((g) => g.id === game.id);
  if (idx !== -1) {
    allPlayedGames[idx] = game;
  }
  localStorage.setItem("gamesCache", JSON.stringify(allPlayedGames));
}

async function prefetchPlayedGameDetails(game) {
  if (!game || !supabaseClient) return null;
  if (hasGameDetailsPlatforms(game)) return game;
  if (playedGameDetailsPrefetches.has(game.id)) {
    return playedGameDetailsPrefetches.get(game.id);
  }

  const loadPromise = (async () => {
    try {
      let updatedGame = game;
      const dbDetails = await fetchPlayedGameDetailsFromDb(game);
      if (dbDetails) {
        updatedGame = applyGameDetails(updatedGame, dbDetails);
        updateLocalPlayedGame(updatedGame);
      }

      if (hasGameDetailsPlatforms(updatedGame)) {
        return updatedGame;
      }

      const rawgPayload = await fetchPlayedGameDetailsFromRawg(updatedGame);
      if (!rawgPayload) return updatedGame;

      const { rawgId, details } = rawgPayload;
      const descriptionText =
        details?.description_raw || details?.description || "";
      const descriptionData = descriptionText
        ? { original: descriptionText, translated: null }
        : null;
      const platforms =
        details?.platforms?.map((p) => p.platform?.name).filter(Boolean) || [];
      const developers =
        details?.developers?.map((d) => d.name).filter(Boolean) || [];
      const publishers =
        details?.publishers?.map((p) => p.name).filter(Boolean) || [];

      const payload = {
        description: descriptionData,
        rawg_rating: details?.rating ?? null,
        metacritic: details?.metacritic ?? null,
        released: details?.released ?? null,
        playtime: details?.playtime ?? null,
        platforms: platforms.join(", "),
        developers: developers.join(", "),
        publishers: publishers.join(", "),
        rawg_id: rawgId ?? null,
      };

      const token = localStorage.getItem("adminToken") || "";
      const response = await fetch(window.Pupsik.apiUrl("/api/admin?action=media-items"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "update_item",
          table: "games",
          id: updatedGame.id,
          changes: payload,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || `RAWG details update failed: ${response.status}`);
      }

      updatedGame = applyGameDetails(updatedGame, payload);
      updateLocalPlayedGame(updatedGame);
      return updatedGame;
    } catch (err) {
      console.error("Failed to load RAWG details for played game", err);
      return game;
    }
  })();

  playedGameDetailsPrefetches.set(game.id, loadPromise);
  try {
    return await loadPromise;
  } finally {
    playedGameDetailsPrefetches.delete(game.id);
  }
}

async function openGameDetailsModal(id) {
  const game = allPlayedGames.find((g) => g.id === id);
  const modal = document.getElementById("gameDetailsModal");
  if (!game || !modal) return;
  resetDetailsInlineEdits(modal);
  setDetailsModalContext(modal, "playedGame", game.id);
  activeGameDetailsId = id;

  renderGameDetailsModal(game, modal);
  modal.style.display = "block";
  refreshCatalogModalDetails("playedGames", game, modal, (updated) => renderGameDetailsModal(updated, modal));

  if (game._detailsLoaded === undefined && !hasGameDetailsPlatforms(game)) {
    setMovieDetailsText("gameDetailsDescription", "Загружаем...", "—");
    const updatedGame = await prefetchPlayedGameDetails(game);
    if (activeGameDetailsId === id) {
      renderGameDetailsModal(updatedGame, modal);
    }
  }

  const deleteBtn = document.getElementById("gameDetailsDeleteBtn");
  if (deleteBtn) {
    deleteBtn.onclick = () => openConfirmDeletePlayedGameModal(game.id);
  }
}

function renderOrderDetailsModal(order) {
  const modal = document.getElementById("orderDetailsModal");
  if (!order || !modal) return;
  resetDetailsInlineEdits(modal);
  setDetailsModalContext(modal, "order", order.id);

  const title = formatMovieDetailsValue(order.title, "Без названия");
  const originalTitle = order.originalTitle || "";
  const genreValue = order.genres || "";
  const orderByValue =
    order.orderBy && order.orderBy !== "null" ? order.orderBy : "";
  const orderTypeValue = order.orderType || "";
  const watchSourceValue = formatWatchSourceLabel(order.watchSource);

  const titleEl = document.getElementById("orderDetailsTitle");
  if (titleEl) titleEl.textContent = title;

  const originalEl = document.getElementById("orderDetailsOriginal");
  if (originalEl) {
    if (originalTitle) {
      originalEl.textContent = originalTitle;
      originalEl.style.display = "block";
    } else {
      originalEl.textContent = "";
      originalEl.style.display = "none";
    }
  }

  const posterEl = document.getElementById("orderDetailsPoster");
  if (posterEl) {
    const posterSrc = order.poster || DEFAULT_POSTER_PLACEHOLDER;
    posterEl.src = posterSrc;
    posterEl.alt = title ? `Постер: ${title}` : "Постер фильма";
    posterEl.onerror = () => {
      posterEl.src = DEFAULT_POSTER_PLACEHOLDER;
      posterEl.alt = "Постер фильма";
    };
  }

  setMovieDetailsText("orderDetailsYear", order.year);
  setMovieDetailsText("orderDetailsGenre", genreValue);
  setMovieDetailsText(
    "orderDetailsDate",
    order.dateAdded ? formatDateTime(order.dateAdded) : ""
  );
  setMovieDetailsText(
    "orderDetailsPlanDate",
    order.planDate ? formatDateTime(order.planDate) : ""
  );
  setMovieDetailsText(
    "orderDetailsLength",
    order.length ? `${order.length} мин` : ""
  );
  setMovieDetailsText("orderDetailsOrderBy", orderByValue);
  setMovieDetailsText("orderDetailsOrderType", orderTypeValue);
  setMovieDetailsText("orderDetailsWatchSource", watchSourceValue);
  setMovieDetailsText("orderDetailsKpRating", order.kpRating ?? "-");
  setMovieDetailsText("orderDetailsDescription", order.description, "—");
  setMovieDetailsText("orderDetailsCountry", order.country, "—");
  setMovieDetailsText("orderDetailsDirector", order.director, "—");
  renderActorsList(
    "orderDetailsActorsList",
    "orderDetailsActorsSection",
    order.actors,
    { filmId: order.kinopoiskId }
  );
  setDetailsSectionLabels({
    descriptionId: "orderDetailsDescription",
    countryId: "orderDetailsCountry",
    directorId: "orderDetailsDirector",
    actorsSectionId: "orderDetailsActorsSection",
  });
  setMetaLabel("orderDetailsOrderBy", "Кто заказал");
  setMetaLabel("orderDetailsOrderType", "Способ заказа");
  setMetaLabel("orderDetailsWatchSource", "Просмотр в");
  setMetaLabel("orderDetailsDate", "Дата добавления");
  setMetaLabel("orderDetailsPlanDate", "Запланировано");
  setMetaLabel("orderDetailsLength", "Длительность");
  // setSectionTitleByValueId("orderDetailsKpRating", "Оценки");

  reorderDetailsLayout(modal, {
    key: "order",
    ids: {
      year: "orderDetailsYear",
      genre: "orderDetailsGenre",
      country: "orderDetailsCountry",
      director: "orderDetailsDirector",
      orderBy: "orderDetailsOrderBy",
      orderType: "orderDetailsOrderType",
      date: "orderDetailsDate",
      extra: ["orderDetailsPlanDate", "orderDetailsLength", "orderDetailsWatchSource"],
    },
    actorsSectionId: "orderDetailsActorsSection",
  });

  const descriptionEl = document.getElementById("orderDetailsDescription");
  const descriptionSection = descriptionEl?.closest(".movie-details-section");
  const parentGuide = document.getElementById("orderParentGuide");
  if (descriptionSection && parentGuide?.parentElement) {
    descriptionSection.classList.add("order-details-description-block");
    parentGuide.parentElement.insertBefore(descriptionSection, parentGuide);
  }

  const watchBtn = document.getElementById("orderDetailsWatch");
  if (watchBtn) {
    watchBtn.onclick = () => {
      if (typeof openOrderOnReyohoho === "function") {
        openOrderOnReyohoho(order);
      }
    };
  }

  const orderKpRating = document
    .getElementById("orderDetailsKpRating")
    ?.closest(".movie-details-rating");
  if (orderKpRating) {
    orderKpRating.dataset.kpId = order?.id ?? "";
    orderKpRating.dataset.kpTable = "Movie_Orders";
    orderKpRating.dataset.kpTitle = order?.title ?? "";
    orderKpRating.dataset.kpYear = order?.year ?? "";
    orderKpRating.dataset.kpOriginalTitle = order?.originalTitle ?? "";
    orderKpRating.dataset.kpKinopoiskId =
      order?.kinopoiskId ?? order?.kpId ?? order?.kp_id ?? "";
  }
  if (orderKpRating && orderKpRating.dataset.kpBound !== "true") {
    orderKpRating.dataset.kpBound = "true";
    orderKpRating.style.cursor = "pointer";
    orderKpRating.addEventListener("click", (event) => {
      event?.stopPropagation?.();
      if (typeof openKinopoiskPageForRecord === "function") {
        const id = orderKpRating.dataset.kpId;
        const table = orderKpRating.dataset.kpTable || "Movie_Orders";
        let currentOrder = null;
        if (id && Array.isArray(watchlist)) {
          currentOrder = watchlist.find((o) => String(o.id) === String(id));
        }
        if (!currentOrder) {
          currentOrder = {
            id,
            title: orderKpRating.dataset.kpTitle || "",
            year: orderKpRating.dataset.kpYear || "",
            originalTitle: orderKpRating.dataset.kpOriginalTitle || "",
            kinopoiskId: orderKpRating.dataset.kpKinopoiskId || null,
          };
        }
        openKinopoiskPageForRecord({ item: currentOrder, table });
      }
    });
  }
  attachRatingTooltip(orderKpRating, "Перейти на Кинопоиск");

  handleOrderDetailsStudios(order, modal);

  alignDetailsPoster(modal);

  const exitBtn = document.getElementById("orderDetailsExit");
  if (exitBtn) {
    exitBtn.onclick = () => closeModal("orderDetailsModal");
  }

  if (order._detailsLoaded !== false && typeof updateOrderDetailsExtras === "function") {
    updateOrderDetailsExtras(order);
  }

  modal.style.display = "block";
}

function openOrderDetailsModal(id) {
  const order = watchlist.find((o) => o.id === id);
  if (!order) return;
  renderOrderDetailsModal(order);
  const modal = document.getElementById("orderDetailsModal");
  if (modal) refreshCatalogModalDetails("watchlist", order, modal, renderOrderDetailsModal);
}

function openOrderDetailsModalFromData(order) {
  renderOrderDetailsModal(order);
}

function openGameOrderDetailsModal(id) {
  const game = gameOrders.find((g) => g.id === id);
  const modal = document.getElementById("gameOrderDetailsModal");
  if (!game || !modal) return;
  resetDetailsInlineEdits(modal);
  setDetailsModalContext(modal, "gameOrder", game.id);

  if (typeof setActiveGameOrderDetailsId === "function") {
    setActiveGameOrderDetailsId(id);
  }

  const title = formatMovieDetailsValue(game.title, "Без названия");
  const genreValue = game.genres || "";
  const orderByValue =
    game.orderBy && game.orderBy !== "null" ? game.orderBy : "";
  const orderTypeValue = game.orderType || "";

  const titleEl = document.getElementById("gameOrderDetailsTitle");
  if (titleEl) titleEl.textContent = title;

  const posterEl = document.getElementById("gameOrderDetailsPoster");
  if (posterEl) {
    const posterSrc = game.poster || DEFAULT_POSTER_PLACEHOLDER;
    posterEl.src = posterSrc;
    posterEl.alt = title ? `Постер: ${title}` : "Постер игры";
    posterEl.onerror = () => {
      posterEl.src = DEFAULT_POSTER_PLACEHOLDER;
      posterEl.alt = "Постер игры";
    };
  }

  setMovieDetailsText("gameOrderDetailsYear", game.year);
  setMovieDetailsText("gameOrderDetailsGenre", genreValue);
  setMovieDetailsText(
    "gameOrderDetailsDate",
    game.dateAdded ? formatDateTime(game.dateAdded) : ""
  );
  setMovieDetailsText(
    "gameOrderDetailsPlanDate",
    game.planDate ? formatDateTime(game.planDate) : ""
  );
  setMovieDetailsText("gameOrderDetailsOrderBy", orderByValue);
  setMovieDetailsText("gameOrderDetailsGameMode", normalizeGameMode(game.gameMode), "—");
  setMovieDetailsText("gameOrderDetailsOrderType", orderTypeValue);

  const descText =
    typeof getGameDescriptionDisplayText === "function"
      ? getGameDescriptionDisplayText(game.description)
      : game.description || "";
  setMovieDetailsText("gameOrderDetailsDescription", descText, "—");

  const isTranslating =
    typeof isGameDescriptionTranslating === "function" &&
    isGameDescriptionTranslating(game.id);
  if (typeof setGameOrderDescriptionStatus === "function") {
    setGameOrderDescriptionStatus(
      isTranslating ? "Переводим..." : "",
      { spinner: isTranslating, gameOrderId: game.id }
    );
  }
  if (typeof syncGameOrderTranslateButton === "function") {
    syncGameOrderTranslateButton(game);
  }

  setMovieDetailsText("gameOrderDetailsMetacritic", game.metacritic, "—");
  setMovieDetailsText("gameOrderDetailsRawgRating", game.rating, "—");
  setMovieDetailsText("gameOrderDetailsReleased", game.released, "—");
  renderGamePlaytimeDetails("gameOrderDetails", game);
  setMovieDetailsText("gameOrderDetailsPlatforms", game.platforms, "—");
  setMovieDetailsText("gameOrderDetailsDevelopers", game.developers, "—");
  setMovieDetailsText("gameOrderDetailsPublishers", game.publishers, "—");

  attachRatingTooltip(
    modal.querySelector(".order-game-rating--metacritic"),
    "Оценка Metacritic"
  );
  attachRatingTooltip(
    modal.querySelector(".order-game-rating--rawg"),
    "Оценка RAWG"
  );

  const gameDescriptionEl = document.getElementById("gameOrderDetailsDescription");
  const gameDescriptionSection = gameDescriptionEl?.closest(".movie-details-section");
  const gameBody = modal.querySelector(".movie-details-body");
  if (gameDescriptionSection && gameBody?.parentElement) {
    gameDescriptionSection.classList.add("game-order-description-block");
    gameBody.parentElement.insertBefore(gameDescriptionSection, gameBody.nextSibling);
  }

  alignDetailsPoster(modal);
  modal.style.display = "block";
  refreshCatalogModalDetails("gameOrders", game, modal, () => openGameOrderDetailsModal(id));
}

// Normalize labels in case HTML encoding is off.
setDetailsSectionLabels({
  descriptionId: "movieDetailsDescription",
  countryId: "movieDetailsCountry",
  directorId: "movieDetailsDirector",
  actorsSectionId: "movieDetailsActorsSection",
});
setDetailsSectionLabels({
  descriptionId: "orderDetailsDescription",
  countryId: "orderDetailsCountry",
  directorId: "orderDetailsDirector",
  actorsSectionId: "orderDetailsActorsSection",
});

function parseDuration(durationStr) {
  if (!durationStr) return 0;
  const str = String(durationStr).trim();
  
  // Try H:MM format
  if (str.includes(":")) {
    const parts = str.split(":");
    if (parts.length === 2) {
      const h = parseInt(parts[0], 10) || 0;
      const m = parseInt(parts[1], 10) || 0;
      return h * 60 + m;
    }
  }
  
  // Try plain number (minutes)
  return parseInt(str, 10) || 0;
}

function closeModal(modalId, shouldReset = false) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = "none";
  }
  if (modalId === "userRateModal") {
    const submitButton = document.getElementById("userRateSubmitButton");
    const status = document.getElementById("userRateStatus");
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.removeAttribute("aria-busy");
    }
    if (status) {
      status.textContent = "";
      status.style.color = "";
    }
  }
  if (modalId === "userRateGameModal") {
    const submitButton = document.getElementById("userRateGameSubmitButton");
    const status = document.getElementById("userRateGameStatus");
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.removeAttribute("aria-busy");
    }
    if (status) {
      status.textContent = "";
      status.style.color = "";
    }
  }
  if (modalId === "duplicateModal") {
    resetDuplicateModalState();
  }
  if (modalId === "gameDetailsModal") {
    activeGameDetailsId = null;
  }
  if (modalId === "orderPlayerModal") {
    if (typeof resetOrderPlayerSplash === "function") resetOrderPlayerSplash();
    const frame = document.getElementById("orderPlayerFrame");
    if (frame) {
      frame.src = "about:blank";
    }
    document.body.classList.remove("order-player-fullscreen");
    if (typeof clearOrderPlayerTimings === "function") {
      clearOrderPlayerTimings();
    }
  }
  if (modalId === "gameOrderDetailsModal") {
    if (typeof clearActiveGameOrderDetailsId === "function") {
      clearActiveGameOrderDetailsId();
    }
    if (typeof setGameOrderDescriptionStatus === "function") {
      setGameOrderDescriptionStatus("");
    }
  }
  if (
    modal &&
    (
      modalId === "movieDetailsModal" ||
      modalId === "gameDetailsModal" ||
      modalId === "orderDetailsModal" ||
      modalId === "gameOrderDetailsModal"
    )
  ) {
    if (isAdmin) resetDetailsInlineEdits(modal);
  }
  if (shouldReset) {
    resetForm();
  }
}

// Переключение режимов

function updateRatingTooltipPosition(event) {
  if (!ratingTooltip || ratingTooltip.style.display !== "block") return;
  const offsetX = 12;
  const offsetY = 16;
  const pageX = event?.pageX ?? 0;
  const pageY = event?.pageY ?? 0;
  ratingTooltip.style.left = `${pageX + offsetX}px`;
  ratingTooltip.style.top = `${pageY + offsetY}px`;
}

function showRatingValueTooltip(event, value) {
  if (!ratingTooltip) return;
  ratingTooltip.textContent = String(value);
  ratingTooltip.style.display = "block";
  updateRatingTooltipPosition(event);
}

function hideRatingValueTooltip() {
  if (!ratingTooltip) return;
  ratingTooltip.style.display = "none";
}

function attachRatingTooltip(target, text) {
  if (!target || target.dataset.tooltipBound === "true") return;
  target.dataset.tooltipBound = "true";
  target.addEventListener("mouseenter", (event) => {
    if (!ratingTooltip) return;
    ratingTooltip.textContent = text;
    ratingTooltip.style.display = "block";
    updateRatingTooltipPosition(event);
  });
  target.addEventListener("mousemove", updateRatingTooltipPosition);
  target.addEventListener("mouseleave", hideRatingValueTooltip);
}

const MODAL_RATING_MEANINGS = {
  0: "Абсолютный провал",
  1: "Кошмар",
  2: "Очень плохо",
  3: "Плохо",
  4: "Ниже среднего",
  5: "Средне",
  6: "Неплохо",
  7: "Хорошо",
  8: "Очень хорошо",
  9: "Отлично",
  10: "Великолепно",
  11: "Легенда",
};

function getModalRatingUi(containerId) {
  const map = {
    ratingStars: { inputId: "ratingInput", meaningId: "ratingMeaning", meaningTextId: "ratingMeaningText" },
    rateMovieStars: { inputId: "rateMovieInput", meaningId: "rateMovieMeaning", meaningTextId: "rateMovieMeaningText" },
    rateGameStars: { inputId: "rateGameInput", meaningId: "rateGameMeaning", meaningTextId: "rateGameMeaningText" },
    userRateStars: { inputId: "userRateInput", meaningId: "userRateMeaning", meaningTextId: "userRateMeaningText" },
    userRateGameStars: { inputId: "userRateGameInput", meaningId: "userRateGameMeaning", meaningTextId: "userRateGameMeaningText" },
    playedGameRatingStars: { inputId: "playedGameRatingInput", meaningId: "playedGameRatingMeaning", meaningTextId: "playedGameRatingMeaningText" },
  };
  return map[containerId] || null;
}

function clampModalRatingValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(11, Math.max(0, numeric));
}

function formatModalRatingValue(value) {
  const normalized = clampModalRatingValue(value);
  if (Number.isInteger(normalized)) return String(normalized);
  return String(Math.round(normalized * 100) / 100);
}

function updateModalRatingMeaning(value, containerId) {
  const ui = getModalRatingUi(containerId);
  if (!ui) return;
  const meaning = document.getElementById(ui.meaningId);
  const meaningText = document.getElementById(ui.meaningTextId);
  if (!meaning || !meaningText) return;

  if (value === null || value === undefined || value === "") {
    meaning.className = "modal-rating-panel__meaning";
    meaningText.textContent = "";
    return;
  }

  const nearest = Math.round(clampModalRatingValue(value));
  meaning.className = `modal-rating-panel__meaning is-level-${nearest}`;
  meaningText.textContent = MODAL_RATING_MEANINGS[nearest] || MODAL_RATING_MEANINGS[0];
}

function syncModalRatingPreview(containerId, value, options = {}) {
  const ui = getModalRatingUi(containerId);
  if (!ui) return;
  const { updateInput = true } = options;
  const input = document.getElementById(ui.inputId);
  if (updateInput && input) {
    input.value =
      value === null || value === undefined || value === ""
        ? ""
        : formatModalRatingValue(value);
  }
  updateModalRatingMeaning(value, containerId);
}

function syncModalRatingInputValue(containerId, value) {
  const ui = getModalRatingUi(containerId);
  if (!ui) return;
  const input = document.getElementById(ui.inputId);
  if (input) {
    input.value =
      value === null || value === undefined || value === ""
        ? ""
        : formatModalRatingValue(value);
  }
}

// Настройка звездного рейтинга
function setupRatingStars(containerId = "ratingStars") {
  const container = document.getElementById(containerId);
  if (!container || container.dataset.ready === "true") return;
  const stars = container.querySelectorAll(".rating-star");
  const inputId = container.dataset.input;
  const ratingInput = inputId ? document.getElementById(inputId) : null;

  stars.forEach((star) => {
    star.addEventListener("click", function () {
      const rating = parseInt(this.dataset.rating);
      setRatingStars(containerId, rating);
    });

    star.addEventListener("mouseover", function () {
      container.classList.add("is-hover-previewing");
      const rating = parseInt(this.dataset.rating);
      highlightStars(containerId, rating);
      syncModalRatingPreview(containerId, rating);
    });

    if (!star.classList.contains("rating-label")) {
      star.addEventListener("mouseenter", function (event) {
        showRatingValueTooltip(event, this.dataset.rating);
      });
      star.addEventListener("mousemove", updateRatingTooltipPosition);
      star.addEventListener("mouseleave", hideRatingValueTooltip);
    }
  });

  container.addEventListener("mouseleave", function () {
    const currentRating = getCurrentRating(containerId);
    container.classList.remove("is-hover-previewing");
    highlightStars(containerId, currentRating);
    syncModalRatingPreview(containerId, currentRating, { updateInput: true });
    hideRatingValueTooltip();
  });

  if (ratingInput) {
    ratingInput.addEventListener("input", function () {
      const value = parseRatingInputValue(this.value);
      if (!this.value.trim()) {
        this.setCustomValidity("");
        setRatingStars(containerId, null, false);
        highlightStars(containerId, null);
        syncModalRatingPreview(containerId, null, { updateInput: false });
        return;
      }
      if (hasTooManyFractionDigits(this.value)) {
        this.setCustomValidity("Можно ввести не более 2 знаков после запятой");
        this.reportValidity();
        return;
      }
      if (!isNaN(value) && value >= 0 && value <= 11) {
        this.setCustomValidity("");
        setRatingStars(containerId, value, false);
        highlightStars(containerId, value);
        syncModalRatingPreview(containerId, value, { updateInput: false });
      } else {
        this.setCustomValidity("Введите число от 0 до 11");
        this.reportValidity();
      }
    });
  }
  container.dataset.ready = "true";
}

function setRatingStars(containerId, rating, updateInput = true) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const stars = container.querySelectorAll(".rating-star");
  const hasValue = !(rating === null || rating === undefined || rating === "");
  container.dataset.currentRating = hasValue ? String(rating) : "";
  if (updateInput) {
    syncModalRatingInputValue(containerId, hasValue ? rating : null);
  }
  syncModalRatingPreview(containerId, hasValue ? rating : null, { updateInput: false });
  stars.forEach((star) => star.classList.remove("active"));

  if (!hasValue) {
    if (containerId === "ratingStars") {
      showKPPreview();
    }
    return;
  }

  if (rating === 0) {
    stars[0]?.classList.add("active");
  } else if (rating >= 1 && rating <= 10) {
    for (let i = 0; i <= rating; i++) {
      stars[i]?.classList.add("active");
    }
  } else if (rating === 11) {
    for (let i = 0; i <= 10; i++) {
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

  stars.forEach((star) => {
    // Удаляем маску и цвет
    star.classList.remove("hovered");
    star.style.backgroundColor = "rgba(255, 235, 59, 0.3)";

    if (star.classList.contains("rating-label")) {
      star.style.backgroundColor = "";
    }
  });

  if (rating === null || rating === undefined || Number.isNaN(Number(rating))) {
    return;
  }

  if (rating === 0) {
    stars[0]?.classList.add("hovered");
  } else if (rating >= 1 && rating <= 10) {
    for (let i = 0; i <= rating; i++) {
      stars[i].classList.add("hovered");
      if (!stars[i].classList.contains("rating-label")) {
        stars[i].style.backgroundColor = "#ffc107";
      }
    }
  } else if (rating === 11) {
    for (let i = 0; i <= 10; i++) {
      stars[i].classList.add("hovered");
      if (!stars[i].classList.contains("rating-label")) {
        stars[i].style.backgroundColor = "#ffc107";
      }
    }
    stars[11]?.classList.add("hovered");
  }
}

function getCurrentRating(containerId) {
  const container = document.getElementById(containerId);
  const raw = container?.dataset.currentRating;
  if (raw === undefined || raw === null || raw === "") return null;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
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

function roundRatingToTwoDigits(ratingValue) {
  if (!Number.isFinite(ratingValue)) return NaN;
  return Math.round(ratingValue * 100) / 100;
}

function isRatingValid(r) {
  return typeof r === "number" && !isNaN(r) && r >= 0 && r <= 11;
}

function getRatingValue(inputId) {
  const el = document.getElementById(inputId);
  const ratingContainer = document.querySelector(`.rating-stars[data-input="${inputId}"]`);
  const committedRating = ratingContainer?.id ? getCurrentRating(ratingContainer.id) : null;
  if (committedRating !== null) {
    return roundRatingToTwoDigits(committedRating);
  }
  const parsed = el ? parseRatingInputValue(el.value) : NaN;
  return roundRatingToTwoDigits(parsed);
}
