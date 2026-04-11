// Обработка форм
// form submit guards
let isSubmittingWatchlistOrder = false;
let isSubmittingGameOrder = false;
let isSubmittingMovieAdd = false;

function toggleSubmitLoading(button, isLoading, label) {
  if (!button) return;
  if (isLoading) {
    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }
    const safeLabel = label || "Добавляем...";
    button.innerHTML = `<span class="loading-spinner" aria-hidden="true"></span><span>${safeLabel}</span>`;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.classList.add("is-loading");
  } else {
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.classList.remove("is-loading");
  }
}

function normalizeActorsForStorage(value, limit = 15) {
  if (Array.isArray(value)) {
    return value
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, limit)
      .join(", ");
  }
  if (typeof value === "string") {
    return value;
  }
  return "";
}

async function resolveKinopoiskImdbId(kinopoiskId, currentImdbId) {
  if (currentImdbId || !kinopoiskId) {
    return currentImdbId || null;
  }
  if (typeof fetchKinopoiskImdbId !== "function" || !KINOPOISK_API_KEY) {
    return currentImdbId || null;
  }
  return fetchKinopoiskImdbId(kinopoiskId);
}

function syncGameModeSelectGroup(groupName) {
  const selects = Array.from(
    document.querySelectorAll(`[data-sync-game-mode="${groupName}"]`)
  );
  if (!selects.length) return;

  selects.forEach((select) => {
    select.addEventListener("change", () => {
      const nextValue = normalizeGameMode(select.value);
      selects.forEach((otherSelect) => {
        if (otherSelect !== select) {
          otherSelect.value = nextValue;
        }
      });
    });
  });
}

function getSelectedGameMode(mode, autoSelectId, manualSelectId) {
  const sourceId = mode === "auto" ? autoSelectId : manualSelectId;
  return normalizeGameMode(document.getElementById(sourceId)?.value);
}

syncGameModeSelectGroup("add-game");
syncGameModeSelectGroup("played-game");

function mapInsertedMovieOrder(data, orderData) {
  return {
    id: data.id,
    title: data.order_title,
    originalTitle: data.order_origin_title,
    genres: data.order_genres,
    poster: data.order_poster,
    year: data.order_year || "",
    length: data.order_length || null,
    planDate: data.plan_date || null,
    kpRating: data.kinopoisk_rate,
    kinopoiskId: data.kp_id || orderData.kinopoiskId,
    imdbId: data.imdb_id || orderData.imdbId || null,
    orderBy: data.order_by,
    orderType: data.order_type,
    dateAdded: data.created_at,
    parentGuide: null,
    parentGuideStatus: null,
    parentGuideError: null,
    description: orderData.description,
    country: orderData.country,
    actors: orderData.actors,
    director: orderData.director,
    watchSource: normalizeWatchSource(data.watch_source || orderData.watchSource),
  };
}

async function saveMovieOrder(orderData) {
  const normalizedTitle = String(orderData?.title || "").trim();
  if (!normalizedTitle) {
    return { ok: false, reason: "missing_title" };
  }

  const normalizedOrder = {
    ...orderData,
    title: normalizedTitle,
    originalTitle: String(orderData?.originalTitle || "").trim(),
    year: orderData?.year || "",
    kpRating: orderData?.kpRating || "-",
    poster:
      orderData?.poster || "https://via.placeholder.com/300x400?text=РќРµС‚+РїРѕСЃС‚РµСЂР°",
    genres: orderData?.genres || "",
    description: orderData?.description || "",
    country: orderData?.country || "",
    actors: Array.isArray(orderData?.actors) ? orderData.actors : [],
    director: orderData?.director || "",
    orderBy: String(orderData?.orderBy || "").trim(),
    orderType: orderData?.orderType || "",
    watchSource: normalizeWatchSource(orderData?.watchSource),
    length: orderData?.length || null,
    kinopoiskId: orderData?.kinopoiskId || null,
    imdbId: orderData?.imdbId || null,
  };

  const duplicateOrder = watchlist.some(
    (o) =>
      o.title.trim().toLowerCase() === normalizedOrder.title.trim().toLowerCase() &&
      Number(o.year) === Number(normalizedOrder.year)
  );
  if (duplicateOrder) {
    if (typeof showDuplicateModal === "function") {
      showDuplicateModal();
    }
    return { ok: false, reason: "duplicate" };
  }

  normalizedOrder.imdbId = await resolveKinopoiskImdbId(
    normalizedOrder.kinopoiskId,
    normalizedOrder.imdbId
  );

  try {
    const token = localStorage.getItem("adminToken") || "";
    const response = await fetch("/api/admin?action=media-items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "create_item",
        table: "Movie_Orders",
        changes: {
        order_title: normalizedOrder.title,
        order_origin_title: normalizedOrder.originalTitle,
        order_year: normalizedOrder.year,
        order_genres: normalizedOrder.genres,
        order_poster: normalizedOrder.poster,
        order_by: normalizedOrder.orderBy,
        order_type: normalizedOrder.orderType,
        kinopoisk_rate: normalizedOrder.kpRating,
        kp_id: normalizedOrder.kinopoiskId,
        imdb_id: normalizedOrder.imdbId,
        order_length: normalizedOrder.length,
        description: normalizedOrder.description,
        country: normalizedOrder.country,
        actors: normalizeActorsForStorage(normalizedOrder.actors),
        director: normalizedOrder.director,
        watch_source: normalizedOrder.watchSource,
        },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || `Movie order create failed: ${response.status}`);
    }
    const data = payload?.row;
    if (!data) throw new Error("Movie order create returned no row");

    const newOrder = mapInsertedMovieOrder(data, normalizedOrder);
    watchlist.push(newOrder);
    renderWatchlist();

    if (typeof prefetchOrderParentGuideForOrder === "function") {
      prefetchOrderParentGuideForOrder(newOrder);
    }

    if (typeof recordUserOrder === "function") {
      await recordUserOrder({
        userName: normalizedOrder.orderBy,
        type: "movies",
      });
    }

    return { ok: true, order: newOrder };
  } catch (err) {
    console.error("Error adding order", err);
    return { ok: false, reason: "error", error: err };
  }
}

