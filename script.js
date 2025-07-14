// Supabase
const SUPABASE_URL = "https://shwekurmzyzivtworjup.supabase.co";
// Значение ключа берётся из переменной окружения на стороне Vercel
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNod2VrdXJtenl6aXZ0d29yanVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYzODQ5NjEsImV4cCI6MjA2MTk2MDk2MX0.wXm1enXaPxXk1r6gjtkE2yizxZayLJh4hXmMV54Up9k";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let isAdmin = false;
let adminElements = [];
// Kinopoisk (unofficial API)
const KINOPOISK_API_KEY = "a63efc29-37be-423f-8c0d-722154bc08f4";
const KINOPOISK_SEARCH_URL =
  "https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword";
let kpResults = [];
let selectedKPMovie = null;

// RAWG
const RAWG_API_KEY = "4f3245bf6f2743649e3087a72623971d";
const RAWG_SEARCH_URL = "https://api.rawg.io/api/games";
let rawgResults = [];
let selectedRAWGGame = null;

// Массив фильмов будет заполняться данными из базы
let allMovies = [];
let movies = [];
let currentSearchQuery = "";
let currentSort = "date";
let sortAscending = false;

// Список заказанных фильмов
let watchlist = [];
let gameOrders = [];

async function verifyAdminPassword(password) {
  try {
    const res = await fetch('/api/verify-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.ok;
  } catch (err) {
    console.error('Failed to verify admin password', err);
    return false;
  }
}

const ORDER_TYPE_ICONS = {
  "Донат": "images/donate_icon.png",
  "Баллы канала": "images/channel_points_icon.png",
  "Шары": "images/balls_icon.png",
};

const ORDER_TYPE_CLASSES = {
  "Донат": "ribbon-donate",
  "Баллы канала": "ribbon-points",
  "Шары": "ribbon-balls",
};

// Watchlist modal helpers
let currentWatchlistMode = "auto";
let kpOrderResults = [];
let selectedKPOrderMovie = null;

// Game modal helpers
let currentGameMode = "auto";

let currentMode = "auto";
let currentRating = 0;
let editingMovieId = null;
let ratingMovieId = null;
let editPosterData = null;
let editingOrderId = null;
let editOrderPosterData = null;
let editingGameId = null;
let editGamePosterData = null;

// Pagination
let currentPage = 1;
const moviesPerPage = 10;
let totalMovies = 0;

// Utility to convert file to base64 string
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

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
    preview.src = "";
    preview.style.display = "none";
  }
}

// Загрузка фильмов из Supabase
async function loadMoviesFromSupabase() {
  try {
    const { data, error } = await supabaseClient
      .from("movies")
      .select(
        "id, title, original_title, genres, poster, year, rating_numeric, rating_OMDB, date, order_by, order_type"
      )
      .order("id", { ascending: false });

    if (error) throw error;

    allMovies = data.map((item) => ({
      id: item.id,
      title: item.title,
      originalTitle: item.original_title,
      genre: item.genres,
      poster: item.poster,
      year: item.year,
      rating: item.rating_numeric,
      kpRating: item.rating_OMDB,
      dateAdded: item.date,
      orderBy: item.order_by && item.order_by !== "null" ? item.order_by : "",
      orderType: item.order_type,
    }));
    totalMovies = allMovies.length;

    localStorage.setItem("moviesCache", JSON.stringify(allMovies));
    renderMovies();
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
        "id, created_at, order_title, order_origin_title, order_type, order_by, kinopoisk_rate, order_genres, order_poster, order_year"
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
      orderBy: item.game_order_by && item.game_order_by !== "null" ? item.game_order_by : "",
      orderType: item.game_order_type,
      dateAdded: item.created_at,
    }));

    renderGames();
  } catch (err) {
    console.error("Error loading game orders from Supabase", err);
  }
}

