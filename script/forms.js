// Обработка форм
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

document
  .getElementById("addMovieForm")
  .addEventListener("submit", async function (e) {
    e.preventDefault();

    const rating = getRatingValue("ratingInput");
    if (!isRatingValid(rating)) {
      alert("Неверная оценка");
      document.getElementById("ratingInput").reportValidity();
      return;
    }

    const rouletteOrderByValue =
      rouletteAutofillActive && rouletteOrderByInput
        ? rouletteOrderByInput.value.trim()
        : "";

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
      const { data, error } = await supabaseClient
        .from("movies")
        .insert({
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
        })
        .select()
        .single();

      if (error) throw error;

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
      });
      localStorage.setItem("moviesCache", JSON.stringify(allMovies));

      if (shouldClearRouletteWinner) {
        await clearRouletteLastWinner({ updateInput: false });
      }
    } catch (err) {
      console.error("Error adding movie to Supabase", err);
    }

    currentPage = 1;
    renderMovies();
    closeModal("addMovieModal", true);
  });

document
  .getElementById("addWatchlistForm")
  .addEventListener("submit", async function (e) {
    e.preventDefault();

    const orderBy = document.getElementById("watchOrderBy").value;
    const orderType = document.getElementById("watchOrderType").value;

    let orderData;
    let filmLength = null;

    if (currentWatchlistMode === "auto") {
      const titleInput = document.getElementById("watchAutoTitle").value;
      if (!titleInput) {
        alert("Введите название фильма");
        return;
      }

      if (!selectedKPOrderMovie) {
        showSearchReminderModal();
        return;
      }

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
        length: filmLength,
      };
    }

    const duplicateOrder =
      watchlist.some(
        (o) =>
          o.title.trim().toLowerCase() ===
            orderData.title.trim().toLowerCase() &&
          Number(o.year) === Number(orderData.year)
      ) ||
      allMovies.some(
        (m) =>
          m.title.trim().toLowerCase() ===
            orderData.title.trim().toLowerCase() &&
          Number(m.year) === Number(orderData.year)
      );
    if (duplicateOrder) {
      showDuplicateModal();
      return;
    }

    orderData.imdbId = await resolveKinopoiskImdbId(
      orderData.kinopoiskId,
      orderData.imdbId
    );

    try {
      const { data, error } = await supabaseClient
        .from("Movie_Orders")
        .insert({
          order_title: orderData.title,
          order_origin_title: orderData.originalTitle || "",
          order_year: orderData.year,
          order_genres: orderData.genres,
          order_poster: orderData.poster,
          order_by: orderData.orderBy,
          order_type: orderData.orderType,
          kinopoisk_rate: orderData.kpRating,
          kp_id: orderData.kinopoiskId,
          imdb_id: orderData.imdbId,
          order_length: orderData.length,
          description: orderData.description,
          country: orderData.country,
          actors: normalizeActorsForStorage(orderData.actors),
          director: orderData.director,
        })
        .select()
        .single();

      if (error) throw error;

      const newOrder = {
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
      };

      watchlist.push(newOrder);
      renderWatchlist();

      if (typeof prefetchOrderParentGuideForOrder === "function") {
        prefetchOrderParentGuideForOrder(newOrder);
      }

      if (typeof recordUserOrder === "function") {
        await recordUserOrder({ userName: orderData.orderBy, type: "movies" });
      }
    } catch (err) {
      console.error("Error adding order", err);
    }

    closeModal("addWatchlistModal", true);
    this.reset();
    selectedKPOrderMovie = null;
    kpOrderResults = [];
    showWatchlistKPPreview();
  });

