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
function openAddMovieModal() {
  const modal = document.getElementById("addMovieModal");
  if (modal) {
    modal.style.display = "block";
  }
}

function openAddToWatchlistModal() {
  document.getElementById("addWatchlistModal").style.display = "block";
}

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

function openRateModal(id) {
  ratingMovieId = id;
  const item = watchlist.find((w) => w.id === id);
  if (item) {
    const duplicateWatchedMovie = allMovies.some(
      (m) =>
        m.title.trim().toLowerCase() === item.title.trim().toLowerCase() &&
        Number(m.year) === Number(item.year)
    );
    if (duplicateWatchedMovie) {
      showDuplicateModal(
        "Такой фильм уже есть в списке просмотренных. Можно удалить его из заказанных.",
        {
          actionLabel: "Удалить",
          onAction: async () => {
            closeModal("duplicateModal");
            await performDeleteOrder(item.id);
          },
        }
      );
      return;
    }
  }
  if (item) {
    document.getElementById("rateMovieTitle").textContent = item.title;
    document.getElementById("rateMoviePoster").src = item.poster;
  } else {
    document.getElementById("rateMovieTitle").textContent = "";
    document.getElementById("rateMoviePoster").src =
      "https://via.placeholder.com/300x400?text=Нет+постера";
  }
  document.getElementById("rateMovieModal").style.display = "block";
  setRatingStars("rateMovieStars", null);
  setupRatingStars("rateMovieStars");
  const confirmBtn = document.querySelector("#rateMovieModal .btn-primary");
  if (confirmBtn) confirmBtn.disabled = isSubmittingRating;
}

