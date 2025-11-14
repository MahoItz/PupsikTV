// Обработка форм
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
        movieData = {
          title: sel.nameRu || sel.nameEn || "",
          originalTitle: sel.nameEn || "",
          year: sel.year || new Date().getFullYear(),
          rating: rating,
          kpRating: sel.rating || "-",
          poster:
            sel.posterUrlPreview ||
            sel.posterUrl ||
            "https://via.placeholder.com/300x400?text=Нет+постера",
          dateAdded: new Date().toISOString().split("T")[0],
          genre: sel.genres?.map((g) => g.genre).join(", ") || "",
          description: sel.description || "",
        };
      } else {
        movieData = {
          title: title,
          year: new Date().getFullYear(),
          rating: rating,
          kpRating: "-",
          poster: "https://via.placeholder.com/300x400?text=Постер",
          dateAdded: new Date().toISOString().split("T")[0],
          genre: "Неизвестно",
          description: "",
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
        poster: poster,
        dateAdded: new Date().toISOString().split("T")[0],
        genre: document.getElementById("manualGenre").value || "Неизвестно",
      };
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
          date: movieData.dateAdded,
          rating_sum: 0,
          rating_count: 0,
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
        dateAdded: data.date,
        orderBy: data.order_by && data.order_by !== "null" ? data.order_by : "",
        orderType: data.order_type,
        ratingSum: Number(data.rating_sum ?? 0) || 0,
        ratingCount: Number(data.rating_count ?? 0) || 0,
        userRating: null,
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
        orderData = {
          title: sel.nameRu || sel.nameEn || "",
          originalTitle: sel.nameEn || "",
          year: sel.year || "",
          kpRating: sel.rating || "-",
          poster:
            sel.posterUrlPreview ||
            sel.posterUrl ||
            "https://via.placeholder.com/300x400?text=Нет+постера",
          genres: sel.genres?.map((g) => g.genre).join(", ") || "",
          orderBy: orderBy,
          orderType: orderType,
          length: filmLength,
        };
      } else {
        orderData = {
          title: titleInput,
          originalTitle: "",
          year: "",
          kpRating: "-",
          poster: "https://via.placeholder.com/300x400?text=Нет+постера",
          genres: "",
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
        kpRating: "-",
        poster: poster,
        genres: document.getElementById("watchManualGenre").value || "",
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
          order_length: orderData.length,
        })
        .select()
        .single();

      if (error) throw error;

      watchlist.push({
        id: data.id,
        title: data.order_title,
        originalTitle: data.order_origin_title,
        genres: data.order_genres,
        poster: data.order_poster,
        year: data.order_year || "",
        length: data.order_length || null,
        kpRating: data.kinopoisk_rate,
        orderBy: data.order_by,
        orderType: data.order_type,
        dateAdded: data.created_at,
      });
      renderWatchlist();
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

    const orderBy = document.getElementById("gameOrderBy").value;
    const orderType = document.getElementById("gameOrderType").value;

    let gameData;

    if (currentGameMode === "auto") {
      const titleInput = document.getElementById("gameAutoTitle").value;
      if (!titleInput) {
        alert("Введите название игры");
        return;
      }

      if (selectedRAWGGame) {
        const g = selectedRAWGGame;
        gameData = {
          title: g.name || titleInput,
          year: g.released ? g.released.split("-")[0] : "",
          genres: g.genres?.map((x) => x.name).join(", ") || "",
          poster:
            steamGridPoster ||
            g.background_image ||
            "https://via.placeholder.com/300x400?text=Нет+постера",
          orderBy: orderBy,
          orderType: orderType,
        };
      } else {
        gameData = {
          title: titleInput,
          year: "",
          genres: "",
          poster: "https://via.placeholder.com/300x400?text=Нет+постера",
          orderBy: orderBy,
          orderType: orderType,
        };
      }
    } else {
      const fileInput = document.getElementById("gamePoster");
      let poster = "https://via.placeholder.com/300x400?text=Нет+постера";
      if (fileInput.files && fileInput.files[0]) {
        try {
          poster = await readFileAsDataURL(fileInput.files[0]);
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
      };
    }

    try {
      const { data, error } = await supabaseClient
        .from("Game_Orders")
        .insert({
          game_title: gameData.title,
          game_year: gameData.year,
          game_genres: gameData.genres,
          game_poster: gameData.poster,
          game_order_by: gameData.orderBy,
          game_order_type: gameData.orderType,
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
        orderBy: data.game_order_by,
        orderType: data.game_order_type,
        dateAdded: data.created_at,
      });
      renderGames();
    } catch (err) {
      console.error("Error adding game", err);
    }

    closeModal("addGameModal", true);
    this.reset();
    selectedRAWGGame = null;
    steamGridPoster = null;
    steamGridPosters = [];
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
      gameData = {
        title: g.name || titleInput,
        year: g.released ? g.released.split("-")[0] : "",
        genres: g.genres?.map((x) => x.name).join(", ") || "",
        poster:
          steamGridPoster ||
          g.background_image ||
          "https://via.placeholder.com/300x400?text=Нет+постера",
        rating: rating,
        orderBy: orderBy,
        orderType: orderType,
      };
    } else {
      const fileInput = document.getElementById("playedGamePoster");
      let poster = "https://via.placeholder.com/300x400?text=Нет+постера";
      if (fileInput.files && fileInput.files[0]) {
        try {
          poster = await readFileAsDataURL(fileInput.files[0]);
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
    // Создаём новый объект фильма для основного списка
    const source = watchlist[itemIndex];
    const watchedMovie = {
      title: source.title,
      originalTitle: source.originalTitle || "",
      year: source.year,
      rating: rating,
      kpRating: source.kpRating,
      poster:
        source.poster || "https://via.placeholder.com/300x400?text=Нет+постера",
      dateAdded: new Date().toISOString().split("T")[0],
      genre: source.genres || "",
      description: "",
      orderBy: source.orderBy || "",
      orderType: source.orderType || "",
    };
    const confirmBtn = document.querySelector("#rateMovieModal .btn-primary");
    isSubmittingRating = true;
    if (confirmBtn) confirmBtn.disabled = true;
    try {
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
          date: watchedMovie.dateAdded,
          order_by: watchedMovie.orderBy,
          order_type: watchedMovie.orderType,
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
        dateAdded: data.date,
        orderBy: data.order_by && data.order_by !== "null" ? data.order_by : "",
        orderType: data.order_type,
        userRating: null,
      });
      localStorage.setItem("moviesCache", JSON.stringify(allMovies));
      await supabaseClient
        .from("Movie_Orders")
        .delete()
        .eq("id", ratingMovieId);
    } catch (err) {
      console.error("Error adding rated movie to Supabase", err);
    } finally {
      isSubmittingRating = false;
      if (confirmBtn) confirmBtn.disabled = false;
    }
    currentPage = 1;
    watchlist.splice(itemIndex, 1);
    renderMovies();
    renderWatchlist();
  }
  closeModal("rateMovieModal", true);
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
      await supabaseClient.from("Game_Orders").delete().eq("id", ratingGameId);
    } catch (err) {
      console.error("Error adding rated game", err);
    }
    gameOrders.splice(idx, 1);
    renderPlayedGames();
    renderGames();
  }
  closeModal("rateGameModal", true);
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
    if (movie) {
      movie.title = document.getElementById("editTitle").value;
      movie.year =
        parseInt(document.getElementById("editYear").value) || movie.year;
      movie.genre = document.getElementById("editGenre").value || movie.genre;
      movie.orderBy =
        document.getElementById("editMovieOrderBy").value || movie.orderBy;
      const rating = getRatingValue("editRatingInput");
      if (!isRatingValid(rating)) {
        alert("Неверная оценка");
        document.getElementById("editRatingInput").reportValidity();
        return;
      }
      movie.rating = rating;
      movie.poster = editPosterData || movie.poster;
      movie.dateAdded =
        movie.dateAdded || new Date().toISOString().split("T")[0];

      try {
        await supabaseClient
          .from("movies")
          .update({
            title: movie.title,
            genres: movie.genre,
            poster: movie.poster,
            year: movie.year,
            rating_numeric: movie.rating,
            rating_OMDB: movie.kpRating,
            order_by: movie.orderBy,
          })
          .eq("id", editingMovieId);
      } catch (err) {
        console.error("Error updating movie in Supabase", err);
      }
    }
    localStorage.setItem("moviesCache", JSON.stringify(allMovies));
    renderMovies();
    closeModal("editMovieModal", true);
  });

