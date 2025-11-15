// Поиск фильмов
function searchMovies(query) {
  currentSearchQuery = query;
  currentPage = 1;
  renderMovies();
}

const debouncedSearchMovies = debounce(searchMovies, 300);

function formatKinopoiskOption(film = {}) {
  if (!film) return "";
  const year = film.year || "";
  const name =
    film.nameRu ||
    film.nameEn ||
    film.nameOriginal ||
    film.originalTitle ||
    "";
  return `${name}${year ? ` (${year})` : ""}`;
}

function formatRawgOption(game = {}) {
  if (!game) return "";
  const name = game.name || "";
  const year = game.released ? game.released.split("-")[0] : "";
  return `${name}${year ? ` (${year})` : ""}`;
}

function updateAutocompleteList(context) {
  if (!context) return;
  const { containerId, listId, state, label } = context;
  const container = document.getElementById(containerId);
  const list = document.getElementById(listId);
  if (!container || !list) return;
  list.innerHTML = "";
  const getLabel = typeof label === "function" ? label : () => "";
  state.results.forEach((item, index) => {
    const option = document.createElement("div");
    option.className = "autocomplete-option";
    option.dataset.index = index;
    option.textContent = getLabel(item) || "";
    list.appendChild(option);
  });
  container.style.display = state.results.length ? "block" : "none";
}

function resetAutocompleteContext(
  context,
  { clearSelection = true, updatePreview = true } = {}
) {
  if (!context) return;
  const { state } = context;
  state.results = [];
  if (clearSelection) {
    state.selected = null;
  }
  if (context.type === "rawg") {
    state.poster = null;
    state.posters = [];
  }
  updateAutocompleteList(context);
  if (updatePreview && typeof context.preview === "function") {
    context.preview();
  }
}

