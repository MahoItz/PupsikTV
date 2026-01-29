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
    img.src = sortAscending ? "images/up-arrow.webp" : "images/down-arrow.webp";
    img.alt = "";
    img.className = "sort-arrow";

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
  applyRouletteAutofill({ force: true, triggerSuggestions: true });
}

function openAddToWatchlistModal() {
  document.getElementById("addWatchlistModal").style.display = "block";
}

function showDuplicateModal() {
  document.getElementById("duplicateModal").style.display = "block";
}

function showSearchReminderModal() {
  document.getElementById("searchReminderModal").style.display = "block";
}

function openRateModal(id) {
  ratingMovieId = id;
  const item = watchlist.find((w) => w.id === id);
  if (item) {
    document.getElementById("rateMovieTitle").textContent = item.title;
    document.getElementById("rateMoviePoster").src = item.poster;
  } else {
    document.getElementById("rateMovieTitle").textContent = "";
    document.getElementById("rateMoviePoster").src =
      "https://via.placeholder.com/300x400?text=Нет+постера";
  }
  document.getElementById("rateMovieModal").style.display = "block";
  setRatingStars("rateMovieStars", 0);
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
  setRatingStars("rateGameStars", 0);
  setupRatingStars("rateGameStars");
}

function openUserRateModal(id) {
  if (ratedMovies[id]) {
    alert("Вы уже оценили этот фильм");
    return;
  }
  userRatingMovieId = id;
  const movie = allMovies.find((m) => m.id === id);
  if (movie) {
    document.getElementById("userRateMovieTitle").textContent = movie.title;
    document.getElementById("userRateMoviePoster").src = movie.poster;
    setRatingStars("userRateStars", 0);
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
    setRatingStars("userRateGameStars", 0);
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

function renderActorsList(listId, sectionId, actorsValue) {
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

  actors.forEach((actor) => {
    const li = document.createElement("li");
    li.textContent = actor;
    listEl.appendChild(li);
  });

  sectionEl.style.display = "block";
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
    const tmdbUrl = `${buildApiPath("/tmdb")}?${params.toString()}`;
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
  if (!id || !studiosData || !supabaseClient) return;

  try {
    const studiosJson = JSON.stringify(studiosData);
    const { error } = await supabaseClient
      .from(tableName)
      .update({ studios: studiosJson })
      .eq("id", id);

    if (error) {
      console.error(`Failed to save studios to ${tableName}`, error);
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
    setMovieStudiosStatus(section, "Ищем на Кинопоиске...");
    const kpFilm = await searchKinopoiskByTitleYear(title, year);

    if (requestId !== movieStudiosRequestId) return;

    if (!kpFilm) {
      setMovieStudiosStatus(section, "Фильм не найден на Кинопоиске");
      return;
    }

    const kinopoiskId = kpFilm.filmId || kpFilm.kinopoiskId || kpFilm.id;

    setMovieStudiosStatus(section, "Получаем IMDb ID...");
    const imdbId = await fetchImdbIdFromKinopoiskFilm(kinopoiskId);

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
      titleEl.textContent = "Информация";
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
    const summary = actorsSection?.querySelector(".movie-details-actors-summary");
    if (summary) {
      summary.textContent = "Главные роли";
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

  if (!posterWrap || !headingsEl || !infoEl) {
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
  if (!section) {
    section = document.createElement("div");
    section.className = "movie-details-section";
    section.dataset.detailsInfo = key;

    const title = document.createElement("div");
    title.className = "movie-details-section-title";
    title.textContent = "Информация";

    const body = document.createElement("div");
    body.className = "movie-details-extra";

    section.append(title, body);
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
  if (actorsSection && legacyInfoSection && legacyInfoSection.contains(actorsSection)) {
    infoColumn?.insertBefore(actorsSection, ratingsSection?.nextSibling || null);
  } else if (ratingsSection && actorsSection && actorsSection.parentElement === infoColumn) {
    infoColumn.insertBefore(actorsSection, ratingsSection.nextSibling);
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

function openMovieDetailsModal(id) {
  const movie = allMovies.find((m) => m.id === id);
  const modal = document.getElementById("movieDetailsModal");
  if (!movie || !modal) return;

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
    movie.actors
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
  setSectionTitleByValueId("movieDetailsPupsikRating", "Оценки");

  reorderDetailsLayout(modal, {
    key: "movie",
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
    votesEl.textContent = `Голосов: ${votes}`;
    votesEl.classList.toggle("movie-details-muted", votes === 0);
  }

  handleMovieDetailsStudios(movie, modal);

  alignDetailsPoster(modal);
  modal.style.display = "block";
}

function openGameDetailsModal(id) {
  const game = allPlayedGames.find((g) => g.id === id);
  const modal = document.getElementById("gameDetailsModal");
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
  setMovieDetailsText(
    "gameDetailsDate",
    game.dateAdded ? formatDateTime(game.dateAdded) : ""
  );
  setMovieDetailsText("gameDetailsOrderBy", orderByValue);
  setMovieDetailsText("gameDetailsOrderType", orderTypeValue);
  setMovieDetailsText("gameDetailsPupsikRating", game.rating);
  setMovieDetailsText("gameDetailsUserRating", game.userRating ?? "-");

  const votes = Math.round(game.ratingCount ?? 0);
  const votesEl = document.getElementById("gameDetailsVotes");
  if (votesEl) {
    votesEl.textContent = `Голосов: ${votes}`;
    votesEl.classList.toggle("movie-details-muted", votes === 0);
  }

  alignDetailsPoster(modal);
  modal.style.display = "block";
}

function renderOrderDetailsModal(order) {
  const modal = document.getElementById("orderDetailsModal");
  if (!order || !modal) return;

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
    order.actors
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
  setSectionTitleByValueId("orderDetailsKpRating", "Оценки");

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
  setMovieDetailsText("gameOrderDetailsOrderType", orderTypeValue);

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
    const { data, error } = await supabaseClient
      .from("movies")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new Error("Movie delete was blocked by security rules.");
    }

    localStorage.setItem("moviesCache", JSON.stringify(allMovies));
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
    const { data, error } = await supabaseClient
      .from("Movie_Orders")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new Error("Movie order delete was blocked by security rules.");
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
    const { data, error } = await supabaseClient
      .from("Game_Orders")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new Error("Game order delete was blocked by security rules.");
    }
    await deleteGamePosterFromStorage(removedOrder.poster);
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

function openEditGameModal(id) {
  editingGameId = id;
  const game = gameOrders.find((g) => g.id === id);
  if (!game) return;
  const preview = document.getElementById("editGamePosterPreview");
  const overlay = preview.parentElement.nextElementSibling;
  if (overlay && overlay.classList.contains("poster-overlay")) overlay.remove();
  steamGridPoster = null;
  steamGridPosters = [];
  resetRawgPosterCache();
  document.getElementById("editGameTitle").value = game.title;
  document.getElementById("editGameYear").value = game.year || "";
  document.getElementById("editGameGenres").value = game.genres || "";
  document.getElementById("editGameOrderBy").value = game.orderBy || "";
  document.getElementById("editGameOrderType").value = game.orderType || "";
  preview.src = game.poster;
  document.getElementById("editGamePoster").value = "";
  editGamePosterData = null;
  const delBtn = document.getElementById("deleteGameBtn");
  if (delBtn) {
    delBtn.onclick = () => {
      closeModal("editGameModal");
      openConfirmDeleteGameOrderModal(id);
    };
  }
  document.getElementById("editGameModal").style.display = "block";
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
  setRatingStars("playedGameRatingStars", 0);
  setupRatingStars("playedGameRatingStars");
}

function openConfirmDeleteMovieModal(id) {
  deleteMovieId = id;
  document.getElementById("confirmDeleteMovieModal").style.display = "block";
}

async function confirmDeleteMovie() {
  if (deleteMovieId !== null) {
    await performDeleteMovie(deleteMovieId);
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

function openEditOrderModal(id) {
  editingOrderId = id;
  const order = watchlist.find((o) => o.id === id);
  if (!order) return;
  document.getElementById("editOrderTitle").value = order.title;
  document.getElementById("editOrderOriginTitle").value =
    order.originalTitle || "";
  document.getElementById("editOrderYear").value = order.year || "";
  document.getElementById("editOrderGenre").value = order.genres || "";
  document.getElementById("editOrderBy").value = order.orderBy || "";
  document.getElementById("editOrderType").value = order.orderType || "";
  document.getElementById("editOrderPosterPreview").src = order.poster;
  document.getElementById("editOrderPoster").value = "";
  editOrderPosterData = null;
  const delBtn = document.getElementById("deleteOrderBtn");
  if (delBtn) {
    delBtn.onclick = () => {
      closeModal("editOrderModal");
      openConfirmDeleteOrderModal(id);
    };
  }
  document.getElementById("editOrderModal").style.display = "block";
}

function closeModal(modalId, shouldReset = false) {
  document.getElementById(modalId).style.display = "none";
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
  } else {
    document.getElementById("gameAutoMode").style.display = "none";
    document.getElementById("gameManualMode").style.display = "block";
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
  } else {
    document.getElementById("playedGameAutoMode").style.display = "none";
    document.getElementById("playedGameManualMode").style.display = "block";
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

// Настройка звездного рейтинга
function setupRatingStars(containerId = "ratingStars") {
  const container = document.getElementById(containerId);
  const stars = container.querySelectorAll(".rating-star");
  const inputId = container.dataset.input;
  const ratingInput = inputId ? document.getElementById(inputId) : null;

  stars.forEach((star) => {
    star.addEventListener("click", function () {
      const rating = parseInt(this.dataset.rating);
      setRatingStars(containerId, rating);
    });

    star.addEventListener("mouseover", function () {
      const rating = parseInt(this.dataset.rating);
      highlightStars(containerId, rating);
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
    highlightStars(containerId, currentRating);
    hideRatingValueTooltip();
  });

  if (ratingInput) {
    ratingInput.addEventListener("input", function () {
      const value = parseFloat(this.value.replace(/,/, "."));
      if (!isNaN(value) && value >= 0 && value <= 11) {
        this.setCustomValidity("");
        setRatingStars(containerId, value, false);
      } else {
        this.setCustomValidity("Введите число от 0 до 11");
        this.reportValidity();
      }
    });
  }
}

function setRatingStars(containerId, rating, updateInput = true) {
  const container = document.getElementById(containerId);
  const stars = container.querySelectorAll(".rating-star");
  container.dataset.currentRating = rating;
  const inputId = container.dataset.input;
  if (updateInput && inputId) {
    const inp = document.getElementById(inputId);
    if (inp) inp.value = String(rating).replace(".", ",");
  }
  stars.forEach((star) => star.classList.remove("active"));

  if (rating === 0) {
    stars[0]?.classList.add("active");
  } else if (rating >= 1 && rating <= 10) {
    for (let i = 1; i <= rating; i++) {
      stars[i]?.classList.add("active");
    }
  } else if (rating === 11) {
    for (let i = 1; i <= 10; i++) {
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

  stars.forEach((star, index) => {
    // Удаляем маску и цвет
    star.classList.remove("hovered");
    star.style.backgroundColor = "rgba(255, 235, 59, 0.3)";

    if (star.classList.contains("rating-label")) {
      star.style.backgroundColor = "transparent";
    }
  });

  if (rating >= 1 && rating <= 10) {
    for (let i = 1; i <= rating; i++) {
      stars[i].style.backgroundColor = "#ffc107";
      stars[i].classList.add("hovered");
    }
  } else if (rating === 11) {
    for (let i = 1; i <= 10; i++) {
      stars[i].style.backgroundColor = "#ffc107";
      stars[i].classList.add("hovered");
    }
  }
}

function getCurrentRating(containerId) {
  const container = document.getElementById(containerId);
  return parseFloat(container.dataset.currentRating) || 0;
}

function isRatingValid(r) {
  return typeof r === "number" && !isNaN(r) && r >= 0 && r <= 11;
}

function getRatingValue(inputId) {
  const el = document.getElementById(inputId);
  return el ? parseFloat(el.value.replace(/,/, ".")) : NaN;
}