document
  .getElementById("addMovieForm")
  .addEventListener("submit", async function (e) {
    e.preventDefault();

    const submitBtn = this.querySelector('button[type="submit"]');
    if (isSubmittingMovieAdd) return;

    const rating = getRatingValue("ratingInput");
    const watchSource = normalizeWatchSource(
      document.getElementById("movieWatchSource")?.value
    );
    if (!isRatingValid(rating)) {
      alert("Неверная оценка");
      document.getElementById("ratingInput").reportValidity();
      return;
    }

    const rouletteOrderByValue =
      rouletteAutofillActive && rouletteOrderByInput
        ? rouletteOrderByInput.value.trim()
        : "";
    if (rouletteAutofillActive && rouletteOrderByInput) {
      const hasOrderBy = rouletteOrderByInput.value.trim().length > 0;
      if (!hasOrderBy) {
        rouletteOrderByInput.reportValidity();
        const modalContent = rouletteOrderByInput.closest(".modal-content");
        if (modalContent && typeof modalContent.scrollTo === "function") {
          modalContent.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
        rouletteOrderByInput.focus();
        return;
      }
    }

    let movieData;

    if (currentMode === "auto") {
      const title = document.getElementById("autoTitle").value;
      if (!title) {
        alert("Введите название фильма");
        return;
      }

      if (!selectedKPMovie) {
        showSearchReminderModal();
        return;
      }

      if (selectedKPMovie) {
        const sel = selectedKPMovie;
        const staff = sel.filmId ? await fetchKPFilmStaff(sel.filmId) : null;
        movieData = {
          title: sel.nameRu || sel.nameEn || "",
          originalTitle: sel.nameEn || "",
          year: sel.year || new Date().getFullYear(),
          rating: rating,
          kpRating: sel.rating || "-",
          kinopoiskId: extractKinopoiskIdFromValue(sel.filmId),
          imdbId: sel.imdbId || null,
          poster:
            sel.posterUrlPreview ||
            sel.posterUrl ||
            "https://via.placeholder.com/300x400?text=Нет+постера",
          dateAdded: new Date().toISOString().split("T")[0],
          genre: sel.genres?.map((g) => g.genre).join(", ") || "",
          description: sel.description || "",
          country: sel.countries?.map((c) => c.country).join(", ") || "",
          actors: staff?.actors || [],
          director: (staff?.directors || []).join(", "),
          orderBy: "",
          orderType: "",
          watchSource,
        };
      } else {
        movieData = {
          title: title,
          year: new Date().getFullYear(),
          rating: rating,
          kpRating: "-",
          kinopoiskId: null,
          imdbId: null,
          poster: "https://via.placeholder.com/300x400?text=Постер",
          dateAdded: new Date().toISOString().split("T")[0],
          genre: "Неизвестно",
          description: "",
          country: "",
          actors: [],
          director: "",
          orderBy: "",
          orderType: "",
          watchSource,
        };
      }
    } else {
      const fileInput = document.getElementById("manualPoster");
      let poster = "https://via.placeholder.com/300x400?text=Нет+постера";
      if (fileInput.files && fileInput.files[0]) {
        try {
          poster = await readFileAsDataURL(fileInput.files[0]);
        } catch (err) {
          console.error("Error reading file", err);
        }
      }
      movieData = {
        title: document.getElementById("manualTitle").value,
        originalTitle: document.getElementById("manuaOriginTitle").value,
        year:
          parseInt(document.getElementById("manualYear").value) ||
          new Date().getFullYear(),
        rating: rating,
        kpRating: "-",
        kinopoiskId: null,
        imdbId: null,
        poster: poster,
        dateAdded: new Date().toISOString().split("T")[0],
        genre: document.getElementById("manualGenre").value || "Неизвестно",
        description: "",
        country: "",
        actors: [],
        director: "",
        orderBy: "",
        orderType: "",
        watchSource,
      };
    }

    if (rouletteAutofillActive && rouletteOrderByValue) {
      movieData.orderBy = rouletteOrderByValue;
      movieData.orderType = ROULETTE_ORDER_TYPE;
    }

    const duplicate =
      allMovies.some(
        (m) =>
          m.title.trim().toLowerCase() ===
            movieData.title.trim().toLowerCase() &&
          Number(m.year) === Number(movieData.year)
      ) ||
      watchlist.some(
        (o) =>
          o.title.trim().toLowerCase() ===
            movieData.title.trim().toLowerCase() &&
          Number(o.year) === Number(movieData.year)
      );
    if (duplicate) {
      showDuplicateModal();
      return;
    }

    movieData.imdbId = await resolveKinopoiskImdbId(
      movieData.kinopoiskId,
      movieData.imdbId
    );

    isSubmittingMovieAdd = true;
    toggleSubmitLoading(submitBtn, true, "Добавляем фильм...");

    const shouldClearRouletteWinner =
      Boolean(rouletteLastWinner) &&
      (!rouletteAutofillActive ||
        movieData.title.trim() !== rouletteLastWinner ||
        (movieData.year && String(movieData.year).trim().length > 0 &&
          String(movieData.year).trim() !== String(new Date().getFullYear())) ||
        (selectedKPMovie &&
          (selectedKPMovie.nameRu || selectedKPMovie.nameEn || "").trim() !==
            rouletteLastWinner));

    try {
      const token = localStorage.getItem("adminToken") || "";
      const response = await fetch("/api/admin?action=media-items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "create_item",
          table: "movies",
          changes: {
          title: movieData.title,
          original_title: movieData.originalTitle || "",
          genres: movieData.genre,
          poster: movieData.poster,
          year: movieData.year,
          rating_numeric: movieData.rating,
          rating_OMDB: movieData.kpRating,
          kp_id: movieData.kinopoiskId,
          imdb_id: movieData.imdbId,
          date: movieData.dateAdded,
          order_by: movieData.orderBy || null,
          order_type: movieData.orderType || null,
          rating_sum: 0,
          rating_count: 0,
          description: movieData.description,
          country: movieData.country,
          actors: normalizeActorsForStorage(movieData.actors),
          director: movieData.director,
          watch_source: movieData.watchSource,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `Movie create failed: ${response.status}`);
      }
      const data = payload?.row;
      if (!data) throw new Error("Movie create returned no row");

      allMovies.unshift({
        id: data.id,
        title: data.title,
        originalTitle: data.original_title,
        genre: data.genres,
        poster: data.poster,
        year: data.year,
        rating: data.rating_numeric,
        kpRating: data.rating_OMDB,
        kinopoiskId: data.kp_id || null,
        imdbId: data.imdb_id || null,
        dateAdded: data.date,
        orderBy: data.order_by && data.order_by !== "null" ? data.order_by : "",
        orderType: data.order_type,
        ratingSum: Number(data.rating_sum ?? 0) || 0,
        ratingCount: Number(data.rating_count ?? 0) || 0,
        userRating: null,
        description: movieData.description,
        country: movieData.country,
        actors: movieData.actors,
        director: movieData.director,
        watchSource: normalizeWatchSource(data.watch_source || movieData.watchSource),
      });
      localStorage.setItem("moviesCache", JSON.stringify(allMovies));

      if (shouldClearRouletteWinner) {
        await clearRouletteLastWinner({ updateInput: false });
      }
    } catch (err) {
      console.error("Error adding movie to Supabase", err);
    } finally {
      isSubmittingMovieAdd = false;
      toggleSubmitLoading(submitBtn, false);
    }

    currentPage = 1;
    renderMovies();
    closeModal("addMovieModal", true);
  });

document
  .getElementById("addWatchlistForm")
  .addEventListener("submit", async function (e) {
    e.preventDefault();

    const submitBtn = this.querySelector('button[type="submit"]');
    if (isSubmittingWatchlistOrder) return;

    const orderBy = document.getElementById("watchOrderBy").value;
    const orderType = document.getElementById("watchOrderType").value;
    const watchSource = normalizeWatchSource(
      document.getElementById("watchSource")?.value
    );

    let orderData;
    let filmLength = null;

    const titleInput =
      currentWatchlistMode === "auto"
        ? document.getElementById("watchAutoTitle").value
        : "";

    if (currentWatchlistMode === "auto") {
      if (!titleInput) {
        alert("Введите название фильма");
        return;
      }

      if (!selectedKPOrderMovie) {
        showSearchReminderModal();
        return;
      }
    }

    isSubmittingWatchlistOrder = true;
    toggleSubmitLoading(submitBtn, true, "Добавляем заказ...");

    try {
    if (currentWatchlistMode === "auto") {
      if (selectedKPOrderMovie) {
        const sel = selectedKPOrderMovie;
        if (sel.filmLength === undefined && sel.filmId) {
          sel.filmLength = await fetchKPFilmLength(sel.filmId);
        }
        filmLength = sel.filmLength || null;
        const staff = sel.filmId ? await fetchKPFilmStaff(sel.filmId) : null;
        orderData = {
          title: sel.nameRu || sel.nameEn || "",
          originalTitle: sel.nameEn || "",
          year: sel.year || "",
          kinopoiskId: extractKinopoiskIdFromValue(sel.filmId),
          imdbId: sel.imdbId || null,
          kpRating: sel.rating || "-",
          poster:
            sel.posterUrlPreview ||
            sel.posterUrl ||
            "https://via.placeholder.com/300x400?text=Нет+постера",
          genres: sel.genres?.map((g) => g.genre).join(", ") || "",
          description: sel.description || "",
          country: sel.countries?.map((c) => c.country).join(", ") || "",
          actors: staff?.actors || [],
          director: (staff?.directors || []).join(", "),
          orderBy: orderBy,
          orderType: orderType,
          watchSource,
          length: filmLength,
        };
      } else {
        orderData = {
          title: titleInput,
          originalTitle: "",
          year: "",
          kinopoiskId: null,
          imdbId: null,
          kpRating: "-",
          poster: "https://via.placeholder.com/300x400?text=Нет+постера",
          genres: "",
          description: "",
          country: "",
          actors: [],
          director: "",
          orderBy: orderBy,
          orderType: orderType,
          watchSource,
          length: filmLength,
        };
      }
    } else {
      const fileInput = document.getElementById("watchManualPoster");
      let poster = "https://via.placeholder.com/300x400?text=Нет+постера";
      if (fileInput.files && fileInput.files[0]) {
        try {
          poster = await readFileAsDataURL(fileInput.files[0]);
        } catch (err) {
          console.error("Error reading file", err);
        }
      }
      orderData = {
        title: document.getElementById("watchManualTitle").value,
        originalTitle: document.getElementById("watchManualOriginTitle").value,
        year: document.getElementById("watchManualYear").value || "",
        kinopoiskId: extractKinopoiskIdFromValue(
          document.getElementById("watchManualTitle").value
        ),
        imdbId: null,
        kpRating: "-",
        poster: poster,
        genres: document.getElementById("watchManualGenre").value || "",
        description: "",
        country: "",
        actors: [],
        director: "",
        orderBy: orderBy,
        orderType: orderType,
        watchSource,
        length: filmLength,
      };
    }

    const saveResult = await saveMovieOrder(orderData);

    if (saveResult?.ok) {
      closeModal("addWatchlistModal", true);
      this.reset();
      selectedKPOrderMovie = null;
      kpOrderResults = [];
      showWatchlistKPPreview();
    }
    } finally {
      isSubmittingWatchlistOrder = false;
      toggleSubmitLoading(submitBtn, false);
    }
  });

document
  .getElementById("addGameForm")
  ?.addEventListener("submit", async function (e) {
    e.preventDefault();

    const submitBtn = this.querySelector('button[type="submit"]');
    if (isSubmittingGameOrder) return;

    const orderType = document.getElementById("gameOrderType").value;
    const orderBy = document.getElementById("gameOrderBy").value;
    const gameMode = getSelectedGameMode(
      currentGameMode,
      "gameAutoModeSelect",
      "gameManualModeSelect"
    );

    let gameData;
    let posterFile = null;

    const titleInput =
      currentGameMode === "auto"
        ? document.getElementById("gameAutoTitle").value
        : "";

    if (currentGameMode === "auto") {
      if (!titleInput) {
        alert("Введите название игры");
        return;
      }
    }

    isSubmittingGameOrder = true;
    toggleSubmitLoading(submitBtn, true, "Добавляем игру...");

    try {
    if (currentGameMode === "auto") {
      if (selectedRAWGGame) {
        const g = selectedRAWGGame;
        const rawgPosterUrl = g.background_image || "";
        const optimizedSteamPoster = steamGridPoster
          ? await readRemoteImageAsOptimizedDataURL(steamGridPoster)
          : null;
        const optimizedRawgPoster = !steamGridPoster && rawgPosterUrl
          ? await ensureRawgOptimizedPoster(rawgPosterUrl)
          : null;

        // Fetch full game details for description and extra info
        let fullGameDetails = null;
        if (g.id) {
            try {
                const detailsRes = await fetch(`https://api.rawg.io/api/games/${g.id}?key=${RAWG_API_KEY}`);
                 if (detailsRes.ok) {
                     fullGameDetails = await detailsRes.json();
                 }
            } catch (err) {
                console.error("Error fetching full game details", err);
            }
        }

        gameData = {
          title: g.name || titleInput,
          year: g.released ? g.released.split("-")[0] : "",
          genres: g.genres?.map((x) => x.name).join(", ") || "",
          poster:
            optimizedSteamPoster ||
            steamGridPoster ||
            optimizedRawgPoster ||
            rawgPosterUrl ||
            "https://via.placeholder.com/300x400?text=Нет+постера",
          orderBy: orderBy,
          orderType: orderType,
          gameMode: gameMode,
          // New fields
          description: fullGameDetails?.description_raw || fullGameDetails?.description || "",
          rating: fullGameDetails?.rating || g.rating || null,
          metacritic: fullGameDetails?.metacritic || g.metacritic || null,
          released: fullGameDetails?.released || g.released || null,
          playtime: fullGameDetails?.playtime || g.playtime || null,
          platforms: fullGameDetails?.platforms?.map(p => p.platform.name).join(", ") || g.platforms?.map(p => p.platform.name).join(", ") || "",
          developers: fullGameDetails?.developers?.map(d => d.name).join(", ") || "",
          publishers: fullGameDetails?.publishers?.map(p => p.name).join(", ") || "",
          rawgId: g.id || null
        };
      } else {
        gameData = {
          title: titleInput,
          year: "",
          genres: "",
          poster: "https://via.placeholder.com/300x400?text=Нет+постера",
          orderBy: orderBy,
          orderType: orderType,
          gameMode: gameMode,
          description: "",
          rating: null,
          metacritic: null,
          released: null,
          playtime: null,
          platforms: "",
          developers: "",
          publishers: "",
          rawgId: null
        };
      }
    } else {
      const fileInput = document.getElementById("gamePoster");
      posterFile = fileInput.files?.[0] || null;
      let poster = "https://via.placeholder.com/300x400?text=Нет+постера";
      if (posterFile) {
        try {
          poster = await readFileAsDataURL(posterFile);
        } catch (err) {
          console.error("Error reading file", err);
        }
      }

      gameData = {
        title: document.getElementById("gameTitle").value,
        year: document.getElementById("gameYear").value || "",
        genres: document.getElementById("gameGenres").value || "",
        poster: poster,
        orderBy: orderBy,
        orderType: orderType,
        gameMode: gameMode,
        description: "",
        rating: null,
        metacritic: null,
        released: null,
        playtime: null,
        platforms: "",
        developers: "",
        publishers: "",
        rawgId: null
      };
    }

    try {
      gameData.poster = await uploadGamePosterToStorage({
        poster: gameData.poster,
        file: posterFile,
        title: gameData.title,
        folder: "orders",
      });

      const descriptionValue =
        gameData.description && String(gameData.description).trim()
          ? { original: gameData.description, translated: null }
          : null;

      const token = localStorage.getItem("adminToken") || "";
      const response = await fetch("/api/admin?action=media-items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "create_item",
          table: "Game_Orders",
          changes: {
          game_title: gameData.title,
          game_year: gameData.year,
          game_genres: gameData.genres,
          game_poster: gameData.poster,
          game_order_by: gameData.orderBy,
          game_order_type: gameData.orderType,
          game_mode: gameData.gameMode || null,
          description: descriptionValue,
          rawg_rating: gameData.rating,
          metacritic: gameData.metacritic,
          released: gameData.released,
          playtime: gameData.playtime,
          platforms: gameData.platforms,
          developers: gameData.developers,
          publishers: gameData.publishers,
          rawg_id: gameData.rawgId
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `Game order create failed: ${response.status}`);
      }
      const data = payload?.row;
      if (!data) throw new Error("Game order create returned no row");

      const newGameOrder = {
        id: data.id,
        title: data.game_title,
        genres: data.game_genres,
        poster: data.game_poster,
        year: data.game_year || "",
        planDate: data.game_plan_date || null,
        orderBy: data.game_order_by,
        orderType: data.game_order_type,
        gameMode: normalizeGameMode(data.game_mode),
        dateAdded: data.created_at,
        description: data.description || "",
        rating: data.rawg_rating || null,
        metacritic: data.metacritic || null,
        released: data.released || null,
        playtime: data.playtime || null,
        platforms: data.platforms || "",
        developers: data.developers || "",
        publishers: data.publishers || "",
        rawgId: data.rawg_id || null
      };
      gameOrders.push(newGameOrder);
      renderGames();

      if (typeof prefetchOrderGameDescriptionForOrder === "function" && descriptionValue) {
        prefetchOrderGameDescriptionForOrder(newGameOrder);
      }

      if (typeof recordUserOrder === "function") {
        await recordUserOrder({ userName: gameData.orderBy, type: "games" });
      }
    } catch (err) {
      console.error("Error adding game", err);
    }

    closeModal("addGameModal", true);
    this.reset();
    selectedRAWGGame = null;
    steamGridPoster = null;
    steamGridPosters = [];
    resetRawgPosterCache();
    rawgResults = [];
    showRAWGPreview();
    } finally {
      isSubmittingGameOrder = false;
      toggleSubmitLoading(submitBtn, false);
    }
  });

document
  .getElementById("addPlayedGameForm")
  ?.addEventListener("submit", async function (e) {
    e.preventDefault();

    const orderBy = document.getElementById("playedGameOrderBy").value;
    const orderType = document.getElementById("playedGameOrderType").value;
    const rating = getRatingValue("playedGameRatingInput");
    if (!isRatingValid(rating)) {
      alert("Неверная оценка");
      document.getElementById("playedGameRatingInput").reportValidity();
      return;
    }

    let gameData;
    let posterFile = null;
    const gameMode = getSelectedGameMode(
      currentPlayedGameMode,
      "playedGameAutoModeSelect",
      "playedGameManualModeSelect"
    );

    if (currentPlayedGameMode === "auto") {
      const titleInput = document.getElementById("playedGameAutoTitle").value;
      if (!titleInput) {
        alert("Введите название игры");
        return;
      }

      if (!selectedRAWGGame) {
        showSearchReminderModal();
        return;
      }

      const g = selectedRAWGGame;
      const rawgPosterUrl = g.background_image || "";
      const optimizedSteamPoster = steamGridPoster
        ? await readRemoteImageAsOptimizedDataURL(steamGridPoster)
        : null;
      const optimizedRawgPoster = !steamGridPoster && rawgPosterUrl
        ? await ensureRawgOptimizedPoster(rawgPosterUrl)
        : null;
      gameData = {
        title: g.name || titleInput,
        year: g.released ? g.released.split("-")[0] : "",
        genres: g.genres?.map((x) => x.name).join(", ") || "",
        poster:
          optimizedSteamPoster ||
          steamGridPoster ||
          optimizedRawgPoster ||
          rawgPosterUrl ||
          "https://via.placeholder.com/300x400?text=Нет+постера",
        rating: rating,
        orderBy: orderBy,
        orderType: orderType,
        gameMode: gameMode,
        rawgId: g.id || null,
      };
    } else {
      const fileInput = document.getElementById("playedGamePoster");
      posterFile = fileInput.files?.[0] || null;
      let poster = "https://via.placeholder.com/300x400?text=Нет+постера";
      if (posterFile) {
        try {
          poster = await readFileAsDataURL(posterFile);
        } catch (err) {
          console.error("Error reading file", err);
        }
      }

      gameData = {
        title: document.getElementById("playedGameTitle").value,
        year: document.getElementById("playedGameYear").value || "",
        genres: document.getElementById("playedGameGenres").value || "",
        poster: poster,
        rating: rating,
        orderBy: orderBy,
        orderType: orderType,
        gameMode: gameMode,
      };
    }

    const duplicate = allPlayedGames.some(
      (g) =>
        g.title.trim().toLowerCase() === gameData.title.trim().toLowerCase()
    );
    if (duplicate) {
      showDuplicateModal();
      return;
    }

    try {
      gameData.poster = await uploadGamePosterToStorage({
        poster: gameData.poster,
        file: posterFile,
        title: gameData.title,
        folder: "played",
      });

      const token = localStorage.getItem("adminToken") || "";
      const response = await fetch("/api/admin?action=media-items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "create_item",
          table: "games",
          changes: {
          title: gameData.title,
          genres: gameData.genres,
          poster: gameData.poster,
          year: gameData.year,
          rating_numeric: gameData.rating,
          date: new Date().toISOString().split("T")[0],
          order_by: gameData.orderBy,
          order_type: gameData.orderType,
          game_mode: gameData.gameMode || null,
          game_rating_sum: 0,
          game_rating_count: 0,
          rawg_id: gameData.rawgId ?? null,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `Played game create failed: ${response.status}`);
      }
      const data = payload?.row;
      if (!data) throw new Error("Played game create returned no row");

      allPlayedGames.unshift({
        id: data.id,
        title: data.title,
        genres: data.genres,
        poster: data.poster,
        year: data.year,
        rating: data.rating_numeric,
        dateAdded: data.date,
        orderBy: data.order_by && data.order_by !== "null" ? data.order_by : "",
        orderType: data.order_type,
        gameMode: normalizeGameMode(data.game_mode),
        rawgId: data.rawg_id ?? null,
        ratingSum: Number(data.game_rating_sum ?? 0) || 0,
        ratingCount: Number(data.game_rating_count ?? 0) || 0,
        userRating: null,
      });
      localStorage.setItem("gamesCache", JSON.stringify(allPlayedGames));
    } catch (err) {
      console.error("Error adding game", err);
    }

    gamePage = 1;
    renderPlayedGames();
    closeModal("addPlayedGameModal", true);
    this.reset();
    selectedRAWGGame = null;
    steamGridPoster = null;
    steamGridPosters = [];
    resetRawgPosterCache();
    rawgResults = [];
    showPlayedGamePreview();
  });

// Оценка фильма из watchlist
async function submitRating() {
  if (isSubmittingRating) return;
  const rating = getRatingValue("rateMovieInput");
  if (!isRatingValid(rating)) {
    alert("Неверная оценка");
    document.getElementById("rateMovieInput").reportValidity();
    return;
  }

  // Находим фильм в watchlist по id
  const itemIndex = watchlist.findIndex((item) => item.id === ratingMovieId);
  if (itemIndex !== -1) {
    const source = watchlist[itemIndex];
    const watchedMovie = {
      title: source.title,
      originalTitle: source.originalTitle || "",
      year: source.year,
      rating: rating,
      kpRating: source.kpRating,
      kinopoiskId: source.kinopoiskId || null,
      imdbId: source.imdbId || null,
      poster:
        source.poster || "https://via.placeholder.com/300x400?text=Нет+постера",
      dateAdded: new Date().toISOString().split("T")[0],
      genre: source.genres || "",
      description: source.description || "",
      country: source.country || "",
      actors: source.actors || [],
      director: source.director || "",
      orderBy: source.orderBy || "",
      orderType: source.orderType || "",
      watchSource: normalizeWatchSource(source.watchSource),
      studios: source.studios || null,
    };
    const duplicateWatchedMovie = allMovies.some(
      (m) =>
        m.title.trim().toLowerCase() ===
          watchedMovie.title.trim().toLowerCase() &&
        Number(m.year) === Number(watchedMovie.year)
    );
    if (duplicateWatchedMovie) {
      showDuplicateModal(
        "Такой фильм уже есть в списке просмотренных. Можно удалить его из заказанных.",
        {
          actionLabel: "Удалить",
          onAction: async () => {
            closeModal("duplicateModal");
            closeModal("rateMovieModal", true);
            await performDeleteOrder(source.id);
          },
        }
      );
      return;
    }
    const confirmBtn = document.querySelector("#rateMovieModal .btn-primary");
    isSubmittingRating = true;
    if (confirmBtn) confirmBtn.disabled = true;
    try {
      watchedMovie.imdbId = await resolveKinopoiskImdbId(
        watchedMovie.kinopoiskId,
        watchedMovie.imdbId
      );
      const token = localStorage.getItem("adminToken") || "";
      const response = await fetch("/api/admin?action=media-items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "promote_movie_order",
          orderId: ratingMovieId,
          movie: {
          title: watchedMovie.title,
          original_title: watchedMovie.originalTitle,
          genres: watchedMovie.genre,
          poster: watchedMovie.poster,
          year: watchedMovie.year,
          rating_numeric: watchedMovie.rating,
          rating_OMDB: watchedMovie.kpRating,
          kp_id: watchedMovie.kinopoiskId,
          imdb_id: watchedMovie.imdbId,
          date: watchedMovie.dateAdded,
          order_by: watchedMovie.orderBy,
          order_type: watchedMovie.orderType,
          description: watchedMovie.description,
          country: watchedMovie.country,
          actors: normalizeActorsForStorage(watchedMovie.actors),
          director: watchedMovie.director,
          studios: watchedMovie.studios,
          watch_source: watchedMovie.watchSource,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `Movie promotion failed: ${response.status}`);
      }
      const data = payload?.row;
      const pendingRatingSum = Number(payload?.pendingRatingSum ?? 0) || 0;
      const pendingRatingCount = Number(payload?.pendingRatingCount ?? 0) || 0;
      if (!data) throw new Error("Movie promotion returned no row");

      const newMovie = {
        id: data.id,
        title: data.title,
        originalTitle: data.original_title,
        genre: data.genres,
        poster: data.poster,
        year: data.year,
        rating: data.rating_numeric,
        kpRating: data.rating_OMDB,
        kinopoiskId: data.kp_id || watchedMovie.kinopoiskId,
        imdbId: data.imdb_id || watchedMovie.imdbId || null,
        ratingSum: Number(data.rating_sum ?? pendingRatingSum) || 0,
        ratingCount: Number(data.rating_count ?? pendingRatingCount) || 0,
        dateAdded: data.date,
        orderBy: data.order_by && data.order_by !== "null" ? data.order_by : "",
        orderType: data.order_type,
        userRating:
          pendingRatingCount > 0
            ? Math.round((pendingRatingSum / pendingRatingCount) * 10) / 10
            : null,
        description: watchedMovie.description,
        country: watchedMovie.country,
        actors: watchedMovie.actors,
        director: watchedMovie.director,
        studios: data.studios ?? watchedMovie.studios,
        watchSource: normalizeWatchSource(data.watch_source || watchedMovie.watchSource),
      };

      allMovies.unshift(newMovie);
      localStorage.setItem("moviesCache", JSON.stringify(allMovies));
      watchlist.splice(itemIndex, 1);
      currentPage = 1;
      renderMovies();
      renderWatchlist();
      closeModal("rateMovieModal", true);
    } catch (err) {
      console.error("Error adding rated movie to Supabase", err);
      alert(
        "Не удалось переместить фильм в список просмотренных. Попробуйте ещё раз."
      );
    } finally {
      isSubmittingRating = false;
      if (confirmBtn) confirmBtn.disabled = false;
    }
  }
}

async function submitGameRating() {
  const rating = getRatingValue("rateGameInput");
  if (!isRatingValid(rating)) {
    alert("Неверная оценка");
    document.getElementById("rateGameInput").reportValidity();
    return;
  }
  const idx = gameOrders.findIndex((g) => g.id === ratingGameId);
  if (idx !== -1) {
    const source = gameOrders[idx];
    const descriptionValue = (() => {
      if (!source?.description) return null;
      if (typeof source.description === "object") return source.description;
      if (typeof source.description === "string") {
        const trimmed = source.description.trim();
        return trimmed ? { original: trimmed, translated: null } : null;
      }
      return null;
    })();
    const played = {
      title: source.title,
      year: source.year,
      rating: rating,
      genres: source.genres || "",
      poster:
        source.poster || "https://via.placeholder.com/300x400?text=Нет+постера",
      dateAdded: new Date().toISOString().split("T")[0],
      orderBy: source.orderBy || "",
      orderType: source.orderType || "",
      gameMode: normalizeGameMode(source.gameMode),
      description: descriptionValue,
      rawgRating: source.rating ?? null,
      metacritic: source.metacritic ?? null,
      released: source.released ?? null,
      playtime: source.playtime ?? null,
      platforms: source.platforms ?? "",
      developers: source.developers ?? "",
      publishers: source.publishers ?? "",
      rawgId: source.rawgId ?? null,
    };
    try {
      const token = localStorage.getItem("adminToken") || "";
      const response = await fetch("/api/admin?action=media-items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "promote_game_order",
          orderId: ratingGameId,
          game: {
          title: played.title,
          genres: played.genres,
          poster: played.poster,
          year: played.year,
          rating_numeric: played.rating,
          date: played.dateAdded,
          order_by: played.orderBy,
          order_type: played.orderType,
          game_mode: played.gameMode || null,
          game_rating_sum: 0,
          game_rating_count: 0,
          description: played.description,
          rawg_rating: played.rawgRating,
          metacritic: played.metacritic,
          released: played.released,
          playtime: played.playtime,
          platforms: played.platforms,
          developers: played.developers,
          publishers: played.publishers,
          rawg_id: played.rawgId,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `Game promotion failed: ${response.status}`);
      }
      const data = payload?.row;
      if (!data) throw new Error("Game promotion returned no row");

      const newGame = {
        id: data.id,
        title: data.title,
        genres: data.genres,
        poster: data.poster,
        year: data.year,
        rating: data.rating_numeric,
        dateAdded: data.date,
        orderBy: data.order_by && data.order_by !== "null" ? data.order_by : "",
        orderType: data.order_type,
        gameMode: normalizeGameMode(data.game_mode),
        description: data.description ?? played.description ?? "",
        rawgRating: data.rawg_rating ?? played.rawgRating ?? null,
        metacritic: data.metacritic ?? played.metacritic ?? null,
        released: data.released ?? played.released ?? null,
        playtime: data.playtime ?? played.playtime ?? null,
        platforms: data.platforms ?? played.platforms ?? "",
        developers: data.developers ?? played.developers ?? "",
        publishers: data.publishers ?? played.publishers ?? "",
        rawgId: data.rawg_id ?? played.rawgId ?? null,
        ratingSum: Number(data.game_rating_sum ?? 0) || 0,
        ratingCount: Number(data.game_rating_count ?? 0) || 0,
        userRating: null,
      };

      allPlayedGames.unshift(newGame);
      localStorage.setItem("gamesCache", JSON.stringify(allPlayedGames));
      gameOrders.splice(idx, 1);
      renderPlayedGames();
      renderGames();
      closeModal("rateGameModal", true);
    } catch (err) {
      console.error("Error adding rated game", err);
      alert(
        "Не удалось переместить игру в список пройденных. Попробуйте ещё раз."
      );
    }
  }
}

async function submitUserMovieRating() {
  if (isSubmittingUserRating) return;
  isSubmittingUserRating = true;

  const rating = getRatingValue("userRateInput");
  if (!isRatingValid(rating)) {
    alert("Неверная оценка");
    document.getElementById("userRateInput").reportValidity();
    isSubmittingUserRating = false;
    return;
  }

  if (!userRatingMovieId) {
    isSubmittingUserRating = false;
    return;
  }

  const movie = allMovies.find((m) => m.id === userRatingMovieId);

  if (hasRatedMovie(movie || userRatingMovieId)) {
    alert("Вы уже оценили этот фильм");
    closeModal("userRateModal", true);
    isSubmittingUserRating = false;
    return;
  }

  try {
    const response = await fetch("/api/movie-ratings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target_id: userRatingMovieId,
        target_type: "movie",
        rating,
        user_id: getGuestId(),
        title: movie ? movie.title : null,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || ("Failed to submit rating: " + response.status));
    }

    if (movie && payload?.movie) {
      const ratingSum = Number(payload.movie.rating_sum ?? 0) || 0;
      const ratingCount = Number(payload.movie.rating_count ?? 0) || 0;
      movie.ratingSum = ratingSum;
      movie.ratingCount = ratingCount;
      movie.userRating =
        ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : null;
      localStorage.setItem("moviesCache", JSON.stringify(allMovies));
    }

    rememberRatedMovie(movie || userRatingMovieId, rating);
    renderMovies();
  } catch (err) {
    console.error("Error submitting user rating", err);
    alert(
      err?.message ||
        "Не удалось сохранить оценку"
    );
  } finally {
    isSubmittingUserRating = false;
  }

  closeModal("userRateModal", true);
  userRatingMovieId = null;
}