function openRateGameModal(id) {
  ratingGameId = id;
  const item = gameOrders.find((g) => g.id === id);
  if (item) {
    document.getElementById("rateGameTitle").textContent = item.title;
    document.getElementById("rateGamePoster").src = item.poster;
  } else {
    document.getElementById("rateGameTitle").textContent = "";
    document.getElementById("rateGamePoster").src =
      "https://via.placeholder.com/300x400?text=Нет+постера";
  }
  document.getElementById("rateGameModal").style.display = "block";
  setRatingStars("rateGameStars", null);
  setupRatingStars("rateGameStars");
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
    const response = await fetch("/api/admin?action=media-items", {
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
    loadStudios(movie, section, currentRequestId, "movies");
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
    loadStudios(order, section, currentRequestId, "Movie_Orders");
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
      { valueId: "gameDetailsYear", key: "year", localKey: "year", dbKey: "year", type: "number" },
      { valueId: "gameDetailsGenre", key: "genres", localKey: "genres", dbKey: "genres", type: "text" },
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
      { valueId: "gameOrderDetailsYear", key: "year", localKey: "year", dbKey: "game_year", type: "number" },
      { valueId: "gameOrderDetailsGenre", key: "genres", localKey: "genres", dbKey: "game_genres", type: "text" },
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

async function setupDetailsPosterEditor(key, record) {
  const config = detailsEditConfigs[key];
  const posterEditor = config?.posterEditor;
  if (!posterEditor || !record) return;

  cleanupDetailsPosterEditor(key, { restorePoster: false });

  const previewEl = document.getElementById(posterEditor.imageId);
  if (!previewEl) return;

  const originalPoster = record[posterEditor.localKey] || previewEl.src || "";
  const state = {
    previewEl,
    originalPoster,
    pendingPoster: originalPoster,
    triggerButton: null,
    overlay: null,
  };
  detailsPosterEditState.set(key, state);

  const title = String(record.title || record.game_title || "").trim();
  const result = await fetchSteamGridPostersForTitle(title);
  if (detailsPosterEditState.get(key) !== state) return;

  const posters = [];
  const seen = new Set();
  const appendPoster = (poster) => {
    const url = poster?.url || poster?.thumb || "";
    const thumb = poster?.thumb || poster?.url || "";
    const dedupeKey = `${url}|${thumb}`;
    if (!url || seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    posters.push({ url, thumb });
  };

  appendPoster({ url: originalPoster, thumb: originalPoster });
  (result?.posters || []).forEach(appendPoster);

  if (posters.length < 2) {
    return;
  }

  state.overlay = createPosterOverlay(previewEl, posters, false, {
    absoluteBelow: true,
    selectedPoster: originalPoster,
    syncGlobalSelection: false,
    onSelect: ({ selectedPoster }) => {
      state.pendingPoster = selectedPoster || state.pendingPoster;
    },
  });

  if (!state.overlay) {
    return;
  }

  state.overlay.style.display = "none";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "poster-overlay-close";
  closeBtn.setAttribute("aria-label", "Закрыть выбор постера");
  closeBtn.textContent = "×";
  closeBtn.onclick = () => {
    state.overlay.style.display = "none";
  };
  state.overlay.appendChild(closeBtn);

  const triggerButton = document.createElement("button");
  triggerButton.type = "button";
  triggerButton.className = "btn btn-secondary details-poster-change-btn";
  triggerButton.textContent = "Заменить постер";
  triggerButton.onclick = () => {
    state.overlay.style.display = "flex";
  };

  previewEl.parentElement.appendChild(triggerButton);
  state.triggerButton = triggerButton;
}

function buildSelectFromSource(sourceId, value) {
  const select = document.createElement("select");
  select.className = "details-edit-select";
  const source = document.getElementById(sourceId);
  if (source) {
    Array.from(source.options).forEach((opt) => {
      const cloned = opt.cloneNode(true);
      select.appendChild(cloned);
    });
  } else {
    const fallbackOptions = [
      { value: "", label: "Не указано" },
      { value: "Донат", label: "Донат" },
      { value: "Шары", label: "Шары" },
      { value: "Баллы канала", label: "Баллы канала" },
      { value: "Аукцион", label: "Аукцион" },
      { value: "Рулетка", label: "Рулетка" },
    ];
    fallbackOptions.forEach((opt) => {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.label;
      select.appendChild(option);
    });
  }
  if (value !== undefined && value !== null) {
    select.value = value;
  }
  return select;
}

function createDetailsInput(field, record) {
  const currentValue = record ? record[field.localKey] : "";
  if (field.type === "select") {
    return buildSelectFromSource(field.selectSourceId, currentValue || "");
  }
  if (field.type === "textarea") {
    const textarea = document.createElement("textarea");
    textarea.className = "details-edit-textarea";
    textarea.value = currentValue || "";
    return textarea;
  }
  const input = document.createElement("input");
  input.className = "details-edit-input";
  if (field.type === "rating") {
    input.type = "number";
    input.min = "0";
    input.max = "11";
    input.step = "0.01";
  } else if (field.type === "date") {
    input.type = "date";
    input.value = getDetailsDateInputValue(currentValue);
    return input;
  } else if (field.type === "datetime-local") {
    input.type = "datetime-local";
    input.value =
      typeof formatDateTimeLocal === "function"
        ? formatDateTimeLocal(currentValue)
        : "";
    return input;
  } else {
    input.type = field.type === "number" ? "number" : "text";
  }
  input.value = currentValue ?? "";
  return input;
}

function normalizeDetailsValue(field, inputValue, record) {
  if (field.type === "number") {
    const parsed = parseInt(inputValue, 10);
    if (!Number.isFinite(parsed)) {
      return record ? record[field.localKey] : null;
    }
    return parsed;
  }
  if (field.type === "rating") {
    if (hasTooManyFractionDigits(String(inputValue ?? ""))) {
      return record ? record[field.localKey] : null;
    }
    const parsed = parseRatingInputValue(String(inputValue ?? ""));
    if (!Number.isFinite(parsed)) {
      return record ? record[field.localKey] : null;
    }
    const clamped = Math.min(11, Math.max(0, parsed));
    return roundRatingToTwoDigits(clamped);
  }
  if (field.type === "date") {
    const normalized = String(inputValue ?? "").trim();
    if (!normalized) return null;
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized)
      ? normalized
      : record
        ? record[field.localKey]
        : null;
  }
  if (field.type === "datetime-local") {
    const normalized = String(inputValue ?? "").trim();
    if (!normalized) return null;
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      return record ? record[field.localKey] : null;
    }
    return parsed.toISOString();
  }
  if (typeof inputValue === "string") {
    return inputValue.trim();
  }
  return inputValue;
}

function setDetailsValueText(valueId, value) {
  const empty = value === null || value === undefined || value === "";
  setMovieDetailsText(valueId, empty ? "" : value, "—");
}

function enterDetailsEdit(key) {
  const config = detailsEditConfigs[key];
  if (!config) return;
  const modal = document.getElementById(config.modalId);
  if (!modal) return;
  const record = getRecordByType(config.recordType, modal.dataset.recordId);
  if (!record) return;

  config.fields.forEach((field) => {
    const span = document.getElementById(field.valueId);
    if (!span || span.dataset.editing === "true") return;
    span.dataset.editing = "true";
    span.dataset.originalText = span.textContent ?? "";
    const input = createDetailsInput(field, record);
    input.dataset.detailsField = `${key}:${field.key}`;
    span.textContent = "";
    span.appendChild(input);
  });

  if (config.posterEditor) {
    setupDetailsPosterEditor(key, record);
  }

  const actions = modal.querySelector(`[data-details-actions="${key}"]`);
  if (actions) actions.classList.add("is-visible");
  const toggle = modal.querySelector(`[data-details-edit="${key}"]`);
  if (toggle) toggle.setAttribute("aria-pressed", "true");
}

function exitDetailsEdit(key, { restore = true } = {}) {
  const config = detailsEditConfigs[key];
  if (!config) return;
  const modal = document.getElementById(config.modalId);
  if (!modal) return;

  config.fields.forEach((field) => {
    const span = document.getElementById(field.valueId);
    if (!span || span.dataset.editing !== "true") return;
    const original = span.dataset.originalText ?? "";
    const current = span.textContent ?? "";
    span.dataset.editing = "false";
    span.removeAttribute("data-original-text");
    span.innerHTML = "";
    span.textContent = restore ? original : current;
  });

  cleanupDetailsPosterEditor(key, { restorePoster: restore });

  const actions = modal.querySelector(`[data-details-actions="${key}"]`);
  if (actions) actions.classList.remove("is-visible");
  const toggle = modal.querySelector(`[data-details-edit="${key}"]`);
  if (toggle) toggle.setAttribute("aria-pressed", "false");
}

function resetDetailsInlineEdits(modal) {
  if (!modal) return;
  Object.keys(detailsEditConfigs).forEach((key) => {
    if (detailsEditConfigs[key].modalId === modal.id) {
      exitDetailsEdit(key, { restore: true });
    }
  });
}

async function saveDetailsEdit(key) {
  const config = detailsEditConfigs[key];
  if (!config) return;
  const modal = document.getElementById(config.modalId);
  if (!modal) return;
  const record = getRecordByType(config.recordType, modal.dataset.recordId);
  if (!record) return;

  const updates = {};
  const payload = {};
  let hasChanges = false;
  let previousPosterToDelete = null;

  config.fields.forEach((field) => {
    const span = document.getElementById(field.valueId);
    const input = span?.querySelector(`[data-details-field="${key}:${field.key}"]`);
    if (!input) return;
    const value = normalizeDetailsValue(field, input.value, record);
    updates[field.key] = value;
    const current = record[field.localKey];
    if (String(current ?? "") !== String(value ?? "")) {
      hasChanges = true;
    }
    if (field.dbKey) {
      if (field.key === "orderType" || field.key === "orderBy") {
        payload[field.dbKey] = value ? value : null;
      } else {
        payload[field.dbKey] = value;
      }
    }
  });

  if (config.posterEditor) {
    const state = detailsPosterEditState.get(key);
    const currentPoster = record[config.posterEditor.localKey] || "";
    const pendingPoster = state?.pendingPoster || currentPoster;
    if (pendingPoster !== currentPoster) {
      hasChanges = true;
    }
  }

  if (!hasChanges) {
    exitDetailsEdit(key, { restore: true });
    return;
  }

  try {
    if (config.posterEditor) {
      const state = detailsPosterEditState.get(key);
      const localKey = config.posterEditor.localKey;
      const dbKey = config.posterEditor.dbKey;
      const currentPoster = record[localKey] || "";
      const pendingPoster = state?.pendingPoster || currentPoster;
      if (pendingPoster !== currentPoster) {
        const uploadedPoster = await uploadGamePosterToStorage({
          poster: pendingPoster,
          title: record.title || "",
          folder: config.posterEditor.folder,
        });
        updates[localKey] = uploadedPoster;
        payload[dbKey] = uploadedPoster;
        previousPosterToDelete =
          currentPoster &&
          currentPoster !== uploadedPoster &&
          getGamePosterStoragePath(currentPoster)
            ? currentPoster
            : null;
      }
    }

    const token = localStorage.getItem("adminToken") || "";
    const response = await fetch("/api/admin?action=media-items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "update_item",
        table: config.table,
        id: record.id,
        changes: payload,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result?.error || `Details update failed: ${response.status}`);
    }

    config.fields.forEach((field) => {
      if (updates[field.key] !== undefined) {
        if (field.key === "orderType" || field.key === "orderBy") {
          record[field.localKey] = updates[field.key] || "";
        } else {
          record[field.localKey] = updates[field.key];
        }
      }
    });

    if (config.posterEditor && updates[config.posterEditor.localKey] !== undefined) {
      record[config.posterEditor.localKey] = updates[config.posterEditor.localKey];
      const posterEl = document.getElementById(config.posterEditor.imageId);
      if (posterEl) {
        posterEl.src = record[config.posterEditor.localKey] || DEFAULT_POSTER_PLACEHOLDER;
      }
    }

    if (config.recordType === "movie") {
      localStorage.setItem("moviesCache", JSON.stringify(allMovies));
      renderMovies();
    } else if (config.recordType === "playedGame") {
      localStorage.setItem("gamesCache", JSON.stringify(allPlayedGames));
      renderPlayedGames();
    } else if (config.recordType === "order") {
      renderWatchlist();
    } else if (config.recordType === "gameOrder") {
      renderGames();
    }

    config.fields.forEach((field) => {
      const value = updates[field.key];
      setDetailsValueText(field.valueId, formatDetailsDisplayValue(field, value));
    });

    if (previousPosterToDelete) {
      await deleteGamePosterFromStorage(previousPosterToDelete);
    }

    exitDetailsEdit(key, { restore: false });
  } catch (err) {
    console.error("Failed to save details edit", err);
    alert("Не удалось сохранить изменения. Попробуйте ещё раз.");
  }
}

let detailsInlineEditsBound = false;
function initDetailsInlineEdits() {
  if (detailsInlineEditsBound) return;
  detailsInlineEditsBound = true;

  document.addEventListener("click", (event) => {
    const editBtn = event.target.closest("[data-details-edit]");
    if (editBtn) {
      const key = editBtn.dataset.detailsEdit;
      const config = detailsEditConfigs[key];
      if (!config) return;
      const modal = document.getElementById(config.modalId);
      const isEditing = modal?.querySelector(`[data-details-actions="${key}"]`)?.classList.contains("is-visible");
      if (isEditing) {
        exitDetailsEdit(key, { restore: true });
      } else {
        enterDetailsEdit(key);
      }
      return;
    }

    const saveBtn = event.target.closest("[data-details-save]");
    if (saveBtn) {
      const key = saveBtn.dataset.detailsSave;
      saveDetailsEdit(key);
    }
  });
}

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
  setMovieDetailsText(
    "gameDetailsPlaytime",
    game.playtime ? `${game.playtime} ч.` : "—"
  );
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
      "description, rawg_rating, metacritic, released, playtime, platforms, developers, publishers, rawg_id"
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
      const response = await fetch("/api/admin?action=media-items", {
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

  if (!hasGameDetailsPlatforms(game)) {
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
      extra: ["orderDetailsPlanDate", "orderDetailsLength"],
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

  if (typeof updateOrderDetailsExtras === "function") {
    updateOrderDetailsExtras(order);
  }

  modal.style.display = "block";
}

function openOrderDetailsModal(id) {
  const order = watchlist.find((o) => o.id === id);
  if (!order) return;
  renderOrderDetailsModal(order);
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
  setMovieDetailsText(
    "gameOrderDetailsPlaytime",
    game.playtime ? `${game.playtime} ч.` : "—"
  );
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
}

function openEditModal(id) {
  editingMovieId = id;
  const movie = allMovies.find((m) => m.id === id);

  document.getElementById("editTitle").value = movie.title;
  document.getElementById("editYear").value = movie.year;
  document.getElementById("editGenre").value = movie.genre || "";
  document.getElementById("editMovieOrderBy").value = movie.orderBy || "";
  document.getElementById("editMovieOrderType").value = movie.orderType || "";
  document.getElementById("editPosterPreview").src = movie.poster;
  document.getElementById("editPoster").value = "";
  editPosterData = null;

  // Установка рейтинга.
  setRatingStars("editRatingStars", movie.rating);
  setupRatingStars("editRatingStars");

  const delBtn = document.getElementById("deleteMovieBtn");
  if (delBtn) {
    delBtn.onclick = () => {
      closeModal("editMovieModal");
      openConfirmDeleteMovieModal(id);
    };
  }
  document.getElementById("editMovieModal").style.display = "block";
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

async function performDeleteMovie(id) {
  const index = allMovies.findIndex((m) => m.id === id);
  if (index === -1) {
    return;
  }

  const [removedMovie] = allMovies.splice(index, 1);
  renderMovies();

  try {
    const token = localStorage.getItem("adminToken") || "";
    const response = await fetch("/api/admin?action=media-admin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "delete_item",
        table: "movies",
        id,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || `Movie delete failed: ${response.status}`);
    }

    localStorage.setItem("moviesCache", JSON.stringify(allMovies));
    if (typeof removeUserOrder === "function" && removedMovie?.orderBy) {
      await removeUserOrder({ userName: removedMovie.orderBy, type: "movies" });
    }
  } catch (err) {
    console.error("Error deleting movie from Supabase", err);
    allMovies.splice(index, 0, removedMovie);
    localStorage.setItem("moviesCache", JSON.stringify(allMovies));
    renderMovies();
    alert(
      "Не удалось удалить фильм. Возможно, не хватает прав или запись уже удалена. Изменения отменены."
    );
  }
}

async function performDeleteOrder(id) {
  const index = watchlist.findIndex((o) => o.id === id);
  if (index === -1) {
    return;
  }

  const [removedOrder] = watchlist.splice(index, 1);
  renderWatchlist();

  try {
    const token = localStorage.getItem("adminToken") || "";
    const response = await fetch("/api/admin?action=media-admin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "delete_item",
        table: "Movie_Orders",
        id,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || `Movie order delete failed: ${response.status}`);
    }

    if (typeof removeUserOrder === "function" && removedOrder?.orderBy) {
      await removeUserOrder({ userName: removedOrder.orderBy, type: "movies" });
    }
  } catch (err) {
    console.error("Error deleting order from Supabase", err);
    watchlist.splice(index, 0, removedOrder);
    renderWatchlist();
    alert(
      "Не удалось удалить заказанный фильм. Возможно, не хватает прав или запись уже удалена. Изменения отменены."
    );
  }
}

async function performDeleteGameOrder(id) {
  const index = gameOrders.findIndex((g) => g.id === id);
  if (index === -1) {
    return;
  }

  const [removedOrder] = gameOrders.splice(index, 1);
  renderGames();

  try {
    const token = localStorage.getItem("adminToken") || "";
    const response = await fetch("/api/admin?action=media-admin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "delete_item",
        table: "Game_Orders",
        id,
        posterUrl: removedOrder?.poster || "",
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || `Game order delete failed: ${response.status}`);
    }
  } catch (err) {
    console.error("Error deleting game order from Supabase", err);
    gameOrders.splice(index, 0, removedOrder);
    renderGames();
    alert(
      "Не удалось удалить заказанную игру. Возможно, не хватает прав или запись уже удалена. Изменения отменены."
    );
  }
}

function markGameDone(id) {
  openRateGameModal(id);
}


function openEditPlayedGameModal(id) {
  editingPlayedGameId = id;
  const game = allPlayedGames.find((g) => g.id === id);
  if (!game) return;
  const preview = document.getElementById("editPlayedGamePosterPreview");
  const overlay = preview.parentElement.nextElementSibling;
  if (overlay && overlay.classList.contains("poster-overlay")) overlay.remove();
  steamGridPoster = null;
  steamGridPosters = [];
  resetRawgPosterCache();
  document.getElementById("editPlayedGameTitle").value = game.title;
  document.getElementById("editPlayedGameYear").value = game.year || "";
  document.getElementById("editPlayedGameGenres").value = game.genres || "";
  document.getElementById("editPlayedGameOrderBy").value = game.orderBy || "";
  document.getElementById("editPlayedGameOrderType").value =
    game.orderType || "";
  preview.src = game.poster;
  document.getElementById("editPlayedGamePoster").value = "";
  setRatingStars("editPlayedGameRatingStars", game.rating);
  setupRatingStars("editPlayedGameRatingStars");
  editPlayedGamePosterData = null;
  const delBtn = document.getElementById("deletePlayedGameBtn");
  if (delBtn) {
    delBtn.onclick = () => {
      closeModal("editPlayedGameModal");
      openConfirmDeletePlayedGameModal(id);
    };
  }
  document.getElementById("editPlayedGameModal").style.display = "block";
}

function openAddGameModal() {
  document.getElementById("addGameModal").style.display = "block";
}

function openAddPlayedGameModal() {
  document.getElementById("addPlayedGameModal").style.display = "block";
  setRatingStars("playedGameRatingStars", null);
  setupRatingStars("playedGameRatingStars");
}

document.addEventListener("DOMContentLoaded", () => {
  initDetailsInlineEdits();
});

function openConfirmDeleteMovieModal(id) {
  deleteMovieId = id;
  document.getElementById("confirmDeleteMovieModal").style.display = "block";
}

async function confirmDeleteMovie() {
  if (deleteMovieId !== null) {
    await performDeleteMovie(deleteMovieId);
    const movieDetailsModal = document.getElementById("movieDetailsModal");
    if (
      movieDetailsModal &&
      movieDetailsModal.style.display === "block" &&
      movieDetailsModal.dataset.recordId === String(deleteMovieId)
    ) {
      closeModal("movieDetailsModal");
    }
    deleteMovieId = null;
  }
  closeModal("confirmDeleteMovieModal");
}

function openConfirmDeletePlayedGameModal(id) {
  deletePlayedGameId = id;
  document.getElementById("confirmDeletePlayedGameModal").style.display =
    "block";
}

async function confirmDeletePlayedGame() {
  if (deletePlayedGameId !== null) {
    await deletePlayedGame(deletePlayedGameId);
    const gameDetailsModal = document.getElementById("gameDetailsModal");
    if (
      gameDetailsModal &&
      gameDetailsModal.style.display === "block" &&
      gameDetailsModal.dataset.recordId === String(deletePlayedGameId)
    ) {
      closeModal("gameDetailsModal");
    }
    deletePlayedGameId = null;
  }
  closeModal("confirmDeletePlayedGameModal");
}

function openConfirmDeleteOrderModal(id) {
  deleteOrderId = id;
  document.getElementById("confirmDeleteOrderModal").style.display = "block";
}

async function confirmDeleteOrder() {
  if (deleteOrderId !== null) {
    await performDeleteOrder(deleteOrderId);
    deleteOrderId = null;
  }
  closeModal("confirmDeleteOrderModal");
}

function openConfirmDeleteGameOrderModal(id) {
  deleteGameOrderId = id;
  document.getElementById("confirmDeleteGameOrderModal").style.display =
    "block";
}

async function confirmDeleteGameOrder() {
  if (deleteGameOrderId !== null) {
    await performDeleteGameOrder(deleteGameOrderId);
    deleteGameOrderId = null;
  }
  closeModal("confirmDeleteGameOrderModal");
}

const PLAN_MONTH_NAMES = [
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

let planCalendarYear = null;
let planCalendarMonth = null;

function renderPlanCalendar(selectedDateStr = "") {
  const grid = document.getElementById("planCalendarGrid");
  const label = document.getElementById("planCalendarMonthLabel");
  const dateInput = document.getElementById("planDateInput");
  if (!grid || planCalendarYear === null || planCalendarMonth === null) return;

  const today = new Date();
  const selectedDate = selectedDateStr ? new Date(selectedDateStr) : null;

  const firstDay = new Date(planCalendarYear, planCalendarMonth, 1);
  const daysInMonth = new Date(planCalendarYear, planCalendarMonth + 1, 0).getDate();
  const monthName = PLAN_MONTH_NAMES[planCalendarMonth];
  if (label) {
    label.textContent = `${monthName} ${planCalendarYear}`;
  }

  grid.innerHTML = "";

  const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  weekdays.forEach((name) => {
    const cell = document.createElement("div");
    cell.className = "plan-calendar-weekday";
    cell.textContent = name;
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

    const cellDate = new Date(planCalendarYear, planCalendarMonth, day);
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
      if (dateInput) {
        dateInput.value = cellDateStr;
      }
      renderPlanCalendar(cellDateStr);
    });

    grid.appendChild(cell);
  }

}

function openPlanDateModal(id, type = "movie") {
  planDateOrderId = id;
  planDateOrderType = type;
  const isGamePlan = type === "game";
  const orders = isGamePlan ? gameOrders : watchlist;
  const order = orders.find((o) => o.id === id);
  const titleEl = document.getElementById("planDateMovieTitle");
  if (titleEl) {
    titleEl.textContent = order?.title || "";
  }
  const dateEl = document.getElementById("planDateInput");
  const timeEl = document.getElementById("planTimeInput");

  let dateValue = "";
  let timeValue = "";

  if (order?.planDate) {
    dateValue = formatDateLocal(order.planDate);
    timeValue = formatTimeLocal(order.planDate);
  } else {
    // Auto-calculate from last scheduled item
    const scheduled = orders.filter((o) => o.planDate && o.id !== id);
    if (scheduled.length > 0) {
      // Find max date+time
      const last = scheduled.reduce((prev, current) => {
        return new Date(prev.planDate) > new Date(current.planDate)
          ? prev
          : current;
      });

      if (last && last.length) {
        const lastDate = new Date(last.planDate);
        const duration = parseDuration(last.length);

        // Add duration and 10 min break
        const targetTime = new Date(
          lastDate.getTime() + (duration + 10) * 60000
        );

        // Round up to nearest 5 min
        const m = targetTime.getMinutes();
        const r = m % 5;
        if (r !== 0) {
          targetTime.setMinutes(m + (5 - r));
          targetTime.setSeconds(0);
          targetTime.setMilliseconds(0);
        }

        // Set date to last movie's date (per instructions)
        dateValue = formatDateLocal(last.planDate);

        // Set time to calculated time
        const hh = String(targetTime.getHours()).padStart(2, "0");
        const mm = String(targetTime.getMinutes()).padStart(2, "0");
        timeValue = `${hh}:${mm}`;
      }
    }
  }

  if (!dateValue) {
    dateValue = formatDateLocal(new Date());
  }
  if (!timeValue) {
    const now = new Date();
    const minutes = now.getMinutes();
    const rounded = minutes % 5 === 0 ? minutes : minutes + (5 - (minutes % 5));
    now.setMinutes(rounded);
    now.setSeconds(0);
    now.setMilliseconds(0);
    timeValue = formatTimeLocal(now);
  }

  if (dateEl) {
    dateEl.value = dateValue;
  }
  if (timeEl) {
    timeEl.value = timeValue;
  }
  const baseDate = dateValue ? new Date(dateValue) : new Date();
  planCalendarYear = baseDate.getFullYear();
  planCalendarMonth = baseDate.getMonth();
  renderPlanCalendar(dateValue);
  document.getElementById("planDateModal").style.display = "block";
}

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
    const frame = document.getElementById("orderPlayerFrame");
    if (frame) {
      frame.src = "about:blank";
    }
    document.body.classList.remove("order-player-fullscreen");
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
    resetDetailsInlineEdits(modal);
  }
  if (shouldReset) {
    resetForm();
  }
}

