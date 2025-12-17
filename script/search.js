// Поиск фильмов
function searchMovies(query) {
  currentSearchQuery = query;
  currentPage = 1;
  renderMovies();
}

const debouncedSearchMovies = debounce(searchMovies, 300);

function createAutocompleteFetcher({
  source,
  resultsVar,
  selectedVar,
  containerId,
  listId,
  onPreview,
  onReset,
}) {
  const clearState = () => {
    resultsVar.set([]);
    selectedVar.set(null);
    if (onReset) {
      onReset();
    }
    const list = document.getElementById(listId);
    if (list) list.innerHTML = "";
  };

  const toggleContainer = (isVisible) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.style.display = isVisible ? "block" : "none";
  };

  return debounce(async (query) => {
    if (!query) {
      toggleContainer(false);
      clearState();
      if (onPreview) onPreview();
      return;
    }

    const { url, options, mapResults, formatItem, handleError } = source(query);

    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        if (handleError) {
          await handleError(res);
        }
        toggleContainer(false);
        clearState();
        if (onPreview) onPreview();
        return;
      }

      const data = await res.json();
      const results = (mapResults ? mapResults(data) : data) || [];
      resultsVar.set(results);

      if (!results.length) {
        toggleContainer(false);
        clearState();
        if (onPreview) onPreview();
        return;
      }

      const list = document.getElementById(listId);
      if (!list) return;

      list.innerHTML = "";
      results.forEach((item, idx) => {
        const div = document.createElement("div");
        div.className = "autocomplete-option";
        div.dataset.index = idx;
        div.textContent = formatItem ? formatItem(item) : item?.name || "";
        list.appendChild(div);
      });

      toggleContainer(true);
    } catch (err) {
      console.error("Autocomplete fetch error", err);
      toggleContainer(false);
      clearState();
      if (onPreview) onPreview();
    }
  }, 100);
}

const debouncedKPSearch = createAutocompleteFetcher({
  source: (query) => ({
    url: `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(query)}&page=1`,
    options: {
      headers: {
        "X-API-KEY": KINOPOISK_API_KEY,
        "Content-Type": "application/json",
      },
    },
    mapResults: (data) => data.films || [],
    formatItem: (m) => {
      const year = m.year || "";
      const name = m.nameRu || m.nameEn || "";
      return `${name}${year ? ` (${year})` : ""}`;
    },
    handleError: handleKinopoiskErrorResponse,
  }),
  resultsVar: { set: (value) => (kpResults = value) },
  selectedVar: { set: (value) => (selectedKPMovie = value) },
  containerId: "autoResultsContainer",
  listId: "autoResults",
  onPreview: showKPPreview,
});

const debouncedWatchlistKPSearch = createAutocompleteFetcher({
  source: (query) => ({
    url: `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(query)}&page=1`,
    options: {
      headers: {
        "X-API-KEY": KINOPOISK_API_KEY,
        "Content-Type": "application/json",
      },
    },
    mapResults: (data) => data.films || [],
    formatItem: (m) => {
      const year = m.year || "";
      const name = m.nameRu || m.nameEn || "";
      return `${name}${year ? ` (${year})` : ""}`;
    },
    handleError: handleKinopoiskErrorResponse,
  }),
  resultsVar: { set: (value) => (kpOrderResults = value) },
  selectedVar: { set: (value) => (selectedKPOrderMovie = value) },
  containerId: "watchAutoResultsContainer",
  listId: "watchAutoResults",
  onPreview: showWatchlistKPPreview,
});

const debouncedRAWGSearch = createAutocompleteFetcher({
  source: (query) => ({
    url: `${RAWG_SEARCH_URL}?key=${RAWG_API_KEY}&search=${encodeURIComponent(
      query
    )}&page_size=5`,
    mapResults: (data) => data.results || [],
    formatItem: (g) => {
      const year = g.released ? g.released.split("-")[0] : "";
      return `${g.name}${year ? ` (${year})` : ""}`;
    },
  }),
  resultsVar: { set: (value) => (rawgResults = value) },
  selectedVar: { set: (value) => (selectedRAWGGame = value) },
  containerId: "gameAutoResultsContainer",
  listId: "gameAutoResults",
  onPreview: showRAWGPreview,
  onReset: () => {
    steamGridPoster = null;
    steamGridPosters = [];
  },
});