async function submitUserGameRating() {
  const rating = getRatingValue("userRateGameInput");
  if (!isRatingValid(rating)) {
    alert("Неверная оценка");
    const input = document.getElementById("userRateGameInput");
    if (input) input.reportValidity();
    return;
  }
  if (!userRatingGameId) return;
  if (hasRatedGame(userRatingGameId)) {
    alert("Вы уже оценили эту игру");
    closeModal("userRateGameModal", true);
    userRatingGameId = null;
    return;
  }
  const game = allPlayedGames.find((g) => g.id === userRatingGameId);
  const currentSum = game ? Number(game.ratingSum ?? 0) || 0 : 0;
  const currentCount = game ? Number(game.ratingCount ?? 0) || 0 : 0;
  const newSum = currentSum + rating;
  const newCount = currentCount + 1;
  try {
    const response = await fetch("/api/movie-ratings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target_id: userRatingGameId,
        target_type: "game",
        rating,
        user_id: getGuestId(),
        title: game ? game.title : null,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || ("Failed to submit rating: " + response.status));
    }
    const newSum = Number(payload?.game?.game_rating_sum ?? currentSum) || 0;
    const newCount = Number(payload?.game?.game_rating_count ?? currentCount) || 0;
    if (game) {
      game.ratingSum = newSum;
      game.ratingCount = newCount;
      game.userRating = Math.round((newSum / newCount) * 10) / 10;
    }
    localStorage.setItem("gamesCache", JSON.stringify(allPlayedGames));
    ratedGames[userRatingGameId] = rating;
    localStorage.setItem("ratedGames", JSON.stringify(ratedGames));
    renderPlayedGames();
  } catch (err) {
    console.error("Error submitting user game rating", err);
  }
  closeModal("userRateGameModal", true);
  userRatingGameId = null;
}

