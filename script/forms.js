// Обработка форм
// form submit guards

// Оценка фильма из watchlist

async function submitUserMovieRating() {
  if (isSubmittingUserRating) return;
  isSubmittingUserRating = true;

  const rating = getRatingValue("userRateInput");
  if (!isRatingValid(rating)) {
    alert("Неверная оценка");
    document.getElementById("userRateInput").reportValidity();
    isSubmittingUserRating = false;
    return;
  }

  if (!userRatingMovieId) {
    isSubmittingUserRating = false;
    return;
  }

  const movie = allMovies.find((m) => m.id === userRatingMovieId);

  if (hasRatedMovie(movie || userRatingMovieId)) {
    alert("Вы уже оценили этот фильм");
    closeModal("userRateModal", true);
    isSubmittingUserRating = false;
    return;
  }

  try {
    const response = await fetch(window.Pupsik.apiUrl("/api/movie-ratings"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target_id: userRatingMovieId,
        target_type: "movie",
        rating,
        user_id: getGuestId(),
        title: movie ? movie.title : null,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || ("Failed to submit rating: " + response.status));
    }

    if (movie && payload?.movie) {
      const ratingSum = Number(payload.movie.rating_sum ?? 0) || 0;
      const ratingCount = Number(payload.movie.rating_count ?? 0) || 0;
      movie.ratingSum = ratingSum;
      movie.ratingCount = ratingCount;
      movie.userRating =
        ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : null;
      localStorage.setItem("moviesCache", JSON.stringify(allMovies));
    }

    rememberRatedMovie(movie || userRatingMovieId, rating);
    renderMovies();
  } catch (err) {
    console.error("Error submitting user rating", err);
    alert(
      err?.message ||
        "Не удалось сохранить оценку"
    );
  } finally {
    isSubmittingUserRating = false;
  }

  closeModal("userRateModal", true);
  userRatingMovieId = null;
}

async function submitUserGameRating() {
  const rating = getRatingValue("userRateGameInput");
  if (!isRatingValid(rating)) {
    alert("Неверная оценка");
    const input = document.getElementById("userRateGameInput");
    if (input) input.reportValidity();
    return;
  }
  if (!userRatingGameId) return;
  if (hasRatedGame(userRatingGameId)) {
    alert("Вы уже оценили эту игру");
    closeModal("userRateGameModal", true);
    userRatingGameId = null;
    return;
  }
  const game = allPlayedGames.find((g) => g.id === userRatingGameId);
  const currentSum = game ? Number(game.ratingSum ?? 0) || 0 : 0;
  const currentCount = game ? Number(game.ratingCount ?? 0) || 0 : 0;
  const newSum = currentSum + rating;
  const newCount = currentCount + 1;
  try {
    const response = await fetch(window.Pupsik.apiUrl("/api/movie-ratings"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target_id: userRatingGameId,
        target_type: "game",
        rating,
        user_id: getGuestId(),
        title: game ? game.title : null,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || ("Failed to submit rating: " + response.status));
    }
    const newSum = Number(payload?.game?.game_rating_sum ?? currentSum) || 0;
    const newCount = Number(payload?.game?.game_rating_count ?? currentCount) || 0;
    if (game) {
      game.ratingSum = newSum;
      game.ratingCount = newCount;
      game.userRating = Math.round((newSum / newCount) * 10) / 10;
    }
    localStorage.setItem("gamesCache", JSON.stringify(allPlayedGames));
    ratedGames[userRatingGameId] = rating;
    localStorage.setItem("ratedGames", JSON.stringify(ratedGames));
    renderPlayedGames();
  } catch (err) {
    console.error("Error submitting user game rating", err);
  }
  closeModal("userRateGameModal", true);
  userRatingGameId = null;
}

// Редактирование фильма
function setUserRateStatus(elementId, message, isError = false) {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = message || "";
  element.style.color = isError ? "#ffbcbc" : "";
}

function setUserRateSubmitState(buttonId, isBusy) {
  const button = document.getElementById(buttonId);
  if (!button) return;
  button.disabled = Boolean(isBusy);
  if (isBusy) {
    button.setAttribute("aria-busy", "true");
  } else {
    button.removeAttribute("aria-busy");
  }
}

