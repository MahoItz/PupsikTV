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

function stringHash(value) {
  if (!value) return 0;
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash >>> 0;
}

function computeMoviesSignature(list) {
  if (!Array.isArray(list) || list.length === 0) return 0;

  let hash = list.length;
  const firstId = Number(list[0]?.id ?? 0);
  const lastId = Number(list[list.length - 1]?.id ?? 0);
  hash = (hash * 31 + firstId) >>> 0;
  hash = (hash * 31 + lastId) >>> 0;

  for (let i = 0; i < list.length; i += 1) {
    const movie = list[i];
    const rating = Number(movie?.rating ?? 0);
    const ratingSum = Number(movie?.ratingSum ?? 0);
    const ratingCount = Number(movie?.ratingCount ?? 0);
    const orderByHash = stringHash(movie?.orderBy ?? "");
    const orderTypeHash = stringHash(movie?.orderType ?? "");
    const descriptionHash = stringHash(movie?.description ?? "");
    const countryHash = stringHash(movie?.country ?? "");
    const directorHash = stringHash(movie?.director ?? "");
    const actorsHash = stringHash(
      Array.isArray(movie?.actors) ? movie.actors.join(",") : movie?.actors ?? ""
    );

    hash = (hash * 31 + Number(movie?.id ?? 0)) >>> 0;
    hash = (hash * 31 + Math.round(rating * 10)) >>> 0;
    hash = (hash * 31 + ratingSum) >>> 0;
    hash = (hash * 31 + ratingCount) >>> 0;
    hash = (hash * 31 + orderByHash) >>> 0;
    hash = (hash * 31 + orderTypeHash) >>> 0;
    hash = (hash * 31 + descriptionHash) >>> 0;
    hash = (hash * 31 + countryHash) >>> 0;
    hash = (hash * 31 + directorHash) >>> 0;
    hash = (hash * 31 + actorsHash) >>> 0;
  }

  return hash >>> 0;
}

function computeGamesSignature(list) {
  if (!Array.isArray(list) || list.length === 0) return 0;

  let hash = list.length;
  const firstId = Number(list[0]?.id ?? 0);
  const lastId = Number(list[list.length - 1]?.id ?? 0);
  hash = (hash * 31 + firstId) >>> 0;
  hash = (hash * 31 + lastId) >>> 0;

  for (let i = 0; i < list.length; i += 1) {
    const game = list[i];
    const rating = Number(game?.rating ?? 0);
    const ratingSum = Number(game?.ratingSum ?? 0);
    const ratingCount = Number(game?.ratingCount ?? 0);
    const orderByHash = stringHash(game?.orderBy ?? "");
    const orderTypeHash = stringHash(game?.orderType ?? "");

    hash = (hash * 31 + Number(game?.id ?? 0)) >>> 0;
    hash = (hash * 31 + Math.round(rating * 10)) >>> 0;
    hash = (hash * 31 + ratingSum) >>> 0;
    hash = (hash * 31 + ratingCount) >>> 0;
    hash = (hash * 31 + orderByHash) >>> 0;
    hash = (hash * 31 + orderTypeHash) >>> 0;
  }

  return hash >>> 0;
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
      .select(
        "id, roulette_last_winner, ai_model_name, ai_model, selected_ai_model, selected_ai_model_name, kp_api, victory_volume, lose_volume, spin_volume"
      )
      .order("id", { ascending: true });

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    const settingsRow =
      rows.find((item) => item?.selected_ai_model || item?.selected_ai_model_name) ||
      rows.find((item) => item?.roulette_last_winner) ||
      (rows.length > 0 ? rows[0] : null);

    settingsRowId = settingsRow?.id ?? settingsRowId;
    const remoteValue = (settingsRow?.roulette_last_winner || "").trim();
    const remoteVictoryVolume =
      clampVictoryVolume(settingsRow?.victory_volume) ?? DEFAULT_VICTORY_VOLUME;
    const remoteLoseVolume =
      clampLoseVolume(settingsRow?.lose_volume) ?? DEFAULT_LOSE_VOLUME;
    const remoteSpinVolume =
      clampRouletteSpinVolume(settingsRow?.spin_volume) ??
      DEFAULT_ROULETTE_SPIN_VOLUME;

    renderAiModelOptions(rows, settingsRow?.selected_ai_model || null);
    applyKpApiSelection(settingsRow?.kp_api || "API 1");
    applyVictoryVolume(remoteVictoryVolume);
    applyLoseVolume(remoteLoseVolume);
    applyRouletteSpinVolume(remoteSpinVolume);

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

function containerHasRenderableContent(node) {
  if (!node || !node.children || node.children.length === 0) return false;
  return Array.from(node.children).some((child) => {
    if (!child || !child.classList) return false;
    return (
      !child.classList.contains("section-loader") &&
      !child.classList.contains("empty-state")
    );
  });
}

function normalizeActorsValue(value, limit = 15) {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean).slice(0, limit);
  }
  if (typeof value === "string") {
    return value
      .split(/[,;|]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, limit);
  }
  return [];
}