// Редактирование фильма
function setUserRateStatus(elementId, message, isError = false) {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = message || "";
  element.style.color = isError ? "#ffbcbc" : "";
}

function setUserRateSubmitState(buttonId, isBusy) {
  const button = document.getElementById(buttonId);
  if (!button) return;
  button.disabled = Boolean(isBusy);
  if (isBusy) {
    button.setAttribute("aria-busy", "true");
  } else {
    button.removeAttribute("aria-busy");
  }
}

async function submitUserMovieRating() {
  if (isSubmittingUserRating) return;

  const input = document.getElementById("userRateInput");
  const rating = getRatingValue("userRateInput");
  if (!isRatingValid(rating)) {
    setUserRateStatus("userRateStatus", "Введите корректную оценку от 0 до 11.", true);
    input?.reportValidity();
    return;
  }

  if (!userRatingMovieId) {
    return;
  }

  const movie = allMovies.find((m) => m.id === userRatingMovieId);

  isSubmittingUserRating = true;
  setUserRateSubmitState("userRateSubmitButton", true);
  setUserRateStatus("userRateStatus", "Сохраняем оценку...");

  try {
    const response = await fetch("/api/movie-ratings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target_id: userRatingMovieId,
        target_type: "movie",
        rating,
        user_id: getGuestId(),
        title: movie ? movie.title : null,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || ("Failed to submit rating: " + response.status));
    }

    if (movie && payload?.movie) {
      const ratingSum = Number(payload.movie.rating_sum ?? 0) || 0;
      const ratingCount = Number(payload.movie.rating_count ?? 0) || 0;
      movie.ratingSum = ratingSum;
      movie.ratingCount = ratingCount;
      movie.userRating =
        ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : null;
      localStorage.setItem("moviesCache", JSON.stringify(allMovies));
    }

    rememberRatedMovie(movie || userRatingMovieId, rating);
    renderMovies();
    closeModal("userRateModal", true);
    userRatingMovieId = null;
  } catch (err) {
    console.error("Error submitting user rating", err);
    setUserRateStatus(
      "userRateStatus",
      err?.message || "Не удалось сохранить оценку",
      true
    );
  } finally {
    isSubmittingUserRating = false;
    setUserRateSubmitState("userRateSubmitButton", false);
  }
}

