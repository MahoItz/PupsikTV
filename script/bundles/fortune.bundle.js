;(function (global) {
  if (global.FortuneBundle) {
    return;
  }

const fortuneWinnerModal = document.getElementById("fortuneWinnerModal");
const fortuneWinnerFilmNameEl = document.getElementById(
  "fortuneWinnerFilmName"
);
const fortuneWinnerKinopoiskBtn = document.getElementById(
  "fortuneWinnerKinopoisk"
);
const fortuneWinnerReYohohoBtn = document.getElementById(
  "fortuneWinnerReYohoho"
);
const fortuneWinnerCancelBtn = document.getElementById("fortuneWinnerCancel");
let fortuneWinnerMovie = null;
const reyohohoPickerModal = document.getElementById("reyohohoPickerModal");
const reyohohoPickerSubtitle = document.getElementById(
  "reyohohoPickerSubtitle"
);
const reyohohoPickerLoading = document.getElementById(
  "reyohohoPickerLoading"
);
const reyohohoOptionsContainer = document.getElementById("reyohohoOptions");
const reyohohoPickerCancelBtn = document.getElementById(
  "reyohohoPickerCancel"
);
const DEFAULT_POSTER_PLACEHOLDER =
  "https://via.placeholder.com/300x450?text=Нет+постера";
let reyohohoPickerContext = null;
const rouletteAutofillHint = document.getElementById("rouletteAutofillHint");
const rouletteAutofillClearBtn = document.getElementById("rouletteAutofillClear");

function normalizeFortuneText(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-z0-9а-я\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSearchText(str) {
  return normalizeFortuneText(str);
}

function levenshteinDistance(a, b) {
  const strA = String(a || "");
  const strB = String(b || "");
  const lenA = strA.length;
  const lenB = strB.length;

  if (!lenA) return lenB;
  if (!lenB) return lenA;

  const dp = Array.from({ length: lenA + 1 }, () =>
    new Array(lenB + 1).fill(0)
  );

  for (let i = 0; i <= lenA; i++) dp[i][0] = i;
  for (let j = 0; j <= lenB; j++) dp[0][j] = j;

  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = strA[i - 1] === strB[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[lenA][lenB];
}

function fuzzyMatchNormalized(normalizedQuery, value) {
  if (!normalizedQuery) return false;

  const normalizedValue = normalizeSearchText(value);
  if (!normalizedValue) return false;

  if (normalizedValue.includes(normalizedQuery)) return true;

  const queryClean = normalizedQuery.replace(/\s+/g, "");
  const valueClean = normalizedValue.replace(/\s+/g, "");

  if (!queryClean || !valueClean) return false;

  if (queryClean.length <= 2) {
    return valueClean.includes(queryClean);
  }

  if (Math.abs(valueClean.length - queryClean.length) > queryClean.length) {
    return false;
  }

  const allowedDistance =
    queryClean.length <= 4 ? 1 : queryClean.length <= 8 ? 2 : 3;

  if (valueClean.length < queryClean.length) {
    const dist = levenshteinDistance(queryClean, valueClean);
    const norm = dist / queryClean.length;
    return dist <= allowedDistance && norm <= 0.35;
  }

  let best = Infinity;

  for (let i = 0; i <= valueClean.length - queryClean.length; i++) {
    const segment = valueClean.slice(i, i + queryClean.length);
    const dist = levenshteinDistance(queryClean, segment);
    if (dist < best) best = dist;
    if (dist === 0) break;
  }

  const normalizedDistance = best / queryClean.length;

  return best <= allowedDistance && normalizedDistance <= 0.35;
}

function scoreMatch(normalizedQuery, value) {
  const normalizedValue = normalizeSearchText(value);
  if (!normalizedQuery || !normalizedValue) return 0;

  // Идеальное совпадение
  if (normalizedValue === normalizedQuery) return 100;
  // Начало строки — очень хорошо
  if (normalizedValue.startsWith(normalizedQuery)) return 90;
  // Вхождение где-то в середине
  if (normalizedValue.includes(normalizedQuery)) return 80;

  const queryClean = normalizedQuery.replace(/\s+/g, "");
  const valueClean = normalizedValue.replace(/\s+/g, "");
  if (!queryClean || !valueClean) return 0;

  const allowedDistance = queryClean.length <= 4 ? 1 : 2;
  let best = Infinity;

  if (valueClean.length <= queryClean.length) {
    best = levenshteinDistance(queryClean, valueClean);
  } else {
    const lenDiff = valueClean.length - queryClean.length;
    for (let i = 0; i <= lenDiff; i++) {
      const segment = valueClean.slice(i, i + queryClean.length);
      const d = levenshteinDistance(queryClean, segment);
      if (d < best) best = d;
      if (best === 0) break;
    }
  }

  if (best > allowedDistance) return 0;

  // Чем меньше расстояние — тем выше балл
  return 70 - best * 10; // 70, 60, 50...
}

function extractYearValue(value) {
  if (!value) return "";
  const match = String(value).match(/(19|20)\d{2}/);
  return match ? match[0] : "";
}

function parseFortuneLabel(label) {
  const originalLabel = (label || "").trim();
  if (!originalLabel) {
    return { originalLabel: "", title: "", originalTitle: "", year: "" };
  }

  const parenthesesValues = Array.from(
    originalLabel.matchAll(/\(([^)]+)\)/g)
  ).map((m) => m[1].trim());
  let year = "";
  let originalTitle = "";

  for (const value of parenthesesValues) {
    if (!year && /^(19|20)\d{2}$/.test(value)) {
      year = value;
    } else if (!originalTitle && value) {
      originalTitle = value;
    }
  }

  const quotedMatch = originalLabel.match(/«([^»]+)»/);
  if (!originalTitle && quotedMatch) {
    originalTitle = quotedMatch[1].trim();
  }

  let base = originalLabel;
  if (year) {
    const yearRegex = new RegExp(`\\b${year}\\b`, "g");
    base = base.replace(yearRegex, " ");
  }

  base = base.replace(/[()«»"]/g, " ");

  if (!originalTitle) {
    const pipeParts = base
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);
    if (pipeParts.length > 1) {
      originalTitle = pipeParts.slice(1).join(" ");
      base = pipeParts[0];
    }
  } else {
    base = base.split("|")[0];
  }

  if (!originalTitle) {
    const slashParts = base
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
    if (slashParts.length > 1) {
      originalTitle = slashParts.slice(1).join(" ");
      base = slashParts[0];
    }
  } else {
    base = base.split("/")[0];
  }

  const dashParts = base
    .split(/\s[-–—]\s/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (dashParts.length > 1) {
    if (!originalTitle) {
      originalTitle = dashParts.slice(1).join(" ");
    }
    base = dashParts[0];
  }

  base = base.replace(/\s+/g, " ").trim();

  return {
    originalLabel,
    title: base || originalLabel,
    originalTitle,
    year,
  };
}

function findFortuneMovieMatch(parsed, candidateList = null) {
  const candidates = candidateList ? [...candidateList] : [...watchlist, ...allMovies];
  if (!candidates.length) {
    return null;
  }

  const normalizedTitle = normalizeFortuneText(parsed.title);
  const normalizedOriginal = normalizeFortuneText(parsed.originalTitle);
  const normalizedLabel = normalizeFortuneText(parsed.originalLabel);
  const targetYear = parsed.year;

  let best = null;
  let bestScore = -Infinity;

  candidates.forEach((movie) => {
    const movieTitle = normalizeFortuneText(movie.title);
    const movieOriginal = normalizeFortuneText(
      movie.originalTitle || movie.original_title || ""
    );
    const movieYear = extractYearValue(movie.year);
    let score = 0;

    if (normalizedTitle && movieTitle) {
      if (movieTitle === normalizedTitle) {
        score += 6;
      } else if (
        movieTitle.includes(normalizedTitle) ||
        normalizedTitle.includes(movieTitle)
      ) {
        score += 3;
      } else if (normalizedLabel && normalizedLabel.includes(movieTitle)) {
        score += 2;
      }
    }

    if (normalizedOriginal && movieOriginal) {
      if (movieOriginal === normalizedOriginal) {
        score += 5;
      } else if (
        movieOriginal.includes(normalizedOriginal) ||
        normalizedOriginal.includes(movieOriginal)
      ) {
        score += 2;
      } else if (normalizedLabel && normalizedLabel.includes(movieOriginal)) {
        score += 2;
      }
    } else if (
      !normalizedTitle &&
      normalizedLabel &&
      movieOriginal &&
      normalizedLabel.includes(movieOriginal)
    ) {
      score += 2;
    }

    if (
      !normalizedTitle &&
      normalizedLabel &&
      movieTitle &&
      normalizedLabel.includes(movieTitle)
    ) {
      score += 2;
    }

    if (targetYear) {
      if (movieYear && movieYear === targetYear) {
        score += 3;
      } else if (
        movieYear &&
        Math.abs(Number(movieYear) - Number(targetYear)) <= 1
      ) {
        score += 1;
      } else if (movieYear) {
        score -= 2;
      }
    } else if (movieYear && parsed.originalLabel.includes(movieYear)) {
      score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      best = movie;
    }
  });

  const MIN_SCORE = 5;
  return bestScore >= MIN_SCORE ? best : null;
}

function extractKinopoiskIdFromValue(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const numeric = Math.abs(Math.trunc(value));
    return numeric ? String(numeric) : null;
  }
  const str = String(value).trim();
  if (!str) {
    return null;
  }
  const directMatch = str.match(/^\d{5,}$/);
  if (directMatch) {
    return directMatch[0];
  }
  const urlMatch = str.match(/(?:film|series|watch)\/(\d{5,})/i);
  if (urlMatch) {
    return urlMatch[1];
  }
  const hashMatch = str.match(/#(\d{5,})/);
  if (hashMatch) {
    return hashMatch[1];
  }
  const genericMatch = str.match(/\b(\d{5,})\b/);
  if (genericMatch) {
    return genericMatch[1];
  }
  return null;
}

function getKinopoiskIdFromMovie(candidate) {
  if (!candidate) {
    return null;
  }
  if (typeof candidate !== "object") {
    return extractKinopoiskIdFromValue(candidate);
  }

  const directKeys = [
    "kinopoiskId",
    "kinopoisk_id",
    "kpId",
    "kp_id",
    "kpFilmId",
    "kpFilmID",
    "filmId",
    "film_id",
    "kinopoisk",
    "kp",
  ];

  for (const key of directKeys) {
    if (key in candidate) {
      const id = extractKinopoiskIdFromValue(candidate[key]);
      if (id) {
        return id;
      }
    }
  }

  const urlKeys = [
    "kinopoiskUrl",
    "kinopoisk_url",
    "kpUrl",
    "kp_url",
    "url",
    "link",
    "kpLink",
    "kp_link",
    "kinopoiskLink",
    "kinopoisk_link",
  ];

  for (const key of urlKeys) {
    if (key in candidate) {
      const id = extractKinopoiskIdFromValue(candidate[key]);
      if (id) {
        return id;
      }
    }
  }

  if (Array.isArray(candidate.links)) {
    for (const link of candidate.links) {
      const id = extractKinopoiskIdFromValue(link);
      if (id) {
        return id;
      }
    }
  }

  if (Array.isArray(candidate.urls)) {
    for (const url of candidate.urls) {
      const id = extractKinopoiskIdFromValue(url);
      if (id) {
        return id;
      }
    }
  }

  if ("label" in candidate) {
    const id = extractKinopoiskIdFromValue(candidate.label);
    if (id) {
      return id;
    }
  }

  if ("displayText" in candidate) {
    const id = extractKinopoiskIdFromValue(candidate.displayText);
    if (id) {
      return id;
    }
  }

  return null;
}

function buildFortuneWinnerMovie(label) {
  const parsed = parseFortuneLabel(label);
  const match = findFortuneMovieMatch(parsed);
  const year = extractYearValue(match?.year) || parsed.year;
  const title = (match?.title || parsed.title || label || "").trim();
  const originalTitle = (
    match?.originalTitle ||
    match?.original_title ||
    parsed.originalTitle ||
    ""
  ).trim();

  const normalizedTitle = normalizeFortuneText(title);
  const normalizedOriginal = normalizeFortuneText(originalTitle);

  const displayParts = [];
  if (title) {
    displayParts.push(title);
  }
  if (year) {
    displayParts.push(`(${year})`);
  }
  if (
    originalTitle &&
    normalizedOriginal &&
    normalizedOriginal !== normalizedTitle
  ) {
    displayParts.push(originalTitle);
  }

  const kinopoiskId =
    getKinopoiskIdFromMovie(match) ||
    extractKinopoiskIdFromValue(parsed.originalLabel) ||
    extractKinopoiskIdFromValue(label);

  return {
    label,
    title: title || label,
    originalTitle,
    year,
    displayText: displayParts.join(" ").trim() || label,
    kinopoiskId: kinopoiskId || null,
    match: match || null,
  };
}

async function resolveFortuneMovieKinopoiskId(movie) {
  if (!movie) {
    return null;
  }

  const directId = getKinopoiskIdFromMovie(movie);
  if (directId) {
    movie.kinopoiskId = directId;
    return directId;
  }

  if (movie.match) {
    const matchId = getKinopoiskIdFromMovie(movie.match);
    if (matchId) {
      movie.kinopoiskId = matchId;
      return matchId;
    }
  }

  if (!KINOPOISK_API_KEY) {
    return null;
  }

  try {
    const film = await fetchKinopoiskFilm(
      movie.title,
      movie.year,
      movie.originalTitle
    );
    const filmId = extractKinopoiskIdFromValue(film?.filmId);
    if (filmId) {
      movie.kinopoiskId = filmId;
      return filmId;
    }
  } catch (err) {
    console.error("Failed to resolve Kinopoisk ID for fortune winner", err);
  }

  return null;
}

function getAutoTitleInput() {
  return document.getElementById("autoTitle");
}

function isAddMovieModalOpen() {
  const modal = document.getElementById("addMovieModal");
  return !!modal && modal.style.display === "block";
}

function toggleRouletteAutofillVisibility(visible) {
  if (!rouletteAutofillHint) {
    return;
  }
  rouletteAutofillHint.classList.toggle("is-visible", Boolean(visible));
}

function triggerAutoTitleSuggestions() {
  if (!isAddMovieModalOpen()) {
    return;
  }

  const input = getAutoTitleInput();
  if (!input) {
    return;
  }

  const query = input.value.trim();
  if (!query) {
    return;
  }

  showSearchLoading("autoResultsContainer", "autoResults");
  debouncedKPSearch(query);
}

function syncRouletteAutofillState() {
  const input = getAutoTitleInput();

  if (!input) {
    rouletteAutofillActive = false;
    toggleRouletteAutofillVisibility(false);
    return;
  }

  if (rouletteLastWinner) {
    const matches = input.value.trim() === rouletteLastWinner;
    rouletteAutofillActive = matches;
    toggleRouletteAutofillVisibility(matches);
  } else {
    rouletteAutofillActive = false;
    toggleRouletteAutofillVisibility(false);
    if (input.value.trim()) {
      rouletteLastWinner = "";
    }
  }
}

function applyRouletteAutofill(options = {}) {
  const { force = false, triggerSuggestions = false } = options;
  const input = getAutoTitleInput();
  const winner = rouletteLastWinner;

  if (!input) {
    rouletteAutofillActive = false;
    toggleRouletteAutofillVisibility(false);
    return;
  }

  if (!winner) {
    if (force) {
      input.value = "";
    }
    rouletteAutofillActive = false;
    toggleRouletteAutofillVisibility(false);
    return;
  }

  if (force || !input.value.trim()) {
    input.value = winner;
  }

  syncRouletteAutofillState();

  if (triggerSuggestions && rouletteAutofillActive && isAddMovieModalOpen()) {
    triggerAutoTitleSuggestions();
  }
}

async function persistRouletteLastWinner(value) {
  const normalizedValue =
    value === null || value === undefined
      ? null
      : String(value).trim() || null;

  if (!supabaseClient) {
    rouletteLastWinnerHasPendingSync = true;
    rouletteLastWinnerPendingValue = normalizedValue;
    return;
  }

  try {
    if (settingsRowId) {
      const { error } = await supabaseClient
        .from("settings")
        .update({ roulette_last_winner: normalizedValue })
        .eq("id", settingsRowId);
      if (error) throw error;
      rouletteLastWinnerHasPendingSync = false;
      rouletteLastWinnerPendingValue = null;
      return;
    }

    const { data, error } = await supabaseClient
      .from("settings")
      .select("id")
      .limit(1);

    if (error) throw error;

    const existing = Array.isArray(data) && data.length > 0 ? data[0] : null;

    if (existing) {
      settingsRowId = existing.id ?? settingsRowId;
      const { error: updateError } = await supabaseClient
        .from("settings")
        .update({ roulette_last_winner: normalizedValue })
        .eq("id", settingsRowId);
      if (updateError) throw updateError;
      rouletteLastWinnerHasPendingSync = false;
      rouletteLastWinnerPendingValue = null;
      return;
    }

    if (normalizedValue === null) {
      rouletteLastWinnerHasPendingSync = false;
      rouletteLastWinnerPendingValue = null;
      return;
    }

    const { data: inserted, error: insertError } = await supabaseClient
      .from("settings")
      .insert({ roulette_last_winner: normalizedValue })
      .select("id")
      .single();

    if (insertError) throw insertError;

    settingsRowId = inserted?.id ?? settingsRowId;
    rouletteLastWinnerHasPendingSync = false;
    rouletteLastWinnerPendingValue = null;
  } catch (err) {
    rouletteLastWinnerHasPendingSync = true;
    rouletteLastWinnerPendingValue = normalizedValue;
    console.error("Error saving roulette last winner", err);
  }
}

async function clearRouletteLastWinner(options = {}) {
  const { updateInput = true, persist = true } = options;

  rouletteLastWinner = "";
  const input = getAutoTitleInput();

  if (updateInput && input) {
    input.value = "";
  }

  syncRouletteAutofillState();
  debouncedKPSearch("");

  if (persist) {
    await persistRouletteLastWinner(null);
  }
}

function showFortuneWinnerModal(label) {
  if (!fortuneWinnerModal || !label) {
    return;
  }

  fortuneWinnerMovie = buildFortuneWinnerMovie(label);

  const storageValue =
    (fortuneWinnerMovie?.title || fortuneWinnerMovie?.label || label || "").trim();

  if (storageValue) {
    rouletteLastWinner = storageValue;
    rouletteAutofillActive = false;
    if (isAddMovieModalOpen()) {
      applyRouletteAutofill({ force: true, triggerSuggestions: true });
    } else {
      toggleRouletteAutofillVisibility(false);
    }
    persistRouletteLastWinner(storageValue);
  }

  if (fortuneWinnerFilmNameEl) {
    if (fortuneWinnerMovie.displayText) {
      fortuneWinnerFilmNameEl.textContent = fortuneWinnerMovie.displayText;
      fortuneWinnerFilmNameEl.style.display = "block";
    } else {
      fortuneWinnerFilmNameEl.textContent = "";
      fortuneWinnerFilmNameEl.style.display = "none";
    }
  }

  fortuneWinnerModal.style.display = "block";
}

function closeFortuneWinnerModal() {
  fortuneWinnerMovie = null;
  if (fortuneWinnerFilmNameEl) {
    fortuneWinnerFilmNameEl.textContent = "";
    fortuneWinnerFilmNameEl.style.display = "";
  }
  closeModal("fortuneWinnerModal");
  closeReyohohoPicker();
}

function getReyohohoDisplayTitle(movie) {
  if (!movie) {
    return "";
  }

  if (movie.displayText) {
    return movie.displayText;
  }

  const parts = [];

  if (movie.title) {
    parts.push(movie.title);
  }

  const movieYear =
    movie.year ||
    extractYearValue(movie.match?.year) ||
    extractYearValue(movie.match?.releaseDate);

  if (movieYear) {
    parts.push(`(${movieYear})`);
  }

  const normalizedTitle = normalizeFortuneText(movie.title);
  const normalizedOriginal = normalizeFortuneText(movie.originalTitle);

  if (
    movie.originalTitle &&
    normalizedOriginal &&
    normalizedOriginal !== normalizedTitle
  ) {
    parts.push(movie.originalTitle);
  }

  return parts.join(" ").trim();
}

function setReyohohoPickerSubtitle(movie) {
  if (!reyohohoPickerSubtitle) {
    return;
  }

  const displayTitle = getReyohohoDisplayTitle(movie);

  if (displayTitle) {
    reyohohoPickerSubtitle.textContent = `Выберите нужный фильм для "${displayTitle}"`;
  } else {
    reyohohoPickerSubtitle.textContent = "Выберите нужный фильм";
  }
}

function openReyohohoPickerLoading(movie) {
  if (!reyohohoPickerModal || !reyohohoOptionsContainer) {
    return false;
  }

  reyohohoPickerContext = { movie: movie || null, options: [] };
  setReyohohoPickerSubtitle(movie);

  if (reyohohoPickerLoading) {
    reyohohoPickerLoading.style.display = "flex";
  }

  reyohohoOptionsContainer.innerHTML = "";
  reyohohoPickerModal.style.display = "block";

  return true;
}

function renderReyohohoPickerOptions(movie, options) {
  if (!reyohohoPickerModal || !reyohohoOptionsContainer) {
    return;
  }

  if (!reyohohoPickerContext || reyohohoPickerContext.movie !== movie) {
    reyohohoPickerContext = { movie: movie || null, options: [] };
  }

  reyohohoPickerContext.options = Array.isArray(options) ? options : [];

  setReyohohoPickerSubtitle(movie);

  if (reyohohoPickerLoading) {
    reyohohoPickerLoading.style.display = "none";
  }

  reyohohoOptionsContainer.innerHTML = "";

  if (!reyohohoPickerContext.options.length) {
    return;
  }

  const fragment = document.createDocumentFragment();
  const limitedOptions = reyohohoPickerContext.options.slice(0, 9);

  for (const option of limitedOptions) {
    fragment.appendChild(createReyohohoOptionButton(option));
  }

  reyohohoOptionsContainer.appendChild(fragment);
}

function createReyohohoOptionButton(option) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "reyohoho-option-card";
  button.addEventListener("click", () => handleReyohohoOptionSelect(option));

  const posterWrapper = document.createElement("div");
  posterWrapper.className = "reyohoho-option-poster";

  const posterImg = document.createElement("img");
  posterImg.src =
    option.posterUrlPreview ||
    option.posterUrl ||
    DEFAULT_POSTER_PLACEHOLDER;
  posterImg.alt = option.nameRu || option.nameEn || "Постер";
  posterImg.loading = "lazy";

  posterWrapper.appendChild(posterImg);
  button.appendChild(posterWrapper);

  const infoWrapper = document.createElement("div");
  infoWrapper.className = "reyohoho-option-info";

  const titleEl = document.createElement("div");
  titleEl.className = "reyohoho-option-title";
  titleEl.textContent =
    option.nameRu || option.nameEn || option.nameOriginal || "Без названия";
  infoWrapper.appendChild(titleEl);

  const metaValues = [];

  if (option.year) {
    metaValues.push(String(option.year));
  }

  const countries = Array.isArray(option.countries)
    ? option.countries
        .map((country) => country?.country)
        .filter(Boolean)
    : [];

  if (countries.length) {
    metaValues.push(countries.slice(0, 2).join(", "));
  }

  if (
    option.nameEn &&
    option.nameRu &&
    option.nameEn.trim().toLowerCase() !== option.nameRu.trim().toLowerCase()
  ) {
    metaValues.push(option.nameEn);
  } else if (option.nameEn && !option.nameRu) {
    metaValues.push(option.nameEn);
  }

  if (metaValues.length) {
    const metaEl = document.createElement("div");
    metaEl.className = "reyohoho-option-meta";
    metaEl.textContent = metaValues.join(" • ");
    infoWrapper.appendChild(metaEl);
  }

  const ratingValue =
    option.rating && option.rating !== "null" ? String(option.rating).trim() : "";

  if (ratingValue) {
    const ratingEl = document.createElement("div");
    ratingEl.className = "reyohoho-option-rating";
    ratingEl.textContent = `Рейтинг КП: ${ratingValue}`;
    infoWrapper.appendChild(ratingEl);
  }

  button.appendChild(infoWrapper);

  return button;
}

function closeReyohohoPicker(shouldReturnFocus = false) {
  if (reyohohoPickerModal) {
    reyohohoPickerModal.style.display = "none";
  }
  if (reyohohoPickerLoading) {
    reyohohoPickerLoading.style.display = "none";
  }
  if (reyohohoOptionsContainer) {
    reyohohoOptionsContainer.innerHTML = "";
  }
  if (reyohohoPickerSubtitle) {
    reyohohoPickerSubtitle.textContent = "";
  }

  reyohohoPickerContext = null;

  if (shouldReturnFocus && fortuneWinnerReYohohoBtn) {
    fortuneWinnerReYohohoBtn.focus();
  }
}

function handleReyohohoOptionSelect(option) {
  const baseUrl = REYOHOHO_BASE_URL;

  if (!option) {
    closeReyohohoPicker();
    window.open(baseUrl, "_blank");
    return;
  }

  const targetId = extractKinopoiskIdFromValue(
    option.filmId || option.kinopoiskId
  );
  const targetUrl = targetId ? `${baseUrl}#${targetId}` : baseUrl;

  if (reyohohoPickerContext?.movie) {
    const contextMovie = reyohohoPickerContext.movie;

    if (targetId) {
      contextMovie.kinopoiskId = targetId;
    }

    const optionYear =
      option.year ||
      extractYearValue(option.premiereRu) ||
      extractYearValue(option.premiereWorld) ||
      extractYearValue(option.releaseDate);

    if (optionYear) {
      contextMovie.year = optionYear;
    }

    if (option.nameRu) {
      contextMovie.title = option.nameRu;
    } else if (option.nameEn && !contextMovie.title) {
      contextMovie.title = option.nameEn;
    }

    if (option.nameEn) {
      contextMovie.originalTitle = option.nameEn;
    } else if (option.nameOriginal) {
      contextMovie.originalTitle = option.nameOriginal;
    }

    contextMovie.match = option;

    const normalizedTitle = normalizeFortuneText(contextMovie.title);
    const normalizedOriginal = normalizeFortuneText(contextMovie.originalTitle);

    const displayParts = [];
    if (contextMovie.title) {
      displayParts.push(contextMovie.title);
    }
    if (contextMovie.year) {
      displayParts.push(`(${contextMovie.year})`);
    }
    if (
      contextMovie.originalTitle &&
      normalizedOriginal &&
      normalizedOriginal !== normalizedTitle
    ) {
      displayParts.push(contextMovie.originalTitle);
    }

    contextMovie.displayText =
      displayParts.join(" ").trim() ||
      contextMovie.displayText ||
      contextMovie.title ||
      "";

    if (fortuneWinnerFilmNameEl && fortuneWinnerMovie === contextMovie) {
      if (contextMovie.displayText) {
        fortuneWinnerFilmNameEl.textContent = contextMovie.displayText;
        fortuneWinnerFilmNameEl.style.display = "block";
      } else {
        fortuneWinnerFilmNameEl.textContent = "";
        fortuneWinnerFilmNameEl.style.display = "none";
      }
    }
  }

  closeReyohohoPicker();

  const newWindow = window.open(targetUrl, "_blank");
  if (!newWindow) {
    console.warn("ReYohoho window was blocked by the browser");
  }
}

async function openReyohohoFallback(baseUrl, movie) {
  let openedWindow = window.open("about:blank", "_blank");

  if (!openedWindow) {
    openedWindow = window.open(baseUrl, "_blank");
  } else {
    try {
      openedWindow.document.write(
        "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Открываем ReYohoho...</title></head><body style='font-family:sans-serif;font-size:16px;margin:20px;'><p>Открываем страницу ReYohoho...</p></body></html>"
      );
      openedWindow.document.close();
    } catch (err) {
      console.error("Failed to prepare ReYohoho window", err);
    }
  }

  try {
    const resolvedId = await resolveFortuneMovieKinopoiskId(movie);
    const targetUrl = resolvedId ? `${baseUrl}#${resolvedId}` : baseUrl;

    if (resolvedId) {
      movie.kinopoiskId = resolvedId;
    }

    if (openedWindow && !openedWindow.closed) {
      try {
        openedWindow.location.replace(targetUrl);
        return;
      } catch (err) {
        console.error("Failed to redirect ReYohoho window", err);
      }
    }

    window.open(targetUrl, "_blank");
  } catch (err) {
    console.error("Failed to resolve Kinopoisk ID for ReYohoho link", err);

    if (openedWindow && !openedWindow.closed) {
      try {
        openedWindow.location.replace(baseUrl);
      } catch (redirectErr) {
        console.error("Failed to open fallback ReYohoho page", redirectErr);
      }
    }
  }
}

if (reyohohoPickerCancelBtn) {
  reyohohoPickerCancelBtn.addEventListener("click", () => {
    closeReyohohoPicker(true);
  });
}

if (reyohohoPickerModal) {
  reyohohoPickerModal.addEventListener("click", (event) => {
    if (event.target === reyohohoPickerModal) {
      closeReyohohoPicker(true);
    }
  });
}

if (fortuneWinnerKinopoiskBtn) {
  fortuneWinnerKinopoiskBtn.addEventListener("click", () => {
    if (!fortuneWinnerMovie) {
      return;
    }
    openKinopoiskPage(
      fortuneWinnerMovie.title,
      fortuneWinnerMovie.year,
      fortuneWinnerMovie.originalTitle
    );
  });
}

if (fortuneWinnerReYohohoBtn) {
  fortuneWinnerReYohohoBtn.addEventListener("click", async () => {
    const baseUrl = REYOHOHO_BASE_URL;

    if (!fortuneWinnerMovie) {
      window.open(baseUrl, "_blank");
      return;
    }

    const immediateId =
      getKinopoiskIdFromMovie(fortuneWinnerMovie) ||
      getKinopoiskIdFromMovie(fortuneWinnerMovie.match);

    if (immediateId) {
      fortuneWinnerMovie.kinopoiskId = immediateId;
      window.open(`${baseUrl}#${immediateId}`, "_blank");
      return;
    }

    if (!KINOPOISK_API_KEY) {
      await openReyohohoFallback(baseUrl, fortuneWinnerMovie);
      return;
    }

    const targetMovie = fortuneWinnerMovie;
    const pickerOpened = openReyohohoPickerLoading(targetMovie);

    if (pickerOpened === false) {
      await openReyohohoFallback(baseUrl, targetMovie);
      return;
    }

    try {
      const options = await fetchKinopoiskFilmOptions(targetMovie, 9);

      if (fortuneWinnerMovie !== targetMovie) {
        closeReyohohoPicker();
        return;
      }

      if (!options.length) {
        closeReyohohoPicker();
        await openReyohohoFallback(baseUrl, targetMovie);
        return;
      }

      renderReyohohoPickerOptions(targetMovie, options);
    } catch (err) {
      console.error("Failed to fetch ReYohoho suggestions", err);
      closeReyohohoPicker();
      await openReyohohoFallback(baseUrl, targetMovie);
    }
  });
}

if (fortuneWinnerCancelBtn) {
  fortuneWinnerCancelBtn.addEventListener("click", () => {
    closeFortuneWinnerModal();
  });
}

if (rouletteAutofillClearBtn) {
  rouletteAutofillClearBtn.addEventListener("click", () => {
    clearRouletteLastWinner();

// Play header video on load and then at random intervals
window.addEventListener("load", () => {
  const headerVideos = document.querySelectorAll(".rats-video");
  if (headerVideos.length === 0) return;

  // Function to get random delay within a range (in milliseconds)
  function getRandomDelay() {
    const min = 5;
    const max = 40;
    return (Math.floor(Math.random() * (max - min + 1)) + min) * 1000;
  }

  // Function to get a random video element from the list
  function getRandomVideo() {
    const randomIndex = Math.floor(Math.random() * headerVideos.length);
    return headerVideos[randomIndex];
  }

  // Function to schedule next play for a random video
  function scheduleNextPlay(videoElement) {
    setTimeout(() => {
      videoElement.play().catch(() => {});
    }, getRandomDelay());
  }

  // Start playing a random video on page load
  const firstVideo = getRandomVideo();
  firstVideo.play().catch(() => {});

  // Add event listener to all videos to schedule the next random video
  headerVideos.forEach((video) => {
    video.addEventListener("ended", () => {
      const nextVideo = getRandomVideo();
      scheduleNextPlay(nextVideo);
    });
  });
});

const musicMenu = document.getElementById("musicMenu");
const musicMenuButton = document.getElementById("musicMenuButton");
const closeMusicMenu = document.getElementById("closeMusicMenu");
const collapseMusicMenuButton = document.getElementById("collapseMusicMenu");
const musicMenuCollapseInertTargets = musicMenu
  ? Array.from(musicMenu.querySelectorAll("[data-menu-collapse-inert]"))
  : [];
const rulesPanel = document.getElementById("rulesPanel");
const rulesPanelToggleButton = document.getElementById(
  "rulesPanelToggleButton"
);
const collapseRulesPanel = document.getElementById("collapseRulesPanel");
const musicList = document.getElementById("musicList");
const audioPlayer = document.getElementById("audioPlayer");
const playPauseBtn = document.getElementById("playPauseBtn");
const loopBtn = document.getElementById("loopBtn");
const volumeSlider = document.getElementById("volumeSlider");
const volumeValue = document.getElementById("volumeValue");
const fortuneTipButton = document.getElementById("fortuneTipButton");
const fortuneTipAudio = document.getElementById("fortuneTipAudio");
let fortuneWheelApi = null;
let rulesPanelManuallyCollapsed = false;
let rulesPanelStandaloneOpen = false;

if (audioPlayer) {
  audioPlayer.loop = true;
}

if (playPauseBtn && audioPlayer) {
  playPauseBtn.addEventListener("click", () => {
    if (audioPlayer.paused) {
      audioPlayer.play().catch(() => {});
    } else {
      audioPlayer.pause();
    }
  });

  audioPlayer.addEventListener("play", () => {
    playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
  });

  audioPlayer.addEventListener("pause", () => {
    playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
  });
}

if (loopBtn && audioPlayer) {
  loopBtn.classList.add("active");
  loopBtn.addEventListener("click", () => {
    audioPlayer.loop = !audioPlayer.loop;
    loopBtn.classList.toggle("active", audioPlayer.loop);
  });
}

if (volumeSlider && audioPlayer) {
  const updateVolumeText = () => {
    if (volumeValue) {
      volumeValue.textContent = Math.round(audioPlayer.volume * 100) + "%";
    }
  };

  const updateFromSlider = () => {
    audioPlayer.volume = parseFloat(volumeSlider.value);
    updateVolumeText();
  };

  const sliderValue = parseFloat(volumeSlider.value);
  if (!Number.isNaN(sliderValue)) {
    audioPlayer.volume = sliderValue;
  } else {
    audioPlayer.volume = 0.3;
    volumeSlider.value = "0.3";
  }

  volumeSlider.addEventListener("input", updateFromSlider);

  audioPlayer.addEventListener("volumechange", () => {
    volumeSlider.value = String(audioPlayer.volume);
    updateVolumeText();
  });

  volumeSlider.value = String(audioPlayer.volume);
  updateVolumeText();
}

const syncRulesPanelToggleButton = () => {
  if (!rulesPanelToggleButton) return;
  const isActive =
    rulesPanelStandaloneOpen &&
    rulesPanel &&
    rulesPanel.classList.contains("open");
  const panelIsOpen = !!(rulesPanel && rulesPanel.classList.contains("open"));
  const label = isActive ? "Скрыть правила" : "Показать правила";

  rulesPanelToggleButton.classList.toggle("is-active", isActive);
  rulesPanelToggleButton.classList.toggle("is-hidden", panelIsOpen);
  rulesPanelToggleButton.setAttribute(
    "aria-pressed",
    isActive ? "true" : "false"
  );
  rulesPanelToggleButton.setAttribute("aria-label", label);
  rulesPanelToggleButton.setAttribute("title", label);
};

const updateRulesPanelState = () => {
  if (!rulesPanel) {
    syncRulesPanelToggleButton();
    return;
  }

  const menuIsOpen = musicMenu ? musicMenu.classList.contains("open") : false;
  const menuIsCollapsed = musicMenu
    ? musicMenu.classList.contains("collapsed")
    : false;
  const shouldOpenFromMenu =
    menuIsOpen && !menuIsCollapsed && !rulesPanelManuallyCollapsed;
  const shouldOpen = shouldOpenFromMenu || rulesPanelStandaloneOpen;

  rulesPanel.classList.toggle("open", shouldOpen);
  rulesPanel.classList.toggle(
    "rules-panel--standalone",
    shouldOpen && rulesPanelStandaloneOpen
  );
  rulesPanel.setAttribute("aria-hidden", shouldOpen ? "false" : "true");

  if (!shouldOpen) {
    rulesPanelStandaloneOpen = false;
    rulesPanel.classList.remove("rules-panel--standalone");
  }

  syncRulesPanelToggleButton();
};

if (rulesPanelToggleButton) {
  rulesPanelToggleButton.addEventListener("click", () => {
    const isActive =
      rulesPanelStandaloneOpen &&
      rulesPanel &&
      rulesPanel.classList.contains("open");

    rulesPanelStandaloneOpen = !isActive;

    if (rulesPanelStandaloneOpen) {
      rulesPanelManuallyCollapsed = false;
    }

    updateRulesPanelState();
  });
}

if (collapseRulesPanel) {
  collapseRulesPanel.addEventListener("click", () => {
    rulesPanelManuallyCollapsed = true;
    rulesPanelStandaloneOpen = false;
    updateRulesPanelState();
  });
}

if (musicMenu && musicMenuButton && closeMusicMenu) {
  const setMenuCollapsed = (shouldCollapse) => {
    musicMenu.classList.toggle("collapsed", shouldCollapse);
    document.body.classList.toggle("music-menu-is-collapsed", shouldCollapse);
    musicMenu.setAttribute("aria-expanded", shouldCollapse ? "false" : "true");
    if (musicMenuCollapseInertTargets.length > 0) {
      musicMenuCollapseInertTargets.forEach((element) => {
        if (!element) {
          return;
        }

        const containsExpandButton =
          collapseMusicMenuButton && element.contains(collapseMusicMenuButton);

        if (containsExpandButton) {
          element.removeAttribute("inert");
          element.removeAttribute("aria-hidden");
          return;
        }

        if (shouldCollapse) {
          element.setAttribute("inert", "");
          element.setAttribute("aria-hidden", "true");
        } else {
          element.removeAttribute("inert");
          element.removeAttribute("aria-hidden");
        }
      });
    }
    if (collapseMusicMenuButton) {
      collapseMusicMenuButton.setAttribute(
        "aria-label",
        shouldCollapse ? "Развернуть панель" : "Свернуть панель"
      );
      const collapseLabel = collapseMusicMenuButton.querySelector(
        ".collapse-music-menu-label"
      );
      if (collapseLabel) {
        collapseLabel.textContent = shouldCollapse ? "Развернуть" : "Свернуть";
      }
    }
    if (shouldCollapse) {
      rulesPanelStandaloneOpen = false;
    }
    updateRulesPanelState();
  };

  const closeMenu = () => {
    musicMenu.classList.remove("open");
    setMenuCollapsed(false);
    rulesPanelManuallyCollapsed = false;
    rulesPanelStandaloneOpen = false;
    updateRulesPanelState();
    if (audioPlayer) audioPlayer.pause();
    if (musicList) {
      musicList
        .querySelectorAll("button")
        .forEach((b) => b.classList.remove("active"));
    }
  };

  setMenuCollapsed(false);
  updateRulesPanelState();

  musicMenuButton.addEventListener("click", () => {
    musicMenu.classList.add("open");
    setMenuCollapsed(false);
    rulesPanelManuallyCollapsed = false;
    updateRulesPanelState();
    if (
      fortuneWheelApi &&
      typeof fortuneWheelApi.handleMenuOpen === "function"
    ) {
      fortuneWheelApi.handleMenuOpen();
    }
  });

  closeMusicMenu.addEventListener("click", () => {
    closeMenu();
  });

  if (collapseMusicMenuButton) {
    collapseMusicMenuButton.addEventListener("click", () => {
      const shouldCollapse = !musicMenu.classList.contains("collapsed");
      setMenuCollapsed(shouldCollapse);
      if (!shouldCollapse) {
        rulesPanelManuallyCollapsed = false;
      }
      if (
        !shouldCollapse &&
        fortuneWheelApi &&
        typeof fortuneWheelApi.handleMenuOpen === "function"
      ) {
        fortuneWheelApi.handleMenuOpen();
      }
    });
  }

  if (musicList) {
    musicList.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-src]");
      if (!btn || !audioPlayer) return;

      const src = btn.getAttribute("data-src");
      if (!src) return;

      audioPlayer.src = src;
      audioPlayer.play().catch(() => {});
      musicList
        .querySelectorAll("button")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  }
}

if (fortuneTipButton && fortuneTipAudio) {
  fortuneTipAudio.loop = false;
  fortuneTipAudio.volume = 0.25;

  const ensureTipAudioSource = () => {
    const configuredSrc = fortuneTipButton.getAttribute("data-audio-src");
    if (configuredSrc && !fortuneTipAudio.getAttribute("src")) {
      fortuneTipAudio.src = configuredSrc;
    }
    return fortuneTipAudio.getAttribute("src");
  };

  const resetTipButtonState = () => {
    fortuneTipButton.disabled = false;
    fortuneTipButton.classList.remove("is-playing");
  };

  fortuneTipButton.addEventListener("click", () => {
    const src = ensureTipAudioSource();
    if (!src) {
      console.warn("No audio source configured for the fortune tip button.");
      return;
    }

    fortuneTipButton.disabled = true;
    fortuneTipButton.classList.add("is-playing");

    try {
      fortuneTipAudio.pause();
      fortuneTipAudio.currentTime = 0;
    } catch (err) {
      console.warn("Unable to reset fortune tip audio state.", err);
    }

    fortuneTipAudio.play().catch((err) => {
      console.warn("Failed to play fortune tip audio.", err);
      resetTipButtonState();
    });
  });

  fortuneTipAudio.addEventListener("ended", resetTipButtonState);
  fortuneTipAudio.addEventListener("error", resetTipButtonState);
}

fortuneWheelApi = initFortuneWheel();

function initFortuneWheel() {
  const canvas = document.getElementById("wheelCanvas");
  const statusEl = document.getElementById("status");
  const input = document.getElementById("itemsInput");
  const fortuneItemInput = document.getElementById("fortuneItemInput");
  const itemsListEl = document.getElementById("fortuneItemsList");
  const clearBtn = document.getElementById("clearBtn");
  const resetBtn = document.getElementById("resetBtn");
  const shuffleBtn = document.getElementById("shuffleBtn");
  const durationInput = document.getElementById("spinDurationInput");
  const fortuneItemsCountValue = document.getElementById("fortuneItemsCount");
  const resultOverlay = document.getElementById("fortuneResultOverlay");
  const resultNameEl = document.getElementById("fortuneResultName");
  const fortuneDuplicateModal = document.getElementById(
    "fortuneDuplicateModal"
  );
  const fortuneDuplicateMessage = document.getElementById(
    "fortuneDuplicateMessage"
  );
  const fortuneDuplicateDetails = document.getElementById(
    "fortuneDuplicateDetails"
  );
  const fortuneDuplicateCancel = document.getElementById(
    "fortuneDuplicateCancel"
  );
  const fortuneDuplicateConfirm = document.getElementById(
    "fortuneDuplicateConfirm"
  );
  const fortuneDuplicateClose = document.getElementById(
    "fortuneDuplicateClose"
  );

  const fortuneWheelWrap = canvas ? canvas.parentElement : null;
  const fortunePointerEl =
    fortuneWheelWrap?.querySelector(".fortune-pointer") ?? null;
  let fortunePointerWidth = null;
  let lastPointerGap = null;
  let lastPointerRightValue = null;

  const measurePointerWidth = () => {
    if (!fortunePointerEl) {
      return 0;
    }
    const rect = fortunePointerEl.getBoundingClientRect();
    if (rect.width > 0) {
      return rect.width;
    }
    const styles = window.getComputedStyle(fortunePointerEl);
    const borderRight = parseFloat(styles.borderRightWidth || "0");
    if (borderRight > 0) {
      return borderRight;
    }
    const borderLeft = parseFloat(styles.borderLeftWidth || "0");
    if (borderLeft > 0) {
      return borderLeft;
    }
    const fallbackWidth = parseFloat(styles.width || "0");
    if (fallbackWidth > 0) {
      return fallbackWidth;
    }
    return 0;
  };

  const POINTER_SHIFT = 20;

  const updatePointerPosition = (canvasWidth, canvasHeight) => {
    if (!fortunePointerEl) {
      return;
    }
    const pointerGap =
      Math.max(0, (canvasWidth - Math.min(canvasWidth, canvasHeight)) / 2 + 4);
  
    if (pointerGap !== lastPointerGap || fortunePointerWidth === null) {
      const measuredWidth = measurePointerWidth();
      if (measuredWidth > 0) {
        fortunePointerWidth = measuredWidth;
      } else if (fortunePointerWidth === null) {
        fortunePointerWidth = 28;
      }
      lastPointerGap = pointerGap;
    }
  
    const effectiveWidth = fortunePointerWidth ?? 0;
    const pointerRight = pointerGap - effectiveWidth + POINTER_SHIFT; // ← тут сдвиг
    const pointerRightValue = `${pointerRight}px`;
  
    if (pointerRightValue !== lastPointerRightValue) {
      fortunePointerEl.style.right = pointerRightValue;
      lastPointerRightValue = pointerRightValue;
    }
  };

  if (!canvas || !statusEl || !input) {
    return null;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  let items = [];
  let eliminatedItems = new Set();
  let eliminatedOrder = [];
  let lastEliminatedLabel = null;
  let pendingFortuneItemLabel = null;

  function registerElimination(label) {
    if (!label) {
      return;
    }

    eliminatedItems.add(label);
    if (!eliminatedOrder.includes(label)) {
      eliminatedOrder.push(label);
    }
    lastEliminatedLabel = label;
    if (!items.includes(label)) {
      items.push(label);
    }
  }

  function clearEliminatedHistory() {
    eliminatedOrder = [];
    lastEliminatedLabel = null;
  }

  function getActiveItems() {
    return items.filter((item) => !eliminatedItems.has(item));
  }

  const updateFortuneItemsCount = (count) => {
    if (fortuneItemsCountValue) {
      fortuneItemsCountValue.textContent = String(count);
    }
  };

  function resetFortuneDuplicateState() {
    pendingFortuneItemLabel = null;
    if (fortuneDuplicateDetails) {
      fortuneDuplicateDetails.textContent = "";
    }
  }

  function showFortuneDuplicateNotice(match, label) {
    if (!fortuneDuplicateModal || !fortuneDuplicateMessage) {
      commitFortuneItem(label);
      resetFortuneDuplicateState();
      return;
    }

    const displayTitle = (match?.title || label || "").trim();
    const displayYear = extractYearValue(match?.year);
    const originalTitle = (
      match?.originalTitle ||
      match?.original_title ||
      ""
    ).trim();

    const baseMessageParts = [];
    if (displayTitle) {
      baseMessageParts.push(`«${displayTitle}»`);
    }
    if (displayYear) {
      baseMessageParts.push(`(${displayYear})`);
    }

    const baseMessage =
      baseMessageParts.length > 0
        ? `Фильм ${baseMessageParts.join(" ")} уже есть в списке просмотренных.`
        : "Этот фильм уже есть в списке просмотренных.";

    fortuneDuplicateMessage.textContent = baseMessage;
    if (fortuneDuplicateDetails) {
      if (
        originalTitle &&
        normalizeFortuneText(originalTitle) !==
          normalizeFortuneText(displayTitle)
      ) {
        fortuneDuplicateDetails.textContent = `Оригинальное название: ${originalTitle}`;
      } else {
        fortuneDuplicateDetails.textContent = "";
      }
    }

    fortuneDuplicateModal.style.display = "block";
    if (statusEl) {
      statusEl.textContent = "Фильм уже есть в списке просмотренных.";
    }
    if (fortuneDuplicateConfirm) {
      setTimeout(() => fortuneDuplicateConfirm.focus(), 0);
    }
  }

  function commitFortuneItem(label) {
    const value = (label || "").trim();
    if (!value) {
      if (fortuneItemInput) {
        fortuneItemInput.value = "";
      }
      return;
    }

    const activeItems = getActiveItems();
    if (activeItems.length >= 128) {
      if (statusEl) {
        statusEl.textContent =
          "Нельзя добавить больше 128 фильмов для рулетки.";
      }
      return;
    }

    activeItems.push(value);
    input.value = activeItems.join("\n");
    if (fortuneItemInput) {
      fortuneItemInput.value = "";
    }
    hideResultOverlay();
    updateFromInput();
  }

  function addFortuneItem(label, options = {}) {
    const { skipDuplicateCheck = false } = options;
    const value = (label || "").trim();
    if (!value) {
      if (fortuneItemInput) {
        fortuneItemInput.value = "";
      }
      return;
    }

    const activeItems = getActiveItems();
    if (activeItems.length >= 128) {
      if (statusEl) {
        statusEl.textContent =
          "Нельзя добавить больше 128 фильмов для рулетки.";
      }
      return;
    }

    if (!skipDuplicateCheck) {
      const parsed = parseFortuneLabel(value);
      const match = findFortuneMovieMatch(parsed, allMovies);
      if (match) {
        pendingFortuneItemLabel = value;
        showFortuneDuplicateNotice(match, value);
        return;
      }
    }

    commitFortuneItem(value);
    resetFortuneDuplicateState();
  }

  if (fortuneDuplicateCancel) {
    fortuneDuplicateCancel.addEventListener("click", () => {
      closeModal("fortuneDuplicateModal");
      resetFortuneDuplicateState();
      if (fortuneItemInput) {
        fortuneItemInput.focus();
      }
    });
  }

  if (fortuneDuplicateClose) {
    fortuneDuplicateClose.addEventListener("click", () => {
      closeModal("fortuneDuplicateModal");
      resetFortuneDuplicateState();
      if (fortuneItemInput) {
        fortuneItemInput.focus();
      }
    });
  }

  if (fortuneDuplicateConfirm) {
    fortuneDuplicateConfirm.addEventListener("click", () => {
      const pendingLabel = pendingFortuneItemLabel;
      closeModal("fortuneDuplicateModal");
      resetFortuneDuplicateState();
      if (pendingLabel) {
        addFortuneItem(pendingLabel, { skipDuplicateCheck: true });
      }
    });
  }

  if (fortuneDuplicateModal) {
    fortuneDuplicateModal.addEventListener("click", (event) => {
      if (event.target === fortuneDuplicateModal) {
        resetFortuneDuplicateState();
        if (fortuneItemInput) {
          setTimeout(() => fortuneItemInput.focus(), 0);
        }
      }
    });
  }

  function renderFortuneItemsList() {
    const activeItems = getActiveItems();
    updateFortuneItemsCount(activeItems.length);

    if (!itemsListEl) {
      return;
    }

    itemsListEl.innerHTML = "";

    const activeItemColors = new Map();
    if (activeItems.length > 0) {
      activeItems.forEach((label, index) => {
        activeItemColors.set(label, colorForIndex(index, activeItems.length));
      });
    }

    const createFortuneSearchLink = (
      href,
      ariaLabel,
      extraClass,
      iconSrc = "images/kp_icon.webp"
    ) => {
      const link = document.createElement("a");
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = ["fortune-items-link", extraClass]
        .filter(Boolean)
        .join(" ");
      link.setAttribute("aria-label", ariaLabel);
      link.title = ariaLabel;
      const icon = document.createElement("img");
      icon.src = iconSrc;
      icon.alt = "";
      icon.className = "fortune-items-link-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.draggable = false;
      link.appendChild(icon);
      return link;
    };

    if (items.length === 0) {
      const emptyEl = document.createElement("li");
      emptyEl.className = "fortune-items-empty";
      emptyEl.textContent = "Список пуст. Добавьте фильм выше.";
      itemsListEl.appendChild(emptyEl);
      return;
    }

    const appendItem = (label, options = {}) => {
      const { isEliminated = false, color } = options;
      const listItem = document.createElement("li");
      listItem.className = "fortune-items-list-item";
      if (isEliminated) {
        listItem.setAttribute("data-fortune-item-state", "eliminated");
      }

      const colorStrip = document.createElement("span");
      colorStrip.className = "fortune-items-color-strip";
      colorStrip.setAttribute("aria-hidden", "true");
      if (color) {
        colorStrip.style.setProperty("--fortune-item-color", color);
      }
      listItem.appendChild(colorStrip);

      const titleEl = document.createElement("span");
      titleEl.className = "fortune-items-list-title";
      titleEl.textContent = label;
      listItem.appendChild(titleEl);

      const actionsEl = document.createElement("div");
      actionsEl.className = "fortune-items-list-actions";

      const searchLabel = label.trim();
      const encodedLabel = encodeURIComponent(searchLabel || label);
      const kpAriaLabel = `Открыть поиск Кинопоиска для «${label}»`;
      const imdbAriaLabel = `Открыть поиск IMDb для «${label}»`;
      const kinopoiskLink = createFortuneSearchLink(
        `https://www.kinopoisk.ru/index.php?kp_query=${encodedLabel}`,
        kpAriaLabel,
        "fortune-items-link-kinopoisk"
      );
      const imdbLink = createFortuneSearchLink(
        `https://www.imdb.com/find/?q=${encodedLabel}&s=tt`,
        imdbAriaLabel,
        "fortune-items-link-imdb",
        "images/imdb_icon.webp"
      );
      actionsEl.appendChild(kinopoiskLink);
      actionsEl.appendChild(imdbLink);

      if (!isEliminated) {
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "fortune-items-remove";
        removeBtn.setAttribute("aria-label", `Удалить «${label}» из списка`);
        removeBtn.title = "Удалить";
        removeBtn.innerHTML = '<span aria-hidden="true">✕</span>';
        removeBtn.addEventListener("click", () => {
          if (spinning) {
            return;
          }

          const currentActive = getActiveItems();
          const removeIndex = currentActive.indexOf(label);
          if (removeIndex === -1) {
            return;
          }

          currentActive.splice(removeIndex, 1);
          input.value = currentActive.join("\n");
          updateFromInput();
        });

        actionsEl.appendChild(removeBtn);
      }

      listItem.appendChild(actionsEl);
      itemsListEl.appendChild(listItem);
      return listItem;
    };

    items.forEach((label) => {
      const isEliminated = eliminatedItems.has(label);
      const itemColor = isEliminated ? null : activeItemColors.get(label);
      const listItem = appendItem(label, { isEliminated, color: itemColor });

      if (!isEliminated) {
        return;
      }

      if (label === lastEliminatedLabel) {
        requestAnimationFrame(() => {
          listItem.classList.add(
            "fortune-items-list-item--eliminated",
            "fortune-items-list-item--animate"
          );
        });
      } else {
        listItem.classList.add("fortune-items-list-item--eliminated");
      }
    });

    lastEliminatedLabel = null;
  }

  let rotation = 0;
  let spinning = false;
  let startRotation = 0;
  let targetRotation = 0;
  let spinStartTime = 0;
  let spinDurationMs = 7000;
  const pointerAngle = 0;
  let resultOverlayTimeoutId = null;
  function setInputValuePreservingState(value) {
    if (!input) {
      return;
    }

    if (input.value === value) {
      return;
    }

    const previousScrollTop = input.scrollTop;
    const isFocused = document.activeElement === input;
    let selectionStart = null;
    let selectionEnd = null;

    if (isFocused) {
      selectionStart = input.selectionStart;
      selectionEnd = input.selectionEnd;
    }

    input.value = value;

    if (isFocused && selectionStart !== null && selectionEnd !== null) {
      const length = input.value.length;
      const clampedStart = Math.min(selectionStart, length);
      const clampedEnd = Math.min(selectionEnd, length);
      try {
        input.setSelectionRange(clampedStart, clampedEnd);
      } catch (err) {
        /* ignore */
      }
    }

    input.scrollTop = previousScrollTop;
  }

  function updateInputFromActiveItems() {
    if (!input) {
      return;
    }
    const activeItems = getActiveItems();
    setInputValuePreservingState(activeItems.join("\n"));
    renderFortuneItemsList();
  }
  const placeholderColors = [
    "hsl(0deg 84% 55%)",
    "hsl(24deg 86% 57%)",
    "hsl(44deg 88% 58%)",
    "hsl(126deg 45% 50%)",
    "hsl(173deg 55% 46%)",
    "hsl(196deg 68% 52%)",
    "hsl(230deg 60% 55%)",
    "hsl(286deg 55% 58%)",
  ];
  const placeholderSegmentsCount = placeholderColors.length;
  const idleAngularVelocity = (Math.PI * 2) / 24000;
  let idleRotation = 0;
  let idleAnimationId = null;
  let idleLastTimestamp = null;
  let idleActive = false;

  function setResultOverlayVisible(visible) {
    if (!resultOverlay) {
      return;
    }
    const wasVisible = resultOverlay.classList.contains("visible");
    resultOverlay.classList.toggle("visible", visible);
    resultOverlay.setAttribute("aria-hidden", String(!visible));
  }

  function hideResultOverlay() {
    if (resultOverlayTimeoutId) {
      window.clearTimeout(resultOverlayTimeoutId);
      resultOverlayTimeoutId = null;
    }
    setResultOverlayVisible(false);
  }

  function showResultOverlay(text) {
    if (!resultOverlay || !resultNameEl) {
      return;
    }

    resultNameEl.textContent = text;
    setResultOverlayVisible(true);

    if (resultOverlayTimeoutId) {
      window.clearTimeout(resultOverlayTimeoutId);
    }
    resultOverlayTimeoutId = window.setTimeout(() => {
      setResultOverlayVisible(false);
      resultOverlayTimeoutId = null;
    }, 4000);
  }

  if (resultOverlay) {
    resultOverlay.addEventListener("click", hideResultOverlay);
  }

  const parseDurationSeconds = (value) => {
    if (value === null || value === undefined) {
      return null;
    }

    const normalized = String(value).trim().replace(",", ".");
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return Math.max(1, Math.round(parsed));
  };

  if (durationInput) {
    const fallbackSeconds = Math.round(spinDurationMs / 1000);
    const initial = parseDurationSeconds(durationInput.value);
    let lastValidDurationSeconds = initial ?? fallbackSeconds;

    lastValidDurationSeconds = Math.max(1, lastValidDurationSeconds);
    durationInput.value = String(lastValidDurationSeconds);
    spinDurationMs = lastValidDurationSeconds * 1000;

    const commitDuration = (rawValue) => {
      const parsed = parseDurationSeconds(rawValue);
      const seconds = parsed ?? lastValidDurationSeconds;
      lastValidDurationSeconds = Math.max(1, seconds);
      spinDurationMs = lastValidDurationSeconds * 1000;
      durationInput.value = String(lastValidDurationSeconds);
    };

    durationInput.addEventListener("input", (event) => {
      const parsed = parseDurationSeconds(event.target.value);
      if (parsed !== null) {
        lastValidDurationSeconds = parsed;
        spinDurationMs = parsed * 1000;
      }
    });

    durationInput.addEventListener("change", (event) => {
      commitDuration(event.target.value);
    });

    durationInput.addEventListener("blur", (event) => {
      commitDuration(event.target.value);
    });
  }

  function normalizeAngle(angle) {
    const tau = Math.PI * 2;
    return ((angle % tau) + tau) % tau;
  }

  function stepIdleAnimation(timestamp) {
    if (!idleActive) {
      idleAnimationId = null;
      idleLastTimestamp = null;
      return;
    }

    if (typeof timestamp === "number") {
      if (idleLastTimestamp !== null) {
        const delta = timestamp - idleLastTimestamp;
        idleRotation = normalizeAngle(
          idleRotation + delta * idleAngularVelocity
        );
      }
      idleLastTimestamp = timestamp;
    }

    drawWheel();

    if (idleActive) {
      idleAnimationId = requestAnimationFrame(stepIdleAnimation);
    }
  }

  function startIdleAnimation() {
    if (idleActive) {
      return;
    }
    idleActive = true;
    idleLastTimestamp = null;
    idleAnimationId = requestAnimationFrame(stepIdleAnimation);
  }

  function stopIdleAnimation() {
    if (!idleActive) {
      return;
    }
    idleActive = false;
    if (idleAnimationId !== null) {
      cancelAnimationFrame(idleAnimationId);
      idleAnimationId = null;
    }
    idleLastTimestamp = null;
  }

  function easeOutCubic(t) {
    const clamped = Math.min(1, Math.max(0, t));
    return 1 - Math.pow(1 - clamped, 3);
  }

  function dprScaleCanvas(cnv) {
    const rect = cnv.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width || cnv.width || 1));
    const height = Math.max(1, Math.round(rect.height || cnv.height || 1));
    cnv.width = width * dpr;
    cnv.height = height * dpr;
    const context = cnv.getContext("2d");
    if (context) {
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return { width, height };
  }

  function parseInput(text) {
    return text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function shuffleArray(array) {
    const cloned = [...array];
    for (let i = cloned.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
    }
    return cloned;
  }

  function colorForIndex(i, n) {
    const hue = Math.round((360 * i) / Math.max(1, n));
    return `hsl(${hue}deg 75% 55%)`;
  }

  function drawWheel() {
    const { width: w, height: h } = dprScaleCanvas(canvas);
    const size = Math.min(w, h);
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.max(40, size / 2 - 12);

    ctx.clearRect(0, 0, w, h);

    const activeItems = items.filter((item) => !eliminatedItems.has(item));
    const usePlaceholder = items.length === 0;
    const segmentCount = usePlaceholder
      ? placeholderSegmentsCount
      : Math.max(1, activeItems.length);
    const segAngle = (Math.PI * 2) / segmentCount;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(usePlaceholder ? idleRotation : rotation);

    for (let i = 0; i < segmentCount; i += 1) {
      const start = i * segAngle;
      const end = start + segAngle;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = usePlaceholder
        ? placeholderColors[i % placeholderColors.length]
        : colorForIndex(i, segmentCount);
      ctx.fill();

      if (segmentCount > 1) {
        ctx.strokeStyle = usePlaceholder
          ? "rgba(255,255,255,0.28)"
          : "rgba(0,0,0,0.35)";
        ctx.lineWidth = usePlaceholder ? 2 : 1.5;
        ctx.stroke();
      }

      if (!usePlaceholder) {
        const mid = start + segAngle / 2;
        ctx.save();
        ctx.rotate(mid);
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        const fontSize = Math.max(
          10,
          Math.min(
            18,
            Math.floor(radius * 0.095 * (8 / Math.sqrt(segmentCount)))
          )
        );
        ctx.font = `600 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Inter, Arial`;
        ctx.fillStyle = "#fff";
        ctx.shadowColor = "rgba(0,0,0,0.55)";
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;

        const label = String(activeItems[i] ?? "");
        const maxTextWidth = radius * 0.8;
        let display = label;
        while (
          ctx.measureText(display).width > maxTextWidth &&
          display.length > 3
        ) {
          display = display.slice(0, -2);
        }
        if (display !== label) {
          display = `${display.slice(0, -1)}…`;
        }

        ctx.fillText(display, radius * 0.25, 0);
        ctx.restore();
      }
    }

    ctx.beginPath();
    ctx.arc(0, 0, Math.max(18, radius * 0.09), 0, Math.PI * 2);
    ctx.fillStyle = "#10132c";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.stroke();

    ctx.restore();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.arc(0, 0, radius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.restore();

    updatePointerPosition(w, h);
  }

  function pickCurrentIndex() {
    const activeItems = items.filter((item) => !eliminatedItems.has(item));
    const n = Math.max(1, activeItems.length);
    const seg = (Math.PI * 2) / n;
    const normalized = normalizeAngle(pointerAngle - rotation);
    let idx = Math.floor(normalized / seg);
    if (idx < 0) idx += n;
    return idx % n;
  }

  function announceWinner(index) {
    const activeItems = items.filter((item) => !eliminatedItems.has(item));
    const text = activeItems[index];
    if (!text) {
      return;
    }

    const remainingItems = activeItems.filter((item) => item !== text);

    if (remainingItems.length === 0) {
      statusEl.innerHTML = `Результат: <b>${escapeHtml(
        text
      )}</b><br><span class="fortune-status-success">🎉 Игра завершена! Все элементы были выбраны.</span>`;
    } else {
      statusEl.innerHTML = `Результат: <b>${escapeHtml(
        text
      )}</b><br><span class="fortune-status-remaining">Осталось элементов: ${
        remainingItems.length
      }</span>`;
    }

    registerElimination(text);
    updateInputFromActiveItems();
    drawWheel();

    if (remainingItems.length === 1) {
      showFortuneWinnerModal(remainingItems[0]);
      return;
    }

    showResultOverlay(text);

    const pointer = document.querySelector(".fortune-pointer");
    if (pointer && pointer.animate) {
      pointer.animate(
        [
          { filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.45))" },
          { filter: "drop-shadow(0 0 14px rgba(40,199,111,0.9))" },
          { filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.45))" },
        ],
        { duration: 900, easing: "ease" }
      );
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function animate(now) {
    if (!spinning) {
      return;
    }

    const current = typeof now === "number" ? now : performance.now();
    const elapsed = current - spinStartTime;
    const duration = Math.max(1, spinDurationMs);
    const progress = Math.min(1, elapsed / duration);
    const eased = easeOutCubic(progress);

    rotation = startRotation + (targetRotation - startRotation) * eased;

    if (progress >= 1) {
      rotation = normalizeAngle(rotation);
      spinning = false;
      if (durationInput) {
        durationInput.disabled = false;
      }
      drawWheel();
      const winner = pickCurrentIndex();
      announceWinner(winner);
      return;
    }

    drawWheel();
    requestAnimationFrame(animate);
  }

  function spin() {
    const activeItems = items.filter((item) => !eliminatedItems.has(item));
    if (spinning || activeItems.length === 0) {
      return;
    }

    stopIdleAnimation();

    hideResultOverlay();
    const segmentAngle = (Math.PI * 2) / activeItems.length;
    const winnerIndex = Math.floor(Math.random() * activeItems.length);
    const randomOffset = 0.15 + Math.random() * 0.7;
    const finalRotation = normalizeAngle(
      pointerAngle - (winnerIndex + randomOffset) * segmentAngle
    );

    const currentRotation = normalizeAngle(rotation);
    let delta = finalRotation - currentRotation;
    if (delta <= 0) {
      delta += Math.PI * 2;
    }

    const extraTurns =
      Math.max(3, Math.round(spinDurationMs / 1000) + 2) +
      Math.floor(Math.random() * 2);
    delta += extraTurns * Math.PI * 2;

    startRotation = currentRotation;
    targetRotation = startRotation + delta;
    spinStartTime = performance.now();
    spinning = true;
    rotation = startRotation;
    statusEl.textContent = "Вращение… Удачи!";
    if (durationInput) {
      durationInput.disabled = true;
    }
    requestAnimationFrame(animate);
  }

  function updateFromInput() {
    if (spinning) {
      return;
    }

    const previousActive = getActiveItems();
    const newActiveItems = parseInput(input.value).slice(0, 128);
    const hasActiveChanged =
      JSON.stringify(previousActive) !== JSON.stringify(newActiveItems);

    const previousItems = [...items];
    const eliminatedSet = new Set(eliminatedOrder);
    const remainingActive = [...newActiveItems];
    const nextItems = [];
    const placedEliminated = new Set();

    if (previousItems.length > 0) {
      previousItems.forEach((label) => {
        if (eliminatedSet.has(label)) {
          if (!placedEliminated.has(label)) {
            nextItems.push(label);
            placedEliminated.add(label);
          }
          return;
        }

        if (remainingActive.length > 0) {
          nextItems.push(remainingActive.shift());
        }
      });
    }

    while (remainingActive.length > 0) {
      nextItems.push(remainingActive.shift());
    }

    eliminatedOrder.forEach((label) => {
      if (!placedEliminated.has(label)) {
        nextItems.push(label);
        placedEliminated.add(label);
      }
    });

    items = nextItems;
    eliminatedItems = new Set(eliminatedOrder);
    if (hasActiveChanged) {
      lastEliminatedLabel = null;
    }

    if (items.length === 0) {
      startIdleAnimation();
    } else {
      stopIdleAnimation();
    }
    drawWheel();
    hideResultOverlay();

    const activeItems = getActiveItems();
    if (items.length === 0) {
      statusEl.textContent = "Добавьте элементы в список для создания колеса.";
    } else if (activeItems.length === 0) {
      statusEl.innerHTML =
        '<span class="fortune-status-success">🎉 Все элементы были исключены! Добавьте новые или очистите список.</span>';
    } else if (activeItems.length === 1) {
      statusEl.textContent =
        "Добавьте больше активных элементов или нажмите на колесо для вращения.";
    } else {
      statusEl.textContent = "Нажмите на колесо, чтобы запустить вращение.";
    }

    renderFortuneItemsList();
  }

  function clearInput() {
    input.value = "";
    items = [];
    eliminatedItems.clear();
    clearEliminatedHistory();
    lastEliminatedLabel = null;
    hideResultOverlay();
    updateFromInput();
  }

  function reshuffle() {
    if (!items.length) {
      return;
    }
    items = shuffleArray(items);
    updateInputFromActiveItems();
    drawWheel();
    hideResultOverlay();
    statusEl.textContent = "Порядок пунктов перемешан.";
  }

  function resetEliminated() {
    eliminatedItems.clear();
    clearEliminatedHistory();
    lastEliminatedLabel = null;
    updateInputFromActiveItems();
    drawWheel();
    hideResultOverlay();
    const activeItems = items.filter((item) => !eliminatedItems.has(item));
    if (activeItems.length > 1) {
      statusEl.textContent =
        "Все элементы восстановлены. Нажмите на колесо для вращения.";
    } else if (activeItems.length === 1) {
      statusEl.textContent =
        "Добавьте больше активных элементов или нажмите на колесо для вращения.";
    }
  }

  if (fortuneItemInput) {
    fortuneItemInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) {
        return;
      }

      event.preventDefault();

      const rawValue = fortuneItemInput.value;
      if (!rawValue.trim()) {
        fortuneItemInput.value = "";
        return;
      }

      addFortuneItem(rawValue);
    });
  }

  input.addEventListener("input", updateFromInput);
  input.addEventListener("paste", () => {
    setTimeout(updateFromInput, 10);
  });

  if (typeof ResizeObserver === "function") {
    const resizeObserver = new ResizeObserver(() => {
      drawWheel();
    });
    resizeObserver.observe(canvas);
  } else {
    window.addEventListener("resize", drawWheel);
  }

  canvas.addEventListener("click", spin);
  if (clearBtn) {
    clearBtn.addEventListener("click", clearInput);
  }
  if (resetBtn) {
    resetBtn.addEventListener("click", resetEliminated);
  }
  if (shuffleBtn) {
    shuffleBtn.addEventListener("click", reshuffle);
  }

  input.value = items.join("\n");
  drawWheel();
  renderFortuneItemsList();
  if (items.length === 0) {
    startIdleAnimation();
  }

  return {
    handleMenuOpen() {
      drawWheel();
      setTimeout(drawWheel, 320);
    },
  };
}

  global.FortuneBundle = {
    applyRouletteAutofill,
    clearRouletteLastWinner,
    syncRouletteAutofillState,
    persistRouletteLastWinner,
    showFortuneWinnerModal,
    closeFortuneWinnerModal
  };
})(window);
