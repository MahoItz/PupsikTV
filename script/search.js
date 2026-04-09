// Поиск фильмов
function searchMovies(query) {
  currentSearchQuery = query;
  currentPage = 1;
  renderMovies();
}

const debouncedSearchMovies = debounce(searchMovies, 300);

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

function createAutocompleteFetcher({
  source,
  resultsVar,
  selectedVar,
  containerId,
  listId,
  onPreview,
  onReset,
}) {
  let activeRequestId = 0;

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

  const runSearch = async (query) => {
    const trimmedQuery = (query || "").trim();
    const requestId = ++activeRequestId;

    if (!trimmedQuery) {
      if (requestId !== activeRequestId) return;
      toggleContainer(false);
      clearState();
      if (onPreview) onPreview();
      return;
    }

    const sourceConfig = source(trimmedQuery) || {};
    const {
      url,
      options,
      mapResults,
      formatItem,
      handleError,
      fallbackQueries,
    } = sourceConfig;

    const fallbackList = Array.isArray(fallbackQueries)
      ? fallbackQueries
      : typeof fallbackQueries === "function"
      ? fallbackQueries(trimmedQuery)
      : [];

    const queries = [trimmedQuery, ...(fallbackList || [])]
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .filter((item, idx, arr) => arr.indexOf(item) === idx);

    try {
      for (const nextQuery of queries) {
        if (requestId !== activeRequestId) return;
        const nextConfig = source(nextQuery) || {};
        const nextUrl = nextConfig.url || url;
        const nextOptions = nextConfig.options || options;
        const nextMapResults = nextConfig.mapResults || mapResults;
        const nextFormatItem = nextConfig.formatItem || formatItem;
        const nextHandleError = nextConfig.handleError || handleError;

        const res = await fetch(nextUrl, nextOptions);
        if (requestId !== activeRequestId) return;
        if (!res.ok) {
          if (nextHandleError) {
            await nextHandleError(res);
          }
          if (requestId !== activeRequestId) return;
          toggleContainer(false);
          clearState();
          if (onPreview) onPreview();
          return;
        }

        const data = await res.json();
        if (requestId !== activeRequestId) return;
        const results = (nextMapResults ? nextMapResults(data) : data) || [];
        resultsVar.set(results);

        if (!results.length) {
          continue;
        }

        const list = document.getElementById(listId);
        if (!list) return;

        list.innerHTML = "";
        results.forEach((item, idx) => {
          const div = document.createElement("div");
          div.className = "autocomplete-option";
          div.dataset.index = idx;
          div.textContent = nextFormatItem
            ? nextFormatItem(item)
            : item?.name || "";
          list.appendChild(div);
        });

        if (requestId !== activeRequestId) return;
        toggleContainer(true);
        return;
      }

      toggleContainer(false);
      clearState();
      if (onPreview) onPreview();
      return;
    } catch (err) {
      if (requestId !== activeRequestId) return;
      console.error("Autocomplete fetch error", err);
      toggleContainer(false);
      clearState();
      if (onPreview) onPreview();
    }
  };

  return debounce((query) => runSearch(query), 100);
}