async function submitUserGameRating() {
  if (isSubmittingUserRating) return;

  const input = document.getElementById("userRateGameInput");
  const rating = getRatingValue("userRateGameInput");
  if (!isRatingValid(rating)) {
    setUserRateStatus("userRateGameStatus", "Введите корректную оценку от 0 до 11.", true);
    input?.reportValidity();
    return;
  }
  if (!userRatingGameId) return;

  const game = allPlayedGames.find((g) => g.id === userRatingGameId);
  const previousRating = Object.prototype.hasOwnProperty.call(ratedGames, String(userRatingGameId))
    ? Number(ratedGames[String(userRatingGameId)])
    : null;
  const currentSum = game ? Number(game.ratingSum ?? 0) || 0 : 0;
  const currentCount = game ? Number(game.ratingCount ?? 0) || 0 : 0;

  isSubmittingUserRating = true;
  setUserRateSubmitState("userRateGameSubmitButton", true);
  setUserRateStatus("userRateGameStatus", "Сохраняем оценку...");

  try {
    const response = await fetch("/api/movie-ratings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target_id: userRatingGameId,
        target_type: "game",
        rating,
        user_id: getGuestId(),
        title: game ? game.title : null,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || ("Failed to submit rating: " + response.status));
    }

    const newSum = Number(payload?.game?.game_rating_sum ?? currentSum) || 0;
    const newCount = Number(payload?.game?.game_rating_count ?? currentCount) || 0;

    if (game) {
      game.ratingSum = newSum;
      game.ratingCount = newCount;
      game.userRating = newCount > 0 ? Math.round((newSum / newCount) * 10) / 10 : null;
    }
    localStorage.setItem("gamesCache", JSON.stringify(allPlayedGames));
    ratedGames[userRatingGameId] = rating;
    localStorage.setItem("ratedGames", JSON.stringify(ratedGames));
    renderPlayedGames();
    closeModal("userRateGameModal", true);
    userRatingGameId = null;
  } catch (err) {
    console.error("Error submitting user game rating", err);
    setUserRateStatus(
      "userRateGameStatus",
      err?.message || "Не удалось сохранить оценку",
      true
    );
  } finally {
    isSubmittingUserRating = false;
    setUserRateSubmitState("userRateGameSubmitButton", false);
  }
}

