// Отображение фильмов
function getFilteredSortedMovies() {
  let result = allMovies.filter((movie) =>
    matchesSelectedOrderTypes(movie, "movies")
  );

  const normalizedQuery = normalizeSearchText(currentSearchQuery);

  if (normalizedQuery) {
    const queryDigits = normalizedQuery.replace(/\D+/g, "");
    const useYearSearch = shouldUseYearSearch(normalizedQuery, queryDigits);

    // Вес совпадения для каждого фильма
    const scored = result.map((movie) => {
      let score = 0;

      // Название
      score = Math.max(
        score,
        scoreMatch(normalizedQuery, movie.title),
        scoreMatch(
          normalizedQuery,
          movie.originalTitle || movie.original_title || ""
        )
      );

      // Жанры
      score = Math.max(
        score,
        scoreMatch(normalizedQuery, movie.genre || movie.genres || "") - 10
      );

      // Ник заказчика
      score = Math.max(
        score,
        scoreStrictIdentifierMatch(normalizedQuery, movie.orderBy || "") - 5
      );

      // Год
      const yearString = movie.year ? String(movie.year) : "";
      const normalizedYear = normalizeSearchText(yearString);
      if (
        (normalizedYear && normalizedYear.includes(normalizedQuery)) ||
        (useYearSearch && yearString.includes(queryDigits))
      ) {
        score += 5;
      }

      return { movie, searchScore: score };
    });

    result = scored
      .filter((item) => item.searchScore > 0)
      .sort((a, b) => b.searchScore - a.searchScore)
      .map((item) => item.movie);

    return result;
  }

  switch (currentSort) {
    case "title":
      result.sort((a, b) =>
        sortAscending
          ? a.title.localeCompare(b.title)
          : b.title.localeCompare(a.title)
      );
      break;
    case "year":
      result.sort((a, b) => (sortAscending ? a.year - b.year : b.year - a.year));
      break;
    case "rating":
      result.sort((a, b) =>
        sortAscending ? a.rating - b.rating : b.rating - a.rating
      );
      break;
    case "date":
    default:
      result.sort((a, b) => (sortAscending ? a.id - b.id : b.id - a.id));
      break;
  }

  return result;
}

const MOVIE_RENDER_KEY_DELIMITER = "\u001F";

const kpFallbackCache = new Map();
let kpFallbackRequestId = 0;
const KP_FALLBACK_POSTER_PLACEHOLDER =
  "images/placeholder-poster.webp";
const kpFallbackDetailsCache = new Map();
const kpFallbackStaffCache = new Map();
const kpFallbackOrderCache = new Map();

function buildKinopoiskSearchLink(query) {
  return `https://www.kinopoisk.ru/index.php?kp_query=${encodeURIComponent(
    query
  )}`;
}

function createKpFallbackCard(film) {
  const card = document.createElement("div");
  card.className = "kp-fallback-card";

  const poster = document.createElement("img");
  const title = film?.nameRu || film?.nameEn || "Без названия";
  poster.src =
    film?.posterUrlPreview || film?.posterUrl || KP_FALLBACK_POSTER_PLACEHOLDER;
  poster.alt = title;
  poster.loading = "lazy";
  poster.className = "kp-fallback-poster";
  poster.onerror = () => {
    poster.onerror = null;
    poster.src = KP_FALLBACK_POSTER_PLACEHOLDER;
  };

  const info = document.createElement("div");
  info.className = "kp-fallback-info";

  const nameEl = document.createElement("div");
  nameEl.className = "kp-fallback-title";
  nameEl.textContent = title;

  const meta = document.createElement("div");
  meta.className = "kp-fallback-meta";
  const year = film?.year ? String(film.year) : "";
  meta.textContent = year;

  const genres = document.createElement("div");
  genres.className = "kp-fallback-genres";
  genres.textContent = film?.genres?.map((g) => g.genre).join(", ") || "";

  const ratingRow = document.createElement("div");
  ratingRow.className = "kp-fallback-kp-rating";
  const kpImg = document.createElement("img");
  kpImg.src = "/images/kinopoisk-icon-main.svg";
  kpImg.alt = "KP Rate";
  const ratingText = document.createElement("span");
  ratingText.textContent = film?.rating ? String(film.rating) : "-";
  ratingRow.append(kpImg, ratingText);

  info.append(nameEl, meta, genres, ratingRow);

  const link = document.createElement("a");
  link.className = "kp-fallback-open";
  link.textContent = "Открыть на КП";
  if (film?.filmId) {
    link.href = `https://www.kinopoisk.ru/film/${film.filmId}/`;
  } else {
    link.href = buildKinopoiskSearchLink(title);
  }
  link.target = "_blank";
  link.rel = "noopener noreferrer";

  const infoBtn = document.createElement("button");
  infoBtn.type = "button";
  infoBtn.className = "kp-fallback-info-btn";
  infoBtn.textContent = "Инфо";
  infoBtn.addEventListener("click", (event) => {
    event.preventDefault();
    openKpFallbackDetailsModal(film);
  });

  const actions = document.createElement("div");
  actions.className = "kp-fallback-actions";
  actions.append(infoBtn, link);

  card.append(poster, info, actions);
  return card;
}

function renderKpFallbackResults(listEl, results) {
  listEl.innerHTML = "";
  results
    .slice(0, 6)
    .forEach((film) => listEl.appendChild(createKpFallbackCard(film)));
}