// Инициализация
document.addEventListener("DOMContentLoaded", async function () {
  const cached = localStorage.getItem("moviesCache");
  if (cached) {
    allMovies = JSON.parse(cached);
    totalMovies = allMovies.length;
  }

  renderMovies();
  renderWatchlist();
  renderGames();
  setupRatingStars();
  initFileUpload();

  adminElements = Array.from(document.querySelectorAll('.admin-only'));
  const adminLogoutBtn = document.getElementById("adminLogoutBtn");
  if (adminLogoutBtn) adminLogoutBtn.addEventListener("click", logoutAdmin);

  const orderBtn = document.getElementById("sortOrderBtn");
  if (orderBtn) {
    orderBtn.textContent = sortAscending ? "⬆️" : "⬇️";
  }

  await loadMoviesFromSupabase();
  await loadWatchlistFromSupabase();
  await loadGamesFromSupabase();

  isAdmin = localStorage.getItem("isAdmin") === "true";
  if (isAdmin) {
    showAdminControls();
  }
  const header = document.getElementById("headerLogo");
  if (header)
    header.addEventListener("click", () => {
      document.getElementById("adminModal").style.display = "block";
    });
  const adminForm = document.getElementById("adminLoginForm");
  if (adminForm)
    adminForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      const pw = document.getElementById("adminPassword").value;
      const ok = await verifyAdminPassword(pw);
      if (ok) {
        isAdmin = true;
        localStorage.setItem("isAdmin", "true");
        showAdminControls();
        closeModal("adminModal");
      } else {
        alert("Неверный пароль");
      }
    });
  const searchBtn = document.getElementById("autoSearchBtn");
  const resultsSelect = document.getElementById("autoResults");
  if (searchBtn) searchBtn.addEventListener("click", handleKPSearch);
  if (resultsSelect)
    resultsSelect.addEventListener("change", function () {
      const idx = parseInt(this.value);
      selectedKPMovie = kpResults[idx] || null;
      showKPPreview();
    });

  const watchSearchBtn = document.getElementById("watchAutoSearchBtn");
  const watchResultsSelect = document.getElementById("watchAutoResults");
  if (watchSearchBtn) watchSearchBtn.addEventListener("click", handleWatchlistSearch);
  if (watchResultsSelect)
    watchResultsSelect.addEventListener("change", function () {
      const idx = parseInt(this.value);
      selectedKPOrderMovie = kpOrderResults[idx] || null;
      showWatchlistKPPreview();
    });

  const gameSearchBtn = document.getElementById("gameAutoSearchBtn");
  const gameResultsSelect = document.getElementById("gameAutoResults");
  if (gameSearchBtn) gameSearchBtn.addEventListener("click", handleGameSearch);
  if (gameResultsSelect)
    gameResultsSelect.addEventListener("change", function () {
      const idx = parseInt(this.value);
      selectedRAWGGame = rawgResults[idx] || null;
      showRAWGPreview();
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
});

// Отображение фильмов
function getFilteredSortedMovies() {
  let result = [...allMovies];

  if (currentSearchQuery) {
    const q = currentSearchQuery.toLowerCase();
    result = result.filter(
      (movie) =>
        movie.title.toLowerCase().includes(q) ||
        movie.year.toString().includes(q)
    );
  }

  switch (currentSort) {
    case "title":
      result.sort((a, b) =>
        sortAscending
          ? a.title.localeCompare(b.title)
          : b.title.localeCompare(a.title)
      );
      break;
    case "year":
      result.sort((a, b) =>
        sortAscending ? a.year - b.year : b.year - a.year
      );
      break;
    case "rating":
      result.sort((a, b) =>
        sortAscending ? a.rating - b.rating : b.rating - a.rating
      );
      break;
    case "date":
    default:
      result.sort((a, b) => (sortAscending ? a.id - b.id : b.id - a.id));
      break;
  }

  return result;
}

function renderMovies() {
  const grid = document.getElementById("moviesGrid");
  grid.innerHTML = "";

  const filtered = getFilteredSortedMovies();
  totalMovies = filtered.length;
  const countEl = document.getElementById("moviesCount");
  if (countEl) {
    countEl.textContent = totalMovies;
  }
  const start = (currentPage - 1) * moviesPerPage;
  movies = filtered.slice(start, start + moviesPerPage);

  movies.forEach((movie) => {
    const movieCard = createMovieCard(movie);
    grid.appendChild(movieCard);
  });
  renderPagination();
}

function renderPagination() {
  const container = document.getElementById("pagination");
  if (!container) return;
  container.innerHTML = "";

  const totalPages = Math.ceil(totalMovies / moviesPerPage);
  if (totalPages <= 1) return;

  const addBtn = (label, page, opts = {}) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.className = opts.class || "page-btn";
    btn.disabled = opts.disabled || false;
    if (opts.active) btn.classList.add("active");
    if (page)
      btn.onclick = () => {
        currentPage = page;
        renderMovies();
      };
    container.appendChild(btn);
  };

  addBtn("«", currentPage - 1, { disabled: currentPage === 1 });

  addBtn("1", 1, { active: currentPage === 1 });

  let start = Math.max(2, currentPage - 1);
  let end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) {
    const span = document.createElement("span");
    span.textContent = "...";
    span.className = "ellipsis";
    container.appendChild(span);
  }

  for (let i = start; i <= end; i++) {
    addBtn(String(i), i, { active: i === currentPage });
  }

  if (end < totalPages - 1) {
    const span = document.createElement("span");
    span.textContent = "...";
    span.className = "ellipsis";
    container.appendChild(span);
  }

  if (totalPages > 1) {
    addBtn(String(totalPages), totalPages, {
      active: currentPage === totalPages,
    });
  }

  addBtn("»", currentPage + 1, { disabled: currentPage === totalPages });
}