document
  .getElementById("editMovieForm")
  .addEventListener("submit", async function (e) {
    e.preventDefault();

    const movie = allMovies.find((m) => m.id === editingMovieId);
    if (!movie) return;

    const rating = getRatingValue("editRatingInput");
    if (!isRatingValid(rating)) {
      alert("Неверная оценка");
      document.getElementById("editRatingInput").reportValidity();
      return;
    }

    const titleValue = document.getElementById("editTitle").value;
    const yearValue = parseInt(document.getElementById("editYear").value, 10);
    const genreInput = document.getElementById("editGenre").value;
    const orderByInput = document.getElementById("editMovieOrderBy").value;
    const orderTypeInput = document.getElementById("editMovieOrderType").value;
    const updatedMovie = {
      title: titleValue,
      year: Number.isFinite(yearValue) ? yearValue : movie.year,
      genre: genreInput ? genreInput : movie.genre,
      orderBy: orderByInput ? orderByInput : movie.orderBy,
      orderType: orderTypeInput ? orderTypeInput : movie.orderType,
      rating,
      poster: editPosterData || movie.poster,
    };

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
          table: "movies",
          id: editingMovieId,
          changes: {
          title: updatedMovie.title,
          genres: updatedMovie.genre,
          poster: updatedMovie.poster,
          year: updatedMovie.year,
          rating_numeric: updatedMovie.rating,
          rating_OMDB: movie.kpRating,
          order_by: updatedMovie.orderBy,
          order_type: updatedMovie.orderType || null,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `Movie update failed: ${response.status}`);
      }

      movie.title = updatedMovie.title;
      movie.year = updatedMovie.year;
      movie.genre = updatedMovie.genre;
      movie.orderBy = updatedMovie.orderBy;
      movie.orderType = updatedMovie.orderType;
      movie.rating = updatedMovie.rating;
      movie.poster = updatedMovie.poster;
      movie.dateAdded =
        movie.dateAdded || new Date().toISOString().split("T")[0];

      localStorage.setItem("moviesCache", JSON.stringify(allMovies));
      renderMovies();
      editPosterData = null;
      closeModal("editMovieModal", true);
    } catch (err) {
      console.error("Error updating movie in Supabase", err);
      alert("Не удалось сохранить изменения фильма. Попробуйте ещё раз.");
    }
  });