const debouncedKPSearch = createAutocompleteFetcher({
  source: (query) => ({
    url: `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(query)}&page=1`,
    fallbackQueries: () => {
      const trimmed = String(query || "").trim();
      if (!trimmed) return [];
      if (hasUppercaseLetters(trimmed)) return [];
      return [capitalizeWords(trimmed)];
    },
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
    fallbackQueries: () => {
      const trimmed = String(query || "").trim();
      if (!trimmed) return [];
      if (hasUppercaseLetters(trimmed)) return [];
      return [capitalizeWords(trimmed)];
    },
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
    resetRawgPosterCache();
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
    resetRawgPosterCache();
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
    if (!kpResults.length && !hasUppercaseLetters(title)) {
      const altTitle = capitalizeWords(title);
      if (altTitle && altTitle !== title) {
        const altRes = await fetch(
          `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(
            altTitle
          )}&page=1`,
          {
            headers: {
              "X-API-KEY": KINOPOISK_API_KEY,
              "Content-Type": "application/json",
            },
          }
        );
        if (altRes.ok) {
          const altData = await altRes.json();
          kpResults = altData.films || [];
        }
      }
    }
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
    if (!kpOrderResults.length && !hasUppercaseLetters(title)) {
      const altTitle = capitalizeWords(title);
      if (altTitle && altTitle !== title) {
        const altRes = await fetch(
          `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(
            altTitle
          )}&page=1`,
          {
            headers: {
              "X-API-KEY": KINOPOISK_API_KEY,
              "Content-Type": "application/json",
            },
          }
        );
        if (altRes.ok) {
          const altData = await altRes.json();
          kpOrderResults = altData.films || [];
        }
      }
    }
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

const watchlistPreviewDetailsCache = new Map();
const watchlistPreviewDetailsPending = new Map();
const watchlistPreviewStaffCache = new Map();
const watchlistPreviewStaffPending = new Map();

function getWatchlistPreviewDetails(filmId) {
  if (!filmId || !KINOPOISK_API_KEY) {
    return Promise.resolve(null);
  }
  if (watchlistPreviewDetailsCache.has(filmId)) {
    return Promise.resolve(watchlistPreviewDetailsCache.get(filmId));
  }
  if (watchlistPreviewDetailsPending.has(filmId)) {
    return watchlistPreviewDetailsPending.get(filmId);
  }

  const loadPromise = fetch(
    `${KINOPOISK_FILM_URL}/${encodeURIComponent(filmId)}`,
    {
      headers: {
        "X-API-KEY": KINOPOISK_API_KEY,
        "Content-Type": "application/json",
      },
    }
  )
    .then(async (res) => {
      if (!res.ok) {
        await handleKinopoiskErrorResponse(res);
        return null;
      }
      return res.json();
    })
    .then((data) => {
      watchlistPreviewDetailsCache.set(filmId, data || null);
      return data || null;
    })
    .catch((err) => {
      console.error("Kinopoisk preview details error", err);
      watchlistPreviewDetailsCache.set(filmId, null);
      return null;
    })
    .finally(() => {
      watchlistPreviewDetailsPending.delete(filmId);
    });

  watchlistPreviewDetailsPending.set(filmId, loadPromise);
  return loadPromise;
}

function getWatchlistPreviewStaff(filmId) {
  if (!filmId || !KINOPOISK_API_KEY) {
    return Promise.resolve({ actors: [], directors: [] });
  }
  if (watchlistPreviewStaffCache.has(filmId)) {
    return Promise.resolve(watchlistPreviewStaffCache.get(filmId));
  }
  if (watchlistPreviewStaffPending.has(filmId)) {
    return watchlistPreviewStaffPending.get(filmId);
  }

  const loadPromise = fetchKPFilmStaff(filmId)
    .then((staff) => {
      const normalized = staff || { actors: [], directors: [] };
      watchlistPreviewStaffCache.set(filmId, normalized);
      return normalized;
    })
    .catch((err) => {
      console.error("Kinopoisk preview staff error", err);
      const fallback = { actors: [], directors: [] };
      watchlistPreviewStaffCache.set(filmId, fallback);
      return fallback;
    })
    .finally(() => {
      watchlistPreviewStaffPending.delete(filmId);
    });

  watchlistPreviewStaffPending.set(filmId, loadPromise);
  return loadPromise;
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
  const filmId = selectedKPOrderMovie.filmId || null;
  const hasDetails = filmId && watchlistPreviewDetailsCache.has(filmId);
  const hasStaff = filmId && watchlistPreviewStaffCache.has(filmId);
  const details = hasDetails ? watchlistPreviewDetailsCache.get(filmId) : null;
  const staff = hasStaff ? watchlistPreviewStaffCache.get(filmId) : null;

  if (filmId && KINOPOISK_API_KEY) {
    if (!hasDetails) {
      getWatchlistPreviewDetails(filmId).then(() => {
        if (selectedKPOrderMovie?.filmId === filmId) {
          showWatchlistKPPreview();
        }
      });
    }
    if (!hasStaff) {
      getWatchlistPreviewStaff(filmId).then(() => {
        if (selectedKPOrderMovie?.filmId === filmId) {
          showWatchlistKPPreview();
        }
      });
    }
  }

  if (
    selectedKPOrderMovie.filmLength === undefined &&
    filmId &&
    KINOPOISK_API_KEY &&
    !details?.filmLength
  ) {
    fetchKPFilmLength(filmId).then((len) => {
      selectedKPOrderMovie.filmLength = len;
      showWatchlistKPPreview();
    });
  }

  if (selectedKPOrderMovie.filmLength === undefined && details?.filmLength) {
    selectedKPOrderMovie.filmLength = details.filmLength;
  }

  const countryText = Array.isArray(details?.countries)
    ? details.countries.map((c) => c.country).filter(Boolean).join(", ")
    : "";
  const directorText = Array.isArray(staff?.directors)
    ? staff.directors.join(", ")
    : "";
  const order = {
    id: filmId ? `kp-${filmId}` : `kp-${Date.now()}`,
    __virtual: true,
    title: selectedKPOrderMovie.nameRu || selectedKPOrderMovie.nameEn || "",
    originalTitle: selectedKPOrderMovie.nameEn || "",
    year: selectedKPOrderMovie.year || "",
    length: selectedKPOrderMovie.filmLength || null,
    kpRating:
      details?.ratingKinopoisk ||
      details?.ratingImdb ||
      selectedKPOrderMovie.rating ||
      "-",
    poster:
      selectedKPOrderMovie.posterUrlPreview ||
      selectedKPOrderMovie.posterUrl ||
      "https://via.placeholder.com/300x400?text=Нет+постера",
    genres: selectedKPOrderMovie.genres?.map((g) => g.genre).join(", ") || "",
    description: details?.description || details?.shortDescription || "",
    country: countryText,
    director: directorText,
    actors: staff?.actors || [],
    kinopoiskId: filmId || null,
    imdbId: details?.imdbId || null,
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

const KP_SELECTION_LIMIT = 6;
let kpSelectionContext = null;

function buildKinopoiskSearchUrl(query) {
  const normalizedQuery = (query || "").trim();
  if (typeof buildKinopoiskSearchLink === "function") {
    return buildKinopoiskSearchLink(normalizedQuery);
  }
  return `https://www.kinopoisk.ru/index.php?kp_query=${encodeURIComponent(
    normalizedQuery
  )}`;
}

async function fetchKinopoiskCandidates(query) {
  const normalizedQuery = (query || "").trim();
  if (!normalizedQuery || !KINOPOISK_API_KEY) {
    return [];
  }
  try {
    const url = `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(
      normalizedQuery
    )}&page=1`;
    const res = await fetch(url, {
      headers: {
        "X-API-KEY": KINOPOISK_API_KEY,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      await handleKinopoiskErrorResponse(res);
      return [];
    }
    const data = await res.json();
    return (data?.films || []).slice(0, KP_SELECTION_LIMIT);
  } catch (err) {
    console.error("Kinopoisk candidates error", err);
    return [];
  }
}

async function fetchKinopoiskImdbId(filmId) {
  if (!filmId || !KINOPOISK_API_KEY) {
    return null;
  }
  try {
    const res = await fetch(
      `${KINOPOISK_FILM_URL}/${encodeURIComponent(filmId)}`,
      {
        headers: {
          "X-API-KEY": KINOPOISK_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );
    if (!res.ok) {
      await handleKinopoiskErrorResponse(res);
      return null;
    }
    const data = await res.json();
    return data?.imdbId || null;
  } catch (err) {
    console.error("Kinopoisk IMDb fetch error", err);
    return null;
  }
}

function updateLocalKinopoiskMetadata(item, kinopoiskId, imdbId, table) {
  if (!item) return;
  item.kinopoiskId = kinopoiskId;
  if (imdbId !== undefined) {
    item.imdbId = imdbId;
  }
  if (table === "movies") {
    localStorage.setItem("moviesCache", JSON.stringify(allMovies));
  }
}

async function persistKinopoiskMetadata({ table, itemId, kinopoiskId, imdbId }) {
  if (!table || !itemId || !kinopoiskId) {
    return;
  }
  try {
    const token = localStorage.getItem("adminToken") || "";
    if (!token) {
      throw new Error("Admin token is missing");
    }

    const response = await fetch("/api/admin?action=media-admin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "update_kinopoisk_metadata",
        table,
        itemId,
        kinopoiskId,
        imdbId: imdbId || null,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || `Failed to persist Kinopoisk IDs: ${response.status}`);
    }
  } catch (err) {
    console.error("Failed to persist Kinopoisk IDs", err);
  }
}

async function handleKinopoiskSelection(film) {
  const filmId = extractKinopoiskIdFromValue(film?.filmId);
  if (!kpSelectionContext || !filmId) return;
  const { item, table } = kpSelectionContext;
  const imdbId = film?.imdbId || (await fetchKinopoiskImdbId(filmId));
  await persistKinopoiskMetadata({
    table,
    itemId: item?.id,
    kinopoiskId: filmId,
    imdbId,
  });
  updateLocalKinopoiskMetadata(item, filmId, imdbId, table);
  closeModal("kpSelectModal");
  window.open(`https://www.kinopoisk.ru/film/${filmId}/`, "_blank");
}

function renderKinopoiskSelectionResults(results) {
  const listEl = document.getElementById("kpSelectList");
  if (!listEl) return;
  listEl.innerHTML = "";
  results.forEach((film) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "kp-select-option";
    const title = film?.nameRu || film?.nameEn || "Без названия";
    const year = film?.year ? ` (${film.year})` : "";
    const rating = film?.rating ? ` • ${film.rating}` : "";
    btn.textContent = `${title}${year}${rating}`;
    btn.addEventListener("click", () => handleKinopoiskSelection(film));
    listEl.appendChild(btn);
  });
}

async function openKinopoiskSelectionModal({ item, table, title, originalTitle }) {
  const modal = document.getElementById("kpSelectModal");
  const statusEl = document.getElementById("kpSelectStatus");
  const linkEl = document.getElementById("kpSelectSearchLink");
  const query = (originalTitle || title || "").trim();
  if (!modal || !query) {
    return;
  }
  kpSelectionContext = { item, table };
  if (linkEl) {
    linkEl.href = buildKinopoiskSearchUrl(query);
  }
  if (statusEl) {
    statusEl.textContent = "Ищем варианты на Кинопоиске...";
  }
  modal.style.display = "block";
  const results = await fetchKinopoiskCandidates(query);
  if (statusEl) {
    statusEl.textContent = results.length
      ? `Найдено вариантов: ${results.length}`
      : "Не удалось найти подходящие фильмы.";
  }
  renderKinopoiskSelectionResults(results);
}

async function openKinopoiskPageForRecord({ item, table }) {
  if (!item) return;
  const kinopoiskId = item.kinopoiskId || item.kpId || item.kp_id || null;
  const title = item.title || "";
  const originalTitle = item.originalTitle || "";
  const year = item.year || "";

  if (kinopoiskId) {
    window.open(`https://www.kinopoisk.ru/film/${kinopoiskId}/`, "_blank");
    return;
  }

  const query = (originalTitle || title || "").trim();
  if (!query) return;

  if (!KINOPOISK_API_KEY) {
    window.open(buildKinopoiskSearchUrl(query), "_blank");
    return;
  }

  const film = await fetchKinopoiskFilm(title, year, originalTitle);
  const filmId = extractKinopoiskIdFromValue(film?.filmId);
  if (filmId) {
    const imdbId = film?.imdbId || (await fetchKinopoiskImdbId(filmId));
    await persistKinopoiskMetadata({
      table,
      itemId: item.id,
      kinopoiskId: filmId,
      imdbId,
    });
    updateLocalKinopoiskMetadata(item, filmId, imdbId, table);
    window.open(`https://www.kinopoisk.ru/film/${filmId}/`, "_blank");
    return;
  }

  await openKinopoiskSelectionModal({ item, table, title, originalTitle });
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
      resetRawgPosterCache();
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
  const rawgPosterUrl = selectedRAWGGame.background_image || "";
  if (!steamGridPoster && rawgPosterUrl) {
    ensureRawgOptimizedPoster(rawgPosterUrl, () => {
      if (
        selectedRAWGGame &&
        selectedRAWGGame.background_image === rawgPosterUrl
      ) {
        showRAWGPreview();
      }
    });
  }
  const optimizedRawgPoster = getRawgOptimizedPosterFor(rawgPosterUrl);
  const game = {
    title: selectedRAWGGame.name || "",
    genres: selectedRAWGGame.genres?.map((g) => g.name).join(", ") || "",
    year: selectedRAWGGame.released
      ? selectedRAWGGame.released.split("-")[0]
      : "",
    poster:
      steamGridPoster ||
      optimizedRawgPoster ||
      rawgPosterUrl ||
      "https://via.placeholder.com/300x400?text=Нет+постера",
    orderBy: document.getElementById("gameOrderBy").value || "",
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
      resetRawgPosterCache();
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
  const rawgPosterUrl = selectedRAWGGame.background_image || "";
  if (!steamGridPoster && rawgPosterUrl) {
    ensureRawgOptimizedPoster(rawgPosterUrl, () => {
      if (
        selectedRAWGGame &&
        selectedRAWGGame.background_image === rawgPosterUrl
      ) {
        showPlayedGamePreview();
      }
    });
  }
  const optimizedRawgPoster = getRawgOptimizedPosterFor(rawgPosterUrl);
  const game = {
    title: selectedRAWGGame.name || "",
    genres: selectedRAWGGame.genres?.map((g) => g.name).join(", ") || "",
    year: selectedRAWGGame.released
      ? selectedRAWGGame.released.split("-")[0]
      : "",
    poster:
      steamGridPoster ||
      optimizedRawgPoster ||
      rawgPosterUrl ||
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
