// Supabase
const SUPABASE_URL = "https://shwekurmzyzivtworjup.supabase.co";
// Значение ключа берётся из переменной окружения на стороне Vercel
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNod2VrdXJtenl6aXZ0d29yanVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYzODQ5NjEsImV4cCI6MjA2MTk2MDk2MX0.wXm1enXaPxXk1r6gjtkE2yizxZayLJh4hXmMV54Up9k";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Массив фильмов будет заполняться данными из базы
let allMovies = [];
let movies = [];
let currentSearchQuery = "";
let currentSort = "date";
let sortAscending = false;

let watchlist = [
  {
    id: 1,
    title: "Матрица",
    year: 1999,
    poster: "https://m.media-amazon.com/images/I/81p+xe8cbnL._SY445_.jpg",
    genre: "Триллер"
  },
  {
    id: 2,
    title: "Бойцовский клуб",
    year: 1999,
    poster: "https://m.media-amazon.com/images/I/81p+xe8cbnL._SY445_.jpg",
    genre: "Триллер"
  },
];

let currentMode = "auto";
let currentRating = 0;
let editingMovieId = null;
let ratingMovieId = null;
let editPosterData = null;

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
    const wrapper = fileInput.closest('.file-upload-wrapper');
    if (!wrapper) return;
    const label = wrapper.querySelector('.file-upload-label');
    const fileName = wrapper.parentElement.querySelector('.file-name');
    const removeBtn = wrapper.querySelector('.file-remove');

    fileInput.addEventListener('change', function (e) {
      const file = e.target.files[0];
      if (file) {
        showSelectedFile(file, label, fileName, removeBtn);
      }
    });

    label.addEventListener('dragover', function (e) {
      e.preventDefault();
      label.classList.add('drag-over');
    });

    label.addEventListener('dragleave', function (e) {
      e.preventDefault();
      label.classList.remove('drag-over');
    });

    label.addEventListener('drop', function (e) {
      e.preventDefault();
      label.classList.remove('drag-over');

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('image/')) {
          const dt = new DataTransfer();
          dt.items.add(file);
          fileInput.files = dt.files;
          showSelectedFile(file, label, fileName, removeBtn);
        }
      }
    });

    removeBtn.addEventListener('click', function () {
      clearFile(fileInput, label, fileName, removeBtn);
    });
  });
}

function showSelectedFile(file, label, fileName, removeBtn) {
  label.classList.add('has-file');
  label.querySelector('.main-text').textContent = 'Файл выбран';
  label.querySelector('.sub-text').textContent = 'Нажмите для замены';

  fileName.textContent = file.name;
  fileName.style.display = 'block';
  removeBtn.style.display = 'flex';
}

function clearFile(fileInput, label, fileName, removeBtn) {
  fileInput.value = '';
  label.classList.remove('has-file');
  label.querySelector('.main-text').textContent = 'Выберите файл изображения';
  label.querySelector('.sub-text').textContent = 'или перетащите его сюда';

  fileName.style.display = 'none';
  removeBtn.style.display = 'none';
}

// Загрузка фильмов из Supabase
async function loadMoviesFromSupabase() {
  try {
    const { data, error } = await supabaseClient
      .from("movies")
      .select(
        "id, title, original_title, genres, poster, year, rating_numeric, date, order_by, order_type"
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
      dateAdded: item.date,
      orderBy: item.order_by,
      orderType: item.order_type,
    }));
    totalMovies = allMovies.length;

    localStorage.setItem("moviesCache", JSON.stringify(allMovies));
    renderMovies();
  } catch (err) {
    console.error("Error loading movies from Supabase", err);
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
  setupRatingStars();
  initFileUpload();

  const orderBtn = document.getElementById("sortOrderBtn");
  if (orderBtn) {
    orderBtn.textContent = sortAscending ? "⬆️" : "⬇️";
  }

  await loadMoviesFromSupabase();

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
      result.sort((a, b) => (sortAscending ? a.year - b.year : b.year - a.year));
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
    if (page) btn.onclick = () => {
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
    addBtn(String(totalPages), totalPages, { active: currentPage === totalPages });
  }

  addBtn("»", currentPage + 1, { disabled: currentPage === totalPages });
}

// Создание карточки фильма
function createMovieCard(movie) {
  const div = document.createElement("div");
  let cardClass = "movie-card";
  if (movie.rating === 0) cardClass += " rating-low";
  if (movie.rating === 11) cardClass += " rating-high";
  const starsCount = Math.max(0, Math.min(movie.rating, 10));
  div.className = cardClass;
  div.innerHTML = `
                <img src="${movie.poster}" alt="${
    movie.title
  }" class="movie-poster" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <div class="movie-poster" style="display: none;">Нет постера</div>
                <div class="movie-info">
                    <div class="movie-title">${movie.title}</div>
                    <div class="movie-year">${movie.year}</div>
                    <div class="movie-rating">
                        <span class="stars">${"★".repeat(
                          starsCount
                        )}${"☆".repeat(10 - starsCount)}</span>
                        <span>${movie.rating}/10</span>
                    </div>
                    <div class="movie-date">Добавлен: ${formatDate(
                      movie.dateAdded
                    )}</div>
                    <div class="movie-actions">
                        <button class="btn btn-edit btn-icon" onclick="openEditModal(${
                          movie.id
                        })">✏️</button>
                        <button class="btn btn-delete btn-icon" onclick="deleteMovie(${
                          movie.id
                        })">🗑️</button>
                    </div>
                </div>
            `;
  return div;
}