document
  .getElementById("addGameForm")
  ?.addEventListener("submit", async function (e) {
    e.preventDefault();

    const orderType = document.getElementById("gameOrderType").value;
    const orderBy = document.getElementById("gameOrderBy").value;

    let gameData;
    let posterFile = null;

    if (currentGameMode === "auto") {
      const titleInput = document.getElementById("gameAutoTitle").value;
      if (!titleInput) {
        alert("Введите название игры");
        return;
      }

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

      const { data, error } = await supabaseClient
        .from("Game_Orders")
        .insert({
          game_title: gameData.title,
          game_year: gameData.year,
          game_genres: gameData.genres,
          game_poster: gameData.poster,
          game_order_by: gameData.orderBy,
          game_order_type: gameData.orderType,
          description: gameData.description,
          rawg_rating: gameData.rating,
          metacritic: gameData.metacritic,
          released: gameData.released,
          playtime: gameData.playtime,
          platforms: gameData.platforms,
          developers: gameData.developers,
          publishers: gameData.publishers,
          rawg_id: gameData.rawgId
        })
        .select()
        .single();

      if (error) throw error;

      gameOrders.push({
        id: data.id,
        title: data.game_title,
        genres: data.game_genres,
        poster: data.game_poster,
        year: data.game_year || "",
        planDate: data.game_plan_date || null,
        orderBy: data.game_order_by,
        orderType: data.game_order_type,
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
      });
      renderGames();

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

      const { data, error } = await supabaseClient
        .from("games")
        .insert({
          title: gameData.title,
          genres: gameData.genres,
          poster: gameData.poster,
          year: gameData.year,
          rating_numeric: gameData.rating,
          date: new Date().toISOString().split("T")[0],
          order_by: gameData.orderBy,
          order_type: gameData.orderType,
          game_rating_sum: 0,
          game_rating_count: 0,
        })
        .select()
        .single();

      if (error) throw error;

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
    };
    const confirmBtn = document.querySelector("#rateMovieModal .btn-primary");
    isSubmittingRating = true;
    if (confirmBtn) confirmBtn.disabled = true;
    try {
      watchedMovie.imdbId = await resolveKinopoiskImdbId(
        watchedMovie.kinopoiskId,
        watchedMovie.imdbId
      );
      const { data, error } = await supabaseClient
        .from("movies")
        .insert({
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
        })
        .select()
        .single();
      if (error) throw error;

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
        dateAdded: data.date,
        orderBy: data.order_by && data.order_by !== "null" ? data.order_by : "",
        orderType: data.order_type,
        userRating: null,
        description: watchedMovie.description,
        country: watchedMovie.country,
        actors: watchedMovie.actors,
        director: watchedMovie.director,
      };

      const { error: deleteError } = await supabaseClient
        .from("Movie_Orders")
        .delete()
        .eq("id", ratingMovieId);
      if (deleteError) throw deleteError;

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
    };
    try {
      const { data, error } = await supabaseClient
        .from("games")
        .insert({
          title: played.title,
          genres: played.genres,
          poster: played.poster,
          year: played.year,
          rating_numeric: played.rating,
          date: played.dateAdded,
          order_by: played.orderBy,
          order_type: played.orderType,
          game_rating_sum: 0,
          game_rating_count: 0,
        })
        .select()
        .single();
      if (error) throw error;

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
        ratingSum: Number(data.game_rating_sum ?? 0) || 0,
        ratingCount: Number(data.game_rating_count ?? 0) || 0,
        userRating: null,
      };

      const { error: deleteError } = await supabaseClient
        .from("Game_Orders")
        .delete()
        .eq("id", ratingGameId);
      if (deleteError) throw deleteError;

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

  if (ratedMovies[userRatingMovieId]) {
    alert("Вы уже оценили этот фильм");
    closeModal("userRateModal", true);
    isSubmittingUserRating = false;
    return;
  }

  const movie = allMovies.find((m) => m.id === userRatingMovieId);

  try {
    // пишем лог
    const { error: ratingError } = await supabaseClient.from("ratings").insert({
      movie_id: userRatingMovieId,
      rating,
      source: "user",
      category: "Movie",
      title: movie ? movie.title : null,
      user_id: getGuestId(),
    });

    if (ratingError) throw ratingError;

    // считаем все оценки по фильму
    const {
      data: ratingsData,
      count,
      error: aggError,
    } = await supabaseClient
      .from("ratings")
      .select("rating", { count: "exact", head: false })
      .eq("movie_id", userRatingMovieId);

    if (aggError) throw aggError;

    const rows = ratingsData || [];
    const newSum = rows.reduce((acc, row) => acc + Number(row.rating ?? 0), 0);
    const newCount = typeof count === "number" ? count : rows.length;

    // обновляем movies
    const { error: movieError } = await supabaseClient
      .from("movies")
      .update({
        rating_sum: newSum,
        rating_count: newCount,
      })
      .eq("id", userRatingMovieId);

    if (movieError) throw movieError;

    // обновляем локальный кэш
    if (movie) {
      movie.ratingSum = newSum;
      movie.ratingCount = newCount;
      movie.userRating =
        newCount > 0 ? Math.round((newSum / newCount) * 10) / 10 : null;
    }

    localStorage.setItem("moviesCache", JSON.stringify(allMovies));
    ratedMovies[userRatingMovieId] = rating;
    localStorage.setItem("ratedMovies", JSON.stringify(ratedMovies));

    renderMovies();
  } catch (err) {
    console.error("Error submitting user rating", err);
  } finally {
    isSubmittingUserRating = false;
  }

  closeModal("userRateModal", true);
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
    const { error } = await supabaseClient
      .from("games")
      .update({
        game_rating_sum: newSum,
        game_rating_count: newCount,
      })
      .eq("id", userRatingGameId);
    if (error) throw error;
    const { error: ratingError } = await supabaseClient.from("ratings").insert({
      movie_id: userRatingGameId,
      rating,
      source: "user",
      category: "Games",
      title: game ? game.title : null,
      user_id: getGuestId(),
    });
    if (ratingError) throw ratingError;
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
      const { error } = await supabaseClient
        .from("movies")
        .update({
          title: updatedMovie.title,
          genres: updatedMovie.genre,
          poster: updatedMovie.poster,
          year: updatedMovie.year,
          rating_numeric: updatedMovie.rating,
          rating_OMDB: movie.kpRating,
          order_by: updatedMovie.orderBy,
          order_type: updatedMovie.orderType || null,
        })
        .eq("id", editingMovieId);

      if (error) throw error;

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
  .getElementById("editOrderForm")
  .addEventListener("submit", async function (e) {
    e.preventDefault();

    const order = watchlist.find((o) => o.id === editingOrderId);
    if (!order) return;

    const updatedOrder = {
      title: document.getElementById("editOrderTitle").value,
      originalTitle: document.getElementById("editOrderOriginTitle").value,
      year: document.getElementById("editOrderYear").value,
      genres: document.getElementById("editOrderGenre").value,
      orderBy: document.getElementById("editOrderBy").value,
      orderType: document.getElementById("editOrderType").value,
      poster: editOrderPosterData || order.poster,
    };

    try {
      const { error } = await supabaseClient
        .from("Movie_Orders")
        .update({
          order_title: updatedOrder.title,
          order_origin_title: updatedOrder.originalTitle,
          order_year: updatedOrder.year,
          order_genres: updatedOrder.genres,
          order_poster: updatedOrder.poster,
          order_by: updatedOrder.orderBy,
          order_type: updatedOrder.orderType,
        })
        .eq("id", editingOrderId);

      if (error) throw error;

      Object.assign(order, updatedOrder);
      renderWatchlist();
      editOrderPosterData = null;
      closeModal("editOrderModal", true);
    } catch (err) {
      console.error("Error updating order in Supabase", err);
      alert("Не удалось сохранить изменения заказа. Попробуйте ещё раз.");
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
      const { data, error } = await supabaseClient
        .from(isGamePlan ? "Game_Orders" : "Movie_Orders")
        .update({ [column]: planValue })
        .eq("id", planDateOrderId)
        .select(column)
        .single();

      if (error) throw error;

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
  .getElementById("editGameForm")
  ?.addEventListener("submit", async function (e) {
    e.preventDefault();

    const game = gameOrders.find((g) => g.id === editingGameId);
    if (!game) return;

    const previousPoster = game.poster;
    const updatedGame = {
      title: document.getElementById("editGameTitle").value,
      year: document.getElementById("editGameYear").value,
      genres: document.getElementById("editGameGenres").value,
      orderBy: document.getElementById("editGameOrderBy").value,
      orderType: document.getElementById("editGameOrderType").value,
      poster: editGamePosterData || game.poster,
    };

    try {
      let shouldDeletePreviousPoster = false;
      if (editGamePosterData && editGamePosterData !== previousPoster) {
        const uploadedPoster = await uploadGamePosterToStorage({
          poster: editGamePosterData,
          title: updatedGame.title,
          folder: "orders",
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

      const { error } = await supabaseClient
        .from("Game_Orders")
        .update({
          game_title: updatedGame.title,
          game_year: updatedGame.year,
          game_genres: updatedGame.genres,
          game_poster: updatedGame.poster,
          game_order_by: updatedGame.orderBy,
          game_order_type: updatedGame.orderType,
        })
        .eq("id", editingGameId);

      if (error) throw error;

      if (shouldDeletePreviousPoster) {
        await deleteGamePosterFromStorage(previousPoster);
      }
      Object.assign(game, updatedGame);
      renderGames();
      editGamePosterData = null;
      closeModal("editGameModal", true);
    } catch (err) {
      console.error("Error updating game", err);
      alert("Не удалось сохранить изменения заказа игры. Попробуйте ещё раз.");
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

      const { error } = await supabaseClient
        .from("games")
        .update({
          title: updatedGame.title,
          genres: updatedGame.genres,
          poster: updatedGame.poster,
          year: updatedGame.year,
          rating_numeric: updatedGame.rating,
          order_by: updatedGame.orderBy,
          order_type: updatedGame.orderType,
        })
        .eq("id", editingPlayedGameId);

      if (error) throw error;

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
  document.getElementById("editGameForm")?.reset();
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

  setRatingStars("ratingStars", 0);
  setRatingStars("editRatingStars", 0);
  setRatingStars("editPlayedGameRatingStars", 0);
  setRatingStars("playedGameRatingStars", 0);
  setRatingStars("rateMovieStars", 0);
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

function showListTab(tab) {
  activeListTab = tab;
  document.querySelectorAll(".list-tabs button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.list === tab);
  });
  updateListVisibility();
}

function updateListVisibility() {
  const movies = document.getElementById("moviesSection");
  const games = document.getElementById("gamesListSection");
  if (movies)
    movies.style.display = activeListTab === "movies" ? "block" : "none";
  if (games) games.style.display = activeListTab === "games" ? "block" : "none";
}

window.addEventListener("resize", updateTabVisibility);
