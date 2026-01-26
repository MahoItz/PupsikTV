// Отображение фильмов
function getFilteredSortedMovies() {
  let result = [...allMovies];

  const normalizedQuery = normalizeSearchText(currentSearchQuery);

  if (normalizedQuery) {
    const queryDigits = normalizedQuery.replace(/\D+/g, "");

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

      // Год
      const yearString = movie.year ? String(movie.year) : "";
      const normalizedYear = normalizeSearchText(yearString);
      if (
        (normalizedYear && normalizedYear.includes(normalizedQuery)) ||
        (queryDigits && yearString.includes(queryDigits))
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
  "https://via.placeholder.com/120x180?text=Нет+постера";

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
  kpImg.src = "images/kp_icon.webp";
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

  card.append(poster, info, link);
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
  const ratedValue =
    typeof ratedMovies !== "undefined" && ratedMovies
      ? ratedMovies[movie.id]
      : "";
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
    Boolean(ratedMovies && ratedMovies[movie.id]),
    isAdmin,
  ];
  return parts.map(normalizeRenderKeyValue).join(MOVIE_RENDER_KEY_DELIMITER);
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
    poster.style.display = "none";
    placeholder.style.display = "flex";
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
    icon2.src = "images/kp_icon.webp";
    icon2.alt = "KP Rate";
    const span2 = document.createElement("span");
    span2.textContent = movie.kpRating ?? "-";
    ratingItem2.appendChild(icon2);
    ratingItem2.appendChild(span2);
    ratingItem2.addEventListener("click", () =>
      openKinopoiskPage(movie.title, movie.year, movie.originalTitle)
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
    rateBtn.textContent = isAdmin ? "" : "Оценить";
    if (ratedMovies[movie.id]) {
      rateBtn.disabled = true;
      rateBtn.title = "Вы уже оценили";
    } else {
      rateBtn.onclick = () => openUserRateModal(movie.id);
    }
    actions.appendChild(rateBtn);
  }

  if (showActions) {
    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-edit btn-icon";
    editBtn.textContent = "✏️";
    editBtn.onclick = () => openEditModal(movie.id);
    actions.appendChild(editBtn);
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

  return (
    getKinopoiskIdFromMovie(order) || extractKinopoiskIdFromValue(order.poster)
  );
}

function buildReyohohoUrlForOrder(order) {
  const kpId = deriveKinopoiskIdFromOrder(order);
  return kpId ? `${REYOHOHO_BASE_URL}#${kpId}` : REYOHOHO_BASE_URL;
}

function openOrderOnReyohoho(order) {
  const targetUrl = buildReyohohoUrlForOrder(order);
  const newWindow = window.open(targetUrl, "_blank");
  if (!newWindow) {
    console.warn("ReYohoho window was blocked by the browser");
  }
}

function createOrderCard(order, showActions = isAdmin, showOrderBy = true) {
  const wrapper = document.createElement("div");
  wrapper.className = "order-wrapper";

  if (order.planDate) {
    const planBanner = document.createElement("div");
    planBanner.className = "order-plan-banner";

    const planIcon = document.createElement("span");
    planIcon.className = "order-plan-icon";
    planIcon.textContent = "⏰";

    const planText = document.createElement("span");
    planText.className = "order-plan-text";
    planText.textContent = `Запланировано: ${formatDateTime(order.planDate)}`;

    planBanner.append(planIcon, planText);

    if (isAdmin) {
      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "order-plan-remove btn-icon";
      clearBtn.title = "Удалить запланированное время";
      clearBtn.textContent = "✕";
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
  infoBtn.onclick = () => openOrderDetailsModal(order.id);
  card.appendChild(infoBtn);

  const poster = document.createElement("img");
  poster.src = order.poster;
  poster.alt = order.title;
  poster.className = "order-poster";
  poster.loading = "lazy";
  poster.onerror = () => {
    poster.style.display = "none";
  };
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
  kpImg.src = "images/kp_icon.webp";
  kpImg.alt = "KP Rate";
  kpRating.appendChild(kpImg);
  kpRating.appendChild(document.createTextNode(` ${order.kpRating ?? "-"}`));
  kpRating.addEventListener("click", () =>
    openKinopoiskPage(order.title, order.year, order.originalTitle)
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
  info.appendChild(meta);

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

  const row = document.createElement("div");
  row.className = "order-footer-row";

  const dateDiv = document.createElement("div");
  dateDiv.className = "order-date";
  dateDiv.textContent = formatDate(order.dateAdded);
  row.appendChild(dateDiv);

  if (showActions) {
    const actions = document.createElement("div");
    actions.className = "order-actions";
    const planBtn = document.createElement("button");
    planBtn.className = "btn btn-plan btn-icon";
    planBtn.textContent = "⏰";
    planBtn.title = "Запланировать просмотр";
    planBtn.onclick = () => openPlanDateModal(order.id);
    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-edit btn-icon";
    editBtn.textContent = "✏️";
    editBtn.onclick = () => openEditOrderModal(order.id);
    actions.appendChild(planBtn);
    actions.appendChild(editBtn);
    row.appendChild(actions);
  }

  footer.appendChild(row);
  info.appendChild(footer);
  card.appendChild(info);
  wrapper.appendChild(card);

  if (showActions) {
    const done = document.createElement("div");
    done.className = "order-complete";
    const doneBtn = document.createElement("button");
    doneBtn.className = "watch-complete-btn";
    doneBtn.textContent = "✓";
    doneBtn.onclick = () => openRateModal(order.id);
    done.appendChild(doneBtn);
    wrapper.appendChild(done);
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
  if (watchlist.length === 0) {
    renderEmptyState(container, "Заказанных фильмов пока нет");
    return;
  }

  getSortedWatchlist().forEach((item) => {
    container.appendChild(createOrderCard(item));
  });
}

function getSortedWatchlist() {
  return watchlist
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
    const { error } = await supabaseClient
      .from("Movie_Orders")
      .update({ plan_date: null })
      .eq("id", orderId)
      .select("id")
      .maybeSingle();

    if (error) throw error;
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
    const { error } = await supabaseClient
      .from("Game_Orders")
      .update({ game_plan_date: null })
      .eq("id", gameId)
      .select("id")
      .maybeSingle();

    if (error) throw error;
  } catch (err) {
    console.error("Error clearing game plan date", err);
    game.planDate = previousPlan;
    renderGames();
    alert("Не удалось удалить запланированное время. Попробуйте ещё раз.");
  }
}

function createGameCard(game, showActions = isAdmin) {
  const wrapper = document.createElement("div");
  wrapper.className = "order-wrapper";

  if (game.planDate) {
    const planBanner = document.createElement("div");
    planBanner.className = "order-plan-banner";

    const planIcon = document.createElement("span");
    planIcon.className = "order-plan-icon";
    planIcon.textContent = "⏰";

    const planText = document.createElement("span");
    planText.className = "order-plan-text";
    planText.textContent = `Запланировано: ${formatDateTime(game.planDate)}`;

    planBanner.append(planIcon, planText);

    if (isAdmin) {
      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "order-plan-remove btn-icon";
      clearBtn.title = "Удалить запланированное время";
      clearBtn.textContent = "✕";
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
  poster.onerror = () => {
    poster.style.display = "none";
  };
  card.appendChild(poster);

  const info = document.createElement("div");
  info.className = "order-info";

  const title = document.createElement("div");
  title.className = "order-title";
  title.textContent = game.title;
  info.appendChild(title);

  const genres = document.createElement("div");
  genres.className = "order-genres";
  genres.textContent = game.genres || "";
  info.appendChild(genres);

  const meta = document.createElement("div");
  meta.className = "order-meta";
  const year = document.createElement("span");
  year.className = "order-year";
  year.textContent = game.year || "";
  meta.appendChild(year);
  info.appendChild(meta);

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

  const row = document.createElement("div");
  row.className = "order-footer-row";

  const dateDiv = document.createElement("div");
  dateDiv.className = "order-date";
  dateDiv.textContent = formatDate(game.dateAdded);
  row.appendChild(dateDiv);

  if (showActions) {
    const actions = document.createElement("div");
    actions.className = "order-actions";
    const planBtn = document.createElement("button");
    planBtn.className = "btn btn-plan btn-icon";
    planBtn.textContent = "⏰";
    planBtn.title = "Запланировать игру";
    planBtn.onclick = () => openPlanDateModal(game.id, "game");
    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-edit btn-icon";
    editBtn.textContent = "✏️";
    editBtn.onclick = () => openEditGameModal(game.id);
    actions.appendChild(planBtn);
    actions.appendChild(editBtn);
    row.appendChild(actions);
  }

  footer.appendChild(row);
  info.appendChild(footer);
  card.appendChild(info);
  wrapper.appendChild(card);

  if (showActions) {
    const done = document.createElement("div");
    done.className = "order-complete";
    const doneBtn = document.createElement("button");
    doneBtn.className = "watch-complete-btn";
    doneBtn.textContent = "✓";
    doneBtn.onclick = () => markGameDone(game.id);
    done.appendChild(doneBtn);
    wrapper.appendChild(done);
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
  if (gameOrders.length === 0) {
    renderEmptyState(container, "Заказанных игр пока нет");
    return;
  }
  getSortedGameOrders().forEach((g) =>
    container.appendChild(createGameCard(g))
  );
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
  let result = [...allPlayedGames];
  if (currentGameSearch) {
    const q = currentGameSearch.toLowerCase();
    result = result.filter(
      (g) => g.title.toLowerCase().includes(q) || g.year.toString().includes(q)
    );
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
  poster.onerror = () => {
    poster.style.display = "none";
    placeholder.style.display = "flex";
  };

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
  title.textContent = game.title;
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
    rateBtn.textContent = isAdmin ? "" : "Оценить";
    if (hasRatedGame(game.id)) {
      rateBtn.disabled = true;
      rateBtn.title = "Вы уже оценили";
    } else {
      rateBtn.onclick = () => openUserRateGameModal(game.id);
    }
    actions.appendChild(rateBtn);
  }
  if (showActions) {
    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-edit btn-icon";
    editBtn.textContent = "✏️";
    editBtn.onclick = () => openEditPlayedGameModal(game.id);
    actions.appendChild(editBtn);
    actions.appendChild(editBtn);
  }
  if (actions.childElementCount > 0) footer.appendChild(actions);
  info.appendChild(footer);

  card.appendChild(poster);
  if (ribbon) card.appendChild(ribbon);
  card.appendChild(placeholder);
  card.appendChild(info);
  return card;
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
    img.src = gameSortAscending
      ? "images/up-arrow.webp"
      : "images/down-arrow.webp";
    img.alt = "";
    img.className = "sort-arrow";
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
    const { data, error } = await supabaseClient
      .from("games")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new Error("Played game delete was blocked by security rules.");
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