const debouncedPlayedRAWGSearch = createAutocompleteFetcher({
  source: (query) => ({
    url: `${RAWG_SEARCH_URL}?key=${RAWG_API_KEY}&search=${encodeURIComponent(
      query
    )}&page_size=5`,
    mapResults: (data) => data.results || [],
    formatItem: (g) => {
      const year = g.released ? g.released.split("-")[0] : "";
      return `${g.name}${year ? ` (${year})` : ""}`;
    },
  }),
  resultsVar: { set: (value) => (rawgResults = value) },
  selectedVar: { set: (value) => (selectedRAWGGame = value) },
  containerId: "playedGameAutoResultsContainer",
  listId: "playedGameAutoResults",
  onPreview: showPlayedGamePreview,
  onReset: () => {
    steamGridPoster = null;
    steamGridPosters = [];
  },
});

async function handleKPSearch() {
  const btn = document.getElementById("autoSearchBtn");
  const loader = document.getElementById("autoSearchLoading");
  if (loader) loader.style.display = "inline-block";
  if (btn) btn.disabled = true;
  const title = document.getElementById("autoTitle").value.trim();
  if (!title) {
    alert("Введите название фильма");
    if (loader) loader.style.display = "none";
    if (btn) btn.disabled = false;
    return;
  }

  try {
    const url = `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(
      title
    )}&page=1`;
    const res = await fetch(url, {
      headers: {
        "X-API-KEY": KINOPOISK_API_KEY,
        "Content-Type": "application/json",
      },
    });
    const container = document.getElementById("autoResultsContainer");
    const list = document.getElementById("autoResults");
    if (!res.ok) {
      await handleKinopoiskErrorResponse(res);
      kpResults = [];
      selectedKPMovie = null;
      if (list) list.innerHTML = "";
      if (container) container.style.display = "none";
      return;
    }
    const data = await res.json();
    kpResults = data.films || [];
    list.innerHTML = "";
    kpResults.forEach((m, idx) => {
      const div = document.createElement("div");
      div.className = "autocomplete-option";
      div.dataset.index = idx;
      const year = m.year || "";
      const name = m.nameRu || m.nameEn || "";
      div.textContent = `${name}${year ? ` (${year})` : ""}`;
      list.appendChild(div);
    });
    if (kpResults.length > 0) {
      container.style.display = "block";
      selectedKPMovie = kpResults[0];
      showKPPreview();
    } else {
      container.style.display = "none";
      selectedKPMovie = null;
      showKPPreview();
      alert("Ничего не найдено");
    }
  } catch (err) {
    console.error("Kinopoisk search error", err);
  }
  if (loader) loader.style.display = "none";
  if (btn) btn.disabled = false;
}

async function handleWatchlistSearch() {
  const btn = document.getElementById("watchAutoSearchBtn");
  const loader = document.getElementById("watchAutoSearchLoading");
  if (loader) loader.style.display = "inline-block";
  if (btn) btn.disabled = true;
  const title = document.getElementById("watchAutoTitle").value.trim();
  if (!title) {
    alert("Введите название фильма");
    if (loader) loader.style.display = "none";
    if (btn) btn.disabled = false;
    return;
  }

  try {
    const url = `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(
      title
    )}&page=1`;
    const res = await fetch(url, {
      headers: {
        "X-API-KEY": KINOPOISK_API_KEY,
        "Content-Type": "application/json",
      },
    });
    const container = document.getElementById("watchAutoResultsContainer");
    const list = document.getElementById("watchAutoResults");
    if (!res.ok) {
      await handleKinopoiskErrorResponse(res);
      kpOrderResults = [];
      selectedKPOrderMovie = null;
      if (list) list.innerHTML = "";
      if (container) container.style.display = "none";
      return;
    }
    const data = await res.json();
    kpOrderResults = data.films || [];
    list.innerHTML = "";
    kpOrderResults.forEach((m, idx) => {
      const div = document.createElement("div");
      div.className = "autocomplete-option";
      div.dataset.index = idx;
      const year = m.year || "";
      const name = m.nameRu || m.nameEn || "";
      div.textContent = `${name}${year ? ` (${year})` : ""}`;
      list.appendChild(div);
    });
    if (kpOrderResults.length > 0) {
      container.style.display = "block";
      selectedKPOrderMovie = kpOrderResults[0];
      showWatchlistKPPreview();
    } else {
      container.style.display = "none";
      selectedKPOrderMovie = null;
      showWatchlistKPPreview();
      alert("Ничего не найдено");
    }
  } catch (err) {
    console.error("Kinopoisk search error", err);
  }
  if (loader) loader.style.display = "none";
  if (btn) btn.disabled = false;
}