document
  .getElementById("editOrderForm")
  .addEventListener("submit", async function (e) {
    e.preventDefault();

    const order = watchlist.find((o) => o.id === editingOrderId);
    if (order) {
      order.title = document.getElementById("editOrderTitle").value;
      order.originalTitle = document.getElementById(
        "editOrderOriginTitle"
      ).value;
      order.year = document.getElementById("editOrderYear").value;
      order.genres = document.getElementById("editOrderGenre").value;
      order.orderBy = document.getElementById("editOrderBy").value;
      order.orderType = document.getElementById("editOrderType").value;
      order.poster = editOrderPosterData || order.poster;

      try {
        await supabaseClient
          .from("Movie_Orders")
          .update({
            order_title: order.title,
            order_origin_title: order.originalTitle,
            order_year: order.year,
            order_genres: order.genres,
            order_poster: order.poster,
            order_by: order.orderBy,
            order_type: order.orderType,
          })
          .eq("id", editingOrderId);
      } catch (err) {
        console.error("Error updating order in Supabase", err);
      }
    }

    renderWatchlist();
    closeModal("editOrderModal", true);
  });

document
  .getElementById("editGameForm")
  ?.addEventListener("submit", async function (e) {
    e.preventDefault();

    const game = gameOrders.find((g) => g.id === editingGameId);
    if (game) {
      game.title = document.getElementById("editGameTitle").value;
      game.year = document.getElementById("editGameYear").value;
      game.genres = document.getElementById("editGameGenres").value;
      game.orderBy = document.getElementById("editGameOrderBy").value;
      game.orderType = document.getElementById("editGameOrderType").value;
      game.poster = editGamePosterData || game.poster;

      try {
        await supabaseClient
          .from("Game_Orders")
          .update({
            game_title: game.title,
            game_year: game.year,
            game_genres: game.genres,
            game_poster: game.poster,
            game_order_by: game.orderBy,
            game_order_type: game.orderType,
          })
          .eq("id", editingGameId);
      } catch (err) {
        console.error("Error updating game", err);
      }
    }

    renderGames();
    closeModal("editGameModal", true);
  });