async function submitUserMovieRating() {
  if (isSubmittingUserRating) return;

  const input = document.getElementById("userRateInput");
  const rating = getRatingValue("userRateInput");
  if (!isRatingValid(rating)) {
    setUserRateStatus("userRateStatus", "Введите корректную оценку от 0 до 11.", true);
    input?.reportValidity();
    return;
  }

  if (!userRatingMovieId) {
    return;
  }

  const movie = allMovies.find((m) => m.id === userRatingMovieId);

  isSubmittingUserRating = true;
  setUserRateSubmitState("userRateSubmitButton", true);
  setUserRateStatus("userRateStatus", "Сохраняем оценку...");

  try {
    const response = await fetch(window.Pupsik.apiUrl("/api/movie-ratings"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target_id: userRatingMovieId,
        target_type: "movie",
        rating,
        user_id: getGuestId(),
        title: movie ? movie.title : null,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || ("Failed to submit rating: " + response.status));
    }

    if (movie && payload?.movie) {
      const ratingSum = Number(payload.movie.rating_sum ?? 0) || 0;
      const ratingCount = Number(payload.movie.rating_count ?? 0) || 0;
      movie.ratingSum = ratingSum;
      movie.ratingCount = ratingCount;
      movie.userRating =
        ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : null;
      localStorage.setItem("moviesCache", JSON.stringify(allMovies));
    }

    rememberRatedMovie(movie || userRatingMovieId, rating);
    renderMovies();
    closeModal("userRateModal", true);
    userRatingMovieId = null;
  } catch (err) {
    console.error("Error submitting user rating", err);
    setUserRateStatus(
      "userRateStatus",
      err?.message || "Не удалось сохранить оценку",
      true
    );
  } finally {
    isSubmittingUserRating = false;
    setUserRateSubmitState("userRateSubmitButton", false);
  }
}

async function submitUserGameRating() {
  if (isSubmittingUserRating) return;

  const input = document.getElementById("userRateGameInput");
  const rating = getRatingValue("userRateGameInput");
  if (!isRatingValid(rating)) {
    setUserRateStatus("userRateGameStatus", "Введите корректную оценку от 0 до 11.", true);
    input?.reportValidity();
    return;
  }
  if (!userRatingGameId) return;

  const game = allPlayedGames.find((g) => g.id === userRatingGameId);
  const previousRating = Object.prototype.hasOwnProperty.call(ratedGames, String(userRatingGameId))
    ? Number(ratedGames[String(userRatingGameId)])
    : null;
  const currentSum = game ? Number(game.ratingSum ?? 0) || 0 : 0;
  const currentCount = game ? Number(game.ratingCount ?? 0) || 0 : 0;

  isSubmittingUserRating = true;
  setUserRateSubmitState("userRateGameSubmitButton", true);
  setUserRateStatus("userRateGameStatus", "Сохраняем оценку...");

  try {
    const response = await fetch(window.Pupsik.apiUrl("/api/movie-ratings"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target_id: userRatingGameId,
        target_type: "game",
        rating,
        user_id: getGuestId(),
        title: game ? game.title : null,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || ("Failed to submit rating: " + response.status));
    }

    const newSum = Number(payload?.game?.game_rating_sum ?? currentSum) || 0;
    const newCount = Number(payload?.game?.game_rating_count ?? currentCount) || 0;

    if (game) {
      game.ratingSum = newSum;
      game.ratingCount = newCount;
      game.userRating = newCount > 0 ? Math.round((newSum / newCount) * 10) / 10 : null;
    }
    localStorage.setItem("gamesCache", JSON.stringify(allPlayedGames));
    ratedGames[userRatingGameId] = rating;
    localStorage.setItem("ratedGames", JSON.stringify(ratedGames));
    renderPlayedGames();
    closeModal("userRateGameModal", true);
    userRatingGameId = null;
  } catch (err) {
    console.error("Error submitting user game rating", err);
    setUserRateStatus(
      "userRateGameStatus",
      err?.message || "Не удалось сохранить оценку",
      true
    );
  } finally {
    isSubmittingUserRating = false;
    setUserRateSubmitState("userRateGameSubmitButton", false);
  }
}

// Форматирование даты
function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit"
  });
}