// Загрузка фильмов из Supabase
async function loadMoviesFromSupabase() {
  const grid = document.getElementById("moviesGrid");
  const hasExistingContent = containerHasRenderableContent(grid);
  moviesLoading = true;
  toggleSectionLoading(grid, true, {
    message: hasExistingContent ? "Обновляем фильмы..." : "Загружаем фильмы...",
  });
  try {
    const { data, error } = await supabaseClient
      .from("movies")
      .select(
        "id, title, original_title, genres, poster, year, rating_numeric, rating_OMDB, rating_sum, rating_count, date, order_by, order_type, description, country, actors, director"
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
        description: item.description || "",
        country: item.country || "",
        actors: normalizeActorsValue(item.actors),
        director: item.director || "",
      };
    });

    const currentSignature = computeMoviesSignature(allMovies);
    const freshSignature = computeMoviesSignature(newMovies);

    if (currentSignature !== freshSignature) {
      allMovies = newMovies;
      totalMovies = allMovies.length;
      recalculateMovieUserRatings(allMovies);
      localStorage.setItem("moviesCache", JSON.stringify(newMovies));
    }
  } catch (err) {
    console.error("Error loading movies from Supabase", err);
  } finally {
    moviesLoading = false;
    toggleSectionLoading(grid, false);
    renderMovies();
  }
}

// Загрузка заказов из Supabase
async function loadWatchlistFromSupabase() {
  const container = document.getElementById("watchlistContainer");
  const hasExistingContent = containerHasRenderableContent(container);
  watchlistLoading = true;
  toggleSectionLoading(container, true, {
    message: hasExistingContent
      ? "Обновляем заказанные фильмы..."
      : "Загружаем заказанные фильмы...",
    compact: true,
  });
  try {
    const { data, error } = await supabaseClient
      .from("Movie_Orders")
      .select(
        "id, created_at, plan_date, order_title, order_origin_title, order_type, order_by, kinopoisk_rate, order_genres, order_poster, order_year, order_length, parents_guide, description, country, actors, director"
      )
      .order("id", { ascending: true });

    if (error) throw error;

    watchlist = data.map((item) => {
      let parentGuide = item.parents_guide ?? null;
      if (typeof parentGuide === "string") {
        try {
          parentGuide = JSON.parse(parentGuide);
        } catch (err) {
          parentGuide = null;
        }
      }

      return {
      id: item.id,
      title: item.order_title,
      originalTitle: item.order_origin_title,
      genres: item.order_genres,
      poster: item.order_poster,
      year: item.order_year || "",
      length: item.order_length || null,
      planDate: item.plan_date || null,
      kpRating: item.kinopoisk_rate,
      kinopoiskId: extractKinopoiskIdFromValue(item.order_poster),
      orderBy: item.order_by && item.order_by !== "null" ? item.order_by : "",
      orderType: item.order_type,
      dateAdded: item.created_at,
      parentGuide,
      parentGuideStatus: parentGuide ? "ready" : null,
      parentGuideError: null,
      description: item.description || "",
      country: item.country || "",
      actors: normalizeActorsValue(item.actors),
      director: item.director || "",
      };
    });
  } catch (err) {
    console.error("Error loading watchlist from Supabase", err);
  } finally {
    watchlistLoading = false;
    toggleSectionLoading(container, false);
    renderWatchlist();
  }
}