// Отображение списка к просмотру
function renderWatchlist() {
  const container = document.getElementById("watchlistContainer");
  container.innerHTML = "";

  watchlist.forEach((item) => {
    const div = document.createElement("div");
    div.className = "watchlist-item";
    div.innerHTML = `
                    <div class="watchlist-title">${item.title}</div>
                    <div class="watchlist-year">${item.year}</div>
                    <button class="btn btn-rate btn-small" onclick="openRateModal(${item.id}, '${item.title}')">⭐ Оценить</button>
                `;
    container.appendChild(div);
  });
}

// Поиск фильмов
function searchMovies(query) {
  currentSearchQuery = query;
  currentPage = 1;
  renderMovies();
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

function openRateModal(id, title) {
  ratingMovieId = id;
  document.getElementById("rateMovieTitle").textContent = title;
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

function closeModal(modalId) {
  document.getElementById(modalId).style.display = "none";
  resetForm();
}

// Переключение режимов
function switchMode(mode) {
  currentMode = mode;

  // Обновление кнопок
  document
    .querySelectorAll(".mode-btn")
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
  const stars = document.querySelectorAll(`#${containerId} .rating-star`);
  stars.forEach((star, index) => {
    if (index < rating) {
      star.classList.add("active");
    } else {
      star.classList.remove("active");
    }
  });
}

function highlightStars(containerId, rating) {
  const stars = document.querySelectorAll(`#${containerId} .rating-star`);
  stars.forEach((star, index) => {
    if (index < rating) {
      star.style.color = "#ffc107";
    } else {
      star.style.color = "#ddd";
    }
  });
}

function getCurrentRating(containerId) {
  const activeStars = document.querySelectorAll(
    `#${containerId} .rating-star.active`
  );
  return activeStars.length;
}

// Обработка форм
document
  .getElementById("addMovieForm")
  .addEventListener("submit", async function (e) {
    e.preventDefault();

    const rating = getCurrentRating("ratingStars");
    if (rating === 0) {
      alert("Пожалуйста, выберите оценку");
      return;
    }

    let movieData;

    if (currentMode === "auto") {
      const title = document.getElementById("autoTitle").value;
      if (!title) {
        alert("Введите название фильма");
        return;
      }

      // Имитация API запроса (здесь будет реальный API)
      movieData = {
        id: Date.now(),
        title: title,
        year: 2023, // Будет получено из API
        rating: rating,
        poster: "https://via.placeholder.com/300x400?text=Постер", // Будет получено из API
        dateAdded: new Date().toISOString().split("T")[0],
        genre: "Неизвестно", // Будет получено из API
        description: "Описание будет загружено из API", // Будет получено из API
      };
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
  .addEventListener("submit", function (e) {
    e.preventDefault();

    const newItem = {
      id: Date.now(),
      title: document.getElementById("watchlistTitle").value,
      year: document.getElementById("watchlistYear").value || "",
    };

    watchlist.unshift(newItem);
    renderWatchlist();
    closeModal("addWatchlistModal");
    this.reset();
  });

// Оценка фильма из watchlist
async function submitRating() {
  const rating = getCurrentRating("rateMovieStars");
  if (rating === 0) {
    alert("Пожалуйста, выберите оценку");
    return;
  }

  // Находим фильм в watchlist по id
  const itemIndex = watchlist.findIndex((item) => item.id === ratingMovieId);
  if (itemIndex !== -1) {
    // Создаём новый объект фильма для основного списка
    const watchedMovie = {
      id: Date.now(),
      title: watchlist[itemIndex].title,
      year: watchlist[itemIndex].year,
      rating: rating,
      poster: "https://via.placeholder.com/300x400?text=Нет+постера",
      dateAdded: new Date().toISOString().split("T")[0],
      genre: "",
      description: "",
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
        genres: watchedMovie.genre,
        poster: watchedMovie.poster,
        year: watchedMovie.year,
        rating_numeric: watchedMovie.rating,
        date: watchedMovie.dateAdded,
      });
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
      movie.year = parseInt(document.getElementById("editYear").value) || movie.year;
      movie.genre = document.getElementById("editGenre").value || movie.genre;
      movie.rating = getCurrentRating("editRatingStars");
      movie.poster = editPosterData || movie.poster;
      movie.dateAdded = movie.dateAdded || new Date().toISOString().split("T")[0];

      try {
        await supabaseClient
          .from("movies")
          .update({
            title: movie.title,
            genres: movie.genre,
            poster: movie.poster,
            year: movie.year,
            rating_numeric: movie.rating,
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
