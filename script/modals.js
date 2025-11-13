// Сортировка фильмов
function sortMovies(criteria) {
  currentSort = criteria;
  currentPage = 1;
  renderMovies();
}

function toggleSortOrder() {
  sortAscending = !sortAscending;
  const orderBtn = document.getElementById("sortOrderBtn");
  if (orderBtn) {
    const img = document.createElement("img");
    img.src = sortAscending ? "images/up-arrow.webp" : "images/down-arrow.webp";
    img.alt = "";
    img.className = "sort-arrow";

    orderBtn.replaceChildren(img);
  }
  currentPage = 1;
  renderMovies();
}

// Модальные окна
function openAddMovieModal() {
  const modal = document.getElementById("addMovieModal");
  if (modal) {
    modal.style.display = "block";
  }
  applyRouletteAutofill({ force: true, triggerSuggestions: true });
}

function openAddToWatchlistModal() {
  document.getElementById("addWatchlistModal").style.display = "block";
}

function showDuplicateModal() {
  document.getElementById("duplicateModal").style.display = "block";
}

function showSearchReminderModal() {
  document.getElementById("searchReminderModal").style.display = "block";
}

function openRateModal(id) {
  ratingMovieId = id;
  const item = watchlist.find((w) => w.id === id);
  if (item) {
    document.getElementById("rateMovieTitle").textContent = item.title;
    document.getElementById("rateMoviePoster").src = item.poster;
  } else {
    document.getElementById("rateMovieTitle").textContent = "";
    document.getElementById("rateMoviePoster").src =
      "https://via.placeholder.com/300x400?text=Нет+постера";
  }
  document.getElementById("rateMovieModal").style.display = "block";
  setRatingStars("rateMovieStars", 0);
  setupRatingStars("rateMovieStars");
  const confirmBtn = document.querySelector("#rateMovieModal .btn-primary");
  if (confirmBtn) confirmBtn.disabled = isSubmittingRating;
}

function openRateGameModal(id) {
  ratingGameId = id;
  const item = gameOrders.find((g) => g.id === id);
  if (item) {
    document.getElementById("rateGameTitle").textContent = item.title;
    document.getElementById("rateGamePoster").src = item.poster;
  } else {
    document.getElementById("rateGameTitle").textContent = "";
    document.getElementById("rateGamePoster").src =
      "https://via.placeholder.com/300x400?text=Нет+постера";
  }
  document.getElementById("rateGameModal").style.display = "block";
  setRatingStars("rateGameStars", 0);
  setupRatingStars("rateGameStars");
}

function openUserRateModal(id) {
  if (ratedMovies[id]) {
    alert("Вы уже оценили этот фильм");
    return;
  }
  userRatingMovieId = id;
  const movie = allMovies.find((m) => m.id === id);
  if (movie) {
    document.getElementById("userRateMovieTitle").textContent = movie.title;
    document.getElementById("userRateMoviePoster").src = movie.poster;
    setRatingStars("userRateStars", 0);
  }
  document.getElementById("userRateModal").style.display = "block";
  setupRatingStars("userRateStars");
}

function openUserRateGameModal(id) {
  if (hasRatedGame(id)) {
    alert("Вы уже оценили эту игру");
    return;
  }
  userRatingGameId = id;
  const game = allPlayedGames.find((g) => g.id === id);
  if (game) {
    const titleEl = document.getElementById("userRateGameTitle");
    if (titleEl) titleEl.textContent = game.title;
    const posterEl = document.getElementById("userRateGamePoster");
    if (posterEl) posterEl.src = game.poster;
    setRatingStars("userRateGameStars", 0);
  }
  const modal = document.getElementById("userRateGameModal");
  if (modal) modal.style.display = "block";
  setupRatingStars("userRateGameStars");
}

function openEditModal(id) {
  editingMovieId = id;
  const movie = allMovies.find((m) => m.id === id);

  document.getElementById("editTitle").value = movie.title;
  document.getElementById("editYear").value = movie.year;
  document.getElementById("editGenre").value = movie.genre || "";
  document.getElementById("editMovieOrderBy").value = movie.orderBy || "";
  document.getElementById("editPosterPreview").src = movie.poster;
  document.getElementById("editPoster").value = "";
  editPosterData = null;

  // Установка рейтинга
  setRatingStars("editRatingStars", movie.rating);
  setupRatingStars("editRatingStars");

  document.getElementById("editMovieModal").style.display = "block";
}