async function loadKpFallbackResults(query, sectionEl) {
  if (!sectionEl) return;
  const listEl = sectionEl.querySelector(".kp-fallback-list");
  const statusEl = sectionEl.querySelector(".kp-fallback-status");
  const linkEl = sectionEl.querySelector(".kp-fallback-link");
  const normalizedQuery = query.trim();
  if (linkEl) linkEl.href = buildKinopoiskSearchLink(normalizedQuery);
  if (!listEl || !statusEl || !normalizedQuery) return;

  if (!KINOPOISK_API_KEY) {
    statusEl.textContent =
      "Чтобы показать результаты Кинопоиска, нужен API-ключ.";
    listEl.innerHTML = "";
    return;
  }

  const cached = kpFallbackCache.get(normalizedQuery);
  if (cached) {
    if (cached.length === 0) {
      statusEl.textContent = "На Кинопоиске тоже ничего не найдено.";
      listEl.innerHTML = "";
      return;
    }
    statusEl.textContent = `Найдено на Кинопоиске: ${cached.length}`;
    renderKpFallbackResults(listEl, cached);
    return;
  }

  const requestId = ++kpFallbackRequestId;
  statusEl.textContent = "Ищем на Кинопоиске...";
  listEl.innerHTML = "";

  try {
    const res = await fetch(
      `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(
        normalizedQuery
      )}&page=1`,
      {
        headers: {
          "X-API-KEY": KINOPOISK_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );
    if (!res.ok) {
      const handled = await handleKinopoiskErrorResponse(res);
      if (!handled) {
        statusEl.textContent = "Не удалось получить результаты Кинопоиска.";
      }
      return;
    }
    const data = await res.json();
    if (requestId !== kpFallbackRequestId) return;
    const results = data.films || [];
    kpFallbackCache.set(normalizedQuery, results);
    if (!results.length) {
      statusEl.textContent = "На Кинопоиске тоже ничего не найдено.";
      listEl.innerHTML = "";
      return;
    }
    const shown = Math.min(results.length, 6);
    statusEl.textContent = `Найдено на Кинопоиске: ${results.length}. Показано: ${shown}`;
    renderKpFallbackResults(listEl, results);
  } catch (err) {
    console.error("Kinopoisk fallback search error", err);
    if (requestId !== kpFallbackRequestId) return;
    statusEl.textContent = "Не удалось получить результаты Кинопоиска.";
  }
}

async function fetchKpFallbackDetails(filmId) {
  if (!filmId || !KINOPOISK_API_KEY) return null;
  if (kpFallbackDetailsCache.has(filmId)) {
    return kpFallbackDetailsCache.get(filmId);
  }
  try {
    const res = await fetch(`${KINOPOISK_FILM_URL}/${encodeURIComponent(filmId)}`, {
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
    kpFallbackDetailsCache.set(filmId, data || null);
    return data || null;
  } catch (err) {
    console.error("Kinopoisk details error", err);
    return null;
  }
}

async function fetchKpFallbackStaff(filmId) {
  if (!filmId || !KINOPOISK_API_KEY) return { actors: [], directors: [] };
  if (kpFallbackStaffCache.has(filmId)) {
    return kpFallbackStaffCache.get(filmId);
  }
  const staff = await fetchKPFilmStaff(filmId);
  kpFallbackStaffCache.set(filmId, staff);
  return staff;
}

function buildKpFallbackOrder(film, details, staff) {
  const title =
    details?.nameRu || film?.nameRu || details?.nameEn || film?.nameEn || "";
  const originalTitle =
    details?.nameOriginal || details?.nameEn || film?.nameEn || "";
  const poster =
    details?.posterUrlPreview ||
    details?.posterUrl ||
    film?.posterUrlPreview ||
    film?.posterUrl ||
    KP_FALLBACK_POSTER_PLACEHOLDER;
  const genres = details?.genres || film?.genres || [];
  const countries = details?.countries || [];
  const genreText = Array.isArray(genres)
    ? genres.map((g) => g.genre).filter(Boolean).join(", ")
    : "";
  const countryText = Array.isArray(countries)
    ? countries.map((c) => c.country).filter(Boolean).join(", ")
    : "";
  const kpRating =
    details?.ratingKinopoisk || details?.ratingImdb || film?.rating || "-";
  const length = details?.filmLength || "";
  const staffData = staff || { actors: [], directors: [] };
  const directorText = Array.isArray(staffData.directors)
    ? staffData.directors.join(", ")
    : "";

  return {
    id: film?.filmId ? `kp-${film.filmId}` : `kp-${Date.now()}`,
    __virtual: true,
    title: title || "Без названия",
    originalTitle: originalTitle || "",
    year: details?.year || film?.year || "",
    genres: genreText,
    length,
    kpRating,
    poster,
    description: details?.description || details?.shortDescription || "",
    country: countryText,
    director: directorText,
    actors: staffData.actors || [],
    kinopoiskId: film?.filmId || null,
    imdbId: details?.imdbId || null,
  };
}

async function openKpFallbackDetailsModal(film) {
  if (!film) return;
  const filmId = film?.filmId || null;
  if (filmId && kpFallbackOrderCache.has(filmId)) {
    const cachedOrder = kpFallbackOrderCache.get(filmId);
    if (typeof openOrderDetailsModalFromData === "function") {
      openOrderDetailsModalFromData(cachedOrder);
    }
    if (
      typeof fetchOrderParentGuideForOrder === "function" &&
      cachedOrder.kinopoiskId &&
      KINOPOISK_API_KEY &&
      !cachedOrder.parentGuideStatus
    ) {
      fetchOrderParentGuideForOrder(cachedOrder);
    }
    return;
  }
  let details = null;
  let staff = null;
  if (filmId && KINOPOISK_API_KEY) {
    [details, staff] = await Promise.all([
      fetchKpFallbackDetails(filmId),
      fetchKpFallbackStaff(filmId),
    ]);
  }

  const order = buildKpFallbackOrder(film, details, staff);
  if (filmId) {
    kpFallbackOrderCache.set(filmId, order);
  }

  if (typeof openOrderDetailsModalFromData === "function") {
    openOrderDetailsModalFromData(order);
  }

  if (
    typeof fetchOrderParentGuideForOrder === "function" &&
    order.kinopoiskId &&
    KINOPOISK_API_KEY
  ) {
    fetchOrderParentGuideForOrder(order);
  }
}

// Movie cards depend on the following fields plus admin/user rating flags:
// id, poster, title, originalTitle, genre, year, rating, kpRating, userRating,
// ratingCount, dateAdded, orderBy, orderType.
function normalizeRenderKeyValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toString(10) : "";
  }
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value);
}

function getMovieRenderKey(movie) {
  const ratedValue = getRatedMovieValue(movie) ?? "";
  const parts = [
    movie?.id,
    movie?.poster,
    movie?.title,
    movie?.originalTitle,
    movie?.genre,
    movie?.year,
    movie?.rating,
    movie?.kpRating,
    movie?.userRating,
    movie?.ratingCount,
    movie?.dateAdded,
    movie?.orderBy,
    movie?.orderType,
    ratedValue,
    hasRatedMovie(movie),
    isAdmin,
  ];
  return parts.map(normalizeRenderKeyValue).join(MOVIE_RENDER_KEY_DELIMITER);
}

function refreshMovieRateButtons(root = document) {
  const cards = root.querySelectorAll("#moviesGrid .movie-card[data-id]");
  cards.forEach((card) => {
    const button = card.querySelector(".movie-actions .btn-rate");
    if (!button) return;

    const movieId = Number(card.dataset.id);
    const movie = allMovies.find((item) => Number(item.id) === movieId) || movieId;
    const hasRating = hasRatedMovie(movie);

    button.disabled = false;
    button.textContent = hasRating ? "Изменить" : "Оценить";
    button.title = hasRating ? "Изменить свою оценку" : "Оценить";
    button.onclick = () => openUserRateModal(movieId);
  });
}

function renderMovies() {
  const grid = document.getElementById("moviesGrid");
  if (!grid) return;
  if (typeof moviesLoading !== "undefined" && moviesLoading) {
    return;
  }

  const normalizedQuery = normalizeSearchText(currentSearchQuery);
  const filtered = getFilteredSortedMovies();
  totalMovies = filtered.length;
  const countEl = document.getElementById("moviesCount");
  if (countEl) {
    countEl.textContent = totalMovies;
  }
  const start = (currentPage - 1) * moviesPerPage;
  movies = filtered.slice(start, start + moviesPerPage);

  if (movies.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.style.gridColumn = "1 / -1";

    const message = document.createElement("div");
    message.textContent = "Ничего не найдено";

    const image = document.createElement("img");
    image.src = "images/Sad_Winston.webp";
    image.alt = "Ничего не найдено";

    emptyState.append(message, image);

    if (normalizedQuery) {
      const kpSection = document.createElement("div");
      kpSection.className = "kp-fallback";
      kpSection.style.gridColumn = "1 / -1";

      const header = document.createElement("div");
      header.className = "kp-fallback-header";

      const title = document.createElement("div");
      title.className = "kp-fallback-heading";
      title.textContent = "Найдено на Кинопоиске";

      const status = document.createElement("div");
      status.className = "kp-fallback-status";

      header.append(title, status);

      const list = document.createElement("div");
      list.className = "kp-fallback-list";

      const link = document.createElement("a");
      link.className = "kp-fallback-link";
      link.textContent = "Открыть поиск Кинопоиска";
      link.target = "_blank";
      link.rel = "noopener noreferrer";

      kpSection.append(header, list, link);

      grid.replaceChildren(emptyState, kpSection);
      loadKpFallbackResults(normalizedQuery, kpSection);
    } else {
      grid.replaceChildren(emptyState);
    }
    movieCardElements = new Map();
    movieDataMap = new Map();
    hasRenderedMovies = false;
    renderPagination();
    return;
  }

  const newElements = new Map();
  const newData = new Map();
  const orderedCards = [];

  movies.forEach((movie) => {
    const dataKey = getMovieRenderKey(movie);
    let card = movieCardElements.get(movie.id);
    const prevData = movieDataMap.get(movie.id);
    if (!card || prevData !== dataKey) {
      if (card) card.remove();
      card = createMovieCard(movie, isAdmin, true, { clickable: true });
    }
    newElements.set(movie.id, card);
    newData.set(movie.id, dataKey);
    orderedCards.push(card);
  });

  if (!hasRenderedMovies) {
    grid.replaceChildren(...orderedCards);
    hasRenderedMovies = true;
  } else {
    orderedCards.forEach((card) => grid.appendChild(card));
    movieCardElements.forEach((card, id) => {
      if (!newElements.has(id)) card.remove();
    });
  }

  movieCardElements = newElements;
  movieDataMap = newData;
  refreshMovieRateButtons(grid);

  renderPagination();
}

function renderPagination() {
  const container = document.getElementById("pagination");
  if (!container) return;
  container.innerHTML = "";

  const totalPages = Math.ceil(totalMovies / moviesPerPage);
  if (totalPages <= 1) return;

  const addBtn = (label, page, opts = {}) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.className = opts.class || "page-btn";
    btn.disabled = opts.disabled || false;
    if (opts.active) btn.classList.add("active");
    if (page)
      btn.onclick = () => {
        currentPage = page;
        renderMovies();
      };
    container.appendChild(btn);
  };

  addBtn("«", currentPage - 1, { disabled: currentPage === 1 });

  addBtn("1", 1, { active: currentPage === 1 });

  let start = Math.max(2, currentPage - 1);
  let end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) {
    const span = document.createElement("span");
    span.textContent = "...";
    span.className = "ellipsis";
    container.appendChild(span);
  }

  for (let i = start; i <= end; i++) {
    addBtn(String(i), i, { active: i === currentPage });
  }

  if (end < totalPages - 1) {
    const span = document.createElement("span");
    span.textContent = "...";
    span.className = "ellipsis";
    container.appendChild(span);
  }

  if (totalPages > 1) {
    addBtn(String(totalPages), totalPages, {
      active: currentPage === totalPages,
    });
  }

  addBtn("»", currentPage + 1, { disabled: currentPage === totalPages });
}

// Создание карточки фильма
function shouldIgnoreMovieCardClick(event) {
  if (!event) return false;
  return Boolean(
    event.target.closest(
      ".movie-actions, .rating-item, button, a, input, select, textarea, label"
    )
  );
}