function formatDateTime(dateStr) {
  if (!dateStr) return "";
  const hasTime = /T\d{2}:\d{2}/.test(dateStr);
  const timePart = hasTime
    ? dateStr.slice(dateStr.indexOf("T") + 1, dateStr.indexOf("T") + 6)
    : "";

  if (!hasTime || timePart === "00:00") {
    return formatDate(dateStr);
  }

  const d = new Date(dateStr);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTimeLocal(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const tzOffset = d.getTimezoneOffset() * 60000;
  const localISOTime = new Date(d.getTime() - tzOffset).toISOString();
  return localISOTime.slice(0, 16);
}

function formatDateLocal(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const tzOffset = d.getTimezoneOffset() * 60000;
  const localISOTime = new Date(d.getTime() - tzOffset).toISOString();
  return localISOTime.slice(0, 10);
}

function formatTimeLocal(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const tzOffset = d.getTimezoneOffset() * 60000;
  const localISOTime = new Date(d.getTime() - tzOffset).toISOString();
  return localISOTime.slice(11, 16);
}

// Сброс форм и рейтингов

// Клик вне модалки закрывает её
window.onclick = function (event) {
  document.querySelectorAll(".modal").forEach((modal) => {
    if (event.target === modal) {
      if (modal.id === "fortuneWinnerModal") {
        if (typeof closeFortuneWinnerModal === "function") closeFortuneWinnerModal();
        else closeModal("fortuneWinnerModal");
      } else {
        closeModal(modal.id);
      }
    }
  });
};

function showAdminControls(skipRender = false) {
  if (!isAdmin || !adminToken) {
    return;
  }
  adminElements.forEach((el) => el.classList.remove("admin-only"));
  const btn = document.getElementById("adminLoginBtn");
  const group = document.getElementById("adminPasswordGroup");
  const input = document.getElementById("adminPassword");
  if (btn) btn.textContent = "Выйти";
  if (group) group.style.display = "none";
  if (input) {
    input.required = false;
    input.value = "";
  }
  if (!skipRender) {
    renderMovies();
    renderWatchlist();
    renderGames();
    renderPlayedGames();
  }
}

function hideAdminControls(skipRender = false) {
  adminElements.forEach((el) => el.classList.add("admin-only"));
  const btn = document.getElementById("adminLoginBtn");
  const group = document.getElementById("adminPasswordGroup");
  const input = document.getElementById("adminPassword");
  if (btn) btn.textContent = "Войти";
  if (group) group.style.display = "";
  if (input) input.required = true;
  closeSettingsPanel();
  if (!skipRender) {
    renderMovies();
    renderWatchlist();
    renderGames();
    renderPlayedGames();
  }
}

function logoutAdmin() {
  isAdmin = false;
  clearAdminSession();
  hideAdminControls();
  closeModal("adminModal");
}

function showTab(tab) {
  activeTab = tab;
  document.querySelectorAll("#mobileTabs button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  updateTabVisibility();
  updateListVisibility();
  void loadActiveCatalog();
}

function updateTabVisibility() {
  const isMobile = window.innerWidth <= 768;
  const movies = document.getElementById("moviesSection");
  const leftPanel = document.querySelector(".left-panel");
  const watch = document.getElementById("watchlistSection");
  const games = document.getElementById("gamesSection");
  const tabs = document.getElementById("mobileTabs");
  if (isMobile) {
    if (tabs) tabs.style.display = "flex";
    if (leftPanel)
      leftPanel.style.display = activeTab === "movies" ? "block" : "none";
    if (movies)
      movies.style.display = activeTab === "movies" ? "block" : "none";
    if (watch)
      watch.style.display = activeTab === "watchlist" ? "block" : "none";
    if (games) games.style.display = activeTab === "games" ? "block" : "none";
  } else {
    if (tabs) tabs.style.display = "none";
    if (leftPanel) leftPanel.style.display = "block";
    if (movies) movies.style.display = "block";
    if (watch) watch.style.display = "block";
    if (games) games.style.display = "block";
  }
}

let activeListTab = "movies";

function updateListTabsIndicator() {
  const tabs = document.querySelector(".list-tabs");
  if (!tabs) return;
  const activeButton = tabs.querySelector("button.active");
  if (!activeButton) return;
  const tabsRect = tabs.getBoundingClientRect();
  const buttonRect = activeButton.getBoundingClientRect();
  const left = buttonRect.left - tabsRect.left;
  tabs.style.setProperty("--indicator-left", `${left}px`);
  tabs.style.setProperty("--indicator-width", `${buttonRect.width}px`);
}

function showListTab(tab) {
  activeListTab = tab;
  document.querySelectorAll(".list-tabs button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.list === tab);
  });
  updateListVisibility();
  requestAnimationFrame(updateListTabsIndicator);
  void loadActiveCatalog();
}

function updateListVisibility() {
  const movies = document.getElementById("moviesSection");
  const games = document.getElementById("gamesListSection");
  if (movies)
    movies.style.display = activeListTab === "movies" ? "block" : "none";
  if (games) games.style.display = activeListTab === "games" ? "block" : "none";
}

window.addEventListener("resize", () => {
  updateTabVisibility();
  updateListVisibility();
  void loadActiveCatalog();
  updateListTabsIndicator();
});