// Создание карточки фильма
function createMovieCard(movie, showActions = isAdmin) {
  const div = document.createElement("div");
  let cardClass = "movie-card";
  if (movie.rating === 0) cardClass += " rating-low";
  if (movie.rating === 11) cardClass += " rating-high";
  const starsCount = Math.max(0, Math.min(movie.rating, 10));
  const ribbonClass = ORDER_TYPE_CLASSES[movie.orderType];
  const orderByText = movie.orderBy && movie.orderBy !== "null" ? movie.orderBy : "";
  const orderRibbon = orderByText
    ? `<div class="order-badge ${ribbonClass}">${orderByText}</div>`
    : "";
  div.className = cardClass;
  div.innerHTML = `
              <img src="${movie.poster}" alt="${movie.title}" class="movie-poster"
                  onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
              ${orderRibbon}
              <div class="movie-poster-placeholder" style="display: none;">
                  <span>Нет постера</span>
              </div>
              <div class="movie-info">
                  <div class="movie-header">
                      <div class="movie-title">${movie.title}</div>
                  </div>
                  <div class="movie-original-title">${movie.originalTitle}</div>
                  <div class="movie-genres">${movie.genre}</div>
                  <div class="movie-year">${movie.year}</div>
                  <div class="movie-rating">
                      <div class="rating-item">
                          <img src="images/Pupsik_TV_Icon.png" alt="Pupsik Rate">
                          <span>${movie.rating}/10</span>
                      </div>
                      <div class="rating-item">
                          <img src="images/kp_icon.png" alt="KP Rate">
                          <span>${movie.kpRating ?? "-"}</span>
                      </div>
                  </div>
                  <div class="movie-footer">
                      <div class="movie-date">Добавлен: ${formatDate(movie.dateAdded)}</div>
                      ${
                      showActions
                      ? `<div class="movie-actions">
                          <button class="btn btn-edit btn-icon" onclick="openEditModal(${movie.id})">✏️</button>
                          <button class="btn btn-delete btn-icon" onclick="deleteMovie(${movie.id})">🗑️</button>
                      </div>`
                      : ""
                      }
                  </div>
              </div>
            `;
  return div;
}

// Отображение списка к просмотру
function createOrderCard(order, showActions = isAdmin, showOrderBy = true) {
  const wrapper = document.createElement("div");
  wrapper.className = "order-wrapper";

  const card = document.createElement("div");
  card.className = "order-card";
  const iconPath = ORDER_TYPE_ICONS[order.orderType];
  const typeHtml = iconPath
    ? `<img src="${iconPath}" alt="${order.orderType}"> ${order.orderType}`
    : order.orderType || "";
  const ribbonClass = ORDER_TYPE_CLASSES[order.orderType];
  const orderByText = order.orderBy && order.orderBy !== "null" ? order.orderBy : "";
  const orderRibbon = orderByText && showOrderBy
    ? `<div class="order-badge ${ribbonClass}">${orderByText}</div>`
    : "";
  card.innerHTML = `
        <img src="${order.poster}" alt="${order.title}" class="order-poster" onerror="this.style.display='none'">
        ${orderRibbon}
        <div class="order-info">
            <div class="order-title">${order.title}</div>
            <div class="order-original-title">${order.originalTitle || ""}</div>
            <div class="order-genres">${order.genres || ""}</div>
            <div class="order-meta">
                <span class="order-year">${order.year || ""}</span>
                <span class="order-kp-rating"><img src="images/kp_icon.png" alt="KP Rate"> ${order.kpRating ?? "-"}</span>
            </div>
            <div class="order-footer">
                <div class="order-date">${formatDate(order.dateAdded)}</div>
                ${
                  showActions
                    ? `<div class="order-actions">
                    <button class="btn btn-edit btn-icon" onclick="openEditOrderModal(${order.id})">✏️</button>
                    <button class="btn btn-delete btn-icon" onclick="deleteOrder(${order.id})">🗑️</button>
                </div>`
                    : ""
                }
            </div>
        </div>
    `;
  wrapper.appendChild(card);
  if (showActions) {
    const done = document.createElement("div");
    done.className = "order-complete";
    done.innerHTML = `<button class="btn btn-primary btn-icon" onclick="openRateModal(${order.id})">✅</button>`;
    wrapper.appendChild(done);
  }
  return wrapper;
}

function renderWatchlist() {
  const container = document.getElementById("watchlistContainer");
  container.innerHTML = "";

  watchlist.forEach((item) => {
    container.appendChild(createOrderCard(item));
  });
}

