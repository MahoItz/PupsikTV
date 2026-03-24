const TRAILERS_STORAGE_KEY = "pupsik_trailers_queue_v1";

const state = {
  pending: [],
  watched: [],
  activeTrailerId: null,
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getYouTubeVideoId(urlValue) {
  if (!urlValue) return null;
  try {
    const url = new URL(urlValue.trim());
    const host = url.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0] || null;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") {
        return url.searchParams.get("v");
      }
      if (url.pathname.startsWith("/shorts/")) {
        return url.pathname.split("/").filter(Boolean)[1] || null;
      }
      if (url.pathname.startsWith("/embed/")) {
        return url.pathname.split("/").filter(Boolean)[1] || null;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function saveState() {
  localStorage.setItem(TRAILERS_STORAGE_KEY, JSON.stringify({
    pending: state.pending,
    watched: state.watched,
  }));
}

function loadState() {
  try {
    const raw = localStorage.getItem(TRAILERS_STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    state.pending = Array.isArray(parsed?.pending) ? parsed.pending : [];
    state.watched = Array.isArray(parsed?.watched) ? parsed.watched : [];
  } catch (error) {
    console.error("Failed to load trailers state", error);
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function getActiveTrailer() {
  return state.pending.find((item) => item.id === state.activeTrailerId) || null;
}

function renderPendingList() {
  const list = document.getElementById("pendingList");
  if (!list) return;

  setText("pendingCount", String(state.pending.length));

  if (!state.pending.length) {
    list.innerHTML = '<p class="trailers-empty">Список пуст</p>';
    return;
  }

  list.innerHTML = state.pending
    .map(
      (item) => `
      <div class="trailer-item">
        <div class="trailer-item__title">${escapeHtml(item.title)}</div>
        <div class="trailer-item__actions">
          <button class="btn btn-secondary" type="button" data-action="watch" data-id="${item.id}">Смотреть</button>
          <button class="btn btn-secondary" type="button" data-action="remove" data-id="${item.id}">Удалить</button>
        </div>
      </div>
    `
    )
    .join("");
}

function renderWatchedList() {
  const list = document.getElementById("watchedList");
  if (!list) return;

  setText("watchedCount", String(state.watched.length));

  if (!state.watched.length) {
    list.innerHTML = '<p class="trailers-empty">Пока нет просмотренных трейлеров</p>';
    return;
  }

  list.innerHTML = state.watched
    .slice()
    .reverse()
    .map(
      (item) => `
      <div class="trailer-item">
        <div class="trailer-item__title">${escapeHtml(item.title)}</div>
        <div class="trailer-item__meta">Оценка: <strong>${item.rating}/10</strong></div>
      </div>
    `
    )
    .join("");
}

async function loadKinopoiskInfo(title) {
  const kpCard = document.getElementById("kinopoiskCard");
  const kpInfo = document.getElementById("kpInfo");
  const kpStatus = document.getElementById("kpStatus");

  if (!kpCard || !kpInfo || !kpStatus) return;

  kpCard.hidden = false;
  kpInfo.hidden = true;
  kpStatus.textContent = "Ищу фильм на Кинопоиске...";

  try {
    const response = await fetch(`/api/kinopoisk-trailer?title=${encodeURIComponent(title)}`);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data?.film) {
      kpStatus.textContent = "Фильм не найден на Кинопоиске.";
      return;
    }

    setText("kpTitle", data.film.nameRu || data.film.nameEn || data.film.nameOriginal || "-");
    setText("kpDescription", data.film.description || "Описание не найдено.");
    setText("kpActors", (data.actors || []).join(", ") || "Нет данных");
    setText("kpReleaseDate", data.film.premiereRu || data.film.year || "Нет данных");

    const link = document.getElementById("kpLink");
    if (link && data.film.kinopoiskId) {
      link.href = `https://www.kinopoisk.ru/film/${data.film.kinopoiskId}/`;
    }

    kpStatus.textContent = "";
    kpInfo.hidden = false;
  } catch (error) {
    kpStatus.textContent = `Не удалось загрузить данные: ${error.message}`;
  }
}

function selectTrailer(itemId) {
  const trailer = state.pending.find((entry) => entry.id === itemId);
  if (!trailer) return;

  state.activeTrailerId = trailer.id;
  const frame = document.getElementById("trailerPlayer");
  const saveButton = document.getElementById("saveRatingButton");

  setText("playerTitle", trailer.title);
  if (frame) {
    frame.src = `https://www.youtube.com/embed/${encodeURIComponent(trailer.videoId)}`;
  }
  if (saveButton) {
    saveButton.disabled = false;
  }

  loadKinopoiskInfo(trailer.title);
}

function removeTrailer(itemId) {
  state.pending = state.pending.filter((item) => item.id !== itemId);
  if (state.activeTrailerId === itemId) {
    state.activeTrailerId = null;
    const frame = document.getElementById("trailerPlayer");
    const saveButton = document.getElementById("saveRatingButton");
    const kpCard = document.getElementById("kinopoiskCard");

    setText("playerTitle", "Выбери трейлер из списка");
    if (frame) frame.src = "";
    if (saveButton) saveButton.disabled = true;
    if (kpCard) kpCard.hidden = true;
  }

  saveState();
  renderPendingList();
}

function saveRating() {
  const trailer = getActiveTrailer();
  if (!trailer) return;

  const ratingInput = document.getElementById("trailerRating");
  const ratingError = document.getElementById("ratingError");
  const numericRating = Number(ratingInput?.value);

  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 10) {
    if (ratingError) {
      ratingError.hidden = false;
      ratingError.textContent = "Оценка должна быть целым числом от 1 до 10.";
    }
    return;
  }

  if (ratingError) {
    ratingError.hidden = true;
    ratingError.textContent = "";
  }

  const watchedItem = {
    ...trailer,
    rating: numericRating,
    watchedAt: new Date().toISOString(),
  };

  state.watched.push(watchedItem);
  state.pending = state.pending.filter((item) => item.id !== trailer.id);
  state.activeTrailerId = null;

  if (ratingInput) ratingInput.value = "";

  const frame = document.getElementById("trailerPlayer");
  const saveButton = document.getElementById("saveRatingButton");
  const kpCard = document.getElementById("kinopoiskCard");

  setText("playerTitle", "Выбери трейлер из списка");
  if (frame) frame.src = "";
  if (saveButton) saveButton.disabled = true;
  if (kpCard) kpCard.hidden = true;

  saveState();
  renderPendingList();
  renderWatchedList();
}

function handleAddTrailer(event) {
  event.preventDefault();

  const titleInput = document.getElementById("trailerTitle");
  const urlInput = document.getElementById("trailerUrl");
  const formError = document.getElementById("trailerFormError");

  const title = titleInput?.value?.trim() || "";
  const url = urlInput?.value?.trim() || "";
  const videoId = getYouTubeVideoId(url);

  if (!title || !videoId) {
    if (formError) {
      formError.hidden = false;
      formError.textContent = "Укажи название и валидную ссылку YouTube.";
    }
    return;
  }

  if (formError) {
    formError.hidden = true;
    formError.textContent = "";
  }

  state.pending.push({
    id: `trailer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    url,
    videoId,
    createdAt: new Date().toISOString(),
  });

  if (titleInput) titleInput.value = "";
  if (urlInput) urlInput.value = "";

  saveState();
  renderPendingList();
}

function initEvents() {
  const form = document.getElementById("trailerForm");
  if (form) {
    form.addEventListener("submit", handleAddTrailer);
  }

  const pendingList = document.getElementById("pendingList");
  if (pendingList) {
    pendingList.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action][data-id]");
      if (!button) return;

      const itemId = button.dataset.id;
      const action = button.dataset.action;
      if (!itemId || !action) return;

      if (action === "watch") {
        selectTrailer(itemId);
      } else if (action === "remove") {
        removeTrailer(itemId);
      }
    });
  }

  const saveButton = document.getElementById("saveRatingButton");
  if (saveButton) {
    saveButton.addEventListener("click", saveRating);
  }
}

function initTrailersPage() {
  loadState();
  renderPendingList();
  renderWatchedList();
  initEvents();
}

document.addEventListener("DOMContentLoaded", initTrailersPage);
