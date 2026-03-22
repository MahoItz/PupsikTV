(function () {
  const SUPABASE_URL = "https://shwekurmzyzivtworjup.supabase.co";
  const API_BASE_PATH = "/api";
  const MOVIE_RATING_MAX = 11;
  const LEADERBOARD_LIMIT = 10;
  const ENV_TIMEOUT_MS = 12000;
  const DATA_TIMEOUT_MS = 20000;

  function buildApiPath(path) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${API_BASE_PATH}${normalizedPath}`;
  }

  function showError(message) {
    const errorBox = document.getElementById("statsError");
    const loading = document.getElementById("statsLoading");
    const content = document.getElementById("statsContent");
    setElementVisibility(loading, false);
    setElementVisibility(content, false);
    if (errorBox) {
      setElementVisibility(errorBox, true);
      errorBox.textContent = message;
    }
  }

  function hideLoading() {
    const loading = document.getElementById("statsLoading");
    setElementVisibility(loading, false);
  }

  function setElementVisibility(element, visible) {
    if (!element) return;
    element.hidden = !visible;
    element.setAttribute("aria-hidden", visible ? "false" : "true");
    element.style.display = visible ? "" : "none";
  }

  function withTimeout(promise, timeoutMs, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        window.setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  }

  function normalizeOrderType(value) {
    if (typeof value !== "string") return "Не указан";
    const normalized = value.trim();
    if (!normalized) return "Не указан";
    const lowered = normalized.toLowerCase();
    if (lowered === "null" || lowered === "undefined") return "Не указан";
    return normalized;
  }

  function normalizeOrderBy(value) {
    if (typeof value !== "string") return null;
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized || normalized.toLowerCase() === "null") return null;
    return normalized;
  }

  function toSafeNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function clampRatingBucket(value) {
    const numeric = toSafeNumber(value);
    if (numeric === null) return null;
    if (numeric < 0 || numeric > MOVIE_RATING_MAX) return null;
    return Math.round(numeric);
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("ru-RU").format(value);
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("ru-RU", {
      dateStyle: "long",
      timeStyle: "short",
    }).format(value);
  }

  async function loadEnv() {
    const response = await withTimeout(
      fetch(buildApiPath("/env"), {
        headers: {
          Accept: "application/json",
        },
      }),
      ENV_TIMEOUT_MS,
      "ENV request"
    );

    if (!response.ok) {
      throw new Error(`ENV request failed: ${response.status}`);
    }

    const payload = await response.json();
    if (!payload?.SUPABASE_KEY) {
      throw new Error("SUPABASE_KEY is missing in env response.");
    }

    return payload;
  }

  async function loadStatsData(client) {
    const [
      moviesResult,
      movieOrdersResult,
      gamesResult,
      gameOrdersResult,
    ] = await withTimeout(
      Promise.all([
        client
          .from("movies")
          .select("id, rating_numeric, order_by, order_type, date"),
        client
          .from("Movie_Orders")
          .select("id, order_by, order_type, created_at"),
        client
          .from("games")
          .select("id, rating_numeric, order_by, order_type, date"),
        client
          .from("Game_Orders")
          .select("id, game_order_by, game_order_type, created_at"),
      ]),
      DATA_TIMEOUT_MS,
      "Stats data request"
    );

    const results = [
      moviesResult,
      movieOrdersResult,
      gamesResult,
      gameOrdersResult,
    ];

    const failedResult = results.find((result) => result.error);
    if (failedResult?.error) {
      throw failedResult.error;
    }

    return {
      movies: moviesResult.data || [],
      movieOrders: movieOrdersResult.data || [],
      games: gamesResult.data || [],
      gameOrders: gameOrdersResult.data || [],
    };
  }

  function buildOrderTypeCounts(entries, key) {
    const counts = new Map();
    for (const entry of entries) {
      const type = normalizeOrderType(entry?.[key]);
      counts.set(type, (counts.get(type) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }

  function buildRatingDistribution(movies) {
    const counts = new Map();
    for (let rating = MOVIE_RATING_MAX; rating >= 0; rating -= 1) {
      counts.set(rating, 0);
    }

    for (const movie of movies) {
      const bucket = clampRatingBucket(movie?.rating_numeric);
      if (bucket === null) continue;
      counts.set(bucket, (counts.get(bucket) || 0) + 1);
    }

    return [...counts.entries()].sort((a, b) => b[0] - a[0]);
  }

  function buildLeaders(movieEntries, gameEntries) {
    const combined = new Map();

    function append(entries, type) {
      for (const entry of entries) {
        const person = normalizeOrderBy(entry.orderBy);
        if (!person) continue;

        const existing = combined.get(person) || {
          name: person,
          movies: 0,
          games: 0,
          total: 0,
        };

        existing.total += 1;
        existing[type] += 1;
        combined.set(person, existing);
      }
    }

    append(movieEntries, "movies");
    append(gameEntries, "games");

    const ranked = [...combined.values()].sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      if (b.movies !== a.movies) return b.movies - a.movies;
      return a.name.localeCompare(b.name, "ru");
    });

    return {
      total: ranked.slice(0, LEADERBOARD_LIMIT),
      movies: [...ranked]
        .sort((a, b) => (b.movies !== a.movies ? b.movies - a.movies : b.total - a.total))
        .filter((entry) => entry.movies > 0)
        .slice(0, LEADERBOARD_LIMIT),
      games: [...ranked]
        .sort((a, b) => (b.games !== a.games ? b.games - a.games : b.total - a.total))
        .filter((entry) => entry.games > 0)
        .slice(0, LEADERBOARD_LIMIT),
      totalUnique: ranked.length,
    };
  }

  function computeStats({ movies, movieOrders, games, gameOrders }) {
    const movieHistory = [
      ...movies.map((item) => ({
        orderBy: item.order_by,
        orderType: item.order_type,
      })),
      ...movieOrders.map((item) => ({
        orderBy: item.order_by,
        orderType: item.order_type,
      })),
    ];

    const gameHistory = [
      ...games.map((item) => ({
        orderBy: item.order_by,
        orderType: item.order_type,
      })),
      ...gameOrders.map((item) => ({
        orderBy: item.game_order_by,
        orderType: item.game_order_type,
      })),
    ];

    const movieTypeCounts = buildOrderTypeCounts(movieHistory, "orderType");
    const gameTypeCounts = buildOrderTypeCounts(gameHistory, "orderType");
    const combinedTypeCounts = buildOrderTypeCounts(
      [...movieHistory, ...gameHistory],
      "orderType"
    );
    const leaders = buildLeaders(movieHistory, gameHistory);
    const ratingDistribution = buildRatingDistribution(movies);

    const movieOrdersWithoutName = movieHistory.filter(
      (entry) => !normalizeOrderBy(entry.orderBy)
    ).length;
    const gameOrdersWithoutName = gameHistory.filter(
      (entry) => !normalizeOrderBy(entry.orderBy)
    ).length;

    const ratingsCount = ratingDistribution.reduce(
      (sum, [, count]) => sum + count,
      0
    );
    const topMovieRating = ratingDistribution.reduce((best, current) => {
      const [bestRating, bestCount] = best || [null, -1];
      const [currentRating, currentCount] = current;
      if (currentCount > bestCount) return current;
      if (currentCount === bestCount && currentCount > 0 && currentRating > bestRating) {
        return current;
      }
      return best;
    }, null);
    const averageMovieRating = ratingsCount
      ? (
          movies.reduce((sum, movie) => {
            const value = toSafeNumber(movie.rating_numeric);
            return value === null ? sum : sum + value;
          }, 0) / ratingsCount
        ).toFixed(2)
      : "0.00";

    return {
      overview: [
        {
          label: "Фильмов в базе",
          value: movies.length,
          meta: `${movieOrders.length} ещё ожидают просмотра`,
        },
        {
          label: "История заказов фильмов",
          value: movieHistory.length,
          meta: "включая завершённые и ожидающие",
        },
        {
          label: "История заказов игр",
          value: gameHistory.length,
          meta: `${games.length} пройдено, ${gameOrders.length} в ожидании`,
        },
        {
          label: "Уникальных заказчиков",
          value: leaders.totalUnique,
          meta: "без пустых или сломанных ников",
        },
      ],
      ratingDistribution,
      orderTypeGroups: [
        { title: "Фильмы", items: movieTypeCounts },
        { title: "Игры", items: gameTypeCounts },
        { title: "Общий итог", items: combinedTypeCounts },
      ],
      leaderboards: [
        {
          title: "Общий топ",
          items: leaders.total.map((entry) => ({
            name: entry.name,
            value: `${formatNumber(entry.total)} заказов`,
          })),
        },
        {
          title: "Топ по фильмам",
          items: leaders.movies.map((entry) => ({
            name: entry.name,
            value: `${formatNumber(entry.movies)} фильмов`,
          })),
        },
        {
          title: "Топ по играм",
          items: leaders.games.map((entry) => ({
            name: entry.name,
            value: `${formatNumber(entry.games)} игр`,
          })),
        },
      ],
      highlights: [
        {
          title: "По фильмам",
          items: [
            {
              label: "Оценённых фильмов",
              value: formatNumber(ratingsCount),
            },
            {
              label: "Средняя оценка",
              value: averageMovieRating,
            },
            {
              label: topMovieRating
                ? `Самый частый рейтинг: ${topMovieRating[0]}`
                : "Самый частый рейтинг",
              value: topMovieRating ? formatNumber(topMovieRating[1]) : "0",
            },
          ],
        },
        {
          title: "По заказам",
          items: [
            {
              label: "Фильмов через донат",
              value: formatNumber(
                movieHistory.filter(
                  (entry) => normalizeOrderType(entry.orderType) === "Донат"
                ).length
              ),
            },
            {
              label: "Фильмов за баллы",
              value: formatNumber(
                movieHistory.filter(
                  (entry) =>
                    normalizeOrderType(entry.orderType) === "Баллы канала"
                ).length
              ),
            },
            {
              label: "Игр всего заказано",
              value: formatNumber(gameHistory.length),
            },
          ],
        },
        {
          title: "Чистота данных",
          items: [
            {
              label: "Заказы фильмов без ника",
              value: formatNumber(movieOrdersWithoutName),
            },
            {
              label: "Заказы игр без ника",
              value: formatNumber(gameOrdersWithoutName),
            },
            {
              label: "Неуказанный тип заказа",
              value: formatNumber(
                [...movieHistory, ...gameHistory].filter(
                  (entry) => normalizeOrderType(entry.orderType) === "Не указан"
                ).length
              ),
            },
          ],
        },
      ],
    };
  }

  function renderOverview(items) {
    const container = document.getElementById("statsOverview");
    if (!container) return;

    container.innerHTML = items
      .map(
        (item) => `
          <article class="stats-card">
            <div class="stats-card__label">${item.label}</div>
            <div class="stats-card__value">${formatNumber(item.value)}</div>
            <div class="stats-card__meta">${item.meta}</div>
          </article>
        `
      )
      .join("");
  }

  function renderRatingDistribution(distribution) {
    const container = document.getElementById("movieRatingDistribution");
    if (!container) return;

    const maxValue = distribution.reduce(
      (max, [, count]) => Math.max(max, count),
      0
    );

    container.innerHTML = distribution
      .map(([rating, count]) => {
        const width = maxValue ? Math.max((count / maxValue) * 100, count ? 4 : 0) : 0;
        return `
          <div class="stats-bar">
            <span class="stats-bar__label">${rating}</span>
            <div class="stats-bar__track">
              <div class="stats-bar__fill" style="width:${width}%"></div>
            </div>
            <span class="stats-bar__value">${formatNumber(count)}</span>
          </div>
        `;
      })
      .join("");
  }

  function renderBreakdown(groups) {
    const container = document.getElementById("orderTypeBreakdown");
    if (!container) return;

    container.innerHTML = groups
      .map((group) => {
        const itemsMarkup = group.items.length
          ? group.items
              .map(
                ([label, value]) => `
                  <div class="stats-breakdown-item">
                    <span>${label}</span>
                    <strong class="stats-breakdown-item__value">${formatNumber(
                      value
                    )}</strong>
                  </div>
                `
              )
              .join("")
          : '<p class="stats-empty">Данных пока нет.</p>';

        return `
          <article class="stats-breakdown-card">
            <h3>${group.title}</h3>
            <div class="stats-breakdown-list">${itemsMarkup}</div>
          </article>
        `;
      })
      .join("");
  }

  function renderLeaderboards(groups) {
    const container = document.getElementById("leaderboards");
    if (!container) return;

    container.innerHTML = groups
      .map((group) => {
        const itemsMarkup = group.items.length
          ? group.items
              .map(
                (item, index) => `
                  <div class="leaderboard-item${index < 3 ? ` leaderboard-item--top-${index + 1}` : ""}">
                    <span class="leaderboard-item__rank leaderboard-item__rank--${index + 1}">${index + 1}</span>
                    <span class="leaderboard-item__name">${item.name}</span>
                    <strong class="leaderboard-item__value">${item.value}</strong>
                  </div>
                `
              )
              .join("")
          : '<p class="stats-empty">Данных пока нет.</p>';

        return `
          <article class="leaderboard-card">
            <h3>${group.title}</h3>
            <div class="leaderboard-list">${itemsMarkup}</div>
          </article>
        `;
      })
      .join("");
  }

  function renderHighlights(groups) {
    const container = document.getElementById("statsHighlights");
    if (!container) return;

    container.innerHTML = groups
      .map((group) => {
        const itemsMarkup = group.items
          .map(
            (item) => `
              <div class="stats-highlight-item">
                <span>${item.label}</span>
                <strong class="stats-highlight-item__value">${item.value}</strong>
              </div>
            `
          )
          .join("");

        return `
          <article class="stats-highlight-card">
            <h3>${group.title}</h3>
            <div class="stats-highlight-list">${itemsMarkup}</div>
          </article>
        `;
      })
      .join("");
  }

  async function initStatsPage() {
    try {
      if (!window.supabase?.createClient) {
        throw new Error("Supabase client library is unavailable.");
      }

      const env = await loadEnv();
      const client = window.supabase.createClient(SUPABASE_URL, env.SUPABASE_KEY);
      const data = await loadStatsData(client);
      const stats = computeStats(data);

      renderOverview(stats.overview);
      renderRatingDistribution(stats.ratingDistribution);
      renderBreakdown(stats.orderTypeGroups);
      renderLeaderboards(stats.leaderboards);
      renderHighlights(stats.highlights);

      const updatedAt = document.getElementById("statsUpdatedAt");
      if (updatedAt) {
        updatedAt.textContent = `Обновлено ${formatDate(new Date())}`;
      }

      hideLoading();
      const content = document.getElementById("statsContent");
      setElementVisibility(content, true);
    } catch (error) {
      console.error("Failed to initialize stats page", error);
      showError(
        "Не удалось загрузить статистику сайта. Проверь доступ к Supabase и настройки /api/env. Если страница долго грузится, значит один из запросов не ответил вовремя."
      );
    }
  }

  document.addEventListener("DOMContentLoaded", initStatsPage);
})();