// Переключение режимов
function switchMode(mode) {
  currentMode = mode;

  // Обновление кнопок
  document
    .querySelectorAll("#addMovieModal .mode-btn")
    .forEach((btn) => btn.classList.remove("active"));
  event.target.classList.add("active");

  // Показ/скрытие форм
  if (mode === "auto") {
    document.getElementById("autoMode").style.display = "block";
    document.getElementById("manualMode").style.display = "none";
  } else {
    document.getElementById("autoMode").style.display = "none";
    document.getElementById("manualMode").style.display = "block";
  }
}

function switchWatchlistMode(mode) {
  currentWatchlistMode = mode;

  document
    .querySelectorAll("#addWatchlistModal .mode-btn")
    .forEach((btn) => btn.classList.remove("active"));
  event.target.classList.add("active");

  if (mode === "auto") {
    document.getElementById("watchAutoMode").style.display = "block";
    document.getElementById("watchManualMode").style.display = "none";
  } else {
    document.getElementById("watchAutoMode").style.display = "none";
    document.getElementById("watchManualMode").style.display = "block";
  }
}

function switchGameMode(mode) {
  currentGameMode = mode;

  document
    .querySelectorAll("#addGameModal .mode-btn")
    .forEach((btn) => btn.classList.remove("active"));
  event.target.classList.add("active");

  if (mode === "auto") {
    document.getElementById("gameAutoMode").style.display = "block";
    document.getElementById("gameManualMode").style.display = "none";
    document.getElementById("gameAutoModeField").style.display = "block";
    document.getElementById("gameManualModeField").style.display = "none";
  } else {
    document.getElementById("gameAutoMode").style.display = "none";
    document.getElementById("gameManualMode").style.display = "block";
    document.getElementById("gameAutoModeField").style.display = "none";
    document.getElementById("gameManualModeField").style.display = "block";
  }
}

function switchPlayedGameMode(mode) {
  currentPlayedGameMode = mode;

  document
    .querySelectorAll("#addPlayedGameModal .mode-btn")
    .forEach((btn) => btn.classList.remove("active"));
  event.target.classList.add("active");

  if (mode === "auto") {
    document.getElementById("playedGameAutoMode").style.display = "block";
    document.getElementById("playedGameManualMode").style.display = "none";
    document.getElementById("playedGameAutoModeField").style.display = "block";
    document.getElementById("playedGameManualModeField").style.display = "none";
  } else {
    document.getElementById("playedGameAutoMode").style.display = "none";
    document.getElementById("playedGameManualMode").style.display = "block";
    document.getElementById("playedGameAutoModeField").style.display = "none";
    document.getElementById("playedGameManualModeField").style.display = "block";
  }
}

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
