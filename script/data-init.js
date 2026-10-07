// ---------- File upload helpers ----------

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
    // Include catalog metadata so edits also refresh the displayed data and cache.
    const metadataHash = stringHash(
      JSON.stringify([
        movie?.title,
        movie?.originalTitle,
        movie?.poster,
        movie?.year,
        movie?.genre,
        movie?.kpRating,
        movie?.dateAdded,
        movie?.kinopoiskId,
        movie?.imdbId,
      ])
    );
    const rating = Number(movie?.rating ?? 0);
    const ratingSum = Number(movie?.ratingSum ?? 0);
    const ratingCount = Number(movie?.ratingCount ?? 0);
    const orderByHash = stringHash(movie?.orderBy ?? "");
    const orderTypeHash = stringHash(movie?.orderType ?? "");
    const descriptionHash = stringHash(movie?.description ?? "");
    const countryHash = stringHash(movie?.country ?? "");
    const directorHash = stringHash(movie?.director ?? "");
    const watchSourceHash = stringHash(movie?.watchSource ?? "");
    const actorsHash = stringHash(
      Array.isArray(movie?.actors) ? movie.actors.join(",") : movie?.actors ?? ""
    );
    const studiosHash = stringHash(
      typeof movie?.studios === "object"
        ? JSON.stringify(movie.studios)
        : movie?.studios ?? ""
    );

    hash = (hash * 31 + Number(movie?.id ?? 0)) >>> 0;
    hash = (hash * 31 + metadataHash) >>> 0;
    hash = (hash * 31 + Math.round(rating * 10)) >>> 0;
    hash = (hash * 31 + ratingSum) >>> 0;
    hash = (hash * 31 + ratingCount) >>> 0;
    hash = (hash * 31 + orderByHash) >>> 0;
    hash = (hash * 31 + orderTypeHash) >>> 0;
    hash = (hash * 31 + descriptionHash) >>> 0;
    hash = (hash * 31 + countryHash) >>> 0;
    hash = (hash * 31 + directorHash) >>> 0;
    hash = (hash * 31 + watchSourceHash) >>> 0;
    hash = (hash * 31 + actorsHash) >>> 0;
    hash = (hash * 31 + studiosHash) >>> 0;
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
    const gameModeHash = stringHash(game?.gameMode ?? "");
    const posterHash = stringHash(game?.poster ?? "");
    const descriptionValue =
      typeof game?.description === "string"
        ? game.description
        : game?.description && typeof game.description === "object"
          ? JSON.stringify(game.description)
          : "";
    const descriptionHash = stringHash(descriptionValue);

    hash = (hash * 31 + Number(game?.id ?? 0)) >>> 0;
    hash = (hash * 31 + Math.round(rating * 10)) >>> 0;
    hash = (hash * 31 + ratingSum) >>> 0;
    hash = (hash * 31 + ratingCount) >>> 0;
    hash = (hash * 31 + orderByHash) >>> 0;
    hash = (hash * 31 + orderTypeHash) >>> 0;
    hash = (hash * 31 + gameModeHash) >>> 0;
    hash = (hash * 31 + posterHash) >>> 0;
    hash = (hash * 31 + descriptionHash) >>> 0;
  }

  return hash >>> 0;
}

function hasRatedGame(id) {
  return Object.prototype.hasOwnProperty.call(ratedGames, id);
}

let loadedSettingsRows = null;