function createGameCard(game, showActions = isAdmin) {
  const wrapper = document.createElement("div");
  wrapper.className = "order-wrapper";

  const card = document.createElement("div");
  card.className = "order-card";
  const iconPath = ORDER_TYPE_ICONS[game.orderType];
  const typeHtml = iconPath
    ? `<img src="${iconPath}" alt="${game.orderType}"> ${game.orderType}`
    : game.orderType || "";
  const ribbonClass = ORDER_TYPE_CLASSES[game.orderType];
  const orderByText = game.orderBy && game.orderBy !== "null" ? game.orderBy : "";
  const orderRibbon = orderByText
    ? `<div class="order-badge ${ribbonClass}">${orderByText}</div>`
    : "";
  card.innerHTML = `
        <img src="${game.poster}" alt="${game.title}" class="order-poster" onerror="this.style.display='none'">
        ${orderRibbon}
        <div class="order-info">
            <div class="order-title">${game.title}</div>
            <div class="order-genres">${game.genres || ""}</div>
            <div class="order-meta">
                <span class="order-year">${game.year || ""}</span>
            </div>
            <div class="order-footer">
                <div class="order-date">${formatDate(game.dateAdded)}</div>
                ${
                  showActions
                    ? `<div class="order-actions">
                    <button class="btn btn-edit btn-icon" onclick="openEditGameModal(${game.id})">✏️</button>
                    <button class="btn btn-delete btn-icon" onclick="deleteGameOrder(${game.id})">🗑️</button>
                </div>`
                    : ""
                }
            </div>
        </div>
    `;
  wrapper.appendChild(card);
  if (showActions) {
    const done = document.createElement("div");
    done.className = "order-complete";
    done.innerHTML = `<button class="btn btn-primary btn-icon" onclick="markGameDone(${game.id})">✅</button>`;
    wrapper.appendChild(done);
  }
  return wrapper;
}

function renderGames() {
  const container = document.getElementById("gamesContainer");
  if (!container) return;
  container.innerHTML = "";
  gameOrders.forEach((g) => container.appendChild(createGameCard(g)));
}

// Поиск фильмов
function searchMovies(query) {
  currentSearchQuery = query;
  currentPage = 1;
  renderMovies();
}

async function handleKPSearch() {
  const title = document.getElementById("autoTitle").value.trim();
  if (!title) {
    alert("Введите название фильма");
    return;
  }

  try {
    const url = `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(
      title
    )}&page=1`;
    const res = await fetch(url, {
      headers: {
        "X-API-KEY": KINOPOISK_API_KEY,
        "Content-Type": "application/json",
      },
    });
    const data = await res.json();
    kpResults = data.films || [];
    const container = document.getElementById("autoResultsContainer");
    const select = document.getElementById("autoResults");
    select.innerHTML = "";
    kpResults.forEach((m, idx) => {
      const opt = document.createElement("option");
      const year = m.year || "";
      const name = m.nameRu || m.nameEn || "";
      opt.value = idx;
      opt.textContent = `${name}${year ? ` (${year})` : ""}`;
      select.appendChild(opt);
    });
    if (kpResults.length > 0) {
      container.style.display = "block";
      select.selectedIndex = 0;
      selectedKPMovie = kpResults[0];
      showKPPreview();
    } else {
      container.style.display = "none";
      selectedKPMovie = null;
      showKPPreview();
      alert("Ничего не найдено");
    }
  } catch (err) {
    console.error("Kinopoisk search error", err);
  }
}

async function handleWatchlistSearch() {
  const title = document.getElementById("watchAutoTitle").value.trim();
  if (!title) {
    alert("Введите название фильма");
    return;
  }

  try {
    const url = `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(title)}&page=1`;
    const res = await fetch(url, {
      headers: {
        "X-API-KEY": KINOPOISK_API_KEY,
        "Content-Type": "application/json",
      },
    });
    const data = await res.json();
    kpOrderResults = data.films || [];
    const container = document.getElementById("watchAutoResultsContainer");
    const select = document.getElementById("watchAutoResults");
    select.innerHTML = "";
    kpOrderResults.forEach((m, idx) => {
      const opt = document.createElement("option");
      const year = m.year || "";
      const name = m.nameRu || m.nameEn || "";
      opt.value = idx;
      opt.textContent = `${name}${year ? ` (${year})` : ""}`;
      select.appendChild(opt);
    });
    if (kpOrderResults.length > 0) {
      container.style.display = "block";
      select.selectedIndex = 0;
      selectedKPOrderMovie = kpOrderResults[0];
      showWatchlistKPPreview();
    } else {
      container.style.display = "none";
      selectedKPOrderMovie = null;
      showWatchlistKPPreview();
      alert("Ничего не найдено");
    }
  } catch (err) {
    console.error("Kinopoisk search error", err);
  }
}

