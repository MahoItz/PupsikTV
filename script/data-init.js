// ---------- File upload helpers ----------
function initFileUpload() {
  const fileInputs = document.querySelectorAll(
    '.file-upload-wrapper input[type="file"]'
  );

  fileInputs.forEach((fileInput) => {
    const wrapper = fileInput.closest(".file-upload-wrapper");
    if (!wrapper) return;
    const label = wrapper.querySelector(".file-upload-label");
    const fileName = wrapper.parentElement.querySelector(".file-name");
    const removeBtn = wrapper.querySelector(".file-remove");
    const preview = wrapper.parentElement.querySelector(".poster-preview");

    fileInput.addEventListener("change", async function (e) {
      const file = e.target.files[0];
      if (file) {
        await showSelectedFile(file, label, fileName, removeBtn, preview);
      }
    });

    label.addEventListener("dragover", function (e) {
      e.preventDefault();
      label.classList.add("drag-over");
    });

    label.addEventListener("dragleave", function (e) {
      e.preventDefault();
      label.classList.remove("drag-over");
    });

    label.addEventListener("drop", async function (e) {
      e.preventDefault();
      label.classList.remove("drag-over");

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        if (file.type.startsWith("image/")) {
          const dt = new DataTransfer();
          dt.items.add(file);
          fileInput.files = dt.files;
          await showSelectedFile(file, label, fileName, removeBtn, preview);
        }
      }
    });

    removeBtn.addEventListener("click", function () {
      clearFile(fileInput, label, fileName, removeBtn, preview);
    });
  });
}

async function showSelectedFile(file, label, fileName, removeBtn, preview) {
  label.classList.add("has-file");
  label.querySelector(".main-text").textContent = "Файл выбран";
  label.querySelector(".sub-text").textContent = "Нажмите для замены";

  fileName.textContent = file.name;
  fileName.style.display = "block";
  removeBtn.style.display = "flex";

  if (preview) {
    try {
      const dataUrl = await readFileAsDataURL(file);
      preview.src = dataUrl;
      preview.style.display = "block";
    } catch (err) {
      console.error("Error reading file", err);
    }
  }
}

function clearFile(fileInput, label, fileName, removeBtn, preview) {
  fileInput.value = "";
  label.classList.remove("has-file");
  label.querySelector(".main-text").textContent = "Выберите файл изображения";
  label.querySelector(".sub-text").textContent = "или перетащите его сюда";

  fileName.style.display = "none";
  removeBtn.style.display = "none";

  if (preview) {
    preview.src = "https://via.placeholder.com/300x400?text=Нет+постера";
    preview.style.display = "none";
  }
}

function recalculateMovieUserRatings(targetMovies = allMovies) {
  if (!Array.isArray(targetMovies)) return;

  targetMovies.forEach((movie) => {
    const sum = Number(movie?.ratingSum ?? 0) || 0;
    const count = Number(movie?.ratingCount ?? 0) || 0;

    movie.ratingSum = sum;
    movie.ratingCount = count;
    movie.userRating = count > 0 ? Math.round((sum / count) * 10) / 10 : null;
  });
}

function recalculateGameUserRatings(targetGames = allPlayedGames) {
  if (!Array.isArray(targetGames)) return;

  targetGames.forEach((game) => {
    const sum = Number(game?.ratingSum ?? game?.game_rating_sum ?? 0) || 0;
    const count =
      Number(game?.ratingCount ?? game?.game_rating_count ?? 0) || 0;

    game.ratingSum = sum;
    game.ratingCount = count;
    game.userRating = count > 0 ? Math.round((sum / count) * 10) / 10 : null;
  });
}

function hasRatedGame(id) {
  return Object.prototype.hasOwnProperty.call(ratedGames, id);
}