function createMovieCard(
  movie,
  showActions = isAdmin,
  showRateButton = true,
  options = {}
) {
  const { showRatings = true, showDate = true, clickable = false } = options;
  const card = document.createElement("div");
  card.dataset.id = movie.id;
  let cardClass = "movie-card";
  // Avoid highlighting preview cards as "worst" before a movie is saved
  if (movie.rating === 0 && movie.id !== 0) cardClass += " rating-low";
  if (movie.rating === 11 && movie.id !== 0) cardClass += " rating-high";
  card.className = cardClass;
  if (clickable) {
    card.classList.add("movie-card--clickable");
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Открыть карточку фильма: ${movie.title}`);
    card.addEventListener("click", (event) => {
      if (shouldIgnoreMovieCardClick(event)) return;
      openMovieDetailsModal(movie.id);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (shouldIgnoreMovieCardClick(event)) return;
      event.preventDefault();
      openMovieDetailsModal(movie.id);
    });
  }

  const poster = document.createElement("img");
  poster.src = movie.poster;
  poster.alt = movie.title;
  poster.className = "movie-poster";
  poster.loading = "lazy";
  const placeholder = document.createElement("div");
  placeholder.className = "movie-poster-placeholder";
  placeholder.style.display = "none";
  const placeholderText = document.createElement("span");
  placeholderText.textContent = "Нет постера";
  placeholder.appendChild(placeholderText);
  poster.onerror = () => {
    poster.onerror = null;
    poster.src = KP_FALLBACK_POSTER_PLACEHOLDER;
    poster.style.display = "";
    placeholder.style.display = "none";
  };

  const orderByText =
    movie.orderBy && movie.orderBy !== "null" ? movie.orderBy : "";
  const ribbonClass = ORDER_TYPE_CLASSES[movie.orderType];
  let ribbon;
  if (orderByText) {
    ribbon = document.createElement("div");
    ribbon.className = `order-badge ${ribbonClass}`;
    ribbon.textContent = orderByText;
  }

  const info = document.createElement("div");
  info.className = "movie-info";

  const header = document.createElement("div");
  header.className = "movie-header";
  const title = document.createElement("div");
  title.className = "movie-title";
  title.textContent = movie.title;
  header.appendChild(title);
  info.appendChild(header);

  const originalTitle = document.createElement("div");
  originalTitle.className = "movie-original-title";
  originalTitle.textContent = movie.originalTitle;
  info.appendChild(originalTitle);

  const genres = document.createElement("div");
  genres.className = "movie-genres";
  genres.textContent = movie.genre;
  info.appendChild(genres);

  const year = document.createElement("div");
  year.className = "movie-year";
  year.textContent = movie.year;
  info.appendChild(year);

  if (showRatings) {
    const rating = document.createElement("div");
    rating.className = "movie-rating";

    const ratingItem1 = document.createElement("div");
    ratingItem1.className = "rating-item";
    const icon1 = document.createElement("img");
    icon1.src = "images/Pupsik_TV_Icon.webp";
    icon1.alt = "Pupsik Rate";
    const span1 = document.createElement("span");
    span1.textContent = `${movie.rating}`;
    ratingItem1.appendChild(icon1);
    ratingItem1.appendChild(span1);
    ratingItem1.addEventListener("mouseenter", (e) => {
      if (!ratingTooltip) return;
      ratingTooltip.textContent = `Оценка Pupsik_ow`;
      ratingTooltip.style.display = "block";
      ratingTooltip.style.left = e.pageX + 10 + "px";
      ratingTooltip.style.top = e.pageY + 10 + "px";
    });
    ratingItem1.addEventListener("mousemove", (e) => {
      if (!ratingTooltip) return;
      ratingTooltip.style.left = e.pageX + 10 + "px";
      ratingTooltip.style.top = e.pageY + 10 + "px";
    });
    ratingItem1.addEventListener("mouseleave", () => {
      if (!ratingTooltip) return;
      ratingTooltip.style.display = "none";
    });
    rating.appendChild(ratingItem1);

    const ratingItem2 = document.createElement("div");
    ratingItem2.className = "rating-item kp-rating-item";
    const icon2 = document.createElement("img");
    icon2.src = "/images/kinopoisk-icon-main.svg";
    icon2.alt = "KP Rate";
    const span2 = document.createElement("span");
    span2.textContent = movie.kpRating ?? "-";
    ratingItem2.appendChild(icon2);
    ratingItem2.appendChild(span2);
    ratingItem2.addEventListener("click", () =>
      openKinopoiskPageForRecord({ item: movie, table: "movies" })
    );
    ratingItem2.addEventListener("mouseenter", (e) => {
      if (!ratingTooltip) return;
      ratingTooltip.textContent = `Перейти на Кинопоиск`;
      ratingTooltip.style.display = "block";
      ratingTooltip.style.left = e.pageX + 10 + "px";
      ratingTooltip.style.top = e.pageY + 10 + "px";
    });
    ratingItem2.addEventListener("mousemove", (e) => {
      if (!ratingTooltip) return;
      ratingTooltip.style.left = e.pageX + 10 + "px";
      ratingTooltip.style.top = e.pageY + 10 + "px";
    });
    ratingItem2.addEventListener("mouseleave", () => {
      if (!ratingTooltip) return;
      ratingTooltip.style.display = "none";
    });
    rating.appendChild(ratingItem2);

    const ratingItem3 = document.createElement("div");
    ratingItem3.className = "rating-item rating-user";
    const icon3 = document.createElement("i");
    icon3.className = "fa-solid fa-star";
    const span3 = document.createElement("span");
    span3.textContent = movie.userRating ?? "-";
    ratingItem3.appendChild(icon3);
    ratingItem3.appendChild(span3);
    const votes = Math.round(movie.ratingCount ?? 0);
    ratingItem3.addEventListener("mouseenter", (e) => {
      if (!ratingTooltip) return;
      ratingTooltip.textContent = `Оценок: ${votes}`;
      ratingTooltip.style.display = "block";
      ratingTooltip.style.left = e.pageX + 10 + "px";
      ratingTooltip.style.top = e.pageY + 10 + "px";
    });
    ratingItem3.addEventListener("mousemove", (e) => {
      if (!ratingTooltip) return;
      ratingTooltip.style.left = e.pageX + 10 + "px";
      ratingTooltip.style.top = e.pageY + 10 + "px";
    });
    ratingItem3.addEventListener("mouseleave", () => {
      if (!ratingTooltip) return;
      ratingTooltip.style.display = "none";
    });
    rating.appendChild(ratingItem3);
    info.appendChild(rating);
  }

  const footer = document.createElement("div");
  footer.className = "movie-footer";
  if (showDate) {
    const dateDiv = document.createElement("div");
    dateDiv.className = "movie-date";
    dateDiv.textContent = `${formatDate(movie.dateAdded)}`;
    footer.appendChild(dateDiv);
  }

  const actions = document.createElement("div");
  actions.className = "movie-actions";

  if (showRateButton) {
    const rateBtn = document.createElement("button");
    rateBtn.className = "btn btn-rate btn-icon";
    rateBtn.textContent = "Оценить";
    if (hasRatedMovie(movie)) {
      rateBtn.disabled = true;
      rateBtn.title = "Вы уже оценили";
    } else {
      rateBtn.onclick = () => openUserRateModal(movie.id);
    }
    actions.appendChild(rateBtn);
  }

  if (showActions) {
    // Inline editing is handled inside the details modal now.
  }

  footer.appendChild(actions);

  info.appendChild(footer);

  card.appendChild(poster);
  if (ribbon) card.appendChild(ribbon);
  card.appendChild(placeholder);
  card.appendChild(info);

  return card;
}

// Отображение списка к просмотру
function deriveKinopoiskIdFromOrder(order) {
  if (!order) return null;

  if (typeof getKinopoiskIdFromMovie === "function") {
    const resolved = getKinopoiskIdFromMovie(order);
    if (resolved) return resolved;
  }
  if (typeof extractKinopoiskIdFromValue === "function") {
    const extracted = extractKinopoiskIdFromValue(order.kinopoiskId);
    if (extracted) return extracted;
  }
  return order.kinopoiskId || null;
}

const ORDER_PLAYER_API_URL = "https://fbphdplay.top/api/players?kinopoisk=";
const ORDER_PLAYER_DEFAULT_TYPE = "Alloha";
const ORDER_PLAYER_EXTERNAL_BASE_URL = "https://flcksbr.xyz/film/";

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

function setupOrderPlayerFullscreenHandling() {
  if (setupOrderPlayerFullscreenHandling.initialized) return;
  setupOrderPlayerFullscreenHandling.initialized = true;

  const applyFullscreenState = () => {
    const fsElement = document.fullscreenElement;
    const isOrderPlayer =
      fsElement &&
      (fsElement.id === "orderPlayerFrame" ||
        (typeof fsElement.closest === "function" &&
          fsElement.closest("#orderPlayerModal")));
    document.body.classList.toggle(
      "order-player-fullscreen",
      Boolean(isOrderPlayer)
    );
  };

  document.addEventListener("fullscreenchange", applyFullscreenState);
  applyFullscreenState();
}

function setOrderPlayerLoading(isLoading, message) {
  const loader = document.getElementById("orderPlayerLoader");
  if (!loader) return;
  if (typeof message === "string") {
    const textEl = loader.querySelector(".order-player-loader-text");
    if (textEl) textEl.textContent = message;
  }
  loader.classList.toggle("is-visible", Boolean(isLoading));
}

function applyOrderPlayerUrl(url) {
  const frame = document.getElementById("orderPlayerFrame");
  const safeUrl = url || "";

  if (frame) {
    frame.src = safeUrl || "about:blank";
  }
}

function populateOrderPlayerSelect(select, items, getLabel) {
  if (!select) return;
  select.innerHTML = "";
  items.forEach((item, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = getLabel(item, index);
    select.appendChild(option);
  });
}

async function openOrderOnReyohoho(order) {
  const kpId = deriveKinopoiskIdFromOrder(order);
  if (!kpId) {
    if (typeof showToastNotification === "function") {
      showToastNotification("У фильма нет ID для запуска плеера.", "warning");
    } else {
      alert("У фильма нет ID для запуска плеера.");
    }
    return;
  }

  const modal = document.getElementById("orderPlayerModal");
  const titleEl = document.getElementById("orderPlayerTitle");
  const sourceSelect = document.getElementById("orderPlayerSourceSelect");
  const translationSelect = document.getElementById(
    "orderPlayerTranslationSelect"
  );
  const externalLink = document.getElementById("orderPlayerOpenExternal");
  const sourceControl = sourceSelect
    ? sourceSelect.closest(".order-player-control")
    : null;
  const translationControl = translationSelect
    ? translationSelect.closest(".order-player-control")
    : null;

  if (titleEl) {
    const title = order?.title ? `Смотреть: ${order.title}` : "Смотреть";
    titleEl.textContent = title;
  }
  if (modal) {
    modal.style.display = "block";
  }
  setOrderPlayerLoading(true, "Загрузка плеера…");
  applyOrderPlayerUrl("");
  if (externalLink) {
    externalLink.href = buildOrderExternalPlayerUrl(kpId);
  }

  try {
    const response = await fetch(`${ORDER_PLAYER_API_URL}${kpId}`);
    if (!response.ok) {
      throw new Error(`Player request failed: ${response.status}`);
    }
    const payload = await response.json();
    const providers = normalizeOrderPlayerProviders(payload);

    if (!providers.length) {
      throw new Error("No providers in response");
    }

    populateOrderPlayerSelect(
      sourceSelect,
      providers,
      (item, index) => item?.type || `Источник ${index + 1}`
    );

    if (sourceControl) {
      sourceControl.style.display = providers.length > 1 ? "" : "none";
    }

    const defaultProviderIndex = providers.findIndex(
      (item) =>
        (item?.type || "").toLowerCase() ===
        ORDER_PLAYER_DEFAULT_TYPE.toLowerCase()
    );
    const initialProviderIndex =
      defaultProviderIndex >= 0 ? defaultProviderIndex : 0;

    function setProvider(index) {
      const provider = providers[index] || providers[0];
      const translations = normalizeOrderPlayerTranslations(provider);

      populateOrderPlayerSelect(
        translationSelect,
        translations,
        (item, tIndex) =>
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
        const idx = Math.max(
          0,
          translations.indexOf(defaultTranslation || translations[0])
        );
        translationSelect.selectedIndex = idx;
      }

      const targetUrl =
        defaultTranslation?.iframeUrl || provider?.iframeUrl || "";
      if (targetUrl) {
        setOrderPlayerLoading(true, "Загрузка фильма…");
      }
      applyOrderPlayerUrl(targetUrl);
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
        const tIndex = Number(
          translationSelect.value || translationSelect.selectedIndex
        );
        const translation = translations[Number.isNaN(tIndex) ? 0 : tIndex];
      const targetUrl =
        translation?.iframeUrl || provider?.iframeUrl || "";
      if (targetUrl) {
        setOrderPlayerLoading(true, "Загрузка фильма…");
      }
      applyOrderPlayerUrl(targetUrl);
    };
  }

    const frame = document.getElementById("orderPlayerFrame");
    if (frame) {
      frame.onload = () => {
        setOrderPlayerLoading(false);
      };
    }

    setProvider(initialProviderIndex);
  } catch (error) {
    console.error("Failed to load order player:", error);
    setOrderPlayerLoading(false);
    if (typeof showToastNotification === "function") {
      showToastNotification("Не удалось загрузить плеер.", "error");
    } else {
      alert("Не удалось загрузить плеер.");
    }
  }
}

function copyOrderEditCommand(order) {
  if (!order) return;
  const title = order.title || "";
  const yearPart = order.year ? ` (${order.year})` : "";
  const orderByText =
    order.orderBy && order.orderBy !== "null" ? order.orderBy : "";
  const commandText = `!editcom !фильм ${title}${yearPart}, заказ ${orderByText}`;

  navigator.clipboard
    .writeText(commandText)
    .then(() => {
      if (typeof showToastNotification === "function") {
        showToastNotification("Команда !editcom скопирована", "success");
      }
    })
    .catch((err) => {
      console.error("Failed to copy edit command:", err);
      if (typeof showToastNotification === "function") {
        showToastNotification("Не удалось скопировать команду", "error");
      }
    });
}

let activeOrderMenu = null;
let activeOrderMenuButton = null;

function closeOrderActionsMenu() {
  if (!activeOrderMenu) return;
  activeOrderMenu.classList.remove("open", "centered");
  if (activeOrderMenuButton) {
    activeOrderMenuButton.setAttribute("aria-expanded", "false");
  }
  activeOrderMenu = null;
  activeOrderMenuButton = null;
  document.removeEventListener("click", handleOrderMenuOutsideClick);
}

function handleOrderMenuOutsideClick(event) {
  if (!activeOrderMenu) return;
  const clickedInsideMenu = activeOrderMenu.contains(event.target);
  const clickedButton =
    activeOrderMenuButton && activeOrderMenuButton.contains(event.target);
  if (clickedInsideMenu || clickedButton) return;
  closeOrderActionsMenu();
}

function toggleOrderActionsMenu(menu, button) {
  if (!menu || !button) return;
  const isOpen = menu.classList.contains("open");
  if (isOpen) {
    closeOrderActionsMenu();
    return;
  }

  if (activeOrderMenu && activeOrderMenu !== menu) {
    closeOrderActionsMenu();
  }

  const isMobile = window.matchMedia("(max-width: 680px)").matches;
  if (isMobile) {
    menu.classList.add("centered");
  } else {
    menu.classList.remove("centered");
  }

  menu.classList.add("open");
  button.setAttribute("aria-expanded", "true");
  activeOrderMenu = menu;
  activeOrderMenuButton = button;
  document.addEventListener("click", handleOrderMenuOutsideClick);
}

const GAME_ORDER_STREAM_TARGET = 3;

function normalizeGameOrderStreams(value) {
  return Math.min(
    GAME_ORDER_STREAM_TARGET,
    Math.max(0, Number.parseInt(value, 10) || 0)
  );
}

async function updateGameOrderStreams(gameId, nextValue) {
  const game = gameOrders.find((item) => item.id === gameId);
  if (!game) return;

  const normalizedValue = normalizeGameOrderStreams(nextValue);
  const previousValue = normalizeGameOrderStreams(game.streamsCompleted);
  if (normalizedValue === previousValue) return;

  game.streamsCompleted = normalizedValue;
  renderGames();

  try {
    const token = localStorage.getItem("adminToken") || "";
    const response = await fetch("/api/admin?action=media-items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "update_item",
        table: "Game_Orders",
        id: gameId,
        changes: { streams_completed: normalizedValue },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload?.error || `Game order streams update failed: ${response.status}`
      );
    }

    game.streamsCompleted = normalizeGameOrderStreams(
      payload?.row?.streams_completed
    );
    renderGames();
  } catch (err) {
    console.error("Error updating game order streams", err);
    game.streamsCompleted = previousValue;
    renderGames();
    alert(
      "Не удалось сохранить количество проведённых стримов по игре. Попробуйте ещё раз."
    );
  }
}

function createGameOrderStreamControls(game, showAdminControls) {
  const streamsCompleted = normalizeGameOrderStreams(game.streamsCompleted);
  const progressRow = document.createElement("div");
  progressRow.className = "game-order-streams";

  if (showAdminControls) {
    const minusBtn = document.createElement("button");
    minusBtn.type = "button";
    minusBtn.className =
      "btn btn-icon game-order-streams__step game-order-streams__step--minus";
    minusBtn.textContent = "−";
    minusBtn.title = "Уменьшить число проведённых стримов";
    minusBtn.setAttribute("aria-label", "Уменьшить число проведённых стримов");
    minusBtn.disabled = streamsCompleted <= 0;
    minusBtn.addEventListener("click", () =>
      updateGameOrderStreams(game.id, streamsCompleted - 1)
    );
    progressRow.appendChild(minusBtn);
  }

  const progress = document.createElement("div");
  progress.className = "game-order-streams__bar";
  progress.setAttribute("role", "progressbar");
  progress.setAttribute("aria-label", "Количество проведённых стримов по игре");
  progress.setAttribute("aria-valuemin", "0");
  progress.setAttribute("aria-valuemax", String(GAME_ORDER_STREAM_TARGET));
  progress.setAttribute("aria-valuenow", String(streamsCompleted));

  for (let index = 0; index < GAME_ORDER_STREAM_TARGET; index += 1) {
    const segment = document.createElement("span");
    segment.className = "game-order-streams__segment";
    if (index < streamsCompleted) {
      segment.classList.add("is-filled");
    }
    progress.appendChild(segment);
  }

  progressRow.appendChild(progress);

  if (showAdminControls) {
    const plusBtn = document.createElement("button");
    plusBtn.type = "button";
    plusBtn.className =
      "btn btn-icon game-order-streams__step game-order-streams__step--plus";
    plusBtn.textContent = "+";
    plusBtn.title = "Увеличить число проведённых стримов";
    plusBtn.setAttribute("aria-label", "Увеличить число проведённых стримов");
    plusBtn.disabled = streamsCompleted >= GAME_ORDER_STREAM_TARGET;
    plusBtn.addEventListener("click", () =>
      updateGameOrderStreams(game.id, streamsCompleted + 1)
    );
    progressRow.appendChild(plusBtn);
  }

  return progressRow;
}

function createOrderCard(order, showActions = isAdmin, showOrderBy = true) {
  const wrapper = document.createElement("div");
  wrapper.className = "order-wrapper";

  if (order.planDate) {
    const planBanner = document.createElement("div");
    planBanner.className = "order-plan-banner";

    const planText = document.createElement("span");
    planText.className = "order-plan-text";
    planText.textContent = `Запланировано: ${formatDateTime(order.planDate)}`;

    planBanner.append(planText);

    if (isAdmin) {
      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "order-plan-remove btn-icon";
      clearBtn.title = "Удалить запланированное время";
      clearBtn.textContent = "✕";
      clearBtn.addEventListener("mouseenter", () => {
        planBanner.classList.add("is-plan-remove-hover");
      });
      clearBtn.addEventListener("mouseleave", () => {
        planBanner.classList.remove("is-plan-remove-hover");
      });
      clearBtn.addEventListener("focus", () => {
        planBanner.classList.add("is-plan-remove-hover");
      });
      clearBtn.addEventListener("blur", () => {
        planBanner.classList.remove("is-plan-remove-hover");
      });
      clearBtn.onclick = () => clearPlanDate(order.id);
      planBanner.appendChild(clearBtn);
    }

    wrapper.appendChild(planBanner);
  }

  const card = document.createElement("div");
  card.className = "order-card";

  const infoBtn = document.createElement("button");
  infoBtn.type = "button";
  infoBtn.className = "order-info-button";
  infoBtn.textContent = "i";
  infoBtn.title = "Информация о фильме";
  infoBtn.setAttribute("aria-label", "Информация о заказанном фильме");
  infoBtn.onclick = async () => {
    if (!order?.__virtual && order?.id !== undefined && order?.id !== null && order?.id !== "") {
      openOrderDetailsModal(order.id);
      return;
    }
    if (
      order?.__virtual &&
      order?.kinopoiskId &&
      KINOPOISK_API_KEY
    ) {
      const needsDetails =
        !order.description || !order.country || !order.imdbId || !order.kpRating;
      const needsActors =
        !Array.isArray(order.actors) || order.actors.length === 0;
      if (needsDetails || needsActors) {
        try {
          const [details, staff] = await Promise.all([
            needsDetails ? fetchKpFallbackDetails(order.kinopoiskId) : null,
            needsActors ? fetchKpFallbackStaff(order.kinopoiskId) : null,
          ]);
          if (details) {
            const countryText = Array.isArray(details.countries)
              ? details.countries
                  .map((c) => c.country)
                  .filter(Boolean)
                  .join(", ")
              : "";
            order.description =
              details.description || details.shortDescription || order.description || "";
            order.country = countryText || order.country || "";
            order.imdbId = details.imdbId || order.imdbId || null;
            order.kpRating =
              details.ratingKinopoisk || details.ratingImdb || order.kpRating || "-";
            if (details.filmLength && !order.length) {
              order.length = details.filmLength;
            }
            if (details.year && !order.year) {
              order.year = details.year;
            }
          }
          if (staff) {
            if (Array.isArray(staff.actors) && staff.actors.length) {
              order.actors = staff.actors;
            }
            if (Array.isArray(staff.directors) && staff.directors.length) {
              order.director = staff.directors.join(", ");
            }
          }
        } catch (err) {
          console.error("Failed to load preview details", err);
        }
      }
    }
    if (typeof openOrderDetailsModalFromData === "function") {
      openOrderDetailsModalFromData(order);
    }
    if (
      typeof fetchOrderParentGuideForOrder === "function" &&
      order?.kinopoiskId &&
      KINOPOISK_API_KEY &&
      !order?.parentGuideStatus
    ) {
      fetchOrderParentGuideForOrder(order);
    }
  };
  card.appendChild(infoBtn);

  const poster = document.createElement("img");
  poster.src = order.poster;
  poster.alt = order.title;
  poster.className = "order-poster";
  poster.loading = "lazy";
  poster.onerror = () => {
    poster.onerror = null;
    poster.src = KP_FALLBACK_POSTER_PLACEHOLDER;
    poster.style.display = "";
  };
  if (isAdmin) {
    poster.classList.add("order-poster--clickable");
    poster.addEventListener("mouseenter", (e) => {
      if (!ratingTooltip) return;
      ratingTooltip.textContent = "Смотреть";
      ratingTooltip.style.display = "block";
      ratingTooltip.style.left = e.pageX + 10 + "px";
      ratingTooltip.style.top = e.pageY + 10 + "px";
    });
    poster.addEventListener("mousemove", (e) => {
      if (!ratingTooltip) return;
      ratingTooltip.style.left = e.pageX + 10 + "px";
      ratingTooltip.style.top = e.pageY + 10 + "px";
    });
    poster.addEventListener("mouseleave", () => {
      if (!ratingTooltip) return;
      ratingTooltip.style.display = "none";
    });
    poster.addEventListener("click", () => openOrderOnReyohoho(order));
  }
  card.appendChild(poster);

  const info = document.createElement("div");
  info.className = "order-info";

  const title = document.createElement("div");
  title.className = "order-title";
  title.textContent = order.title;
  info.appendChild(title);

  const orig = document.createElement("div");
  orig.className = "order-original-title";
  orig.textContent = order.originalTitle || "";
  info.appendChild(orig);

  const genres = document.createElement("div");
  genres.className = "order-genres";
  genres.textContent = order.genres || "";
  info.appendChild(genres);

  const meta = document.createElement("div");
  meta.className = "order-meta";
  const year = document.createElement("span");
  year.className = "order-year";
  year.textContent = order.year || "";
  meta.appendChild(year);
  if (order.length) {
    const lengthSpan = document.createElement("span");
    lengthSpan.className = "order-length";
    lengthSpan.textContent = `${order.length} мин`;
    meta.appendChild(lengthSpan);
  }
  const kpRating = document.createElement("span");
  kpRating.className = "order-kp-rating";
  const kpImg = document.createElement("img");
  kpImg.src = "/images/kinopoisk-icon-main.svg";
  kpImg.alt = "KP Rate";
  kpRating.appendChild(kpImg);
  kpRating.appendChild(document.createTextNode(` ${order.kpRating ?? "-"}`));
  kpRating.addEventListener("click", () =>
    openKinopoiskPageForRecord({ item: order, table: "Movie_Orders" })
  );
  kpRating.addEventListener("mouseenter", (e) => {
    if (!ratingTooltip) return;
    ratingTooltip.textContent = `Перейти на Кинопоиск`;
    ratingTooltip.style.display = "block";
    ratingTooltip.style.left = e.pageX + 10 + "px";
    ratingTooltip.style.top = e.pageY + 10 + "px";
  });
  kpRating.addEventListener("mousemove", (e) => {
    if (!ratingTooltip) return;
    ratingTooltip.style.left = e.pageX + 10 + "px";
    ratingTooltip.style.top = e.pageY + 10 + "px";
  });
  kpRating.addEventListener("mouseleave", () => {
    if (!ratingTooltip) return;
    ratingTooltip.style.display = "none";
  });
  meta.appendChild(kpRating);

  const footer = document.createElement("div");
  footer.className = "order-footer";

  const ribbonClass = ORDER_TYPE_CLASSES[order.orderType];
  const orderByText =
    order.orderBy && order.orderBy !== "null" ? order.orderBy : "";
  if (orderByText && showOrderBy) {
    const ribbon = document.createElement("div");
    ribbon.className = `order-badge ${ribbonClass}`;
    ribbon.textContent = orderByText;
    footer.appendChild(ribbon);
  }

  let actions = null;
  if (showActions) {
    actions = document.createElement("div");
    actions.className = "order-actions";
    const menuBtn = document.createElement("button");
    menuBtn.type = "button";
    menuBtn.className = "btn btn-icon order-menu-button";
    menuBtn.title = "Действия";
    menuBtn.setAttribute("aria-haspopup", "true");
    menuBtn.setAttribute("aria-expanded", "false");

    const menuIcon = document.createElement("span");
    menuIcon.className = "order-menu-icon";
    for (let i = 0; i < 3; i += 1) {
      const line = document.createElement("span");
      line.className = "order-menu-line";
      menuIcon.appendChild(line);
    }
    menuBtn.appendChild(menuIcon);

    const menu = document.createElement("div");
    menu.className = "order-actions-menu";
    menu.setAttribute("role", "menu");

    const planItem = document.createElement("button");
    planItem.type = "button";
    planItem.className = "order-actions-item";
    planItem.innerHTML = "<span>Запланировать</span><span aria-hidden=\"true\">⏰</span>";
    planItem.onclick = () => {
      closeOrderActionsMenu();
      openPlanDateModal(order.id);
    };

    const copyItem = document.createElement("button");
    copyItem.type = "button";
    copyItem.className = "order-actions-item";
    copyItem.innerHTML = "<span>Скопировать</span><span aria-hidden=\"true\">📋</span>";
    copyItem.onclick = () => {
      closeOrderActionsMenu();
      copyOrderEditCommand(order);
    };

    const deleteItem = document.createElement("button");
    deleteItem.type = "button";
    deleteItem.className = "order-actions-item order-actions-item--danger";
    deleteItem.innerHTML = "<span>Удалить</span><span aria-hidden=\"true\">🗑️</span>";
    deleteItem.onclick = () => {
      closeOrderActionsMenu();
      openConfirmDeleteOrderModal(order.id);
    };

    menu.append(planItem, copyItem, deleteItem);
    menuBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleOrderActionsMenu(menu, menuBtn);
    });

    const doneBtn = document.createElement("button");
    doneBtn.className = "watch-complete-btn";
    doneBtn.textContent = "Просмотрено ✓";
    doneBtn.title = "Просмотрено";
    doneBtn.onclick = () => openRateModal(order.id);

    actions.appendChild(doneBtn);
    actions.appendChild(menuBtn);
    actions.appendChild(menu);
  }

  footer.appendChild(meta);
  info.appendChild(footer);
  card.appendChild(info);
  wrapper.appendChild(card);

  if (actions && actions.childElementCount > 0) {
    const actionsRow = document.createElement("div");
    actionsRow.className = "order-actions-below";
    actionsRow.appendChild(actions);
    wrapper.appendChild(actionsRow);
  }

  return wrapper;
}

function renderWatchlist() {
  const container = document.getElementById("watchlistContainer");
  if (!container) return;
  if (typeof watchlistLoading !== "undefined" && watchlistLoading) {
    return;
  }
  container.innerHTML = "";
  const paginationEl = document.getElementById("watchlistPagination");
  const paginationTopEl = document.getElementById("watchlistPaginationTop");
  const countEl = document.getElementById("watchlistCount");
  const sortedWatchlist = getSortedWatchlist();
  const totalWatchlist = sortedWatchlist.length;
  if (countEl) {
    countEl.textContent = String(totalWatchlist);
  }
  if (totalWatchlist === 0) {
    renderEmptyState(container, "Заказанных фильмов пока нет");
    if (paginationEl) paginationEl.innerHTML = "";
    if (paginationTopEl) paginationTopEl.innerHTML = "";
    return;
  }

  const totalPages = Math.ceil(totalWatchlist / watchlistPerPage);
  if (watchlistPage > totalPages) watchlistPage = totalPages;
  if (watchlistPage < 1) watchlistPage = 1;

  const start = (watchlistPage - 1) * watchlistPerPage;
  const pageItems = sortedWatchlist.slice(start, start + watchlistPerPage);

  pageItems.forEach((item) => {
    container.appendChild(createOrderCard(item));
  });

  renderWatchlistPagination(totalPages);
}

function renderWatchlistPagination(totalPages) {
  const container = document.getElementById("watchlistPagination");
  const containerTop = document.getElementById("watchlistPaginationTop");
  if (!container && !containerTop) return;
  if (container) container.innerHTML = "";
  if (containerTop) containerTop.innerHTML = "";
  if (totalPages <= 1) return;

  const addBtn = (label, page, opts = {}) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.className = opts.class || "page-btn";
    btn.disabled = opts.disabled || false;
    if (opts.active) btn.classList.add("active");
    if (page) {
      btn.onclick = () => {
        const targetPage = page;
        const shouldScroll = targetPage !== watchlistPage;
        watchlistPage = targetPage;
        renderWatchlist();
        if (shouldScroll) {
          const watchlistSection = document.getElementById("watchlistSection");
          if (watchlistSection && typeof watchlistSection.scrollIntoView === "function") {
            watchlistSection.scrollIntoView({ behavior: "smooth", block: "start" });
          } else {
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
        }
      };
    }
    container.appendChild(btn);
    if (containerTop) {
      const clone = btn.cloneNode(true);
      if (page) {
        clone.onclick = () => {
          watchlistPage = page;
          renderWatchlist();
        };
      }
      containerTop.appendChild(clone);
    }
  };

  addBtn("«", watchlistPage - 1, { disabled: watchlistPage === 1 });
  addBtn("1", 1, { active: watchlistPage === 1 });

  let start = Math.max(2, watchlistPage - 1);
  let end = Math.min(totalPages - 1, watchlistPage + 1);

  if (start > 2) {
    const span = document.createElement("span");
    span.textContent = "...";
    span.className = "ellipsis";
    container.appendChild(span);
  }

  for (let i = start; i <= end; i++) {
    addBtn(String(i), i, { active: i === watchlistPage });
  }

  if (end < totalPages - 1) {
    const span = document.createElement("span");
    span.textContent = "...";
    span.className = "ellipsis";
    container.appendChild(span);
  }

  if (totalPages > 1) {
    addBtn(String(totalPages), totalPages, {
      active: watchlistPage === totalPages,
    });
  }

  addBtn("»", watchlistPage + 1, { disabled: watchlistPage === totalPages });
}

function getSortedWatchlist() {
  return watchlist
    .filter((item) => matchesSelectedOrderTypes(item, "watchlist"))
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aHasPlan = Boolean(a.item.planDate);
      const bHasPlan = Boolean(b.item.planDate);

      if (aHasPlan && !bHasPlan) return -1;
      if (!aHasPlan && bHasPlan) return 1;

      if (aHasPlan && bHasPlan) {
        const aDate = new Date(a.item.planDate).getTime();
        const bDate = new Date(b.item.planDate).getTime();

        if (aDate !== bDate) return aDate - bDate;
      }

      return a.index - b.index;
    })
    .map(({ item }) => item);
}

async function clearPlanDate(orderId) {
  const order = watchlist.find((o) => o.id === orderId);
  if (!order) return;

  const previousPlan = order.planDate;
  order.planDate = null;
  renderWatchlist();

  try {
    const token = localStorage.getItem("adminToken") || "";
    const response = await fetch("/api/admin?action=media-items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "update_item",
        table: "Movie_Orders",
        id: orderId,
        changes: { plan_date: null },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || `Plan date clear failed: ${response.status}`);
    }
  } catch (err) {
    console.error("Error clearing plan date", err);
    order.planDate = previousPlan;
    renderWatchlist();
    alert("Не удалось удалить запланированное время. Попробуйте ещё раз.");
  }
}

async function clearGamePlanDate(gameId) {
  const game = gameOrders.find((g) => g.id === gameId);
  if (!game) return;

  const previousPlan = game.planDate;
  game.planDate = null;
  renderGames();

  try {
    const token = localStorage.getItem("adminToken") || "";
    const response = await fetch("/api/admin?action=media-items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "update_item",
        table: "Game_Orders",
        id: gameId,
        changes: { game_plan_date: null },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || `Game plan date clear failed: ${response.status}`);
    }
  } catch (err) {
    console.error("Error clearing game plan date", err);
    game.planDate = previousPlan;
    renderGames();
    alert("Не удалось удалить запланированное время. Попробуйте ещё раз.");
  }
}

function appendGameTitleWithMode(container, titleText, gameMode, titleClass) {
  if (!container) return;

  const title = document.createElement("span");
  title.className = titleClass;
  title.textContent = titleText || "Без названия";
  container.appendChild(title);

  const normalizedMode = normalizeGameMode(gameMode);
  if (!normalizedMode) return;

  const mode = document.createElement("span");
  mode.className = "game-mode-label";
  mode.textContent = `(${normalizedMode})`;
  container.appendChild(mode);
}

function createGameCard(game, showActions = isAdmin) {
  const wrapper = document.createElement("div");
  wrapper.className = "order-wrapper";

  if (game.planDate) {
    const planBanner = document.createElement("div");
    planBanner.className = "order-plan-banner";

    const planText = document.createElement("span");
    planText.className = "order-plan-text";
    planText.textContent = `Запланировано: ${formatDateTime(game.planDate)}`;

    planBanner.append(planText);

    if (isAdmin) {
      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "order-plan-remove btn-icon";
      clearBtn.title = "Удалить запланированное время";
      clearBtn.textContent = "✕";
      clearBtn.addEventListener("mouseenter", () => {
        planBanner.classList.add("is-plan-remove-hover");
      });
      clearBtn.addEventListener("mouseleave", () => {
        planBanner.classList.remove("is-plan-remove-hover");
      });
      clearBtn.addEventListener("focus", () => {
        planBanner.classList.add("is-plan-remove-hover");
      });
      clearBtn.addEventListener("blur", () => {
        planBanner.classList.remove("is-plan-remove-hover");
      });
      clearBtn.onclick = () => clearGamePlanDate(game.id);
      planBanner.appendChild(clearBtn);
    }

    wrapper.appendChild(planBanner);
  }

  const card = document.createElement("div");
  card.className = "order-card";

  const infoBtn = document.createElement("button");
  infoBtn.type = "button";
  infoBtn.className = "order-info-button";
  infoBtn.textContent = "i";
  infoBtn.title = "Информация об игре";
  infoBtn.setAttribute("aria-label", "Информация о заказанной игре");
  infoBtn.onclick = () => openGameOrderDetailsModal(game.id);
  card.appendChild(infoBtn);

  const poster = document.createElement("img");
  poster.src = game.poster;
  poster.alt = game.title;
  poster.className = "order-poster";
  poster.loading = "lazy";
  setupPosterLoading(poster, { hideOnFail: true });
  card.appendChild(poster);

  const info = document.createElement("div");
  info.className = "order-info";

  const title = document.createElement("div");
  title.className = "order-title";
  appendGameTitleWithMode(title, game.title, game.gameMode, "order-title-text");
  info.appendChild(title);

  const genres = document.createElement("div");
  genres.className = "order-genres";
  genres.textContent = game.genres || "";
  info.appendChild(genres);

  const extraInfo = document.createElement("div");
  extraInfo.className = "order-game-extra";

  const releaseDate = document.createElement("span");
  releaseDate.className = "order-game-release";
  releaseDate.textContent = `Релиз: ${game.released ? formatDate(game.released) : "—"}`;
  extraInfo.appendChild(releaseDate);

  const playtime = document.createElement("span");
  playtime.className = "order-game-playtime";
  playtime.textContent = `Время прохождения: ${game.playtime ? `${game.playtime} ч` : "—"}`;
  extraInfo.appendChild(playtime);

  info.appendChild(extraInfo);

  const meta = document.createElement("div");
  meta.className = "order-meta";
  const year = document.createElement("span");
  year.className = "order-year";
  year.textContent = game.year || "";
  meta.appendChild(year);

  const ratings = document.createElement("div");
  ratings.className = "order-game-ratings";

  const metacriticRating = document.createElement("span");
  metacriticRating.className = "order-game-rating order-game-rating--metacritic";
  const metacriticIcon = document.createElement("img");
  metacriticIcon.className = "order-game-rating-icon order-game-rating-icon--metacritic";
  metacriticIcon.src = "images/Metacritic.svg";
  metacriticIcon.alt = "Metacritic";
  metacriticRating.appendChild(metacriticIcon);
  metacriticRating.appendChild(
    document.createTextNode(` ${game.metacritic ?? "-"}`)
  );
  metacriticRating.addEventListener("mouseenter", (e) => {
    if (!ratingTooltip) return;
    ratingTooltip.textContent = "Оценка Metacritic";
    ratingTooltip.style.display = "block";
    ratingTooltip.style.left = e.pageX + 10 + "px";
    ratingTooltip.style.top = e.pageY + 10 + "px";
  });
  metacriticRating.addEventListener("mousemove", (e) => {
    if (!ratingTooltip) return;
    ratingTooltip.style.left = e.pageX + 10 + "px";
    ratingTooltip.style.top = e.pageY + 10 + "px";
  });
  metacriticRating.addEventListener("mouseleave", () => {
    if (!ratingTooltip) return;
    ratingTooltip.style.display = "none";
  });
  ratings.appendChild(metacriticRating);

  const rawgRating = document.createElement("span");
  rawgRating.className = "order-game-rating order-game-rating--rawg";
  const rawgIcon = document.createElement("span");
  rawgIcon.className = "order-game-rating-icon order-game-rating-icon--rawg";
  rawgIcon.setAttribute("aria-hidden", "true");
  rawgIcon.textContent = "RAWG";
  rawgRating.appendChild(rawgIcon);
  rawgRating.appendChild(
    document.createTextNode(` ${game.rating ?? "-"}`)
  );
  rawgRating.addEventListener("mouseenter", (e) => {
    if (!ratingTooltip) return;
    ratingTooltip.textContent = "Оценка RAWG";
    ratingTooltip.style.display = "block";
    ratingTooltip.style.left = e.pageX + 10 + "px";
    ratingTooltip.style.top = e.pageY + 10 + "px";
  });
  rawgRating.addEventListener("mousemove", (e) => {
    if (!ratingTooltip) return;
    ratingTooltip.style.left = e.pageX + 10 + "px";
    ratingTooltip.style.top = e.pageY + 10 + "px";
  });
  rawgRating.addEventListener("mouseleave", () => {
    if (!ratingTooltip) return;
    ratingTooltip.style.display = "none";
  });
  ratings.appendChild(rawgRating);

  meta.appendChild(ratings);

  const footer = document.createElement("div");
  footer.className = "order-footer";

  const ribbonClass = ORDER_TYPE_CLASSES[game.orderType];
  const orderByText =
    game.orderBy && game.orderBy !== "null" ? game.orderBy : "";
  if (orderByText) {
    const ribbon = document.createElement("div");
    ribbon.className = `order-badge ${ribbonClass}`;
    ribbon.textContent = orderByText;
    footer.appendChild(ribbon);
  }

  footer.appendChild(meta);
  info.appendChild(footer);
  card.appendChild(info);
  wrapper.appendChild(card);

  const streamsRow = createGameOrderStreamControls(game, showActions);
  wrapper.appendChild(streamsRow);

  if (showActions) {
    const actions = document.createElement("div");
    actions.className = "order-actions";

    const doneBtn = document.createElement("button");
    doneBtn.className = "watch-complete-btn";
    doneBtn.textContent = "Пройдено ✓";
    doneBtn.title = "Пройдено";
    doneBtn.onclick = () => markGameDone(game.id);

    const menuBtn = document.createElement("button");
    menuBtn.type = "button";
    menuBtn.className = "btn btn-icon order-menu-button";
    menuBtn.title = "Действия";
    menuBtn.setAttribute("aria-haspopup", "true");
    menuBtn.setAttribute("aria-expanded", "false");

    const menuIcon = document.createElement("span");
    menuIcon.className = "order-menu-icon";
    for (let i = 0; i < 3; i += 1) {
      const line = document.createElement("span");
      line.className = "order-menu-line";
      menuIcon.appendChild(line);
    }
    menuBtn.appendChild(menuIcon);

    const menu = document.createElement("div");
    menu.className = "order-actions-menu";
    menu.setAttribute("role", "menu");

    const planItem = document.createElement("button");
    planItem.type = "button";
    planItem.className = "order-actions-item";
    planItem.innerHTML = "<span>Запланировать</span><span aria-hidden=\"true\">⏰</span>";
    planItem.onclick = () => {
      closeOrderActionsMenu();
      openPlanDateModal(game.id, "game");
    };

    const deleteItem = document.createElement("button");
    deleteItem.type = "button";
    deleteItem.className = "order-actions-item order-actions-item--danger";
    deleteItem.innerHTML = "<span>Удалить</span><span aria-hidden=\"true\">🗑️</span>";
    deleteItem.onclick = () => {
      closeOrderActionsMenu();
      openConfirmDeleteGameOrderModal(game.id);
    };

    menu.append(planItem, deleteItem);
    menuBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleOrderActionsMenu(menu, menuBtn);
    });

    actions.appendChild(doneBtn);
    actions.appendChild(menuBtn);
    actions.appendChild(menu);

    const actionsRow = document.createElement("div");
    actionsRow.className = "order-actions-below";
    actionsRow.appendChild(actions);
    wrapper.appendChild(actionsRow);
  }

  return wrapper;
}

function renderGames() {
  const container = document.getElementById("gamesContainer");
  if (!container) return;
  if (typeof gameOrdersLoading !== "undefined" && gameOrdersLoading) {
    return;
  }
  container.innerHTML = "";
  const countEl = document.getElementById("gameOrdersCount");
  const sortedGameOrders = getSortedGameOrders();
  const totalGameOrders = sortedGameOrders.length;
  if (countEl) {
    countEl.textContent = String(totalGameOrders);
  }
  if (totalGameOrders === 0) {
    renderEmptyState(container, "Заказанных игр пока нет");
    return;
  }
  sortedGameOrders.forEach((g) => container.appendChild(createGameCard(g)));
}

function getSortedGameOrders() {
  return gameOrders
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aHasPlan = Boolean(a.item.planDate);
      const bHasPlan = Boolean(b.item.planDate);

      if (aHasPlan && !bHasPlan) return -1;
      if (!aHasPlan && bHasPlan) return 1;

      if (aHasPlan && bHasPlan) {
        const aDate = new Date(a.item.planDate).getTime();
        const bDate = new Date(b.item.planDate).getTime();

        if (aDate !== bDate) return aDate - bDate;
      }

      return a.index - b.index;
    })
    .map(({ item }) => item);
}

function getFilteredSortedPlayedGames() {
  let result = allPlayedGames.filter((game) =>
    matchesSelectedOrderTypes(game, "games")
  );
  const normalizedQuery = normalizeSearchText(currentGameSearch);

  if (normalizedQuery) {
    const queryDigits = normalizedQuery.replace(/\D+/g, "");
    const useYearSearch = shouldUseYearSearch(normalizedQuery, queryDigits);

    const scored = result.map((game) => {
      let score = 0;

      // Название
      score = Math.max(score, scoreMatch(normalizedQuery, game.title));

      // Жанры
      score = Math.max(
        score,
        scoreMatch(normalizedQuery, game.genres || "") - 10
      );

      // Ник заказчика
      score = Math.max(
        score,
        scoreStrictIdentifierMatch(normalizedQuery, game.orderBy || "") - 5
      );

      // Год
      const yearString = game.year ? String(game.year) : "";
      const normalizedYear = normalizeSearchText(yearString);
      if (
        (normalizedYear && normalizedYear.includes(normalizedQuery)) ||
        (useYearSearch && yearString.includes(queryDigits))
      ) {
        score += 5;
      }

      return { game, searchScore: score };
    });

    result = scored
      .filter((item) => item.searchScore > 0)
      .sort((a, b) => b.searchScore - a.searchScore)
      .map((item) => item.game);
  }
  switch (currentGameSort) {
    case "title":
      result.sort((a, b) =>
        gameSortAscending
          ? a.title.localeCompare(b.title)
          : b.title.localeCompare(a.title)
      );
      break;
    case "year":
      result.sort((a, b) =>
        gameSortAscending ? a.year - b.year : b.year - a.year
      );
      break;
    case "rating":
      result.sort((a, b) =>
        gameSortAscending ? a.rating - b.rating : b.rating - a.rating
      );
      break;
    case "date":
    default:
      result.sort((a, b) => (gameSortAscending ? a.id - b.id : b.id - a.id));
      break;
  }
  return result;
}

function createPlayedGameCard(
  game,
  showActions = isAdmin,
  showRateButton = true,
  options = {}
) {
  const { clickable = false } = options;
  const card = document.createElement("div");
  card.dataset.id = game.id;
  let cardClass = "movie-card";
  const hasPersistentId = typeof game.id === "number" && game.id !== 0;
  if (hasPersistentId && game.rating === 0) cardClass += " rating-low";
  if (hasPersistentId && game.rating === 11) cardClass += " rating-high";
  card.className = cardClass;
  if (clickable) {
    card.classList.add("movie-card--clickable");
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Открыть карточку игры: ${game.title}`);
    card.addEventListener("click", (event) => {
      if (shouldIgnoreMovieCardClick(event)) return;
      openGameDetailsModal(game.id);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (shouldIgnoreMovieCardClick(event)) return;
      event.preventDefault();
      openGameDetailsModal(game.id);
    });
  }

  const poster = document.createElement("img");
  poster.src = game.poster;
  poster.alt = game.title;
  poster.className = "movie-poster";
  poster.loading = "lazy";
  const placeholder = document.createElement("div");
  placeholder.className = "movie-poster-placeholder";
  placeholder.style.display = "none";
  const placeholderText = document.createElement("span");
  placeholderText.textContent = "Нет постера";
  placeholder.appendChild(placeholderText);
  setupPosterLoading(poster, { placeholder });

  const orderByText =
    game.orderBy && game.orderBy !== "null" ? game.orderBy : "";
  const ribbonClass = ORDER_TYPE_CLASSES[game.orderType];
  let ribbon;
  if (orderByText) {
    ribbon = document.createElement("div");
    ribbon.className = `order-badge ${ribbonClass}`;
    ribbon.textContent = orderByText;
  }

  const info = document.createElement("div");
  info.className = "movie-info";
  const header = document.createElement("div");
  header.className = "movie-header";
  const title = document.createElement("div");
  title.className = "movie-title";
  appendGameTitleWithMode(title, game.title, game.gameMode, "movie-title-text");
  header.appendChild(title);
  info.appendChild(header);

  const genres = document.createElement("div");
  genres.className = "movie-genres";
  genres.textContent = game.genres || "";
  info.appendChild(genres);

  const year = document.createElement("div");
  year.className = "movie-year";
  year.textContent = game.year || "";
  info.appendChild(year);

  const ratingDiv = document.createElement("div");
  ratingDiv.className = "movie-rating";
  const item1 = document.createElement("div");
  item1.className = "rating-item";
  const icon1 = document.createElement("img");
  icon1.src = "images/Pupsik_TV_Icon.webp";
  icon1.alt = "Pupsik Rate";
  const span1 = document.createElement("span");
  span1.textContent = `${game.rating}`;
  item1.appendChild(icon1);
  item1.appendChild(span1);
  item1.addEventListener("mouseenter", (e) => {
    if (!ratingTooltip) return;
    ratingTooltip.textContent = `Оценка Pupsik_ow`;
    ratingTooltip.style.display = "block";
    ratingTooltip.style.left = e.pageX + 10 + "px";
    ratingTooltip.style.top = e.pageY + 10 + "px";
  });
  item1.addEventListener("mousemove", (e) => {
    if (!ratingTooltip) return;
    ratingTooltip.style.left = e.pageX + 10 + "px";
    ratingTooltip.style.top = e.pageY + 10 + "px";
  });
  item1.addEventListener("mouseleave", () => {
    if (!ratingTooltip) return;
    ratingTooltip.style.display = "none";
  });
  ratingDiv.appendChild(item1);

  const userRatingItem = document.createElement("div");
  userRatingItem.className = "rating-item rating-user";
  const userIcon = document.createElement("i");
  userIcon.className = "fa-solid fa-star";
  const userSpan = document.createElement("span");
  userSpan.textContent = game.userRating ?? "-";
  userRatingItem.appendChild(userIcon);
  userRatingItem.appendChild(userSpan);
  const votes = Math.round(game.ratingCount ?? 0);
  userRatingItem.addEventListener("mouseenter", (e) => {
    if (!ratingTooltip) return;
    ratingTooltip.textContent = `Оценок: ${votes}`;
    ratingTooltip.style.display = "block";
    ratingTooltip.style.left = e.pageX + 10 + "px";
    ratingTooltip.style.top = e.pageY + 10 + "px";
  });
  userRatingItem.addEventListener("mousemove", (e) => {
    if (!ratingTooltip) return;
    ratingTooltip.style.left = e.pageX + 10 + "px";
    ratingTooltip.style.top = e.pageY + 10 + "px";
  });
  userRatingItem.addEventListener("mouseleave", () => {
    if (!ratingTooltip) return;
    ratingTooltip.style.display = "none";
  });
  ratingDiv.appendChild(userRatingItem);
  info.appendChild(ratingDiv);

  const footer = document.createElement("div");
  footer.className = "movie-footer";
  const dateDiv = document.createElement("div");
  dateDiv.className = "movie-date";
  dateDiv.textContent = `${formatDate(game.dateAdded)}`;
  footer.appendChild(dateDiv);
  const actions = document.createElement("div");
  actions.className = "movie-actions";
  if (showRateButton) {
    const rateBtn = document.createElement("button");
    rateBtn.className = "btn btn-rate btn-icon";
    rateBtn.textContent = "Оценить";
    if (hasRatedGame(game.id)) {
      rateBtn.disabled = true;
      rateBtn.title = "Вы уже оценили";
    } else {
      rateBtn.onclick = () => openUserRateGameModal(game.id);
    }
    actions.appendChild(rateBtn);
  }
  if (showActions) {
    // Inline editing is handled inside the details modal now.
  }
  if (actions.childElementCount > 0) footer.appendChild(actions);
  info.appendChild(footer);

  card.appendChild(poster);
  if (ribbon) card.appendChild(ribbon);
  card.appendChild(placeholder);
  card.appendChild(info);
  return card;
}