function showKPPreview() {
  const preview = document.getElementById("autoPreview");
  if (!preview) return;
  preview.innerHTML = "";
  if (!selectedKPMovie) {
    preview.style.display = "none";
    return;
  }
  const movie = {
    id: 0,
    title: selectedKPMovie.nameRu || selectedKPMovie.nameEn || "",
    originalTitle: selectedKPMovie.nameEn || "",
    year: selectedKPMovie.year || "",
    rating: getCurrentRating("ratingStars"),
    kpRating: selectedKPMovie.rating || "-",
    poster:
      selectedKPMovie.posterUrlPreview ||
      selectedKPMovie.posterUrl ||
      "https://via.placeholder.com/300x400?text=Нет+постера",
    dateAdded: new Date().toISOString().split("T")[0],
    genre: selectedKPMovie.genres?.map((g) => g.genre).join(", ") || "",
  };
  preview.appendChild(createMovieCard(movie, false, false));
  preview.style.display = "block";
}

// Preview for watchlist modal
function showWatchlistKPPreview() {
  const preview = document.getElementById("watchAutoPreview");
  if (!preview) return;
  preview.innerHTML = "";
  if (!selectedKPOrderMovie) {
    preview.style.display = "none";
    return;
  }
  if (
    selectedKPOrderMovie.filmLength === undefined &&
    selectedKPOrderMovie.filmId
  ) {
    fetchKPFilmLength(selectedKPOrderMovie.filmId).then((len) => {
      selectedKPOrderMovie.filmLength = len;
      showWatchlistKPPreview();
    });
  }
  const order = {
    title: selectedKPOrderMovie.nameRu || selectedKPOrderMovie.nameEn || "",
    originalTitle: selectedKPOrderMovie.nameEn || "",
    year: selectedKPOrderMovie.year || "",
    length: selectedKPOrderMovie.filmLength || null,
    kpRating: selectedKPOrderMovie.rating || "-",
    poster:
      selectedKPOrderMovie.posterUrlPreview ||
      selectedKPOrderMovie.posterUrl ||
      "https://via.placeholder.com/300x400?text=Нет+постера",
    genres: selectedKPOrderMovie.genres?.map((g) => g.genre).join(", ") || "",
    orderBy: document.getElementById("watchOrderBy").value || "",
    orderType: document.getElementById("watchOrderType").value || "",
    dateAdded: new Date().toISOString().split("T")[0],
  };
  preview.appendChild(createOrderCard(order, false, false));
  preview.style.display = "block";
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
      const handled = await handleKinopoiskErrorResponse(res);
      if (!handled) {
        console.error("Kinopoisk search error", res.status, res.statusText);
      }
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
  const title = document.getElementById("gameAutoTitle").value.trim();
  if (!title) {
    alert("Введите название игры");
    if (loader) loader.style.display = "none";
    if (btn) btn.disabled = false;
    return;
  }

  try {
    const url = `${RAWG_SEARCH_URL}?key=${RAWG_API_KEY}&search=${encodeURIComponent(
      title
    )}&page_size=5`;
    const res = await fetch(url);
    const data = await res.json();
    rawgResults = data.results || [];
    const container = document.getElementById("gameAutoResultsContainer");
    const list = document.getElementById("gameAutoResults");
    list.innerHTML = "";
    rawgResults.forEach((g, idx) => {
      const div = document.createElement("div");
      div.className = "autocomplete-option";
      div.dataset.index = idx;
      const year = g.released ? g.released.split("-")[0] : "";
      div.textContent = `${g.name}${year ? ` (${year})` : ""}`;
      list.appendChild(div);
    });
    if (rawgResults.length > 0) {
      container.style.display = "block";
      selectedRAWGGame = rawgResults[0];
      await fetchSteamGridPosters(selectedRAWGGame.name);
      showRAWGPreview();
    } else {
      container.style.display = "none";
      selectedRAWGGame = null;
      steamGridPoster = null;
      steamGridPosters = [];
      showRAWGPreview();
      alert("Ничего не найдено");
    }
  } catch (err) {
    console.error("RAWG search error", err);
  }
  if (loader) loader.style.display = "none";
  if (btn) btn.disabled = false;
}