// Загрузка заказанных игр из Supabase
async function loadGamesFromSupabase() {
  const container = document.getElementById("gamesContainer");
  const hasExistingContent = containerHasRenderableContent(container);
  gameOrdersLoading = true;
  toggleSectionLoading(container, true, {
    message: hasExistingContent
      ? "Обновляем заказанные игры..."
      : "Загружаем заказанные игры...",
    compact: true,
  });
  try {
    const { data, error } = await supabaseClient
      .from("Game_Orders")
      .select(
        "id, created_at, game_title, game_order_type, game_order_by, game_genres, game_poster, game_year, game_plan_date"
      )
      .order("id", { ascending: true });

    if (error) throw error;

    gameOrders = data.map((item) => ({
      id: item.id,
      title: item.game_title,
      genres: item.game_genres,
      poster: item.game_poster,
      year: item.game_year || "",
      planDate: item.game_plan_date || null,
      orderBy:
        item.game_order_by && item.game_order_by !== "null"
          ? item.game_order_by
          : "",
      orderType: item.game_order_type,
      dateAdded: item.created_at,
    }));

  } catch (err) {
    console.error("Error loading game orders from Supabase", err);
  } finally {
    gameOrdersLoading = false;
    toggleSectionLoading(container, false);
    renderGames();
  }
}