async function loadSettingsFromSupabase() {
  if (!supabaseClient) {
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("settings")
      .select("id, roulette_last_winner")
      .limit(1);

    if (error) throw error;

    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;

    settingsRowId = row?.id ?? settingsRowId;
    const remoteValue = (row?.roulette_last_winner || "").trim();

    if (rouletteLastWinnerHasPendingSync) {
      const pending = rouletteLastWinnerPendingValue;
      rouletteLastWinner = (pending ?? "").trim();
      await persistRouletteLastWinner(pending);
      syncRouletteAutofillState();
      return;
    }

    rouletteLastWinner = remoteValue;

    if (!rouletteLastWinner) {
      syncRouletteAutofillState();
    } else {
      rouletteAutofillActive = false;
      if (isAddMovieModalOpen()) {
        applyRouletteAutofill({ triggerSuggestions: true });
      } else {
        toggleRouletteAutofillVisibility(false);
      }
    }
  } catch (err) {
    console.error("Error loading settings from Supabase", err);
  }
}

// Загрузка фильмов из Supabase
async function loadMoviesFromSupabase() {
  try {
    const { data, error } = await supabaseClient
      .from("movies")
      .select(
        "id, title, original_title, genres, poster, year, rating_numeric, rating_OMDB, rating_sum, rating_count, date, order_by, order_type"
      )
      .order("id", { ascending: false });

    if (error) throw error;

    const newMovies = data.map((item) => {
      const ratingSum = Number(item.rating_sum ?? 0) || 0;
      const ratingCount = Number(item.rating_count ?? 0) || 0;

      return {
        id: item.id,
        title: item.title,
        originalTitle: item.original_title,
        genre: item.genres,
        poster: item.poster,
        year: item.year,
        rating: item.rating_numeric,
        kpRating: item.rating_OMDB,
        ratingSum,
        ratingCount,
        userRating:
          ratingCount > 0
            ? Math.round((ratingSum / ratingCount) * 10) / 10
            : null,
        dateAdded: item.date,
        orderBy: item.order_by && item.order_by !== "null" ? item.order_by : "",
        orderType: item.order_type,
      };
    });

    const current = JSON.stringify(allMovies);
    const fresh = JSON.stringify(newMovies);

    if (current !== fresh) {
      allMovies = newMovies;
      totalMovies = allMovies.length;
      recalculateMovieUserRatings(allMovies);
      localStorage.setItem("moviesCache", fresh);
    }
  } catch (err) {
    console.error("Error loading movies from Supabase", err);
  }
}

// Загрузка заказов из Supabase
async function loadWatchlistFromSupabase() {
  try {
    const { data, error } = await supabaseClient
      .from("Movie_Orders")
      .select(
        "id, created_at, order_title, order_origin_title, order_type, order_by, kinopoisk_rate, order_genres, order_poster, order_year, order_length"
      )
      .order("id", { ascending: true });

    if (error) throw error;

    watchlist = data.map((item) => ({
      id: item.id,
      title: item.order_title,
      originalTitle: item.order_origin_title,
      genres: item.order_genres,
      poster: item.order_poster,
      year: item.order_year || "",
      length: item.order_length || null,
      kpRating: item.kinopoisk_rate,
      orderBy: item.order_by && item.order_by !== "null" ? item.order_by : "",
      orderType: item.order_type,
      dateAdded: item.created_at,
    }));

    renderWatchlist();
  } catch (err) {
    console.error("Error loading watchlist from Supabase", err);
  }
}

// Загрузка заказанных игр из Supabase
async function loadGamesFromSupabase() {
  try {
    const { data, error } = await supabaseClient
      .from("Game_Orders")
      .select(
        "id, created_at, game_title, game_order_type, game_order_by, game_genres, game_poster, game_year"
      )
      .order("id", { ascending: true });

    if (error) throw error;

    gameOrders = data.map((item) => ({
      id: item.id,
      title: item.game_title,
      genres: item.game_genres,
      poster: item.game_poster,
      year: item.game_year || "",
      orderBy:
        item.game_order_by && item.game_order_by !== "null"
          ? item.game_order_by
          : "",
      orderType: item.game_order_type,
      dateAdded: item.created_at,
    }));

    renderGames();
  } catch (err) {
    console.error("Error loading game orders from Supabase", err);
  }
}