function showRAWGPreview() {
  const preview = document.getElementById("gameAutoPreview");
  if (!preview) return;
  preview.innerHTML = "";
  if (!selectedRAWGGame) {
    preview.style.display = "none";
    return;
  }
  const game = {
    title: selectedRAWGGame.name || "",
    genres: selectedRAWGGame.genres?.map((g) => g.name).join(", ") || "",
    year: selectedRAWGGame.released
      ? selectedRAWGGame.released.split("-")[0]
      : "",
    poster:
      steamGridPoster ||
      selectedRAWGGame.background_image ||
      "https://via.placeholder.com/300x400?text=Нет+постера",
    orderBy: "",
    orderType: document.getElementById("gameOrderType").value || "",
    dateAdded: new Date().toISOString().split("T")[0],
  };
  const card = createGameCard(game, false);
  preview.appendChild(card);
  createPosterOverlay(
    card.querySelector(".order-poster"),
    steamGridPosters,
    true
  );
  preview.style.display = "block";
}

async function handlePlayedGameSearch() {
  const btn = document.getElementById("playedGameAutoSearchBtn");
  const loader = document.getElementById("playedGameAutoSearchLoading");
  if (loader) loader.style.display = "inline-block";
  if (btn) btn.disabled = true;
  const title = document.getElementById("playedGameAutoTitle").value.trim();
  if (!title) {
    alert("Введите название игры");
    if (loader) loader.style.display = "none";
    if (btn) btn.disabled = false;
    return;
  }

  try {
    const url = `${RAWG_SEARCH_URL}?key=${RAWG_API_KEY}&search=${encodeURIComponent(
      title
    )}&page_size=5`;
    const res = await fetch(url);
    const data = await res.json();
    rawgResults = data.results || [];
    const container = document.getElementById("playedGameAutoResultsContainer");
    const list = document.getElementById("playedGameAutoResults");
    list.innerHTML = "";
    rawgResults.forEach((g, idx) => {
      const div = document.createElement("div");
      div.className = "autocomplete-option";
      div.dataset.index = idx;
      const year = g.released ? g.released.split("-")[0] : "";
      div.textContent = `${g.name}${year ? ` (${year})` : ""}`;
      list.appendChild(div);
    });
    if (rawgResults.length > 0) {
      container.style.display = "block";
      selectedRAWGGame = rawgResults[0];
      await fetchSteamGridPosters(selectedRAWGGame.name);
      showPlayedGamePreview();
    } else {
      container.style.display = "none";
      selectedRAWGGame = null;
      steamGridPoster = null;
      showPlayedGamePreview();
      alert("Ничего не найдено");
    }
  } catch (err) {
    console.error("RAWG search error", err);
  }
  if (loader) loader.style.display = "none";
  if (btn) btn.disabled = false;
}

function showPlayedGamePreview() {
  const preview = document.getElementById("playedGameAutoPreview");
  if (!preview) return;
  preview.innerHTML = "";
  if (!selectedRAWGGame) {
    preview.style.display = "none";
    return;
  }
  const game = {
    title: selectedRAWGGame.name || "",
    genres: selectedRAWGGame.genres?.map((g) => g.name).join(", ") || "",
    year: selectedRAWGGame.released
      ? selectedRAWGGame.released.split("-")[0]
      : "",
    poster:
      steamGridPoster ||
      selectedRAWGGame.background_image ||
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
    steamGridPosters,
    true
  );
  preview.style.display = "block";
}