async function performDeleteMovie(id) {
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

async function performDeleteOrder(id) {
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

async function performDeleteGameOrder(id) {
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
  openRateGameModal(id);
}

function openEditGameModal(id) {
  editingGameId = id;
  const game = gameOrders.find((g) => g.id === id);
  if (!game) return;
  const preview = document.getElementById("editGamePosterPreview");
  const overlay = preview.parentElement.nextElementSibling;
  if (overlay && overlay.classList.contains("poster-overlay")) overlay.remove();
  steamGridPoster = null;
  steamGridPosters = [];
  document.getElementById("editGameTitle").value = game.title;
  document.getElementById("editGameYear").value = game.year || "";
  document.getElementById("editGameGenres").value = game.genres || "";
  document.getElementById("editGameOrderBy").value = game.orderBy || "";
  document.getElementById("editGameOrderType").value = game.orderType || "";
  preview.src = game.poster;
  document.getElementById("editGamePoster").value = "";
  editGamePosterData = null;
  document.getElementById("editGameModal").style.display = "block";
}

function openEditPlayedGameModal(id) {
  editingPlayedGameId = id;
  const game = allPlayedGames.find((g) => g.id === id);
  if (!game) return;
  const preview = document.getElementById("editPlayedGamePosterPreview");
  const overlay = preview.parentElement.nextElementSibling;
  if (overlay && overlay.classList.contains("poster-overlay")) overlay.remove();
  steamGridPoster = null;
  steamGridPosters = [];
  document.getElementById("editPlayedGameTitle").value = game.title;
  document.getElementById("editPlayedGameYear").value = game.year || "";
  document.getElementById("editPlayedGameGenres").value = game.genres || "";
  document.getElementById("editPlayedGameOrderBy").value = game.orderBy || "";
  document.getElementById("editPlayedGameOrderType").value =
    game.orderType || "";
  preview.src = game.poster;
  document.getElementById("editPlayedGamePoster").value = "";
  setRatingStars("editPlayedGameRatingStars", game.rating);
  setupRatingStars("editPlayedGameRatingStars");
  editPlayedGamePosterData = null;
  document.getElementById("editPlayedGameModal").style.display = "block";
}

function openAddGameModal() {
  document.getElementById("addGameModal").style.display = "block";
}

function openAddPlayedGameModal() {
  document.getElementById("addPlayedGameModal").style.display = "block";
  setRatingStars("playedGameRatingStars", 0);
  setupRatingStars("playedGameRatingStars");
}

function openConfirmDeleteMovieModal(id) {
  deleteMovieId = id;
  document.getElementById("confirmDeleteMovieModal").style.display = "block";
}

async function confirmDeleteMovie() {
  if (deleteMovieId !== null) {
    await performDeleteMovie(deleteMovieId);
    deleteMovieId = null;
  }
  closeModal("confirmDeleteMovieModal");
}

function openConfirmDeletePlayedGameModal(id) {
  deletePlayedGameId = id;
  document.getElementById("confirmDeletePlayedGameModal").style.display =
    "block";
}

async function confirmDeletePlayedGame() {
  if (deletePlayedGameId !== null) {
    await deletePlayedGame(deletePlayedGameId);
    deletePlayedGameId = null;
  }
  closeModal("confirmDeletePlayedGameModal");
}

function openConfirmDeleteOrderModal(id) {
  deleteOrderId = id;
  document.getElementById("confirmDeleteOrderModal").style.display = "block";
}

async function confirmDeleteOrder() {
  if (deleteOrderId !== null) {
    await performDeleteOrder(deleteOrderId);
    deleteOrderId = null;
  }
  closeModal("confirmDeleteOrderModal");
}

function openConfirmDeleteGameOrderModal(id) {
  deleteGameOrderId = id;
  document.getElementById("confirmDeleteGameOrderModal").style.display =
    "block";
}

async function confirmDeleteGameOrder() {
  if (deleteGameOrderId !== null) {
    await performDeleteGameOrder(deleteGameOrderId);
    deleteGameOrderId = null;
  }
  closeModal("confirmDeleteGameOrderModal");
}

function openEditOrderModal(id) {
  editingOrderId = id;
  const order = watchlist.find((o) => o.id === id);
  if (!order) return;
  document.getElementById("editOrderTitle").value = order.title;
  document.getElementById("editOrderOriginTitle").value =
    order.originalTitle || "";
  document.getElementById("editOrderYear").value = order.year || "";
  document.getElementById("editOrderGenre").value = order.genres || "";
  document.getElementById("editOrderBy").value = order.orderBy || "";
  document.getElementById("editOrderType").value = order.orderType || "";
  document.getElementById("editOrderPosterPreview").src = order.poster;
  document.getElementById("editOrderPoster").value = "";
  editOrderPosterData = null;
  document.getElementById("editOrderModal").style.display = "block";
}

function closeModal(modalId, shouldReset = false) {
  document.getElementById(modalId).style.display = "none";
  if (shouldReset) {
    resetForm();
  }
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

function switchPlayedGameMode(mode) {
  currentPlayedGameMode = mode;

  document
    .querySelectorAll("#addPlayedGameModal .mode-btn")
    .forEach((btn) => btn.classList.remove("active"));
  event.target.classList.add("active");

  if (mode === "auto") {
    document.getElementById("playedGameAutoMode").style.display = "block";
    document.getElementById("playedGameManualMode").style.display = "none";
  } else {
    document.getElementById("playedGameAutoMode").style.display = "none";
    document.getElementById("playedGameManualMode").style.display = "block";
  }
}

function updateRatingTooltipPosition(event) {
  if (!ratingTooltip || ratingTooltip.style.display !== "block") return;
  const offsetX = 12;
  const offsetY = 16;
  const pageX = event?.pageX ?? 0;
  const pageY = event?.pageY ?? 0;
  ratingTooltip.style.left = `${pageX + offsetX}px`;
  ratingTooltip.style.top = `${pageY + offsetY}px`;
}

function showRatingValueTooltip(event, value) {
  if (!ratingTooltip) return;
  ratingTooltip.textContent = String(value);
  ratingTooltip.style.display = "block";
  updateRatingTooltipPosition(event);
}

function hideRatingValueTooltip() {
  if (!ratingTooltip) return;
  ratingTooltip.style.display = "none";
}

// Настройка звездного рейтинга
function setupRatingStars(containerId = "ratingStars") {
  const container = document.getElementById(containerId);
  const stars = container.querySelectorAll(".rating-star");
  const inputId = container.dataset.input;
  const ratingInput = inputId ? document.getElementById(inputId) : null;

  stars.forEach((star) => {
    star.addEventListener("click", function () {
      const rating = parseInt(this.dataset.rating);
      setRatingStars(containerId, rating);
    });

    star.addEventListener("mouseover", function () {
      const rating = parseInt(this.dataset.rating);
      highlightStars(containerId, rating);
    });

    if (!star.classList.contains("rating-label")) {
      star.addEventListener("mouseenter", function (event) {
        showRatingValueTooltip(event, this.dataset.rating);
      });
      star.addEventListener("mousemove", updateRatingTooltipPosition);
      star.addEventListener("mouseleave", hideRatingValueTooltip);
    }
  });

  container.addEventListener("mouseleave", function () {
    const currentRating = getCurrentRating(containerId);
    highlightStars(containerId, currentRating);
    hideRatingValueTooltip();
  });

  if (ratingInput) {
    ratingInput.addEventListener("input", function () {
      const value = parseFloat(this.value.replace(/,/, "."));
      if (!isNaN(value) && value >= 0 && value <= 11) {
        this.setCustomValidity("");
        setRatingStars(containerId, value, false);
      } else {
        this.setCustomValidity("Введите число от 0 до 11");
        this.reportValidity();
      }
    });
  }
}

function setRatingStars(containerId, rating, updateInput = true) {
  const container = document.getElementById(containerId);
  const stars = container.querySelectorAll(".rating-star");
  container.dataset.currentRating = rating;
  const inputId = container.dataset.input;
  if (updateInput && inputId) {
    const inp = document.getElementById(inputId);
    if (inp) inp.value = String(rating).replace(".", ",");
  }
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

  stars.forEach((star, index) => {
    // Удаляем маску и цвет
    star.classList.remove("hovered");
    star.style.backgroundColor = "rgba(255, 235, 59, 0.3)";

    if (star.classList.contains("rating-label")) {
      star.style.backgroundColor = "transparent";
    }
  });

  if (rating >= 1 && rating <= 10) {
    for (let i = 1; i <= rating; i++) {
      stars[i].style.backgroundColor = "#ffc107";
      stars[i].classList.add("hovered");
    }
  } else if (rating === 11) {
    for (let i = 1; i <= 10; i++) {
      stars[i].style.backgroundColor = "#ffc107";
      stars[i].classList.add("hovered");
    }
  }
}

function getCurrentRating(containerId) {
  const container = document.getElementById(containerId);
  return parseFloat(container.dataset.currentRating) || 0;
}

function isRatingValid(r) {
  return typeof r === "number" && !isNaN(r) && r >= 0 && r <= 11;
}

function getRatingValue(inputId) {
  const el = document.getElementById(inputId);
  return el ? parseFloat(el.value.replace(/,/, ".")) : NaN;
}