async function loadSettingsFromSupabase() {
  if (!supabaseClient) {
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("settings")
      .select(
        "id, roulette_last_winner, ai_model_name, ai_model, selected_ai_model, selected_ai_model_name, kp_api, victory_volume, lose_volume, spin_volume, ai_model_statuses"
      )
      .order("id", { ascending: true });

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    loadedSettingsRows = rows;
    const settingsRow =
      rows.find((item) => item?.selected_ai_model || item?.selected_ai_model_name) ||
      rows.find((item) => item?.roulette_last_winner) ||
      (rows.length > 0 ? rows[0] : null);

    settingsRowId = settingsRow?.id ?? settingsRowId;

    // Load AI Model Statuses if they exist
    if (settingsRow?.ai_model_statuses) {
      aiModelStatuses = settingsRow.ai_model_statuses;
      console.log("AI model statuses loaded from database:", aiModelStatuses);
    }

    const remoteValue = (settingsRow?.roulette_last_winner || "").trim();
    const remoteVictoryVolume =
      clampVictoryVolume(settingsRow?.victory_volume) ?? DEFAULT_VICTORY_VOLUME;
    const remoteLoseVolume =
      clampLoseVolume(settingsRow?.lose_volume) ?? DEFAULT_LOSE_VOLUME;
    const remoteSpinVolume =
      clampRouletteSpinVolume(settingsRow?.spin_volume) ??
      DEFAULT_ROULETTE_SPIN_VOLUME;

    if (typeof renderAiModelOptions === "function") {
      renderAiModelOptions(rows, settingsRow?.selected_ai_model || null);
    }
    applyKpApiSelection(settingsRow?.kp_api || "API 1");
    applyVictoryVolume(remoteVictoryVolume);
    applyLoseVolume(remoteLoseVolume);
    applyRouletteSpinVolume(remoteSpinVolume);

    if (rouletteLastWinnerHasPendingSync) {
      const pending = rouletteLastWinnerPendingValue;
      rouletteLastWinner = (pending ?? "").trim();
      await persistRouletteLastWinner(pending);
      syncRouletteAutofillState();
      return true;
    }

    rouletteLastWinner = "";
    rouletteAutofillActive = false;
    toggleRouletteAutofillVisibility(false);

    if (remoteValue) {
      persistRouletteLastWinner(null);
    }
    return true;
  } catch (err) {
    console.error("Error loading settings from Supabase", err);
    return false;
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
  moviesLoading = !hasExistingContent;
  toggleSectionLoading(grid, moviesLoading, {
    message: hasExistingContent ? "Обновляем фильмы..." : "Загружаем фильмы...",
  });
  try {
    const { data, error } = await supabaseClient
      .from("movies")
      .select(
        "id, title, original_title, genres, poster, year, rating_numeric, rating_OMDB, rating_sum, rating_count, date, order_by, order_type, description, country, actors, director, kp_id, imdb_id, studios, watch_source"
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
        kinopoiskId: item.kp_id || null,
        imdbId: item.imdb_id || null,
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
        studios: item.studios || null,
        watchSource: normalizeWatchSource(item.watch_source),
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
    return true;
  } catch (err) {
    console.error("Error loading movies from Supabase", err);
    return false;
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
        "id, created_at, plan_date, order_title, order_origin_title, order_type, order_by, kinopoisk_rate, order_genres, order_poster, order_year, order_length, parents_guide, description, country, actors, director, kp_id, imdb_id, studios, watch_source"
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
        kinopoiskId:
          item.kp_id || extractKinopoiskIdFromValue(item.order_poster),
        imdbId: item.imdb_id || null,
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
        studios: item.studios || null,
        watchSource: normalizeWatchSource(item.watch_source),
      };
    });
    return true;
  } catch (err) {
    console.error("Error loading watchlist from Supabase", err);
    return false;
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
        "id, created_at, game_title, game_order_type, game_order_by, game_mode, game_genres, game_poster, game_year, game_plan_date, description, rawg_rating, metacritic, released, playtime, playtime_hastily, playtime_normally, playtime_completely, playtime_count, platforms, developers, publishers, rawg_id, streams_completed"
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
      gameMode: normalizeGameMode(item.game_mode),
      dateAdded: item.created_at,
      description: item.description || "",
      rating: item.rawg_rating || null, // Using 'rating' to align with movie structure for generic usage if needed
      metacritic: item.metacritic || null,
      released: item.released || null,
      playtime: item.playtime || null,
      playtimeHastily: item.playtime_hastily ?? null,
      playtimeNormally: item.playtime_normally ?? null,
      playtimeCompletely: item.playtime_completely ?? null,
      playtimeCount: item.playtime_count ?? null,
      platforms: item.platforms || "",
      developers: item.developers || "",
      publishers: item.publishers || "",
      rawgId: item.rawg_id || null,
      streamsCompleted: Math.min(
        3,
        Math.max(0, Number.parseInt(item.streams_completed, 10) || 0)
      ),
    }));

    return true;
  } catch (err) {
    console.error("Error loading game orders from Supabase", err);
    return false;
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
  playedGamesLoading = !hasExistingContent;
  toggleSectionLoading(grid, playedGamesLoading, {
    message: hasExistingContent
      ? "Обновляем библиотеку игр..."
      : "Загружаем пройденные игры...",
  });
  try {
    const { data, error } = await supabaseClient
      .from("games")
      .select(
        "id, title, genres, poster, year, rating_numeric, date, order_by, order_type, game_mode, game_rating_sum, game_rating_count, description, rawg_rating, metacritic, released, playtime, playtime_hastily, playtime_normally, playtime_completely, playtime_count, platforms, developers, publishers, rawg_id"
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
        gameMode: normalizeGameMode(item.game_mode),
        description: item.description || "",
        rawgRating: item.rawg_rating ?? null,
        metacritic: item.metacritic ?? null,
        released: item.released ?? null,
        playtime: item.playtime ?? null,
        playtimeHastily: item.playtime_hastily ?? null,
        playtimeNormally: item.playtime_normally ?? null,
        playtimeCompletely: item.playtime_completely ?? null,
        playtimeCount: item.playtime_count ?? null,
        platforms: item.platforms || "",
        developers: item.developers || "",
        publishers: item.publishers || "",
        rawgId: item.rawg_id ?? null,
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
    return true;
  } catch (err) {
    console.error("Error loading played games", err);
    return false;
  } finally {
    playedGamesLoading = false;
    toggleSectionLoading(grid, false);
    renderPlayedGames();
  }
}

// Инициализация
// Share in-flight requests and keep successful catalogs until the page reloads.
const catalogLoadRequests = new Map();
const restoredCatalogCaches = new Set();

function restoreCatalogCache(catalog) {
  const cacheKey = catalog === "movies" ? "moviesCache"
    : catalog === "playedGames" ? "gamesCache" : null;
  if (!cacheKey || restoredCatalogCaches.has(catalog)) return;
  // Restore synchronously, once per tab, before any API/client availability check.
  // Retrying a failed refresh must not replace edits with an older cached snapshot.
  restoredCatalogCaches.add(catalog);
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (!Array.isArray(cached)) return;
    if (catalog === "movies") {
      allMovies = cached;
      totalMovies = cached.length;
      recalculateMovieUserRatings();
      renderMovies();
    } else {
      allPlayedGames = cached;
      totalGamesPlayed = cached.length;
      recalculateGameUserRatings();
      renderPlayedGames();
    }
  } catch (error) {
    console.warn("Unable to restore catalog cache", error);
  }
}