function showKPPreview() {
  const preview = document.getElementById("autoPreview");
  if (!preview) return;
  preview.innerHTML = "";
  if (!selectedKPMovie) {
    preview.style.display = "none";
    return;
  }
  const movie = {
    id: 0,
    title: selectedKPMovie.nameRu || selectedKPMovie.nameEn || "",
    originalTitle: selectedKPMovie.nameEn || "",
    year: selectedKPMovie.year || "",
    rating: getCurrentRating("ratingStars"),
    kpRating: selectedKPMovie.rating || "-",
    poster:
      selectedKPMovie.posterUrlPreview ||
      selectedKPMovie.posterUrl ||
      "https://via.placeholder.com/300x400?text=Нет+постера",
    dateAdded: new Date().toISOString().split("T")[0],
    genre: selectedKPMovie.genres?.map((g) => g.genre).join(", ") || "",
  };
  preview.appendChild(createMovieCard(movie, false));
  preview.style.display = "block";
}

// Preview for watchlist modal
function showWatchlistKPPreview() {
  const preview = document.getElementById("watchAutoPreview");
  if (!preview) return;
  preview.innerHTML = "";
  if (!selectedKPOrderMovie) {
    preview.style.display = "none";
    return;
  }
  const order = {
    title: selectedKPOrderMovie.nameRu || selectedKPOrderMovie.nameEn || "",
    originalTitle: selectedKPOrderMovie.nameEn || "",
    year: selectedKPOrderMovie.year || "",
    kpRating: selectedKPOrderMovie.rating || "-",
    poster:
      selectedKPOrderMovie.posterUrlPreview ||
      selectedKPOrderMovie.posterUrl ||
      "https://via.placeholder.com/300x400?text=Нет+постера",
    genres: selectedKPOrderMovie.genres?.map((g) => g.genre).join(", ") || "",
    orderBy: document.getElementById("watchOrderBy").value || "",
    orderType: document.getElementById("watchOrderType").value || "",
    dateAdded: new Date().toISOString().split("T")[0],
  };
  preview.appendChild(createOrderCard(order, false, false));
  preview.style.display = "block";
}

async function handleGameSearch() {
  const title = document.getElementById("gameAutoTitle").value.trim();
  if (!title) {
    alert("Введите название игры");
    return;
  }

  try {
    const url = `${RAWG_SEARCH_URL}?key=${RAWG_API_KEY}&search=${encodeURIComponent(
      title
    )}&page_size=5`;
    const res = await fetch(url);
    const data = await res.json();
    rawgResults = data.results || [];
    const container = document.getElementById("gameAutoResultsContainer");
    const select = document.getElementById("gameAutoResults");
    select.innerHTML = "";
    rawgResults.forEach((g, idx) => {
      const opt = document.createElement("option");
      const year = g.released ? g.released.split("-")[0] : "";
      opt.value = idx;
      opt.textContent = `${g.name}${year ? ` (${year})` : ""}`;
      select.appendChild(opt);
    });
    if (rawgResults.length > 0) {
      container.style.display = "block";
      select.selectedIndex = 0;
      selectedRAWGGame = rawgResults[0];
      showRAWGPreview();
    } else {
      container.style.display = "none";
      selectedRAWGGame = null;
      showRAWGPreview();
      alert("Ничего не найдено");
    }
  } catch (err) {
    console.error("RAWG search error", err);
  }
}

function showRAWGPreview() {
  const preview = document.getElementById("gameAutoPreview");
  if (!preview) return;
  preview.innerHTML = "";
  if (!selectedRAWGGame) {
    preview.style.display = "none";
    return;
  }
  const game = {
    title: selectedRAWGGame.name || "",
    genres: selectedRAWGGame.genres?.map((g) => g.name).join(", ") || "",
    year: selectedRAWGGame.released
      ? selectedRAWGGame.released.split("-")[0]
      : "",
    poster:
      selectedRAWGGame.background_image ||
      "https://via.placeholder.com/300x400?text=Нет+постера",
    orderBy: document.getElementById("gameOrderBy").value || "",
    orderType: document.getElementById("gameOrderType").value || "",
    dateAdded: new Date().toISOString().split("T")[0],
  };
  preview.appendChild(createGameCard(game, false));
  preview.style.display = "block";
}

// Сортировка фильмов
function sortMovies(criteria) {
  currentSort = criteria;
  currentPage = 1;
  renderMovies();
}

function toggleSortOrder() {
  sortAscending = !sortAscending;
  const btn = document.getElementById("sortOrderBtn");
  if (btn) {
    btn.textContent = sortAscending ? "⬆️" : "⬇️";
  }
  currentPage = 1;
  renderMovies();
}