function refreshPlayedGameRateButtons(root = document) {
  const cards = root.querySelectorAll("#gamesGridPlayed .movie-card[data-id]");
  cards.forEach((card) => {
    const button = card.querySelector(".movie-actions .btn-rate");
    if (!button) return;

    const gameId = Number(card.dataset.id);
    const hasRating = hasRatedGame(gameId);

    button.disabled = false;
    button.textContent = hasRating ? "Изменить" : "Оценить";
    button.title = hasRating ? "Изменить свою оценку" : "Оценить";
    button.onclick = () => openUserRateGameModal(gameId);
  });
}

function renderPlayedGames() {
  const grid = document.getElementById("gamesGridPlayed");
  if (!grid) return;
  if (typeof playedGamesLoading !== "undefined" && playedGamesLoading) {
    return;
  }

  const filtered = getFilteredSortedPlayedGames();
  totalGamesPlayed = filtered.length;
  const countEl = document.getElementById("gamesCount");
  if (countEl) countEl.textContent = totalGamesPlayed;
  const start = (gamePage - 1) * gamesPerPage;
  playedGames = filtered.slice(start, start + gamesPerPage);
  recalculateGameUserRatings(playedGames);

  const fragment = document.createDocumentFragment();
  const newElements = new Map();
  const newData = new Map();

  playedGames.forEach((game) => {
    const dataKey = JSON.stringify(game) + isAdmin + hasRatedGame(game.id);
    let card = playedGameCardElements.get(game.id);
    const prevData = playedGameDataMap.get(game.id);
    if (!card || prevData !== dataKey) {
      if (card) card.remove();
      card = createPlayedGameCard(game, isAdmin, true, { clickable: true });
    }
    fragment.appendChild(card);
    newElements.set(game.id, card);
    newData.set(game.id, dataKey);
  });

  grid.replaceChildren(fragment);
  playedGameCardElements = newElements;
  playedGameDataMap = newData;
  refreshPlayedGameRateButtons(grid);

  renderGamesPagination();
}