function ensureCatalogLoaded(catalog) {
  restoreCatalogCache(catalog);
  if (catalogLoadRequests.has(catalog)) return catalogLoadRequests.get(catalog);
  const loaders = {
    movies: loadMoviesFromSupabase,
    playedGames: loadPlayedGamesFromSupabase,
    watchlist: loadWatchlistFromSupabase,
    games: loadGamesFromSupabase,
    settings: loadSettingsFromSupabase,
  };
  if (!supabaseClient || !loaders[catalog]) return Promise.resolve(false);
  const request = Promise.resolve().then(async () => {
    try {
      const loaded = await loaders[catalog]();
      if (!loaded) catalogLoadRequests.delete(catalog);
      return loaded;
    } catch (error) {
      catalogLoadRequests.delete(catalog);
      console.error("Unable to load catalog", error);
      return false;
    }
  });
  catalogLoadRequests.set(catalog, request);
  return request;
}

function getActiveCatalog() {
  return window.innerWidth <= 768 && activeTab !== "movies"
    ? activeTab : activeListTab === "games" ? "playedGames" : "movies";
}

function loadActiveCatalog() {
  return ensureCatalogLoaded(getActiveCatalog());
}

function initVisibleCatalogLoading() {
  void loadActiveCatalog();
  // Desktop order columns have no tabs; fetch them when they enter the viewport.
  if (typeof IntersectionObserver !== "function") {
    if (window.innerWidth > 768) {
      void ensureCatalogLoaded("watchlist");
      void ensureCatalogLoaded("games");
    }
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const catalog = entry.target.id === "watchlistSection" ? "watchlist" : "games";
        void ensureCatalogLoaded(catalog).then((loaded) => {
          if (loaded) observer.unobserve(entry.target);
        });
      }
    }
  });
  for (const id of ["watchlistSection", "gamesSection"]) {
    const section = document.getElementById(id);
    if (section) observer.observe(section);
  }
}