// Модальные окна
function openAddMovieModal() {
  document.getElementById("addMovieModal").style.display = "block";
  resetForm();
}

function openAddToWatchlistModal() {
  document.getElementById("addWatchlistModal").style.display = "block";
}

function openRateModal(id) {
  ratingMovieId = id;
  const item = watchlist.find((w) => w.id === id);
  document.getElementById("rateMovieTitle").textContent = item ? item.title : "";
  document.getElementById("rateMovieModal").style.display = "block";
  setupRatingStars("rateMovieStars");
}

function openEditModal(id) {
  editingMovieId = id;
  const movie = allMovies.find((m) => m.id === id);

  document.getElementById("editTitle").value = movie.title;
  document.getElementById("editYear").value = movie.year;
  document.getElementById("editGenre").value = movie.genre || "";
  document.getElementById("editPosterPreview").src = movie.poster;
  document.getElementById("editPoster").value = "";
  editPosterData = null;

  // Установка рейтинга
  setRatingStars("editRatingStars", movie.rating);
  setupRatingStars("editRatingStars");

  document.getElementById("editMovieModal").style.display = "block";
}

async function deleteMovie(id) {
  if (!confirm("Удалить фильм?")) return;

  const index = allMovies.findIndex((m) => m.id === id);
  if (index !== -1) {
    allMovies.splice(index, 1);
    localStorage.setItem("moviesCache", JSON.stringify(allMovies));
    renderMovies();
    try {
      await supabaseClient.from("movies").delete().eq("id", id);
    } catch (err) {
      console.error("Error deleting movie from Supabase", err);
    }
  }
}

async function deleteOrder(id) {
  if (!confirm("Удалить заказ?")) return;

  const index = watchlist.findIndex((o) => o.id === id);
  if (index !== -1) {
    watchlist.splice(index, 1);
    renderWatchlist();
    try {
      await supabaseClient.from("Movie_Orders").delete().eq("id", id);
    } catch (err) {
      console.error("Error deleting order from Supabase", err);
    }
  }
}

async function deleteGameOrder(id) {
  if (!confirm("Удалить игру?")) return;

  const index = gameOrders.findIndex((g) => g.id === id);
  if (index !== -1) {
    gameOrders.splice(index, 1);
    renderGames();
    try {
      await supabaseClient.from("Game_Orders").delete().eq("id", id);
    } catch (err) {
      console.error("Error deleting game order from Supabase", err);
    }
  }
}

function markGameDone(id) {
  if (!confirm("Отметить игру пройденной?")) return;
  deleteGameOrder(id);
}

function openEditGameModal(id) {
  editingGameId = id;
  const game = gameOrders.find((g) => g.id === id);
  if (!game) return;
  document.getElementById("editGameTitle").value = game.title;
  document.getElementById("editGameYear").value = game.year || "";
  document.getElementById("editGameGenres").value = game.genres || "";
  document.getElementById("editGameOrderBy").value = game.orderBy || "";
  document.getElementById("editGameOrderType").value = game.orderType || "";
  document.getElementById("editGamePosterPreview").src = game.poster;
  document.getElementById("editGamePoster").value = "";
  editGamePosterData = null;
  document.getElementById("editGameModal").style.display = "block";
}

function openAddGameModal() {
  document.getElementById("addGameModal").style.display = "block";
}

function openEditOrderModal(id) {
  editingOrderId = id;
  const order = watchlist.find((o) => o.id === id);
  if (!order) return;
  document.getElementById("editOrderTitle").value = order.title;
  document.getElementById("editOrderOriginTitle").value = order.originalTitle || "";
  document.getElementById("editOrderYear").value = order.year || "";
  document.getElementById("editOrderGenre").value = order.genres || "";
  document.getElementById("editOrderBy").value = order.orderBy || "";
  document.getElementById("editOrderType").value = order.orderType || "";
  document.getElementById("editOrderPosterPreview").src = order.poster;
  document.getElementById("editOrderPoster").value = "";
  editOrderPosterData = null;
  document.getElementById("editOrderModal").style.display = "block";
}

function closeModal(modalId) {
  document.getElementById(modalId).style.display = "none";
  resetForm();
}

// Переключение режимов
function switchMode(mode) {
  currentMode = mode;

  // Обновление кнопок
  document
    .querySelectorAll("#addMovieModal .mode-btn")
    .forEach((btn) => btn.classList.remove("active"));
  event.target.classList.add("active");

  // Показ/скрытие форм
  if (mode === "auto") {
    document.getElementById("autoMode").style.display = "block";
    document.getElementById("manualMode").style.display = "none";
  } else {
    document.getElementById("autoMode").style.display = "none";
    document.getElementById("manualMode").style.display = "block";
  }
}