document
  .getElementById("editPlayedGameForm")
  ?.addEventListener("submit", async function (e) {
    e.preventDefault();

    const game = allPlayedGames.find((g) => g.id === editingPlayedGameId);
    if (game) {
      game.title = document.getElementById("editPlayedGameTitle").value;
      game.year = document.getElementById("editPlayedGameYear").value;
      game.genres = document.getElementById("editPlayedGameGenres").value;
      const rating = getRatingValue("editPlayedGameRatingInput");
      if (!isRatingValid(rating)) {
        alert("Неверная оценка");
        document.getElementById("editPlayedGameRatingInput").reportValidity();
        return;
      }
      game.rating = rating;
      game.orderBy = document.getElementById("editPlayedGameOrderBy").value;
      game.orderType = document.getElementById("editPlayedGameOrderType").value;
      game.poster = editPlayedGamePosterData || game.poster;

      try {
        await supabaseClient
          .from("games")
          .update({
            title: game.title,
            genres: game.genres,
            poster: game.poster,
            year: game.year,
            rating_numeric: game.rating,
            order_by: game.orderBy,
            order_type: game.orderType,
          })
          .eq("id", editingPlayedGameId);
      } catch (err) {
        console.error("Error updating played game", err);
      }
    }

    localStorage.setItem("gamesCache", JSON.stringify(allPlayedGames));
    renderPlayedGames();
    closeModal("editPlayedGameModal", true);
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

// Сброс форм и рейтингов
function resetForm() {
  document.getElementById("addMovieForm").reset();
  document.getElementById("addWatchlistForm").reset();
  document.getElementById("addGameForm")?.reset();
  document.getElementById("addPlayedGameForm")?.reset();
  document.getElementById("editGameForm")?.reset();
  document.getElementById("editPlayedGameForm")?.reset();
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