document
  .getElementById("planDateForm")
  ?.addEventListener("submit", async function (e) {
    e.preventDefault();

    if (planDateOrderId === null) return;

    const isGamePlan = planDateOrderType === "game";
    const orders = isGamePlan ? gameOrders : watchlist;
    const order = orders.find((o) => o.id === planDateOrderId);
    const dateInput = document.getElementById("planDateInput");
    const timeInput = document.getElementById("planTimeInput");
    const dateValue = dateInput?.value?.trim();
    const timeValue = timeInput?.value?.trim();

    let planValue = null;

    if (dateValue && !timeValue) {
      const dateOnly = new Date(`${dateValue}T00:00`);

      if (Number.isNaN(dateOnly.getTime())) {
        alert("Некорректная дата. Проверьте ввод.");
        return;
      }

      planValue = `${dateValue}T00:00`;
    } else if (!dateValue && timeValue) {
      alert("Чтобы указать время, заполните дату или очистите оба поля.");
      return;
    } else if (dateValue && timeValue) {
      const combinedValue = new Date(`${dateValue}T${timeValue}`);

      if (Number.isNaN(combinedValue.getTime())) {
        alert("Некорректная дата или время. Проверьте ввод.");
        return;
      }

      planValue = combinedValue.toISOString();
    }

    try {
      const column = isGamePlan ? "game_plan_date" : "plan_date";
      const token = localStorage.getItem("adminToken") || "";
      const response = await fetch("/api/admin?action=media-items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "update_item",
          table: isGamePlan ? "Game_Orders" : "Movie_Orders",
          id: planDateOrderId,
          changes: { [column]: planValue },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `Plan date update failed: ${response.status}`);
      }
      const data = payload?.row;

      if (order) {
        order.planDate = data?.[column] || null;
      }

      if (isGamePlan) {
        renderGames();
      } else {
        renderWatchlist();
      }
      closeModal("planDateModal");
    } catch (err) {
      console.error("Error updating plan date", err);
      alert("Не удалось сохранить время просмотра. Попробуйте ещё раз.");
    } finally {
      planDateOrderId = null;
      planDateOrderType = "movie";
    }
  });
document
  .getElementById("editPlayedGameForm")
  ?.addEventListener("submit", async function (e) {
    e.preventDefault();

    const game = allPlayedGames.find((g) => g.id === editingPlayedGameId);
    if (!game) return;

    const previousPoster = game.poster;
    const rating = getRatingValue("editPlayedGameRatingInput");
    if (!isRatingValid(rating)) {
      alert("Неверная оценка");
      document.getElementById("editPlayedGameRatingInput").reportValidity();
      return;
    }

    const updatedGame = {
      title: document.getElementById("editPlayedGameTitle").value,
      year: document.getElementById("editPlayedGameYear").value,
      genres: document.getElementById("editPlayedGameGenres").value,
      rating,
      orderBy: document.getElementById("editPlayedGameOrderBy").value,
      orderType: document.getElementById("editPlayedGameOrderType").value,
      poster: editPlayedGamePosterData || game.poster,
    };

    try {
      let shouldDeletePreviousPoster = false;
      if (
        editPlayedGamePosterData &&
        editPlayedGamePosterData !== previousPoster
      ) {
        const uploadedPoster = await uploadGamePosterToStorage({
          poster: editPlayedGamePosterData,
          title: updatedGame.title,
          folder: "played",
        });
        if (!getGamePosterStoragePath(uploadedPoster)) {
          throw new Error("Не удалось сохранить постер в storage.");
        }
        updatedGame.poster = uploadedPoster;
        shouldDeletePreviousPoster =
          previousPoster &&
          previousPoster !== updatedGame.poster &&
          Boolean(getGamePosterStoragePath(previousPoster));
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
          table: "games",
          id: editingPlayedGameId,
          changes: {
          title: updatedGame.title,
          genres: updatedGame.genres,
          poster: updatedGame.poster,
          year: updatedGame.year,
          rating_numeric: updatedGame.rating,
          order_by: updatedGame.orderBy,
          order_type: updatedGame.orderType,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `Played game update failed: ${response.status}`);
      }

      if (shouldDeletePreviousPoster) {
        await deleteGamePosterFromStorage(previousPoster);
      }
      Object.assign(game, updatedGame);
      localStorage.setItem("gamesCache", JSON.stringify(allPlayedGames));
      renderPlayedGames();
      editPlayedGamePosterData = null;
      closeModal("editPlayedGameModal", true);
    } catch (err) {
      console.error("Error updating played game", err);
      alert("Не удалось сохранить изменения пройденной игры. Попробуйте ещё раз.");
    }
  });

// Форматирование даты
function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit"
  });
}