function switchWatchlistMode(mode) {
  currentWatchlistMode = mode;

  document
    .querySelectorAll("#addWatchlistModal .mode-btn")
    .forEach((btn) => btn.classList.remove("active"));
  event.target.classList.add("active");

  if (mode === "auto") {
    document.getElementById("watchAutoMode").style.display = "block";
    document.getElementById("watchManualMode").style.display = "none";
  } else {
    document.getElementById("watchAutoMode").style.display = "none";
    document.getElementById("watchManualMode").style.display = "block";
  }
}

function switchGameMode(mode) {
  currentGameMode = mode;

  document
    .querySelectorAll("#addGameModal .mode-btn")
    .forEach((btn) => btn.classList.remove("active"));
  event.target.classList.add("active");

  if (mode === "auto") {
    document.getElementById("gameAutoMode").style.display = "block";
    document.getElementById("gameManualMode").style.display = "none";
  } else {
    document.getElementById("gameAutoMode").style.display = "none";
    document.getElementById("gameManualMode").style.display = "block";
  }
}

// Настройка звездного рейтинга
function setupRatingStars(containerId = "ratingStars") {
  const stars = document.querySelectorAll(`#${containerId} .rating-star`);
  stars.forEach((star) => {
    star.addEventListener("click", function () {
      const rating = parseInt(this.dataset.rating);
      setRatingStars(containerId, rating);
    });

    star.addEventListener("mouseover", function () {
      const rating = parseInt(this.dataset.rating);
      highlightStars(containerId, rating);
    });
  });

  document
    .getElementById(containerId)
    .addEventListener("mouseleave", function () {
      const currentRating = getCurrentRating(containerId);
      highlightStars(containerId, currentRating);
    });
}

function setRatingStars(containerId, rating) {
  const container = document.getElementById(containerId);
  const stars = container.querySelectorAll(".rating-star");
  container.dataset.currentRating = rating;
  updateRatingDisplay(containerId, rating);
  stars.forEach((star) => star.classList.remove("active"));

  if (rating === 0) {
    stars[0]?.classList.add("active");
  } else if (rating >= 1 && rating <= 10) {
    for (let i = 1; i <= rating; i++) {
      stars[i]?.classList.add("active");
    }
  } else if (rating === 11) {
    for (let i = 1; i <= 10; i++) {
      stars[i]?.classList.add("active");
    }
    stars[11]?.classList.add("active");
  }
  if (containerId === "ratingStars") {
    showKPPreview();
  }
}

function highlightStars(containerId, rating) {
  const stars = document.querySelectorAll(`#${containerId} .rating-star`);
  stars.forEach((star) => {
    star.style.color = "#ddd";
  });

  if (rating === 0) {
    stars[0].style.color = "#ffc107";
  } else if (rating >= 1 && rating <= 10) {
    for (let i = 1; i <= rating; i++) {
      stars[i].style.color = "#ffc107";
    }
  } else if (rating === 11) {
    for (let i = 1; i <= 10; i++) {
      stars[i].style.color = "#ffc107";
    }
    stars[11].style.color = "#ffc107";
  }
}

function getCurrentRating(containerId) {
  const container = document.getElementById(containerId);
  return parseInt(container.dataset.currentRating) || 0;
}

function updateRatingDisplay(containerId, rating) {
  const container = document.getElementById(containerId);
  const displayId = container.dataset.display;
  if (!displayId) return;
  const el = document.getElementById(displayId);
  if (el) {
    el.textContent = `${rating}/10`;
  }
}

