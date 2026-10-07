// Поиск фильмов
function searchMovies(query) {
  currentSearchQuery = query;
  currentPage = 1;
  renderMovies();
}

const debouncedSearchMovies = debounce(searchMovies, 300);

// Preview for watchlist modal

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

    const response = await fetch(window.Pupsik.apiUrl("/api/admin?action=media-admin"), {
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