// Загрузка пройденных игр из Supabase
async function loadPlayedGamesFromSupabase() {
  try {
    const { data, error } = await supabaseClient
      .from("games")
      .select(
        "id, title, genres, poster, year, rating_numeric, date, order_by, order_type, game_rating_sum, game_rating_count"
      )
      .order("id", { ascending: false });

    if (error) throw error;

    allPlayedGames = data.map((item) => {
      const ratingSum = Number(item.game_rating_sum ?? 0) || 0;
      const ratingCount = Number(item.game_rating_count ?? 0) || 0;

      return {
        id: item.id,
        title: item.title,
        genres: item.genres,
        poster: item.poster,
        year: item.year,
        rating: item.rating_numeric,
        dateAdded: item.date,
        orderBy: item.order_by && item.order_by !== "null" ? item.order_by : "",
        orderType: item.order_type,
        ratingSum,
        ratingCount,
        userRating:
          ratingCount > 0
            ? Math.round((ratingSum / ratingCount) * 10) / 10
            : null,
      };
    });
    totalGamesPlayed = allPlayedGames.length;
    recalculateGameUserRatings(allPlayedGames);
    localStorage.setItem("gamesCache", JSON.stringify(allPlayedGames));
    renderPlayedGames();
  } catch (err) {
    console.error("Error loading played games", err);
  }
}

