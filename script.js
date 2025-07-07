// Supabase
const SUPABASE_URL = "https://shwekurmzyzivtworjup.supabase.co";
// Значение ключа берётся из переменной окружения на стороне Vercel
const SUPABASE_KEY = window.SUPABASE_API_KEY || "";
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Массив фильмов будет заполняться данными из базы
let movies = [];

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

// Загрузка фильмов из Supabase
async function loadMoviesFromSupabase() {
  try {
    const { data, error } = await supabase
      .from("movies")
      .select(
        "id, title, origin_title, genres, poster, year, rating_numeric, date, order_by, order_type"
      )
      .order("date", { ascending: false });

    if (error) throw error;

    movies = data.map((item) => ({
      id: item.id,
      title: item.title,
      originTitle: item.origin_title,
      genre: item.genres,
      poster: item.poster,
      year: item.year,
      rating: item.rating_numeric,
      dateAdded: item.date,
      orderBy: item.order_by,
      orderType: item.order_type,
    }));

    localStorage.setItem("moviesCache", JSON.stringify(movies));
    renderMovies();
  } catch (err) {
    console.error("Error loading movies from Supabase", err);
  }
}

// Инициализация
document.addEventListener("DOMContentLoaded", async function () {
  const cached = localStorage.getItem("moviesCache");
  if (cached) {
    movies = JSON.parse(cached);
  }

  renderMovies();
  renderWatchlist();
  setupRatingStars();

  await loadMoviesFromSupabase();
});

// Отображение фильмов
function renderMovies() {
  const grid = document.getElementById("moviesGrid");
  grid.innerHTML = "";

  movies.forEach((movie) => {
    const movieCard = createMovieCard(movie);
    grid.appendChild(movieCard);
  });
}

// Создание карточки фильма
function createMovieCard(movie) {
  const div = document.createElement("div");
  div.className = "movie-card";
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
                          movie.rating
                        )}${"☆".repeat(10 - movie.rating)}</span>
                        <span>${movie.rating}/10</span>
                    </div>
                    <div class="movie-date">Добавлен: ${formatDate(
                      movie.dateAdded
                    )}</div>
                    <div class="movie-actions">
                        <button class="btn btn-edit btn-small" onclick="openEditModal(${
                          movie.id
                        })">✏️ Редактировать</button>
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
  const grid = document.getElementById("moviesGrid");
  const filteredMovies = movies.filter(
    (movie) =>
      movie.title.toLowerCase().includes(query.toLowerCase()) ||
      movie.year.toString().includes(query)
  );

  grid.innerHTML = "";
  filteredMovies.forEach((movie) => {
    const movieCard = createMovieCard(movie);
    grid.appendChild(movieCard);
  });
}

// Сортировка фильмов
function sortMovies(criteria) {
  let sortedMovies = [...movies];

  switch (criteria) {
    case "title":
      sortedMovies.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "year":
      sortedMovies.sort((a, b) => b.year - a.year);
      break;
    case "rating":
      sortedMovies.sort((a, b) => b.rating - a.rating);
      break;
    case "date":
    default:
      sortedMovies.sort(
        (a, b) => new Date(b.dateAdded) - new Date(a.dateAdded)
      );
      break;
  }

  movies = sortedMovies;
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
  const movie = movies.find((m) => m.id === id);

  document.getElementById("editTitle").value = movie.title;
  document.getElementById("editYear").value = movie.year;
  document.getElementById("editPoster").value = movie.poster;

  // Установка рейтинга
  setRatingStars("editRatingStars", movie.rating);

  document.getElementById("editMovieModal").style.display = "block";
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
  .addEventListener("submit", function (e) {
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
      movieData = {
        id: Date.now(),
        title: document.getElementById("manualTitle").value,
        year:
          parseInt(document.getElementById("manualYear").value) ||
          new Date().getFullYear(),
        rating: rating,
        poster:
          document.getElementById("manualPoster").value ||
          "https://via.placeholder.com/300x400?text=Нет+постера",
        dateAdded: new Date().toISOString().split("T")[0],
        genre: document.getElementById("manualGenre").value || "Неизвестно",
        description:
          document.getElementById("manualDescription").value ||
          "Описание отсутствует",
      };
    }

    movies.unshift(movieData);
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
function submitRating() {
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
    movies.unshift(watchedMovie);
    watchlist.splice(itemIndex, 1);
    renderMovies();
    renderWatchlist();
  }
  closeModal("rateMovieModal");
}

// Редактирование фильма
document
  .getElementById("editMovieForm")
  .addEventListener("submit", function (e) {
    e.preventDefault();

    const movie = movies.find((m) => m.id === editingMovieId);
    if (movie) {
      movie.title = document.getElementById("editTitle").value;
      movie.year = document.getElementById("editYear").value;
      movie.poster = document.getElementById("editPoster").value;
      movie.rating = getCurrentRating("editRatingStars");
      movie.dateAdded =
        movie.dateAdded || new Date().toISOString().split("T")[0];
    }
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