async function executeKinopoiskSearch(
  query,
  contextKey,
  { autoSelect = false, showAlertOnEmpty = false } = {}
) {
  const context = KINO_CONTEXTS[contextKey];
  if (!context) return [];

  if (!query) {
    resetAutocompleteContext(context);
    return [];
  }

  try {
    const res = await fetch(
      `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(query)}&page=1`,
      {
        headers: {
          "X-API-KEY": KINOPOISK_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );
    const data = await res.json();
    const results = Array.isArray(data.films) ? data.films : [];

    if (!results.length) {
      resetAutocompleteContext(context);
      if (showAlertOnEmpty) {
        alert("Ничего не найдено");
      }
      return results;
    }

    context.state.results = results;
    updateAutocompleteList(context);

    if (autoSelect) {
      context.state.selected = results[0];
      if (typeof context.preview === "function") {
        context.preview();
      }
    }

    return results;
  } catch (err) {
    console.error(context.logLabel, err);
    resetAutocompleteContext(context);
    if (showAlertOnEmpty) {
      alert("Не удалось выполнить поиск. Попробуйте снова.");
    }
    return [];
  }
}

async function executeRawgSearch(
  query,
  contextKey,
  { autoSelect = false, showAlertOnEmpty = false } = {}
) {
  const context = RAWG_CONTEXTS[contextKey];
  if (!context) return [];

  if (!query) {
    resetAutocompleteContext(context);
    return [];
  }

  try {
    const res = await fetch(
      `${RAWG_SEARCH_URL}?key=${RAWG_API_KEY}&search=${encodeURIComponent(
        query
      )}&page_size=5`
    );
    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];

    if (!results.length) {
      resetAutocompleteContext(context);
      if (showAlertOnEmpty) {
        alert("Ничего не найдено");
      }
      return results;
    }

    context.state.results = results;
    updateAutocompleteList(context);

    if (autoSelect) {
      context.state.selected = results[0];
    }

    return results;
  } catch (err) {
    console.error(context.logLabel, err);
    resetAutocompleteContext(context);
    if (showAlertOnEmpty) {
      alert("Не удалось выполнить поиск. Попробуйте снова.");
    }
    return [];
  }
}

const KINO_CONTEXTS = {
  movies: {
    type: "kino",
    state: searchState.kino.movies,
    containerId: "autoResultsContainer",
    listId: "autoResults",
    preview: showKPPreview,
    label: formatKinopoiskOption,
    logLabel: "Kinopoisk autocomplete error",
  },
  watchlist: {
    type: "kino",
    state: searchState.kino.watchlist,
    containerId: "watchAutoResultsContainer",
    listId: "watchAutoResults",
    preview: showWatchlistKPPreview,
    label: formatKinopoiskOption,
    logLabel: "Kinopoisk autocomplete error",
  },
};

const RAWG_CONTEXTS = {
  orders: {
    type: "rawg",
    state: searchState.rawg.orders,
    containerId: "gameAutoResultsContainer",
    listId: "gameAutoResults",
    preview: showRAWGPreview,
    label: formatRawgOption,
    logLabel: "RAWG autocomplete error",
  },
  played: {
    type: "rawg",
    state: searchState.rawg.played,
    containerId: "playedGameAutoResultsContainer",
    listId: "playedGameAutoResults",
    preview: showPlayedGamePreview,
    label: formatRawgOption,
    logLabel: "RAWG autocomplete error",
  },
};

const debouncedKPSearch = debounce((query) => {
  executeKinopoiskSearch(query, "movies");
}, 100);

const debouncedWatchlistKPSearch = debounce((query) => {
  executeKinopoiskSearch(query, "watchlist");
}, 100);

const debouncedRAWGSearch = debounce((query) => {
  executeRawgSearch(query, "orders");
}, 100);

const debouncedPlayedRAWGSearch = debounce((query) => {
  executeRawgSearch(query, "played");
}, 100);

async function handleKPSearch() {
  const btn = document.getElementById("autoSearchBtn");
  const loader = document.getElementById("autoSearchLoading");
  if (loader) loader.style.display = "inline-block";
  if (btn) btn.disabled = true;

  try {
    const title = document.getElementById("autoTitle").value.trim();
    if (!title) {
      alert("Введите название фильма");
      return;
    }

    await executeKinopoiskSearch(title, "movies", {
      autoSelect: true,
      showAlertOnEmpty: true,
    });
  } finally {
    if (loader) loader.style.display = "none";
    if (btn) btn.disabled = false;
  }
}

async function handleWatchlistSearch() {
  const btn = document.getElementById("watchAutoSearchBtn");
  const loader = document.getElementById("watchAutoSearchLoading");
  if (loader) loader.style.display = "inline-block";
  if (btn) btn.disabled = true;

  try {
    const title = document.getElementById("watchAutoTitle").value.trim();
    if (!title) {
      alert("Введите название фильма");
      return;
    }

    await executeKinopoiskSearch(title, "watchlist", {
      autoSelect: true,
      showAlertOnEmpty: true,
    });
  } finally {
    if (loader) loader.style.display = "none";
    if (btn) btn.disabled = false;
  }
}

function showKPPreview() {
  const preview = document.getElementById("autoPreview");
  if (!preview) return;
  preview.innerHTML = "";
  const selected = searchState.kino.movies.selected;
  if (!selected) {
    preview.style.display = "none";
    return;
  }
  const movie = {
    id: 0,
    title: selected.nameRu || selected.nameEn || "",
    originalTitle: selected.nameEn || "",
    year: selected.year || "",
    rating: getCurrentRating("ratingStars"),
    kpRating: selected.rating || "-",
    poster:
      selected.posterUrlPreview ||
      selected.posterUrl ||
      "https://via.placeholder.com/300x400?text=Нет+постера",
    dateAdded: new Date().toISOString().split("T")[0],
    genre: selected.genres?.map((g) => g.genre).join(", ") || "",
  };
  preview.appendChild(createMovieCard(movie, false, false));
  preview.style.display = "block";
}

// Preview for watchlist modal
function showWatchlistKPPreview() {
  const preview = document.getElementById("watchAutoPreview");
  if (!preview) return;
  preview.innerHTML = "";
  const state = searchState.kino.watchlist;
  const selected = state.selected;
  if (!selected) {
    preview.style.display = "none";
    return;
  }
  if (
    selected.filmLength === undefined &&
    selected.filmId
  ) {
    fetchKPFilmLength(selected.filmId).then((len) => {
      selected.filmLength = len;
      showWatchlistKPPreview();
    });
  }
  const order = {
    title: selected.nameRu || selected.nameEn || "",
    originalTitle: selected.nameEn || "",
    year: selected.year || "",
    length: selected.filmLength || null,
    kpRating: selected.rating || "-",
    poster:
      selected.posterUrlPreview ||
      selected.posterUrl ||
      "https://via.placeholder.com/300x400?text=Нет+постера",
    genres: selected.genres?.map((g) => g.genre).join(", ") || "",
    orderBy: document.getElementById("watchOrderBy").value || "",
    orderType: document.getElementById("watchOrderType").value || "",
    dateAdded: new Date().toISOString().split("T")[0],
  };
  preview.appendChild(createOrderCard(order, false, false));
  preview.style.display = "block";
}

async function fetchKinopoiskFilmOptions(movie, limit = 9) {
  if (!KINOPOISK_API_KEY || !movie) {
    return [];
  }

  const querySource =
    (movie.originalTitle ||
      movie.title ||
      movie.label ||
      movie.match?.title ||
      movie.match?.nameRu ||
      movie.match?.nameEn ||
      movie.match?.nameOriginal ||
      movie.match?.label ||
      "").trim();

  if (!querySource) {
    return [];
  }

  try {
    const response = await fetch(
      `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(
        querySource
      )}&page=1`,
      {
        headers: {
          "X-API-KEY": KINOPOISK_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      console.error(
        "Kinopoisk search error for ReYohoho options",
        response.status,
        response.statusText
      );
      return [];
    }

    const payload = await response.json();
    const films = Array.isArray(payload.films)
      ? payload.films.filter(Boolean)
      : [];

    if (!films.length) {
      return [];
    }

    const normalizedTitle = normalizeFortuneText(movie.title);
    const normalizedOriginal = normalizeFortuneText(movie.originalTitle);
    const normalizedLabel = normalizeFortuneText(movie.label);
    const targetYear = Number(
      movie.year ||
        movie.match?.year ||
        extractYearValue(movie.match?.releaseDate)
    );

    const scoredFilms = [];
    const seenIds = new Set();

    films.forEach((film, index) => {
      const filmId = extractKinopoiskIdFromValue(film?.filmId);
      if (!filmId || seenIds.has(filmId)) {
        return;
      }
      seenIds.add(filmId);

      let score = 0;
      const filmYear = Number(film.year);

      if (!Number.isNaN(filmYear) && !Number.isNaN(targetYear)) {
        const diff = Math.abs(filmYear - targetYear);
        if (diff === 0) {
          score += 100;
        } else if (diff === 1) {
          score += 60;
        } else if (diff === 2) {
          score += 40;
        } else if (diff <= 4) {
          score += 20 - diff * 2;
        } else {
          score -= diff;
        }
      }

      const filmTitleNormalized = normalizeFortuneText(
        film.nameRu || film.nameEn || film.nameOriginal || ""
      );

      if (normalizedTitle && filmTitleNormalized === normalizedTitle) {
        score += 80;
      }

      if (normalizedOriginal) {
        const filmOriginalNormalized = normalizeFortuneText(
          film.nameEn || film.nameOriginal || ""
        );
        if (filmOriginalNormalized === normalizedOriginal) {
          score += 60;
        }
      }

      if (normalizedLabel && filmTitleNormalized === normalizedLabel) {
        score += 30;
      }

      if (film.rating && film.rating !== "null") {
        const ratingNumber = Number(film.rating);
        if (!Number.isNaN(ratingNumber)) {
          score += Math.min(Math.max(ratingNumber, 0), 10);
        } else {
          score += 5;
        }
      }

      scoredFilms.push({ film, score, index });
    });

    scoredFilms.sort((a, b) => {
      if (b.score === a.score) {
        return a.index - b.index;
      }
      return b.score - a.score;
    });

    return scoredFilms
      .slice(0, Math.max(1, Number(limit) || 1))
      .map(({ film }) => film);
  } catch (err) {
    console.error("Kinopoisk search error for ReYohoho options", err);
    return [];
  }
}

async function fetchKinopoiskFilm(title, year, originalTitle = "") {
  if (!KINOPOISK_API_KEY) {
    return null;
  }
  const query = (originalTitle || title || "").trim();
  if (!query) {
    return null;
  }
  try {
    const res = await fetch(
      `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(query)}&page=1`,
      {
        headers: {
          "X-API-KEY": KINOPOISK_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );
    if (!res.ok) {
      console.error("Kinopoisk search error", res.status, res.statusText);
      return null;
    }
    const data = await res.json();
    const films = data.films || [];
    if (!films.length) {
      return null;
    }
    const targetYear = Number(year);
    let film = null;
    if (targetYear) {
      film =
        films.find((f) => Number(f.year) === targetYear) ||
        films.find((f) => {
          const filmYear = Number(f.year);
          return filmYear && Math.abs(filmYear - targetYear) <= 1;
        });
    }
    if (!film && title) {
      const normalizedTitle = title.trim().toLowerCase();
      film =
        films.find(
          (f) =>
            (f.nameRu || f.nameEn || "").trim().toLowerCase() ===
            normalizedTitle
        ) || null;
    }
    return film || films[0] || null;
  } catch (err) {
    console.error("Kinopoisk search error", err);
    return null;
  }
}

async function openKinopoiskPage(title, year, originalTitle = "") {
  const query = (originalTitle || title || "").trim();
  if (!query) {
    return;
  }
  if (!KINOPOISK_API_KEY) {
    window.open(
      `https://www.kinopoisk.ru/index.php?kp_query=${encodeURIComponent(
        query
      )}`,
      "_blank"
    );
    return;
  }
  const film = await fetchKinopoiskFilm(title, year, originalTitle);
  if (film && film.filmId) {
    window.open(`https://www.kinopoisk.ru/film/${film.filmId}/`, "_blank");
    return;
  }
  window.open(
    `https://www.kinopoisk.ru/index.php?kp_query=${encodeURIComponent(query)}`,
    "_blank"
  );
}

async function handleGameSearch() {
  const btn = document.getElementById("gameAutoSearchBtn");
  const loader = document.getElementById("gameAutoSearchLoading");
  if (loader) loader.style.display = "inline-block";
  if (btn) btn.disabled = true;

  try {
    const title = document.getElementById("gameAutoTitle").value.trim();
    if (!title) {
      alert("Введите название игры");
      return;
    }

    const results = await executeRawgSearch(title, "orders", {
      autoSelect: true,
      showAlertOnEmpty: true,
    });

    if (results.length) {
      const state = RAWG_CONTEXTS.orders.state;
      const selected = state.selected;
      state.poster = null;
      state.posters = [];
      if (selected && selected.name) {
        await fetchSteamGridPosters(selected.name, state);
      }
      showRAWGPreview();
    }
  } finally {
    if (loader) loader.style.display = "none";
    if (btn) btn.disabled = false;
  }
}

function showRAWGPreview() {
  const preview = document.getElementById("gameAutoPreview");
  if (!preview) return;
  preview.innerHTML = "";
  const state = searchState.rawg.orders;
  const selected = state.selected;
  if (!selected) {
    preview.style.display = "none";
    return;
  }
  const game = {
    title: selected.name || "",
    genres: selected.genres?.map((g) => g.name).join(", ") || "",
    year: selected.released
      ? selected.released.split("-")[0]
      : "",
    poster:
      state.poster ||
      selected.background_image ||
      "https://via.placeholder.com/300x400?text=Нет+постера",
    orderBy: document.getElementById("gameOrderBy").value || "",
    orderType: document.getElementById("gameOrderType").value || "",
    dateAdded: new Date().toISOString().split("T")[0],
  };
  const card = createGameCard(game, false);
  preview.appendChild(card);
  createPosterOverlay(
    card.querySelector(".order-poster"),
    state.posters,
    true,
    state
  );
  preview.style.display = "block";
}

async function handlePlayedGameSearch() {
  const btn = document.getElementById("playedGameAutoSearchBtn");
  const loader = document.getElementById("playedGameAutoSearchLoading");
  if (loader) loader.style.display = "inline-block";
  if (btn) btn.disabled = true;

  try {
    const title = document.getElementById("playedGameAutoTitle").value.trim();
    if (!title) {
      alert("Введите название игры");
      return;
    }

    const results = await executeRawgSearch(title, "played", {
      autoSelect: true,
      showAlertOnEmpty: true,
    });

    if (results.length) {
      const state = RAWG_CONTEXTS.played.state;
      const selected = state.selected;
      state.poster = null;
      state.posters = [];
      if (selected && selected.name) {
        await fetchSteamGridPosters(selected.name, state);
      }
      showPlayedGamePreview();
    }
  } finally {
    if (loader) loader.style.display = "none";
    if (btn) btn.disabled = false;
  }
}

function showPlayedGamePreview() {
  const preview = document.getElementById("playedGameAutoPreview");
  if (!preview) return;
  preview.innerHTML = "";
  const state = searchState.rawg.played;
  const selected = state.selected;
  if (!selected) {
    preview.style.display = "none";
    return;
  }
  const game = {
    title: selected.name || "",
    genres: selected.genres?.map((g) => g.name).join(", ") || "",
    year: selected.released
      ? selected.released.split("-")[0]
      : "",
    poster:
      state.poster ||
      selected.background_image ||
      "https://via.placeholder.com/300x400?text=Нет+постера",
    rating: getCurrentRating("playedGameRatingStars"),
    orderBy: document.getElementById("playedGameOrderBy").value || "",
    orderType: document.getElementById("playedGameOrderType").value || "",
    dateAdded: new Date().toISOString().split("T")[0],
  };
  const card = createPlayedGameCard(game, false, false);
  preview.appendChild(card);
  createPosterOverlay(
    card.querySelector(".movie-poster"),
    state.posters,
    true,
    state
  );
  preview.style.display = "block";
}