function renderGamesPagination() {
  const container = document.getElementById("gamesPagination");
  if (!container) return;
  container.innerHTML = "";
  const totalPages = Math.ceil(totalGamesPlayed / gamesPerPage);
  if (totalPages <= 1) return;
  const addBtn = (label, page, opts = {}) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.className = opts.class || "page-btn";
    btn.disabled = opts.disabled || false;
    if (opts.active) btn.classList.add("active");
    if (page)
      btn.onclick = () => {
        gamePage = page;
        renderPlayedGames();
      };
    container.appendChild(btn);
  };
  addBtn("«", gamePage - 1, { disabled: gamePage === 1 });
  addBtn("1", 1, { active: gamePage === 1 });
  let start = Math.max(2, gamePage - 1);
  let end = Math.min(totalPages - 1, gamePage + 1);
  if (start > 2) {
    const span = document.createElement("span");
    span.textContent = "...";
    span.className = "ellipsis";
    container.appendChild(span);
  }
  for (let i = start; i <= end; i++) {
    addBtn(String(i), i, { active: i === gamePage });
  }
  if (end < totalPages - 1) {
    const span = document.createElement("span");
    span.textContent = "...";
    span.className = "ellipsis";
    container.appendChild(span);
  }
  if (totalPages > 1) {
    addBtn(String(totalPages), totalPages, { active: gamePage === totalPages });
  }
  addBtn("»", gamePage + 1, { disabled: gamePage === totalPages });
}