document.addEventListener("DOMContentLoaded", async function () {
  localStorage.removeItem("KINOPOISK_API_KEY");
  localStorage.removeItem("KINOPOISK_API_KEY2");
  localStorage.removeItem("KINOPOISK_API_KEY3");
  localStorage.removeItem("RAWG_API_KEY");
  const ratedStored = localStorage.getItem("ratedMovies");
  if (ratedStored) {
    ratedMovies = JSON.parse(ratedStored);
  }
  const ratedGamesStored = localStorage.getItem("ratedGames");
  if (ratedGamesStored) {
    ratedGames = JSON.parse(ratedGamesStored);
  }
  ratingTooltip = document.createElement("div");
  ratingTooltip.className = "rating-tooltip";
  document.body.appendChild(ratingTooltip);

  if (typeof initTopLeftActionsMenu === "function") {
    initTopLeftActionsMenu();
  }

  if (typeof setupOrderPlayerFullscreenHandling === "function") {
    setupOrderPlayerFullscreenHandling();
  }

  adminElements = Array.from(document.querySelectorAll(".admin-only"));
  hideAdminControls(true);

  applyKpApiSelection(selectedKpApiValue);

  updateTabVisibility();
  updateListVisibility();
  restoreCatalogCache(getActiveCatalog());

  // Public data must not wait for the Edge Function or admin verification.
  // Keep these sequential in the background so public settings cannot overwrite
  // restored admin settings when the public request finishes late.
  const hadCatalogClient = Boolean(supabaseClient);
  void loadEnv()
    .then((env) => {
      TMDB_ENABLED = Boolean(env.TMDB_ENABLED);
      // Retry if the public client only became available through configuration.
      if (!hadCatalogClient) void loadActiveCatalog();
    })
    .catch((err) => console.warn("Server settings unavailable; public data can still load", err))
    .then(() => restoreAdminSession())
    .catch((err) => console.warn("Failed to restore admin session", err));

  recalculateMovieUserRatings();
  recalculateGameUserRatings();

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
    img.src = "images/sort_arrow.webp";
    img.alt = "";
    img.className = "sort-arrow";
    if (sortAscending) {
      img.classList.add("is-desc");
    }

    orderBtn.replaceChildren(img);
  }

  const gameOrderBtn = document.getElementById("gameSortOrderBtn");
  if (gameOrderBtn) {
    const img = document.createElement("img");
    img.src = "images/sort_arrow.webp";
    img.alt = "";
    img.className = "sort-arrow";
    if (gameSortAscending) {
      img.classList.add("is-desc");
    }
    gameOrderBtn.replaceChildren(img);
  }

  initVisibleCatalogLoading();
  const headerImg = document.querySelector("#headerLogo .header-mouse");
  if (headerImg)
    headerImg.addEventListener("click", () => {
      document.getElementById("adminModal").style.display = "block";
    });
  if (!supabaseClient) {
    showFatalErrorBanner(
      "От сервера не получены настройки Supabase. Попробуйте обновить страницу позже."
    );
  }
});