// Инициализация
document.addEventListener("DOMContentLoaded", async function () {
  let initialEnv;
  try {
    initialEnv = await loadEnv();
  } catch (err) {
    showFatalErrorBanner(
      "Не удалось подключиться к базе данных. Попробуйте обновить страницу позже.",
      err
    );
    return;
  }

  if (!initialEnv || !initialEnv.SUPABASE_KEY) {
    showFatalErrorBanner(
      "От сервера не получены настройки Supabase. Попробуйте обновить страницу позже."
    );
    return;
  }

  const kpStored = localStorage.getItem("KINOPOISK_API_KEY");
  if (kpStored) KINOPOISK_API_KEY = kpStored;
  const rawgStored = localStorage.getItem("RAWG_API_KEY");
  if (rawgStored) RAWG_API_KEY = rawgStored;
  const cached = localStorage.getItem("moviesCache");
  if (cached) {
    allMovies = JSON.parse(cached);
    totalMovies = allMovies.length;
    recalculateMovieUserRatings();
  }
  const ratedStored = localStorage.getItem("ratedMovies");
  if (ratedStored) {
    ratedMovies = JSON.parse(ratedStored);
  }
  const ratedGamesStored = localStorage.getItem("ratedGames");
  if (ratedGamesStored) {
    ratedGames = JSON.parse(ratedGamesStored);
  }
  const gamesCached = localStorage.getItem("gamesCache");
  if (gamesCached) {
    allPlayedGames = JSON.parse(gamesCached);
    totalGamesPlayed = allPlayedGames.length;
    recalculateGameUserRatings(allPlayedGames);
  }

  ratingTooltip = document.createElement("div");
  ratingTooltip.className = "rating-tooltip";
  document.body.appendChild(ratingTooltip);

  adminElements = Array.from(document.querySelectorAll(".admin-only"));
  hideAdminControls(true);

  const storedToken = adminToken;
  if (storedToken) {
    const verification = await verifyAdminTokenRequest(storedToken);
    if (verification.ok) {
      try {
        const env = await loadEnv({ token: storedToken });
        if (env && env.isAdmin) {
          isAdmin = true;
          updateAdminSession(storedToken, verification.expiresAt);
          showAdminControls(true);
          if (env.KINOPOISK_API_KEY) {
            localStorage.setItem("KINOPOISK_API_KEY", env.KINOPOISK_API_KEY);
          }
          if (env.RAWG_API_KEY) {
            localStorage.setItem("RAWG_API_KEY", env.RAWG_API_KEY);
          }
        } else {
          clearAdminSession();
        }
      } catch (err) {
        console.error("Failed to refresh admin environment", err);
        clearAdminSession();
      }
    } else {
      clearAdminSession();
    }
  }

  recalculateMovieUserRatings();
  recalculateGameUserRatings();
  renderPlayedGames();
  setupRatingStars();
  initFileUpload();

  document
    .querySelectorAll("#mobileTabs button")
    .forEach((btn) =>
      btn.addEventListener("click", () => showTab(btn.dataset.tab))
    );
  document
    .querySelectorAll(".list-tabs button")
    .forEach((btn) =>
      btn.addEventListener("click", () => showListTab(btn.dataset.list))
    );
  updateTabVisibility();
  updateListVisibility();
  showListTab(activeListTab);

  const orderBtn = document.getElementById("sortOrderBtn");
  if (orderBtn) {
    const img = document.createElement("img");
    img.src = sortAscending ? "images/up-arrow.webp" : "images/down-arrow.webp";
    img.alt = "";
    img.className = "sort-arrow";

    orderBtn.replaceChildren(img);
  }

  await Promise.all([
    loadSettingsFromSupabase(),
    loadMoviesFromSupabase(),
    loadWatchlistFromSupabase(),
    loadGamesFromSupabase(),
    loadPlayedGamesFromSupabase(),
  ]);

  renderMovies();
  renderPlayedGames();
  const headerImg = document.querySelector(
    "#headerLogo img[src='images/Pupsik_TV_Header.webp']"
  );
  if (headerImg)
    headerImg.addEventListener("click", () => {
      document.getElementById("adminModal").style.display = "block";
    });
  const adminForm = document.getElementById("adminLoginForm");
  if (adminForm)
    adminForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (isAdmin) {
        logoutAdmin();
      } else {
        const pw = document.getElementById("adminPassword").value;
        const result = await verifyAdminPassword(pw);
        if (result.ok && result.token) {
          const token = result.token;
          try {
            const env = await loadEnv({ token });
            if (env && env.isAdmin) {
              updateAdminSession(token, result.expiresAt);
              isAdmin = true;
              showAdminControls();
              if (env.KINOPOISK_API_KEY) {
                localStorage.setItem(
                  "KINOPOISK_API_KEY",
                  env.KINOPOISK_API_KEY
                );
              }
              if (env.RAWG_API_KEY) {
                localStorage.setItem("RAWG_API_KEY", env.RAWG_API_KEY);
              }
              await loadSettingsFromSupabase();
              closeModal("adminModal");
            } else {
              clearAdminSession();
              alert(
                "Не удалось подтвердить сессию администратора. Попробуйте ещё раз."
              );
            }
          } catch (err) {
            console.error("Failed to load environment for admin session", err);
            alert(
              "Не удалось получить настройки сервера. Попробуйте ещё раз позже."
            );
          }
        } else {
          alert("Неверный пароль");
        }
      }
    });
  const searchBtn = document.getElementById("autoSearchBtn");
  const resultsContainer = document.getElementById("autoResults");
  const titleInput = document.getElementById("autoTitle");
  if (searchBtn) searchBtn.addEventListener("click", handleKPSearch);
  if (titleInput)
    titleInput.addEventListener("input", () => {
      const q = titleInput.value.trim();
      syncRouletteAutofillState();
      if (q) {
        showSearchLoading("autoResultsContainer", "autoResults");
      } else {
        document.getElementById("autoResultsContainer").style.display = "none";
        if (rouletteLastWinner || rouletteAutofillActive) {
          clearRouletteLastWinner({ updateInput: false });
        }
      }
      debouncedKPSearch(q);
    });
  if (resultsContainer)
    resultsContainer.addEventListener("click", function (e) {
      const option = e.target.closest(".autocomplete-option");
      if (!option) return;
      const idx = parseInt(option.dataset.index, 10);
      selectedKPMovie = kpResults[idx] || null;
      if (selectedKPMovie) {
        titleInput.value =
          selectedKPMovie.nameRu || selectedKPMovie.nameEn || "";
      }
      syncRouletteAutofillState();
      showKPPreview();
      document.getElementById("autoResultsContainer").style.display = "none";
    });

  if (titleInput) {
    titleInput.addEventListener("keydown", (event) => {
      if (event.key !== "Backspace" && event.key !== "Delete") {
        return;
      }

      const currentValue = titleInput.value;
      const selectionStart = titleInput.selectionStart ?? currentValue.length;
      const selectionEnd = titleInput.selectionEnd ?? selectionStart;

      let resultingValue = currentValue;

      if (selectionStart !== selectionEnd) {
        resultingValue =
          currentValue.slice(0, selectionStart) +
          currentValue.slice(selectionEnd);
      } else if (event.key === "Backspace" && selectionStart > 0) {
        resultingValue =
          currentValue.slice(0, selectionStart - 1) +
          currentValue.slice(selectionEnd);
      } else if (event.key === "Delete" && selectionStart < currentValue.length) {
        resultingValue =
          currentValue.slice(0, selectionStart) +
          currentValue.slice(selectionEnd + 1);
      }

      Promise.resolve().then(() => {
        if (!rouletteLastWinner) {
          return;
        }

        const trimmed = (resultingValue || "").trim();
        if (!trimmed || trimmed !== rouletteLastWinner) {
          clearRouletteLastWinner({ updateInput: false });
        }
      });
    });
  }

  const watchSearchBtn = document.getElementById("watchAutoSearchBtn");
  const watchResultsContainer = document.getElementById("watchAutoResults");
  const watchTitleInput = document.getElementById("watchAutoTitle");
  if (watchSearchBtn)
    watchSearchBtn.addEventListener("click", handleWatchlistSearch);
  if (watchTitleInput)
    watchTitleInput.addEventListener("input", () => {
      const q = watchTitleInput.value.trim();
      if (q) {
        showSearchLoading("watchAutoResultsContainer", "watchAutoResults");
      } else {
        document.getElementById("watchAutoResultsContainer").style.display =
          "none";
      }
      debouncedWatchlistKPSearch(q);
    });
  if (watchResultsContainer)
    watchResultsContainer.addEventListener("click", function (e) {
      const option = e.target.closest(".autocomplete-option");
      if (!option) return;
      const idx = parseInt(option.dataset.index, 10);
      selectedKPOrderMovie = kpOrderResults[idx] || null;
      if (selectedKPOrderMovie) {
        watchTitleInput.value =
          selectedKPOrderMovie.nameRu || selectedKPOrderMovie.nameEn || "";
      }
      showWatchlistKPPreview();
      document.getElementById("watchAutoResultsContainer").style.display =
        "none";
    });

  const gameSearchBtn = document.getElementById("gameAutoSearchBtn");
  const gameResultsContainer = document.getElementById("gameAutoResults");
  const gameTitleInput = document.getElementById("gameAutoTitle");
  if (gameSearchBtn) gameSearchBtn.addEventListener("click", handleGameSearch);
  if (gameTitleInput)
    gameTitleInput.addEventListener("input", () => {
      const q = gameTitleInput.value.trim();
      if (q) {
        showSearchLoading("gameAutoResultsContainer", "gameAutoResults");
      } else {
        document.getElementById("gameAutoResultsContainer").style.display =
          "none";
      }
      debouncedRAWGSearch(q);
    });
  if (gameResultsContainer)
    gameResultsContainer.addEventListener("click", async function (e) {
      const option = e.target.closest(".autocomplete-option");
      if (!option) return;
      const idx = parseInt(option.dataset.index, 10);
      selectedRAWGGame = rawgResults[idx] || null;
      if (selectedRAWGGame) {
        gameTitleInput.value = selectedRAWGGame.name || "";
        await fetchSteamGridPosters(selectedRAWGGame.name);
      }
      showRAWGPreview();
      document.getElementById("gameAutoResultsContainer").style.display =
        "none";
    });

  const playedSearchBtn = document.getElementById("playedGameAutoSearchBtn");
  const playedResultsContainer = document.getElementById(
    "playedGameAutoResults"
  );
  const playedTitleInput = document.getElementById("playedGameAutoTitle");
  if (playedSearchBtn)
    playedSearchBtn.addEventListener("click", handlePlayedGameSearch);
  if (playedTitleInput)
    playedTitleInput.addEventListener("input", () => {
      const q = playedTitleInput.value.trim();
      if (q) {
        showSearchLoading(
          "playedGameAutoResultsContainer",
          "playedGameAutoResults"
        );
      } else {
        document.getElementById(
          "playedGameAutoResultsContainer"
        ).style.display = "none";
      }
      debouncedPlayedRAWGSearch(q);
    });
  if (playedResultsContainer)
    playedResultsContainer.addEventListener("click", async function (e) {
      const option = e.target.closest(".autocomplete-option");
      if (!option) return;
      const idx = parseInt(option.dataset.index, 10);
      selectedRAWGGame = rawgResults[idx] || null;
      if (selectedRAWGGame) {
        playedTitleInput.value = selectedRAWGGame.name || "";
        await fetchSteamGridPosters(selectedRAWGGame.name);
      }
      showPlayedGamePreview();
      document.getElementById("playedGameAutoResultsContainer").style.display =
        "none";
    });

  const preview = document.getElementById("editPosterPreview");
  const input = document.getElementById("editPoster");
  if (preview && input) {
    preview.addEventListener("click", () => input.click());
    input.addEventListener("change", async function () {
      if (this.files && this.files[0]) {
        try {
          editPosterData = await readFileAsDataURL(this.files[0]);
          preview.src = editPosterData;
        } catch (err) {
          console.error("Error reading file", err);
        }
      }
    });
  }

  const orderPreview = document.getElementById("editOrderPosterPreview");
  const orderInput = document.getElementById("editOrderPoster");
  if (orderPreview && orderInput) {
    orderPreview.addEventListener("click", () => orderInput.click());
    orderInput.addEventListener("change", async function () {
      if (this.files && this.files[0]) {
        try {
          editOrderPosterData = await readFileAsDataURL(this.files[0]);
          orderPreview.src = editOrderPosterData;
        } catch (err) {
          console.error("Error reading file", err);
        }
      }
    });
  }

  const gamePreview = document.getElementById("editGamePosterPreview");
  const gameInput = document.getElementById("editGamePoster");
  if (gamePreview && gameInput) {
    gamePreview.addEventListener("click", () => gameInput.click());
    gameInput.addEventListener("change", async function () {
      if (this.files && this.files[0]) {
        try {
          editGamePosterData = await readFileAsDataURL(this.files[0]);
          gamePreview.src = editGamePosterData;
        } catch (err) {
          console.error("Error reading file", err);
        }
      }
    });
  }

  const gameEditBtn = document.getElementById("editGamePosterBtn");
  if (gameEditBtn && gamePreview) {
    gameEditBtn.addEventListener("click", async () => {
      const title = document.getElementById("editGameTitle").value.trim();
      if (!title) {
        alert("Введите название игры");
        return;
      }
      await fetchSteamGridPosters(title);
      if (!steamGridPoster) {
        alert("Постеры не найдены");
        return;
      }
      const overlay = gamePreview.parentElement.nextElementSibling;
      if (overlay && overlay.classList.contains("poster-overlay"))
        overlay.remove();
      gamePreview.src = steamGridPoster;
      editGamePosterData = steamGridPoster;
      createPosterOverlay(gamePreview, steamGridPosters, true);
    });
  }

  const playedPreview = document.getElementById("editPlayedGamePosterPreview");
  const playedInput = document.getElementById("editPlayedGamePoster");
  if (playedPreview && playedInput) {
    playedPreview.addEventListener("click", () => playedInput.click());
    playedInput.addEventListener("change", async function () {
      if (this.files && this.files[0]) {
        try {
          editPlayedGamePosterData = await readFileAsDataURL(this.files[0]);
          playedPreview.src = editPlayedGamePosterData;
        } catch (err) {
          console.error("Error reading file", err);
        }
      }
    });
  }

  const playedEditBtn = document.getElementById("editPlayedGamePosterBtn");
  if (playedEditBtn && playedPreview) {
    playedEditBtn.addEventListener("click", async () => {
      const title = document.getElementById("editPlayedGameTitle").value.trim();
      if (!title) {
        alert("Введите название игры");
        return;
      }
      await fetchSteamGridPosters(title);
      if (!steamGridPoster) {
        alert("Постеры не найдены");
        return;
      }
      const overlay = playedPreview.parentElement.nextElementSibling;
      if (overlay && overlay.classList.contains("poster-overlay"))
        overlay.remove();
      playedPreview.src = steamGridPoster;
      editPlayedGamePosterData = steamGridPoster;
      createPosterOverlay(playedPreview, steamGridPosters, true);
    });
  }
});