// Обработка форм
document
  .getElementById("addMovieForm")
  .addEventListener("submit", async function (e) {
    e.preventDefault();

    const rating = getCurrentRating("ratingStars");

    let movieData;

    if (currentMode === "auto") {
      const title = document.getElementById("autoTitle").value;
      if (!title) {
        alert("Введите название фильма");
        return;
      }

      if (selectedKPMovie) {
        const sel = selectedKPMovie;
        movieData = {
          id: Date.now(),
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
          id: Date.now(),
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
        id: Date.now(),
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
        description:
          document.getElementById("manualDescription")?.value ||
          "Описание отсутствует",
      };
    }

    allMovies.unshift(movieData);
    localStorage.setItem("moviesCache", JSON.stringify(allMovies));

    try {
      await supabaseClient.from("movies").insert({
        title: movieData.title,
        original_title: movieData.originalTitle || "",
        genres: movieData.genre,
        poster: movieData.poster,
        year: movieData.year,
        rating_numeric: movieData.rating,
        rating_OMDB: movieData.kpRating,
        date: movieData.dateAdded,
      });
    } catch (err) {
      console.error("Error adding movie to Supabase", err);
    }

    currentPage = 1;
    renderMovies();
    closeModal("addMovieModal");
  });

document
  .getElementById("addWatchlistForm")
  .addEventListener("submit", async function (e) {
    e.preventDefault();

    const orderBy = document.getElementById("watchOrderBy").value;
    const orderType = document.getElementById("watchOrderType").value;

    let orderData;

    if (currentWatchlistMode === "auto") {
      const titleInput = document.getElementById("watchAutoTitle").value;
      if (!titleInput) {
        alert("Введите название фильма");
        return;
      }

      if (selectedKPOrderMovie) {
        const sel = selectedKPOrderMovie;
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
      };
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
        kpRating: data.kinopoisk_rate,
        orderBy: data.order_by,
        orderType: data.order_type,
        dateAdded: data.created_at,
      });
      renderWatchlist();
    } catch (err) {
      console.error("Error adding order", err);
    }

    closeModal("addWatchlistModal");
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

    closeModal("addGameModal");
    this.reset();
    selectedRAWGGame = null;
    rawgResults = [];
    showRAWGPreview();
  });

// Оценка фильма из watchlist
async function submitRating() {
  const rating = getCurrentRating("rateMovieStars");

  // Находим фильм в watchlist по id
  const itemIndex = watchlist.findIndex((item) => item.id === ratingMovieId);
  if (itemIndex !== -1) {
    // Создаём новый объект фильма для основного списка
    const source = watchlist[itemIndex];
    const watchedMovie = {
      id: Date.now(),
      title: source.title,
      originalTitle: source.originalTitle || "",
      year: source.year,
      rating: rating,
      kpRating: source.kpRating,
      poster: source.poster || "https://via.placeholder.com/300x400?text=Нет+постера",
      dateAdded: new Date().toISOString().split("T")[0],
      genre: source.genres || "",
      description: "",
      orderBy: source.orderBy || "",
      orderType: source.orderType || "",
    };
    allMovies.unshift(watchedMovie);
    localStorage.setItem("moviesCache", JSON.stringify(allMovies));
    currentPage = 1;
    watchlist.splice(itemIndex, 1);
    renderMovies();
    renderWatchlist();

    try {
      await supabaseClient.from("movies").insert({
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
      });
      await supabaseClient.from("Movie_Orders").delete().eq("id", ratingMovieId);
    } catch (err) {
      console.error("Error adding rated movie to Supabase", err);
    }
  }
  closeModal("rateMovieModal");
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
      movie.rating = getCurrentRating("editRatingStars");
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
          })
          .eq("id", editingMovieId);
      } catch (err) {
        console.error("Error updating movie in Supabase", err);
      }
    }
    localStorage.setItem("moviesCache", JSON.stringify(allMovies));
    renderMovies();
    closeModal("editMovieModal");
  });

document
  .getElementById("editOrderForm")
  .addEventListener("submit", async function (e) {
    e.preventDefault();

    const order = watchlist.find((o) => o.id === editingOrderId);
    if (order) {
      order.title = document.getElementById("editOrderTitle").value;
      order.originalTitle = document.getElementById("editOrderOriginTitle").value;
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
    closeModal("editOrderModal");
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
    closeModal("editGameModal");
  });

// Форматирование даты
function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru-RU");
}

// Сброс форм и рейтингов
function resetForm() {
  document.getElementById("addMovieForm").reset();
  document.getElementById("addWatchlistForm").reset();
  document.getElementById("addGameForm")?.reset();
  document.getElementById("editGameForm")?.reset();
  setRatingStars("ratingStars", 0);
  setRatingStars("editRatingStars", 0);
  setRatingStars("rateMovieStars", 0);
}

// Клик вне модалки закрывает её
window.onclick = function (event) {
  document.querySelectorAll(".modal").forEach((modal) => {
    if (event.target === modal) {
      modal.style.display = "none";
      resetForm();
    }
  });
};


function showAdminControls() {
  adminElements.forEach(el => el.classList.remove('admin-only'));
  const logoutBtn = document.getElementById('adminLogoutBtn');
  if (logoutBtn) logoutBtn.style.display = 'block';
  renderMovies();
  renderWatchlist();
  renderGames();
}

function hideAdminControls() {
  adminElements.forEach(el => el.classList.add('admin-only'));
  const logoutBtn = document.getElementById('adminLogoutBtn');
  if (logoutBtn) logoutBtn.style.display = 'none';
  renderMovies();
  renderWatchlist();
  renderGames();
}

function logoutAdmin() {
  isAdmin = false;
  localStorage.removeItem('isAdmin');
  hideAdminControls();
  closeModal('adminModal');
}