// Загрузка пройденных игр из Supabase
async function loadPlayedGamesFromSupabase() {
  const grid = document.getElementById("gamesGridPlayed");
  const hasExistingContent = containerHasRenderableContent(grid);
  playedGamesLoading = true;
  toggleSectionLoading(grid, true, {
    message: hasExistingContent
      ? "Обновляем библиотеку игр..."
      : "Загружаем пройденные игры...",
  });
  try {
    const { data, error } = await supabaseClient
      .from("games")
      .select(
        "id, title, genres, poster, year, rating_numeric, date, order_by, order_type, game_rating_sum, game_rating_count"
      )
      .order("id", { ascending: false });

    if (error) throw error;

    const newPlayedGames = data.map((item) => {
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
    const currentSignature = computeGamesSignature(allPlayedGames);
    const freshSignature = computeGamesSignature(newPlayedGames);

    if (currentSignature !== freshSignature) {
      allPlayedGames = newPlayedGames;
      totalGamesPlayed = allPlayedGames.length;
      recalculateGameUserRatings(allPlayedGames);
      localStorage.setItem("gamesCache", JSON.stringify(allPlayedGames));
    }
  } catch (err) {
    console.error("Error loading played games", err);
  } finally {
    playedGamesLoading = false;
    toggleSectionLoading(grid, false);
    renderPlayedGames();
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

  TMDB_ENABLED = Boolean(initialEnv.TMDB_ENABLED);

  const kpStored = localStorage.getItem("KINOPOISK_API_KEY");
  if (kpStored) {
    kpApiPrimaryKey = kpStored;
  }
  const kpStoredSecondary = localStorage.getItem("KINOPOISK_API_KEY2");
  if (kpStoredSecondary) {
    kpApiSecondaryKey = kpStoredSecondary;
  }
  const kpStoredTertiary = localStorage.getItem("KINOPOISK_API_KEY3");
  if (kpStoredTertiary) {
    kpApiTertiaryKey = kpStoredTertiary;
  }
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

  settingsPanel = document.getElementById("settingsPanel");
  settingsToggleButton = document.getElementById("settingsToggleButton");
  settingsPanelCloseButton = document.getElementById("settingsPanelCloseButton");
  aiModelSelect = document.getElementById("aiModelSelect");
  aiModelStatus = document.getElementById("aiModelStatus");
  kpApiSelect = document.getElementById("kpApiSelect");
  kpApiStatus = document.getElementById("kpApiStatus");
  victoryVolumeSlider = document.getElementById("victoryVolumeSlider");
  victoryVolumeValue = document.getElementById("victoryVolumeValue");
  loseVolumeSlider = document.getElementById("loseVolumeSlider");
  loseVolumeValue = document.getElementById("loseVolumeValue");
  rouletteSpinVolumeSlider = document.getElementById(
    "rouletteSpinVolumeSlider"
  );
  rouletteSpinVolumeValue = document.getElementById(
    "rouletteSpinVolumeValue"
  );

  if (settingsToggleButton && settingsPanel) {
    settingsToggleButton.addEventListener("click", () => toggleSettingsPanel());
    settingsToggleButton.setAttribute("aria-expanded", "false");
  }
  if (settingsPanelCloseButton) {
    settingsPanelCloseButton.addEventListener("click", closeSettingsPanel);
  }
  if (aiModelSelect) {
    aiModelSelect.addEventListener("change", handleAiModelChange);
  }
  if (kpApiSelect) {
    kpApiSelect.addEventListener("change", handleKpApiChange);
  }
  applyVictoryVolume(victoryVolume);
  if (victoryVolumeSlider) {
    victoryVolumeSlider.addEventListener("input", handleVictoryVolumeInput);
    victoryVolumeSlider.addEventListener("change", handleVictoryVolumeChange);
  }
  applyLoseVolume(loseVolume);
  if (loseVolumeSlider) {
    loseVolumeSlider.addEventListener("input", handleLoseVolumeInput);
    loseVolumeSlider.addEventListener("change", handleLoseVolumeChange);
  }
  applyRouletteSpinVolume(rouletteSpinVolume);
  if (rouletteSpinVolumeSlider) {
    rouletteSpinVolumeSlider.addEventListener(
      "input",
      handleRouletteSpinVolumeInput
    );
    rouletteSpinVolumeSlider.addEventListener(
      "change",
      handleRouletteSpinVolumeChange
    );
  }

  adminElements = Array.from(document.querySelectorAll(".admin-only"));
  hideAdminControls(true);

  applyKpApiSelection(selectedKpApiValue);

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
            kpApiPrimaryKey = env.KINOPOISK_API_KEY;
            localStorage.setItem("KINOPOISK_API_KEY", env.KINOPOISK_API_KEY);
          }
          if (env.KINOPOISK_API_KEY2) {
            kpApiSecondaryKey = env.KINOPOISK_API_KEY2;
            localStorage.setItem("KINOPOISK_API_KEY2", env.KINOPOISK_API_KEY2);
          }
          if (env.KINOPOISK_API_KEY3) {
            kpApiTertiaryKey = env.KINOPOISK_API_KEY3;
            localStorage.setItem("KINOPOISK_API_KEY3", env.KINOPOISK_API_KEY3);
          }
          TMDB_ENABLED = Boolean(env.TMDB_ENABLED);
          if (env.RAWG_API_KEY) {
            localStorage.setItem("RAWG_API_KEY", env.RAWG_API_KEY);
          }
          applyKpApiSelection(selectedKpApiValue);
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
  const headerImg = document.querySelector("#headerLogo img");
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
                kpApiPrimaryKey = env.KINOPOISK_API_KEY;
                localStorage.setItem(
                  "KINOPOISK_API_KEY",
                  env.KINOPOISK_API_KEY
                );
              }
              if (env.KINOPOISK_API_KEY2) {
                kpApiSecondaryKey = env.KINOPOISK_API_KEY2;
                localStorage.setItem(
                  "KINOPOISK_API_KEY2",
                  env.KINOPOISK_API_KEY2
                );
              }
              if (env.KINOPOISK_API_KEY3) {
                kpApiTertiaryKey = env.KINOPOISK_API_KEY3;
                localStorage.setItem(
                  "KINOPOISK_API_KEY3",
                  env.KINOPOISK_API_KEY3
                );
              }
              TMDB_ENABLED = Boolean(env.TMDB_ENABLED);
              if (env.RAWG_API_KEY) {
                localStorage.setItem("RAWG_API_KEY", env.RAWG_API_KEY);
              }
              applyKpApiSelection(selectedKpApiValue);
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
  const twitchConnectBtn = document.getElementById("adminTwitchConnectBtn");
  if (twitchConnectBtn) {
    twitchConnectBtn.addEventListener("click", startTwitchAdminConnect);
  }
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