function formatDateTime(dateStr) {
  if (!dateStr) return "";
  const hasTime = /T\d{2}:\d{2}/.test(dateStr);
  const timePart = hasTime
    ? dateStr.slice(dateStr.indexOf("T") + 1, dateStr.indexOf("T") + 6)
    : "";

  if (!hasTime || timePart === "00:00") {
    return formatDate(dateStr);
  }

  const d = new Date(dateStr);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTimeLocal(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const tzOffset = d.getTimezoneOffset() * 60000;
  const localISOTime = new Date(d.getTime() - tzOffset).toISOString();
  return localISOTime.slice(0, 16);
}

function formatDateLocal(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const tzOffset = d.getTimezoneOffset() * 60000;
  const localISOTime = new Date(d.getTime() - tzOffset).toISOString();
  return localISOTime.slice(0, 10);
}

function formatTimeLocal(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const tzOffset = d.getTimezoneOffset() * 60000;
  const localISOTime = new Date(d.getTime() - tzOffset).toISOString();
  return localISOTime.slice(11, 16);
}

// Сброс форм и рейтингов
function resetForm() {
  document.getElementById("addMovieForm").reset();
  document.getElementById("addWatchlistForm").reset();
  document.getElementById("addGameForm")?.reset();
  document.getElementById("addPlayedGameForm")?.reset();
  document.getElementById("editPlayedGameForm")?.reset();

  // Очистка состояния автопоиска фильмов
  kpResults = [];
  selectedKPMovie = null;
  const autoResults = document.getElementById("autoResults");
  if (autoResults) autoResults.innerHTML = "";
  const autoResultsContainer = document.getElementById("autoResultsContainer");
  if (autoResultsContainer) autoResultsContainer.style.display = "none";
  const autoPreview = document.getElementById("autoPreview");
  if (autoPreview) {
    autoPreview.innerHTML = "";
    autoPreview.style.display = "none";
  }
  if (typeof showKPPreview === "function") {
    showKPPreview();
  }

  // Очистка состояния автопоиска заказанных фильмов
  kpOrderResults = [];
  selectedKPOrderMovie = null;
  const watchAutoResults = document.getElementById("watchAutoResults");
  if (watchAutoResults) watchAutoResults.innerHTML = "";
  const watchAutoResultsContainer = document.getElementById(
    "watchAutoResultsContainer"
  );
  if (watchAutoResultsContainer)
    watchAutoResultsContainer.style.display = "none";
  const watchAutoPreview = document.getElementById("watchAutoPreview");
  if (watchAutoPreview) {
    watchAutoPreview.innerHTML = "";
    watchAutoPreview.style.display = "none";
  }
  if (typeof showWatchlistKPPreview === "function") {
    showWatchlistKPPreview();
  }

  // Очистка состояния автопоиска игр
  rawgResults = [];
  selectedRAWGGame = null;
  steamGridPoster = null;
  steamGridPosters = [];
  resetRawgPosterCache();
  const gameAutoResults = document.getElementById("gameAutoResults");
  if (gameAutoResults) gameAutoResults.innerHTML = "";
  const gameAutoResultsContainer = document.getElementById(
    "gameAutoResultsContainer"
  );
  if (gameAutoResultsContainer) gameAutoResultsContainer.style.display = "none";
  const gameAutoPreview = document.getElementById("gameAutoPreview");
  if (gameAutoPreview) {
    gameAutoPreview.innerHTML = "";
    gameAutoPreview.style.display = "none";
  }
  const playedGameAutoResults = document.getElementById(
    "playedGameAutoResults"
  );
  if (playedGameAutoResults) playedGameAutoResults.innerHTML = "";
  const playedGameAutoResultsContainer = document.getElementById(
    "playedGameAutoResultsContainer"
  );
  if (playedGameAutoResultsContainer)
    playedGameAutoResultsContainer.style.display = "none";
  const playedGameAutoPreview = document.getElementById(
    "playedGameAutoPreview"
  );
  if (playedGameAutoPreview) {
    playedGameAutoPreview.innerHTML = "";
    playedGameAutoPreview.style.display = "none";
  }
  if (typeof showRAWGPreview === "function") {
    showRAWGPreview();
  }
  if (typeof showPlayedGamePreview === "function") {
    showPlayedGamePreview();
  }

  setRatingStars("ratingStars", null);
  setRatingStars("editRatingStars", 0);
  setRatingStars("editPlayedGameRatingStars", 0);
  setRatingStars("playedGameRatingStars", null);
  setRatingStars("rateMovieStars", null);
  syncRouletteAutofillState();
}

// Клик вне модалки закрывает её
window.onclick = function (event) {
  document.querySelectorAll(".modal").forEach((modal) => {
    if (event.target === modal) {
      if (modal.id === "fortuneWinnerModal") {
        closeFortuneWinnerModal();
      } else {
        closeModal(modal.id);
      }
    }
  });
};

function showAdminControls(skipRender = false) {
  if (!isAdmin || !adminToken) {
    return;
  }
  adminElements.forEach((el) => el.classList.remove("admin-only"));
  const btn = document.getElementById("adminLoginBtn");
  const group = document.getElementById("adminPasswordGroup");
  const input = document.getElementById("adminPassword");
  if (btn) btn.textContent = "Выйти";
  if (group) group.style.display = "none";
  if (input) {
    input.required = false;
    input.value = "";
  }
  if (!skipRender) {
    renderMovies();
    renderWatchlist();
    renderGames();
    renderPlayedGames();
  }
}

function hideAdminControls(skipRender = false) {
  adminElements.forEach((el) => el.classList.add("admin-only"));
  const btn = document.getElementById("adminLoginBtn");
  const group = document.getElementById("adminPasswordGroup");
  const input = document.getElementById("adminPassword");
  if (btn) btn.textContent = "Войти";
  if (group) group.style.display = "";
  if (input) input.required = true;
  closeSettingsPanel();
  if (!skipRender) {
    renderMovies();
    renderWatchlist();
    renderGames();
    renderPlayedGames();
  }
}

function logoutAdmin() {
  isAdmin = false;
  clearAdminSession();
  hideAdminControls();
  closeModal("adminModal");
}

function showTab(tab) {
  activeTab = tab;
  document.querySelectorAll("#mobileTabs button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  updateTabVisibility();
}

function updateTabVisibility() {
  const isMobile = window.innerWidth <= 768;
  const movies = document.getElementById("moviesSection");
  const leftPanel = document.querySelector(".left-panel");
  const watch = document.getElementById("watchlistSection");
  const games = document.getElementById("gamesSection");
  const tabs = document.getElementById("mobileTabs");
  if (isMobile) {
    if (tabs) tabs.style.display = "flex";
    if (leftPanel)
      leftPanel.style.display = activeTab === "movies" ? "block" : "none";
    if (movies)
      movies.style.display = activeTab === "movies" ? "block" : "none";
    if (watch)
      watch.style.display = activeTab === "watchlist" ? "block" : "none";
    if (games) games.style.display = activeTab === "games" ? "block" : "none";
  } else {
    if (tabs) tabs.style.display = "none";
    if (leftPanel) leftPanel.style.display = "block";
    if (movies) movies.style.display = "block";
    if (watch) watch.style.display = "block";
    if (games) games.style.display = "block";
  }
}

let activeListTab = "movies";

function updateListTabsIndicator() {
  const tabs = document.querySelector(".list-tabs");
  if (!tabs) return;
  const activeButton = tabs.querySelector("button.active");
  if (!activeButton) return;
  const tabsRect = tabs.getBoundingClientRect();
  const buttonRect = activeButton.getBoundingClientRect();
  const left = buttonRect.left - tabsRect.left;
  tabs.style.setProperty("--indicator-left", `${left}px`);
  tabs.style.setProperty("--indicator-width", `${buttonRect.width}px`);
}

function showListTab(tab) {
  activeListTab = tab;
  document.querySelectorAll(".list-tabs button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.list === tab);
  });
  updateListVisibility();
  requestAnimationFrame(updateListTabsIndicator);
}

function updateListVisibility() {
  const movies = document.getElementById("moviesSection");
  const games = document.getElementById("gamesListSection");
  if (movies)
    movies.style.display = activeListTab === "movies" ? "block" : "none";
  if (games) games.style.display = activeListTab === "games" ? "block" : "none";
}

window.addEventListener("resize", () => {
  updateTabVisibility();
  updateListTabsIndicator();
});