function searchPlayedGames(q) {
  currentGameSearch = q;
  gamePage = 1;
  renderPlayedGames();
}

const debouncedSearchPlayedGames = debounce(searchPlayedGames, 300);

function sortPlayedGames(sort) {
  currentGameSort = sort;
  renderPlayedGames();
}

function toggleGameSortOrder() {
  gameSortAscending = !gameSortAscending;
  const btn = document.getElementById("gameSortOrderBtn");
  if (btn) {
    const img = document.createElement("img");
    img.src = "images/sort_arrow.webp";
    img.alt = "";
    img.className = "sort-arrow";
    if (gameSortAscending) {
      img.classList.add("is-desc");
    }
    btn.replaceChildren(img);
  }
  renderPlayedGames();
}

async function deletePlayedGame(id) {
  const idx = allPlayedGames.findIndex((g) => g.id === id);
  if (idx === -1) {
    return;
  }

  const [removedGame] = allPlayedGames.splice(idx, 1);
  const hadUserRating = hasRatedGame(id);
  const previousRatingValue = hadUserRating ? ratedGames[id] : null;
  renderPlayedGames();

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
        table: "games",
        id,
        posterUrl: removedGame?.poster || "",
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || `Played game delete failed: ${response.status}`);
    }

    if (hadUserRating) {
      delete ratedGames[id];
      localStorage.setItem("ratedGames", JSON.stringify(ratedGames));
    }
    localStorage.setItem("gamesCache", JSON.stringify(allPlayedGames));
  } catch (err) {
    console.error("Error deleting game", err);
    allPlayedGames.splice(idx, 0, removedGame);
    if (hadUserRating && previousRatingValue !== null) {
      ratedGames[id] = previousRatingValue;
      localStorage.setItem("ratedGames", JSON.stringify(ratedGames));
    }
    localStorage.setItem("gamesCache", JSON.stringify(allPlayedGames));
    renderPlayedGames();
    alert(
      "Не удалось удалить пройденную игру. Возможно, не хватает прав или запись уже удалена. Изменения отменены."
    );
  }
}
