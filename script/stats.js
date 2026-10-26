(function () {
  'use strict';

  const SUPABASE_URL = 'https://shwekurmzyzivtworjup.supabase.co';
  const PAGE_SIZE = 200;
  const DATA_TIMEOUT_MS = 20000;
  const DAY_MS = 86400000;
  const TIME_ZONE = 'Europe/Moscow';
  const NUMBER = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
  const DECIMAL = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
  const DAY_FORMAT = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const MONTH_FORMAT = new Intl.DateTimeFormat('ru-RU', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });
  const TOOLTIP_DATE_FORMAT = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const MOSCOW_DATE = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const DATASETS = {
    movies: {
      table: 'movies',
      label: 'просмотренные фильмы',
      columns:
        'id, title, rating_numeric, rating_sum, rating_count, order_by, order_type, date, genres',
    },
    games: {
      table: 'games',
      label: 'пройденные игры',
      columns:
        'id, title, rating_numeric, game_rating_sum, game_rating_count, order_by, order_type, date, genres',
    },
    movieOrders: {
      table: 'Movie_Orders',
      label: 'очередь фильмов',
      columns: 'id, order_title, order_by, order_type, created_at',
    },
    gameOrders: {
      table: 'Game_Orders',
      label: 'очередь игр',
      columns:
        'id, game_title, game_order_by, game_order_type, created_at, streams_completed',
    },
    ratings: {
      table: 'ratings',
      label: 'история голосования',
      columns: 'id, movie_id, rating, category',
      categories: ['Movie', 'Games'],
    },
  };
  const GENRES = new Map(
    Object.entries({
      action: 'Боевик',
      боевик: 'Боевик',
      adventure: 'Приключения',
      приключения: 'Приключения',
      animation: 'Мультфильм',
      мультфильм: 'Мультфильм',
      anime: 'Аниме',
      аниме: 'Аниме',
      comedy: 'Комедия',
      комедия: 'Комедия',
      crime: 'Криминал',
      криминал: 'Криминал',
      documentary: 'Документальный',
      документальный: 'Документальный',
      drama: 'Драма',
      драма: 'Драма',
      family: 'Семейный',
      семейный: 'Семейный',
      fantasy: 'Фэнтези',
      фэнтези: 'Фэнтези',
      horror: 'Ужасы',
      ужасы: 'Ужасы',
      mystery: 'Детектив',
      детектив: 'Детектив',
      romance: 'Мелодрама',
      мелодрама: 'Мелодрама',
      thriller: 'Триллер',
      триллер: 'Триллер',
      'science fiction': 'Фантастика',
      'sci-fi': 'Фантастика',
      фантастика: 'Фантастика',
      biography: 'Биография',
      биография: 'Биография',
      history: 'История',
      история: 'История',
      war: 'Военный',
      военный: 'Военный',
      western: 'Вестерн',
      вестерн: 'Вестерн',
      music: 'Музыка',
      музыка: 'Музыка',
      musical: 'Мюзикл',
      мюзикл: 'Мюзикл',
      sport: 'Спорт',
      sports: 'Спорт',
      спорт: 'Спорт',
      short: 'Короткометражка',
      короткометражка: 'Короткометражка',
      indie: 'Инди',
      инди: 'Инди',
      shooter: 'Шутер',
      шутер: 'Шутер',
      puzzle: 'Головоломка',
      головоломка: 'Головоломка',
      simulation: 'Симулятор',
      симулятор: 'Симулятор',
      strategy: 'Стратегия',
      стратегия: 'Стратегия',
      racing: 'Гонки',
      гонки: 'Гонки',
      arcade: 'Аркада',
      аркада: 'Аркада',
      platformer: 'Платформер',
      платформер: 'Платформер',
      casual: 'Казуальная',
      казуальная: 'Казуальная',
      'role-playing': 'RPG',
      rpg: 'RPG',
      fighting: 'Файтинг',
      файтинг: 'Файтинг',
    })
  );

  function numeric(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (typeof value === 'string' && !value.trim()) return null;
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  }

  function rating(value) {
    const result = numeric(value);
    return result !== null && result >= 0 && result <= 11 ? result : null;
  }

  function cleanText(value) {
    if (typeof value !== 'string') return null;
    const result = value.replace(/\s+/g, ' ').trim();
    return result && !['null', 'undefined'].includes(result.toLowerCase())
      ? result
      : null;
  }

  function orderType(value) {
    const result = cleanText(value);
    const types = ['Донат', 'Баллы канала', 'Рулетка', 'Аукцион', 'Шары'];
    return (
      types.find((type) => type.toLowerCase() === result?.toLowerCase()) ||
      result ||
      'Не указан'
    );
  }

  function dayOf(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (match) {
      const day = Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3])
      );
      return new Date(day).toISOString().slice(0, 10) === value ? day : null;
    }
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    const parts = Object.fromEntries(
      MOSCOW_DATE.formatToParts(date).map((part) => [part.type, part.value])
    );
    return Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day)
    );
  }

  function todayOf(now) {
    return dayOf(now.toISOString());
  }
  function average(values) {
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  }
  function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  }
  function percent(value, total) {
    return total ? (value / total) * 100 : 0;
  }
  function countGroups(values) {
    const groups = new Map();
    for (const value of values) groups.set(value, (groups.get(value) || 0) + 1);
    return [...groups].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru')
    );
  }
  function distribution(values) {
    const counts = Array(12).fill(0);
    for (const value of values) {
      const valid = rating(value);
      if (valid !== null) counts[Math.round(valid)] += 1;
    }
    return counts.map((count, score) => [String(score), count]).reverse();
  }

  // Commit a dataset only after every page succeeds. Short pages are not an
  // end marker: a project may impose a row cap smaller than our page size.
  async function fetchDataset(client, definition) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('Stats request timed out'));
      }, DATA_TIMEOUT_MS);
    });
    try {
      return await Promise.race([
        (async () => {
          const rows = [];
          let total = null;
          let previousId = null;
          while (true) {
            let query = client
              .from(definition.table)
              .select(
                definition.columns,
                rows.length ? undefined : { count: 'exact' }
              );
            if (definition.categories)
              query = query.in('category', definition.categories);
            const result = await query
              .order('id', { ascending: true })
              .range(rows.length, rows.length + PAGE_SIZE - 1)
              .abortSignal(controller.signal);
            if (result.error) throw result.error;
            if (!Array.isArray(result.data))
              throw new Error('Invalid stats response');
            if (!rows.length && Number.isInteger(result.count))
              total = result.count;
            if (!result.data.length) {
              if (total !== null && rows.length < total)
                throw new Error('Incomplete stats response');
              break;
            }
            for (const row of result.data) {
              const id = numeric(row.id);
              if (id === null || (previousId !== null && id <= previousId))
                throw new Error('Unstable stats pagination');
              previousId = id;
              rows.push(row);
            }
            if (total !== null && rows.length >= total) break;
          }
          return rows;
        })(),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchLegacyCount(client) {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const result = await client
            .from('ratings')
            .select('id', { count: 'exact', head: true })
            .is('category', null)
            .abortSignal(controller.signal);
          if (result.error) throw result.error;
          if (!Number.isInteger(result.count))
            throw new Error('Missing legacy count');
          return result.count;
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error('Stats count timed out'));
          }, DATA_TIMEOUT_MS);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadStatsData(client) {
    const keys = [...Object.keys(DATASETS), 'legacyCount'];
    const results = await Promise.allSettled(
      keys.map((key) =>
        key === 'legacyCount'
          ? fetchLegacyCount(client)
          : fetchDataset(client, DATASETS[key])
      )
    );
    const data = {};
    const errors = [];
    results.forEach((result, index) => {
      const key = keys[index];
      if (result.status === 'fulfilled') data[key] = result.value;
      else errors.push(key);
    });
    return { data, errors };
  }

  function history(data, scope) {
    const movieKeys = ['movies', 'movieOrders'];
    const gameKeys = ['games', 'gameOrders'];
    const keys =
      scope === 'movies'
        ? movieKeys
        : scope === 'games'
          ? gameKeys
          : [...movieKeys, ...gameKeys];
    if (keys.some((key) => !Array.isArray(data[key]))) return null;
    return keys.flatMap((key) =>
      data[key].map((item) => ({
        name: cleanText(
          key === 'gameOrders' ? item.game_order_by : item.order_by
        ),
        type: orderType(
          key === 'gameOrders' ? item.game_order_type : item.order_type
        ),
        kind: movieKeys.includes(key) ? 'movies' : 'games',
      }))
    );
  }

  function buildLeaders(entries) {
    if (entries === null) return null;
    const people = new Map();
    for (const item of entries) {
      if (!item.name) continue;
      const key = item.name.toLocaleLowerCase('ru-RU');
      const person = people.get(key) || {
        name: item.name,
        movies: 0,
        games: 0,
        total: 0,
      };
      person[item.kind] += 1;
      person.total += 1;
      people.set(key, person);
    }
    return [...people.values()].sort(
      (a, b) => b.total - a.total || a.name.localeCompare(b.name, 'ru')
    );
  }

  function buildRatings(items, votes, category) {
    if (!Array.isArray(items)) return null;
    const ids = new Set(items.map((item) => String(item.id)));
    const validVotes = Array.isArray(votes)
      ? votes.filter(
          (vote) =>
            vote.category === category &&
            ids.has(String(vote.movie_id)) &&
            rating(vote.rating) !== null
        )
      : null;
    const grouped = new Map();
    for (const vote of validVotes || []) {
      const key = String(vote.movie_id);
      const group = grouped.get(key) || { sum: 0, count: 0 };
      group.sum += rating(vote.rating);
      group.count += 1;
      grouped.set(key, group);
    }
    const pupsik = items
      .map((item) => rating(item.rating_numeric))
      .filter((value) => value !== null);
    const viewerValues = validVotes?.map((vote) => rating(vote.rating));
    const countKey =
      category === 'Movie' ? 'rating_count' : 'game_rating_count';
    const sumKey = category === 'Movie' ? 'rating_sum' : 'game_rating_sum';
    let savedCount = 0;
    let savedSum = 0;
    let savedRated = 0;
    let mismatches = 0;
    for (const item of items) {
      const count = numeric(item[countKey]);
      const sum = numeric(item[sumKey]);
      if (
        count !== null &&
        Number.isInteger(count) &&
        count > 0 &&
        sum !== null &&
        sum >= 0 &&
        sum <= count * 11
      ) {
        savedCount += count;
        savedSum += sum;
        savedRated += 1;
      }
      if (
        validVotes !== null &&
        (count || 0) !== (grouped.get(String(item.id))?.count || 0)
      )
        mismatches += 1;
    }
    const bins = distribution(pupsik);
    return {
      items,
      grouped,
      pupsik,
      viewerValues,
      pupsikAverage: average(pupsik),
      viewerAverage: viewerValues ? average(viewerValues) : null,
      pupsikDistribution: bins,
      viewerDistribution: viewerValues ? distribution(viewerValues) : null,
      mode: pupsik.length
        ? bins.reduce((best, item) => (item[1] > best[1] ? item : best))[0]
        : null,
      ratedCount: validVotes === null ? null : grouped.size,
      savedCount,
      savedAverage: savedCount ? savedSum / savedCount : null,
      savedRated,
      mismatches,
      orphanVotes: Array.isArray(votes)
        ? votes.filter(
            (vote) =>
              vote.category === category && !ids.has(String(vote.movie_id))
          ).length
        : null,
      invalidVotes: Array.isArray(votes)
        ? votes.filter(
            (vote) => vote.category === category && rating(vote.rating) === null
          ).length
        : null,
    };
  }

  function buildQueue(items, kind, today) {
    if (!Array.isArray(items)) return null;
    const dated = items
      .map((item) => ({ item, day: dayOf(item.created_at) }))
      .filter(({ day }) => day !== null && day <= today);
    const ages = dated.map(({ day }) => (today - day) / DAY_MS);
    const oldest = [...dated].sort((a, b) => a.day - b.day)[0];
    return {
      count: items.length,
      median: median(ages),
      oldestAge: ages.length ? Math.max(...ages) : null,
      oldestTitle: oldest
        ? cleanText(
            kind === 'movies' ? oldest.item.order_title : oldest.item.game_title
          ) || 'Без названия'
        : null,
      invalidDates: items.length - dated.length,
      inProgress:
        kind === 'games'
          ? items.filter((item) => (numeric(item.streams_completed) || 0) > 0)
              .length
          : 0,
      streams:
        kind === 'games'
          ? items.reduce(
              (sum, item) =>
                sum +
                Math.max(0, Math.floor(numeric(item.streams_completed) || 0)),
              0
            )
          : 0,
    };
  }

  function buildGenres(items) {
    if (!Array.isArray(items)) return null;
    const entries = [];
    let covered = 0;
    for (const item of items) {
      const values = Array.isArray(item.genres)
        ? item.genres
        : typeof item.genres === 'string'
          ? item.genres.split(/[,;|]/)
          : [];
      const genres = new Set(
        values
          .map(cleanText)
          .filter(Boolean)
          .map(
            (value) =>
              GENRES.get(value.toLowerCase()) ||
              value.toLocaleLowerCase('ru-RU')
          )
      );
      if (genres.size) covered += 1;
      entries.push(...genres);
    }
    return {
      counts: countGroups(entries).slice(0, 7),
      covered,
      total: items.length,
    };
  }

  function buildActivity(data, scope, period, today) {
    const keys = scope === 'all' ? ['movies', 'games'] : [scope];
    if (keys.some((key) => !Array.isArray(data[key]))) return null;
    const entries = keys.flatMap((key) =>
      data[key].map((item) => ({ kind: key, day: dayOf(item.date) }))
    );
    const dated = entries.filter(({ day }) => day !== null && day <= today);
    const days = period === 'all' ? null : Number(period);
    const start = days
      ? today - (days - 1) * DAY_MS
      : dated.reduce((min, item) => Math.min(min, item.day), today);
    const selected = dated.filter(({ day }) => day >= start);
    const previous = days
      ? dated.filter(({ day }) => day >= start - days * DAY_MS && day < start)
          .length
      : null;
    const mode = period === '30' ? 'day' : period === '90' ? 'week' : 'month';
    const buckets = new Map();
    function keyOf(day) {
      if (mode === 'day') return day;
      if (mode === 'week')
        return start + Math.floor((day - start) / DAY_MS / 7) * 7 * DAY_MS;
      const date = new Date(day);
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    }
    for (let day = start; day <= today; day += DAY_MS) {
      const key = keyOf(day);
      if (!buckets.has(key)) {
        const end =
          mode === 'month'
            ? Date.UTC(
                new Date(key).getUTCFullYear(),
                new Date(key).getUTCMonth() + 1,
                0
              )
            : key + (mode === 'week' ? 6 : 0) * DAY_MS;
        const from = Math.max(key, start);
        const to = Math.min(end, today);
        buckets.set(key, {
          key,
          from,
          to,
          label:
            mode === 'month'
              ? MONTH_FORMAT.format(new Date(key))
              : DAY_FORMAT.format(new Date(key)),
          range:
            from === to
              ? DAY_FORMAT.format(new Date(from))
              : `${DAY_FORMAT.format(new Date(from))} — ${DAY_FORMAT.format(new Date(to))}`,
          movies: 0,
          games: 0,
        });
      }
    }
    for (const item of selected) buckets.get(keyOf(item.day))[item.kind] += 1;
    return {
      buckets: [...buckets.values()],
      total: selected.length,
      previous,
      change: previous ? ((selected.length - previous) / previous) * 100 : null,
      missing: entries.filter(({ day }) => day === null).length,
      future: entries.filter(({ day }) => day !== null && day > today).length,
      movies: selected.filter((item) => item.kind === 'movies').length,
      games: selected.filter((item) => item.kind === 'games').length,
      start,
      end: today,
      mode,
    };
  }

  function buildDisagreements(movieRatings, minimum) {
    if (
      !movieRatings ||
      movieRatings.viewerValues === null ||
      movieRatings.viewerValues === undefined
    )
      return null;
    return movieRatings.items
      .flatMap((item) => {
        const group = movieRatings.grouped.get(String(item.id));
        const pupsik = rating(item.rating_numeric);
        if (!group || group.count < minimum || pupsik === null) return [];
        const viewers = group.sum / group.count;
        return [
          {
            title: cleanText(item.title) || 'Без названия',
            pupsik,
            viewers,
            count: group.count,
            difference: Math.abs(pupsik - viewers),
          },
        ];
      })
      .sort(
        (a, b) =>
          b.difference - a.difference ||
          b.count - a.count ||
          a.title.localeCompare(b.title, 'ru')
      )
      .slice(0, 5);
  }

  function computeStats(data, now = new Date()) {
    const today = todayOf(now);
    return {
      today,
      leaders: buildLeaders(history(data, 'all')),
      ratings: {
        movies: buildRatings(data.movies, data.ratings, 'Movie'),
        games: buildRatings(data.games, data.ratings, 'Games'),
      },
      queues: {
        movies: buildQueue(data.movieOrders, 'movies', today),
        games: buildQueue(data.gameOrders, 'games', today),
      },
      genres: {
        movies: buildGenres(data.movies),
        games: buildGenres(data.games),
      },
    };
  }

  const state = {
    data: {},
    model: null,
    errors: [],
    loading: false,
    loadedAt: null,
    activityScope: 'all',
    activityPeriod: '365',
    ratingScope: 'movies',
    ratingSource: 'pupsik',
    orderScope: 'all',
    leaderScope: 'all',
    leaderLimit: 5,
    genreScope: 'movies',
    minimumVotes: 5,
  };
  let client;
  let activityTooltipTarget = null;
  let activityBuckets = [];
  let activityMaximum = 1;

  function element(tag, className, value) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (value !== undefined) result.textContent = String(value);
    return result;
  }
  function replace(id, ...children) {
    document.getElementById(id)?.replaceChildren(...children);
  }
  function text(id, value) {
    const target = document.getElementById(id);
    if (target) target.textContent = value;
  }
  function format(value) {
    return value === null || value === undefined ? '—' : NUMBER.format(value);
  }
  function score(value) {
    return value === null || value === undefined ? '—' : DECIMAL.format(value);
  }
  function empty(message = 'Данных пока нет.') {
    return element('p', 'stats-empty', message);
  }
  function unavailable() {
    return empty(
      'Данные недоступны. Нажмите «Обновить данные», чтобы повторить загрузку.'
    );
  }

  function metric(label, value, meta, className = 'stats-card') {
    const card = element('article', className);
    card.append(
      element('div', 'stats-card__label', label),
      element('div', 'stats-card__value', value)
    );
    if (meta) card.append(element('p', 'stats-card__meta', meta));
    return card;
  }

  function renderOverview() {
    const { data, model } = state;
    const count = (key) => (Array.isArray(data[key]) ? data[key].length : null);
    replace(
      'statsOverview',
      metric(
        'Фильмов просмотрено',
        format(count('movies')),
        'За всё время',
        'stats-card stats-card--movies'
      ),
      metric(
        'Игр пройдено',
        format(count('games')),
        'За всё время',
        'stats-card stats-card--games'
      ),
      metric(
        'Фильмов в очереди',
        format(count('movieOrders')),
        'Ожидают просмотра'
      ),
      metric(
        'Игр в очереди',
        format(count('gameOrders')),
        model.queues.games
          ? `В процессе: ${format(model.queues.games.inProgress)}`
          : 'Данные недоступны'
      ),
      metric(
        'Ников заказчиков',
        format(model.leaders?.length),
        'Архив и очередь · без пустых ников'
      )
    );
  }

  function renderBars(id, rows, total, options = {}) {
    if (rows === null) {
      replace(id, unavailable());
      return;
    }
    if (!rows.length || !total) {
      replace(id, empty());
      return;
    }
    const max = Math.max(...rows.map(([, count]) => count), 1);
    replace(
      id,
      ...rows.map(([label, count]) => {
        const row = element(
          'div',
          `stats-bar${options.rating ? ' stats-bar--rating' : ''}`
        );
        const track = element('div', 'stats-bar__track');
        const fill = element('div', 'stats-bar__fill');
        fill.style.width = `${(count / max) * 100}%`;
        track.setAttribute('aria-hidden', 'true');
        track.append(fill);
        row.append(
          element('span', 'stats-bar__label', label),
          track,
          element(
            'span',
            'stats-bar__value',
            `${format(count)} · ${format(percent(count, total))}%`
          )
        );
        return row;
      })
    );
  }

  function activityPeriodLabel(bucket) {
    const from = new Date(bucket.from);
    const to = new Date(bucket.to);
    if (bucket.from === bucket.to) return TOOLTIP_DATE_FORMAT.format(to);
    if (
      from.getUTCFullYear() === to.getUTCFullYear() &&
      from.getUTCMonth() === to.getUTCMonth()
    )
      return `${from.getUTCDate()}–${TOOLTIP_DATE_FORMAT.format(to)}`;
    return `${TOOLTIP_DATE_FORMAT.format(from)} — ${TOOLTIP_DATE_FORMAT.format(to)}`;
  }

  function hideActivityTooltip() {
    const tooltip = document.getElementById('activityTooltip');
    if (tooltip) tooltip.hidden = true;
    activityTooltipTarget?.removeAttribute('aria-describedby');
    activityTooltipTarget = null;
  }

  function positionActivityTooltip() {
    if (!activityTooltipTarget) return;
    const tooltip = document.getElementById('activityTooltip');
    const column = activityTooltipTarget.getBoundingClientRect();
    const chart = document
      .getElementById('activityChart')
      .getBoundingClientRect();
    const width = document.documentElement.clientWidth;
    const height = window.innerHeight;
    if (
      column.right <= chart.left ||
      column.left >= chart.right ||
      column.bottom <= 0 ||
      column.top >= height
    ) {
      hideActivityTooltip();
      return;
    }
    const bucket =
      activityBuckets[Number(activityTooltipTarget.dataset.bucketIndex)];
    const stack = activityTooltipTarget
      .querySelector('.stats-activity-stack')
      .getBoundingClientRect();
    const anchorTop =
      stack.bottom -
      (stack.height * (bucket.movies + bucket.games)) / activityMaximum;
    const plot = document
      .getElementById('activityPlot')
      .getBoundingClientRect();
    const box = tooltip.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(
        column.left + column.width / 2 - box.width / 2,
        width - box.width - 8
      )
    );
    let top = anchorTop - box.height - 12;
    if (top < 8) top = anchorTop + 12;
    top = Math.max(8, Math.min(top, height - box.height - 8));
    tooltip.style.left = `${left - plot.left}px`;
    tooltip.style.top = `${top - plot.top}px`;
  }

  function showActivityTooltip(column) {
    const bucket = activityBuckets[Number(column.dataset.bucketIndex)];
    if (!bucket) return;
    if (activityTooltipTarget === column) {
      positionActivityTooltip();
      return;
    }
    hideActivityTooltip();
    const tooltip = document.getElementById('activityTooltip');
    const rows = [
      ['movies', 'Фильмы', bucket.movies],
      ['games', 'Игры', bucket.games],
      ['total', 'Всего', bucket.movies + bucket.games],
    ];
    tooltip.replaceChildren(
      element(
        'div',
        'stats-chart-tooltip__period',
        activityPeriodLabel(bucket)
      ),
      ...rows.map(([kind, label, count]) => {
        const row = element(
          'div',
          `stats-chart-tooltip__row stats-chart-tooltip__row--${kind}`
        );
        const name = element('span', 'stats-chart-tooltip__label');
        if (kind !== 'total') {
          const dot = element('i', `stats-dot stats-dot--${kind}`);
          dot.setAttribute('aria-hidden', 'true');
          name.append(dot);
        }
        name.append(element('span', '', label));
        row.append(
          name,
          element('strong', 'stats-chart-tooltip__value', format(count))
        );
        return row;
      })
    );
    activityTooltipTarget = column;
    column.setAttribute('aria-describedby', 'activityTooltip');
    tooltip.hidden = false;
    positionActivityTooltip();
  }

  function renderActivity() {
    hideActivityTooltip();
    const result = buildActivity(
      state.data,
      state.activityScope,
      state.activityPeriod,
      state.model.today
    );
    activityBuckets = result?.buckets || [];
    if (!result) {
      replace('activitySummary', unavailable());
      replace('activityChart');
      replace('activityTable');
      text('activityNote', '');
      return;
    }
    let comparison = 'За всё время';
    if (result.previous !== null)
      comparison =
        result.previous === 0
          ? result.total
            ? 'В предыдущем периоде — 0'
            : 'В предыдущем периоде тоже 0'
          : `${result.change > 0 ? '+' : ''}${format(result.change)}% к предыдущему периоду (${format(result.previous)})`;
    replace(
      'activitySummary',
      metric(
        'Завершено за период',
        format(result.total),
        comparison,
        'stats-activity-total'
      ),
      element(
        'p',
        'stats-hint',
        `${DAY_FORMAT.format(new Date(result.start))} ${new Date(result.start).getUTCFullYear()} — ${DAY_FORMAT.format(new Date(result.end))} ${new Date(result.end).getUTCFullYear()} · Фильмов: ${format(result.movies)}, игр: ${format(result.games)}`
      )
    );
    const max = Math.max(
      ...result.buckets.map((bucket) => bucket.movies + bucket.games),
      1
    );
    activityMaximum = max;
    const chart = element('div', 'stats-activity-columns');
    chart.style.setProperty('--bucket-count', result.buckets.length);
    const stride = Math.max(1, Math.ceil(result.buckets.length / 9));
    for (const [index, bucket] of result.buckets.entries()) {
      const column = element('div', 'stats-activity-column');
      const title = `${activityPeriodLabel(bucket)}. Фильмы: ${bucket.movies}. Игры: ${bucket.games}. Всего: ${bucket.movies + bucket.games}.`;
      column.setAttribute('aria-label', title);
      column.setAttribute('data-bucket-index', String(index));
      if (bucket.movies + bucket.games) column.tabIndex = 0;
      const stack = element('div', 'stats-activity-stack');
      for (const kind of ['movies', 'games']) {
        const segment = element(
          'div',
          `stats-activity-segment stats-activity-segment--${kind}`
        );
        segment.style.height = `${percent(bucket[kind], max)}%`;
        stack.append(segment);
      }
      if (bucket.movies + bucket.games) {
        const count = element(
          'span',
          'stats-activity-count',
          format(bucket.movies + bucket.games)
        );
        count.style.bottom = `${percent(bucket.movies + bucket.games, max)}%`;
        count.setAttribute('aria-hidden', 'true');
        stack.append(count);
      }
      column.append(
        stack,
        element(
          'span',
          'stats-activity-label',
          index % stride === 0 || index === result.buckets.length - 1
            ? bucket.label
            : ''
        )
      );
      chart.append(column);
    }
    replace('activityChart', chart);
    const table = element('table', 'stats-table');
    const head = element('thead');
    const headRow = element('tr');
    for (const label of ['Период', 'Фильмы', 'Игры', 'Всего']) {
      const th = element('th', '', label);
      th.scope = 'col';
      headRow.append(th);
    }
    head.append(headRow);
    const body = element('tbody');
    for (const bucket of result.buckets) {
      const row = element('tr');
      const heading = element(
        'th',
        '',
        result.mode === 'month'
          ? `${bucket.label} (${bucket.range})`
          : bucket.range
      );
      heading.scope = 'row';
      row.append(
        heading,
        element('td', '', format(bucket.movies)),
        element('td', '', format(bucket.games)),
        element('td', '', format(bucket.movies + bucket.games))
      );
      body.append(row);
    }
    table.append(head, body);
    replace('activityTable', table);
    const notes = [
      'Столбцы: ' +
        { day: 'дни', week: 'недели', month: 'месяцы' }[result.mode] +
        '. Даты — по московскому времени.',
    ];
    if (result.missing)
      notes.push(
        `Без даты: ${format(result.missing)}. Учтены в общем обзоре, но не на графике.`
      );
    if (result.future)
      notes.push(
        `С будущей датой: ${format(result.future)}. В график пока не включены.`
      );
    text('activityNote', notes.join(' '));
  }

  function renderRatings() {
    const result = state.model.ratings[state.ratingScope];
    if (!result) {
      replace('ratingSummary', unavailable());
      replace('ratingDistribution');
      text('ratingCaption', '');
      text('ratingNote', '');
      return;
    }
    replace(
      'ratingSummary',
      metric(
        'Средняя Pupsik',
        score(result.pupsikAverage),
        `${format(result.pupsik.length)} оценок · из 11`,
        'stats-mini-card'
      ),
      metric(
        'Средняя зрителей',
        score(result.viewerAverage),
        result.viewerValues
          ? `${format(result.viewerValues.length)} голосов · из 11`
          : 'История голосов недоступна',
        'stats-mini-card'
      )
    );
    const viewers = state.ratingSource === 'viewers';
    renderBars(
      'ratingDistribution',
      viewers ? result.viewerDistribution : result.pupsikDistribution,
      viewers ? result.viewerValues?.length : result.pupsik.length,
      { rating: true }
    );
    text(
      'ratingCaption',
      viewers
        ? 'Распределение отдельных голосов зрителей · дробные оценки округлены до ближайшего балла'
        : 'Распределение оценок Pupsik · количество произведений и доля'
    );
    const notes = [];
    if (result.ratedCount !== null)
      notes.push(
        `Есть голоса зрителей: ${format(result.ratedCount)} из ${format(result.items.length)} (${format(percent(result.ratedCount, result.items.length))}%).`
      );
    if (result.mode !== null)
      notes.push(`Самая частая оценка Pupsik: ${result.mode}.`);
    notes.push(
      'Средняя зрителей и график — по доступной истории голосования; исторические итоги приведены внизу страницы.'
    );
    text('ratingNote', notes.join(' '));
  }

  function renderOrders() {
    const entries = history(state.data, state.orderScope);
    renderBars(
      'orderTypeBreakdown',
      entries === null ? null : countGroups(entries.map((item) => item.type)),
      entries?.length
    );
    text(
      'orderTypeNote',
      entries === null
        ? ''
        : `Всего записей: ${format(entries.length)}. «Не указан» — источник не сохранён; это не отдельный способ заказа.`
    );
  }

  function renderLeaders() {
    let entries = history(
      state.data,
      state.leaderScope === 'roulette' ? 'all' : state.leaderScope
    );
    if (entries && state.leaderScope === 'roulette')
      entries = entries.filter((entry) => entry.type === 'Рулетка');
    const ranked = buildLeaders(entries);
    const more = document.getElementById('leadersMore');
    more.hidden = !ranked || ranked.length <= 5;
    more.textContent =
      state.leaderLimit === 5 ? 'Показать 10' : 'Свернуть до 5';
    more.setAttribute('aria-expanded', String(state.leaderLimit > 5));
    if (ranked === null) {
      replace('leaderboards', unavailable());
      text('leaderNote', '');
      return;
    }
    replace(
      'leaderboards',
      ...(ranked.length
        ? ranked.slice(0, state.leaderLimit).map((person, index) => {
            const row = element(
              'div',
              `leaderboard-item${index < 3 ? ` leaderboard-item--top-${index + 1}` : ''}`
            );
            const name = element('span', 'leaderboard-item__name', person.name);
            name.title = person.name;
            row.append(
              element('span', 'leaderboard-item__rank', index + 1),
              name,
              element('strong', 'leaderboard-item__value', format(person.total))
            );
            return row;
          })
        : [empty()])
    );
    text(
      'leaderNote',
      state.leaderScope === 'roulette'
        ? 'Количество заказов с источником «Рулетка», а не число отдельных розыгрышей.'
        : 'Количество записей в каталоге и очереди. Регистр и лишние пробелы в никах не учитываются. Удалённые заказы не восстановлены.'
    );
  }

  function queueLine(label, value) {
    const row = element('div', 'stats-queue-line');
    row.append(element('span', '', label), element('strong', '', value));
    return row;
  }

  function renderQueues() {
    replace(
      'queueStats',
      ...['movies', 'games'].map((kind) => {
        const result = state.model.queues[kind];
        const card = element('div', 'stats-queue-card');
        card.append(element('h3', '', kind === 'movies' ? 'Фильмы' : 'Игры'));
        if (!result) {
          card.append(unavailable());
          return card;
        }
        card.append(queueLine('Заказов', format(result.count)));
        if (!result.count) {
          card.append(empty('Очередь пуста.'));
          return card;
        }
        card.append(
          queueLine(
            'Медиана ожидания',
            result.median === null ? '—' : `${format(result.median)} дн.`
          ),
          queueLine(
            'Самый старый заказ',
            result.oldestAge === null ? '—' : `${format(result.oldestAge)} дн.`
          )
        );
        if (result.oldestTitle)
          card.append(element('p', 'stats-queue-oldest', result.oldestTitle));
        if (kind === 'games')
          card.append(
            queueLine('В процессе', format(result.inProgress)),
            queueLine('Стримов по текущим играм', format(result.streams))
          );
        if (result.invalidDates)
          card.append(
            element(
              'p',
              'stats-hint',
              `Без корректной даты: ${format(result.invalidDates)}. Не входят в расчёт ожидания.`
            )
          );
        return card;
      })
    );
  }

  function renderGenres() {
    const result = state.model.genres[state.genreScope];
    renderBars('genreChart', result?.counts ?? null, result?.covered);
    text(
      'genreNote',
      result
        ? `Топ-7 · жанры заполнены у ${format(result.covered)} из ${format(result.total)}. Один фильм или игра могут относиться к нескольким жанрам, поэтому проценты не складываются в 100%.`
        : ''
    );
  }

  function renderDisagreements() {
    const items = buildDisagreements(
      state.model.ratings.movies,
      Number(state.minimumVotes)
    );
    replace(
      'disagreements',
      ...(items === null
        ? [unavailable()]
        : !items.length
          ? [
              empty(
                'Пока нет фильмов с таким количеством голосов. Попробуйте уменьшить минимум.'
              ),
            ]
          : items.map((item) => {
              const card = element('div', 'stats-disagreement');
              const heading = element('div', 'stats-disagreement__heading');
              heading.append(
                element('h3', '', item.title),
                element(
                  'strong',
                  'stats-disagreement__difference',
                  `Δ ${score(item.difference)}`
                )
              );
              card.append(
                heading,
                element(
                  'p',
                  'stats-hint',
                  `Pupsik: ${score(item.pupsik)} · зрители: ${score(item.viewers)} · голосов: ${format(item.count)}`
                )
              );
              return card;
            }))
    );
  }

  function renderDiagnostics() {
    const cards = [];
    for (const kind of ['movies', 'games']) {
      const result = state.model.ratings[kind];
      const card = element('div', 'stats-diagnostic-card');
      card.append(element('h3', '', kind === 'movies' ? 'Фильмы' : 'Игры'));
      if (!result) card.append(unavailable());
      else {
        card.append(
          queueLine('Голосов в историческом итоге', format(result.savedCount)),
          queueLine('Историческая средняя', score(result.savedAverage)),
          queueLine(
            'Произведений с голосами в итоге',
            format(result.savedRated)
          ),
          queueLine(
            'Голосов в доступной истории',
            format(result.viewerValues?.length)
          ),
          queueLine(
            'Расхождение числа голосов у записей',
            result.viewerValues ? format(result.mismatches) : '—'
          ),
          queueLine(
            'Голосов без записи в каталоге',
            format(result.orphanVotes)
          ),
          queueLine(
            'Некорректных оценок в истории',
            format(result.invalidVotes)
          )
        );
        card.append(
          queueLine(
            'Без даты завершения',
            format(
              result.items.filter((item) => dayOf(item.date) === null).length
            )
          )
        );
      }
      cards.push(card);
    }
    const quality = element('div', 'stats-diagnostic-card');
    quality.append(element('h3', '', 'Заполненность заказов'));
    const entries = history(state.data, 'all');
    if (entries === null) quality.append(unavailable());
    else
      quality.append(
        queueLine(
          'Без ника',
          format(entries.filter((item) => !item.name).length)
        ),
        queueLine(
          'Без источника заказа',
          format(entries.filter((item) => item.type === 'Не указан').length)
        )
      );
    quality.append(
      queueLine('Старых голосов без категории', format(state.data.legacyCount)),
      element(
        'p',
        'stats-hint',
        'Голоса без категории и без существующего фильма или игры не включены в графики и средние по истории.'
      )
    );
    cards.push(quality);
    replace('statsDiagnostics', ...cards);
  }

  function renderAll() {
    state.model = computeStats(state.data);
    renderOverview();
    renderActivity();
    renderRatings();
    renderOrders();
    renderLeaders();
    renderQueues();
    renderGenres();
    renderDisagreements();
    renderDiagnostics();
  }

  function bindControls() {
    const chart = document.getElementById('activityChart');
    chart.addEventListener('pointerover', (event) => {
      const column = event.target.closest('.stats-activity-column');
      if (column) showActivityTooltip(column);
    });
    chart.addEventListener('pointerleave', () => {
      if (document.activeElement !== activityTooltipTarget)
        hideActivityTooltip();
    });
    chart.addEventListener('focusin', (event) => {
      const column = event.target.closest('.stats-activity-column');
      if (column) showActivityTooltip(column);
    });
    chart.addEventListener('focusout', hideActivityTooltip);
    chart.addEventListener('click', (event) => {
      const column = event.target.closest('.stats-activity-column');
      if (column) showActivityTooltip(column);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') hideActivityTooltip();
    });
    document.addEventListener('pointerdown', (event) => {
      if (!chart.contains(event.target)) hideActivityTooltip();
    });
    window.addEventListener('scroll', positionActivityTooltip, true);
    window.addEventListener('resize', positionActivityTooltip);
    const selects = {
      activityScope: renderActivity,
      activityPeriod: renderActivity,
      ratingScope: renderRatings,
      genreScope: renderGenres,
      minimumVotes: renderDisagreements,
    };
    for (const [id, render] of Object.entries(selects))
      document.getElementById(id).addEventListener('change', (event) => {
        state[id] = event.target.value;
        if (state.model) render();
      });
    document.querySelectorAll('[data-control]').forEach((group) =>
      group.addEventListener('click', (event) => {
        const button = event.target.closest('button');
        if (!button || !group.contains(button)) return;
        const key = group.dataset.control;
        state[key] = button.value;
        group
          .querySelectorAll('button')
          .forEach((item) =>
            item.setAttribute('aria-pressed', String(item === button))
          );
        if (key === 'leaderScope') state.leaderLimit = 5;
        if (state.model)
          ({
            ratingSource: renderRatings,
            orderScope: renderOrders,
            leaderScope: renderLeaders,
          })[key]();
      })
    );
    document.getElementById('leadersMore').addEventListener('click', () => {
      state.leaderLimit = state.leaderLimit === 5 ? 10 : 5;
      renderLeaders();
    });
    document.getElementById('statsRefresh').addEventListener('click', refresh);
  }

  async function refresh() {
    if (state.loading) return;
    state.loading = true;
    const button = document.getElementById('statsRefresh');
    button.disabled = true;
    button.textContent = 'Обновляем…';
    document.getElementById('statsContent').setAttribute('aria-busy', 'true');
    text('statsUpdatedAt', 'Загружаем данные…');
    try {
      if (!client) {
        if (!window.supabase?.createClient || !window.Pupsik?.supabasePublicKey)
          throw new Error('Stats configuration unavailable');
        client = window.supabase.createClient(
          SUPABASE_URL,
          window.Pupsik.supabasePublicKey,
          {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false,
            },
          }
        );
      }
      const result = await loadStatsData(client);
      // Keep a previous complete dataset if its refresh fails. Do not replace
      // it with an empty array or with the first successful pages of a request.
      Object.assign(state.data, result.data);
      state.errors = result.errors;
      if (!result.errors.length) state.loadedAt = new Date();
      const notice = document.getElementById('statsError');
      notice.hidden = !result.errors.length;
      if (result.errors.length) {
        const labels = result.errors.map(
          (key) => DATASETS[key]?.label || 'сведения о старых голосах'
        );
        notice.textContent = `Не удалось загрузить или обновить: ${labels.join(', ')}. Ранее загруженные данные сохранены; недоступные показатели отмечены прочерком. Нажмите «Обновить данные», чтобы повторить.`;
      }
      renderAll();
      document.getElementById('statsContent').hidden = false;
      const stamp = state.loadedAt
        ? new Intl.DateTimeFormat('ru-RU', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: TIME_ZONE,
          }).format(state.loadedAt) + ' МСК'
        : null;
      text(
        'statsUpdatedAt',
        result.errors.length
          ? stamp
            ? `Часть данных не обновлена · полная загрузка: ${stamp}`
            : 'Доступны не все данные'
          : `Загружено ${stamp}`
      );
    } catch (error) {
      console.error('Failed to load statistics', error);
      const notice = document.getElementById('statsError');
      notice.hidden = false;
      notice.textContent =
        'Не удалось загрузить статистику. Проверьте подключение и нажмите «Обновить данные».';
      text('statsUpdatedAt', 'Не удалось обновить данные');
    } finally {
      document.getElementById('statsLoading').hidden = true;
      document
        .getElementById('statsContent')
        .setAttribute('aria-busy', 'false');
      state.loading = false;
      button.disabled = false;
      button.textContent = 'Обновить данные';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindControls();
    void refresh();
  });
})();
