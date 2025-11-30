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
const fortuneSuggestionsContainer = document.getElementById(
  "fortuneSuggestionsContainer"
);
const fortuneSuggestionsButton = document.getElementById(
  "fortuneSuggestionsButton"
);
const fortuneSuggestionsBadge = document.getElementById(
  "fortuneSuggestionsCount"
);
const fortuneSuggestionsDropdown = document.getElementById(
  "fortuneSuggestionsDropdown"
);
const fortuneSuggestionsList = document.getElementById(
  "fortuneSuggestionsList"
);
const fortuneSuggestionsEmpty = document.getElementById(
  "fortuneSuggestionsEmpty"
);
const fortuneSuggestionsClose = document.getElementById(
  "fortuneSuggestionsClose"
);
const FORTUNE_SUGGESTIONS_POLL_INTERVAL = 3000;
const fortuneSuggestionsState = {
  pollTimerId: null,
  isFetching: false,
  items: [],
  lastFetch: 0,
  dropdownOpen: false,
  signature: null,
  supabaseWaitPromise: null,
  initialized: false,
  pendingIds: new Set(),
  highlightIds: null,
  notifyNewItems: false,
};
let fortuneSuggestionsSupabaseErrorLogged = false;
let fortuneWheelApi = null;
let rulesPanelManuallyCollapsed = false;
let rulesPanelStandaloneOpen = false;
const fortuneAutoResultsContainer = document.getElementById(
  "fortuneAutoResultsContainer"
);
const fortuneAutoResults = document.getElementById("fortuneAutoResults");
const fortuneMovieModal = document.getElementById("fortuneMovieModal");
const fortuneMovieClose = document.getElementById("fortuneMovieClose");
const fortuneMoviePreview = document.getElementById("fortuneMoviePreview");
const fortuneMovieCancel = document.getElementById("fortuneMovieCancel");
const fortuneMovieAdd = document.getElementById("fortuneMovieAdd");
const fortuneItemInput = document.getElementById("fortuneItemInput");
let fortuneKpResults = [];
let selectedFortuneKPMovie = null;

function setFortuneAutocompleteVisible(isOpen) {
  if (!fortuneAutoResultsContainer) return;

  fortuneAutoResultsContainer.style.display = isOpen ? "block" : "none";
  fortuneAutoResultsContainer.classList.toggle(
    "fortune-autocomplete--open",
    Boolean(isOpen)
  );
  fortuneAutoResultsContainer.setAttribute(
    "aria-expanded",
    isOpen ? "true" : "false"
  );
}

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

function waitForSupabaseClientForSuggestions() {
  if (supabaseClient && typeof supabaseClient.from === "function") {
    return Promise.resolve(supabaseClient);
  }

  if (fortuneSuggestionsState.supabaseWaitPromise) {
    return fortuneSuggestionsState.supabaseWaitPromise;
  }

  fortuneSuggestionsState.supabaseWaitPromise = new Promise(
    (resolve, reject) => {
      const startedAt = Date.now();
      const attempt = () => {
        if (supabaseClient && typeof supabaseClient.from === "function") {
          fortuneSuggestionsState.supabaseWaitPromise = null;
          resolve(supabaseClient);
          return;
        }
        if (Date.now() - startedAt > 10000) {
          fortuneSuggestionsState.supabaseWaitPromise = null;
          reject(new Error("Supabase client is not ready"));
          return;
        }
        setTimeout(attempt, 150);
      };
      attempt();
    }
  );

  return fortuneSuggestionsState.supabaseWaitPromise;
}

function updateFortuneSuggestionsBadge(count) {
  if (fortuneSuggestionsBadge) {
    if (count > 0) {
      fortuneSuggestionsBadge.textContent = count > 99 ? "99+" : String(count);
      fortuneSuggestionsBadge.classList.remove(
        "fortune-suggestions-badge--hidden"
      );
    } else {
      fortuneSuggestionsBadge.textContent = "0";
      fortuneSuggestionsBadge.classList.add(
        "fortune-suggestions-badge--hidden"
      );
    }
  }

  if (fortuneSuggestionsButton) {
    const baseLabel = "Предложенные фильмы";
    const suffixParts = [];
    suffixParts.push(count > 0 ? `: ${count}` : ": нет новых");
    if (
      fortuneSuggestionsState.notifyNewItems &&
      !fortuneSuggestionsState.dropdownOpen
    ) {
      suffixParts.push("(есть новые предложения)");
    }
    fortuneSuggestionsButton.setAttribute(
      "aria-label",
      `${baseLabel}${suffixParts.join(" ")}`
    );
  }
}

function updateFortuneSuggestionsButtonNotifyState() {
  if (!fortuneSuggestionsButton) {
    return;
  }
  const shouldNotify =
    fortuneSuggestionsState.notifyNewItems &&
    !fortuneSuggestionsState.dropdownOpen;
  fortuneSuggestionsButton.classList.toggle(
    "fortune-suggestions-button--notify",
    Boolean(shouldNotify)
  );
}

function getFortuneSuggestionsCount() {
  return Array.isArray(fortuneSuggestionsState.items)
    ? fortuneSuggestionsState.items.length
    : 0;
}

function computeFortuneSuggestionsSignature(list) {
  return (Array.isArray(list) ? list : [])
    .map((item) => {
      const idPart = String(item?.id ?? "").trim();
      const createdAtPart = String(item?.created_at ?? "").trim();
      const channelPart =
        typeof item?.twitch_channel === "string"
          ? item.twitch_channel.trim()
          : "";
      const userPart =
        typeof item?.twitch_user === "string" ? item.twitch_user.trim() : "";
      const textPart =
        typeof item?.raw_text === "string" ? item.raw_text.trim() : "";
      return `${idPart}:${createdAtPart}:${channelPart}:${userPart}:${textPart}`;
    })
    .join("|");
}

function createFortuneSuggestionSearchLink(
  href,
  ariaLabel,
  extraClass,
  iconSrc = "images/kp_icon.webp"
) {
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
}

function renderFortuneSuggestionsList() {
  if (!fortuneSuggestionsList) return;

  fortuneSuggestionsList.replaceChildren();

  const items = Array.isArray(fortuneSuggestionsState.items)
    ? fortuneSuggestionsState.items
    : [];
  const highlightIds = fortuneSuggestionsState.highlightIds;

  if (!items.length) {
    if (fortuneSuggestionsEmpty) {
      fortuneSuggestionsEmpty.hidden = false;
    }
    return;
  }

  if (fortuneSuggestionsEmpty) {
    fortuneSuggestionsEmpty.hidden = true;
  }

  items.forEach((item) => {
    const itemId = item?.id;
    const highlightKey =
      itemId === null || itemId === undefined ? null : String(itemId);
    const listItem = document.createElement("li");
    listItem.className = "fortune-suggestions-item";

    const userEl = document.createElement("span");
    userEl.className = "fortune-suggestions-user";
    const userName =
      typeof item?.twitch_user === "string" ? item.twitch_user.trim() : "";
    userEl.textContent = userName ? `${userName}` : "Неизвестно";

    const textEl = document.createElement("span");
    textEl.className = "fortune-suggestions-text";
    const filmText =
      typeof item?.raw_text === "string" ? item.raw_text.trim() : "";
    if (filmText) {
      textEl.textContent = filmText;
      textEl.title = filmText;
    } else {
      textEl.textContent = "—";
    }

    const card = document.createElement("div");
    card.className = "fortune-suggestions-card";

    const contentColumn = document.createElement("div");
    contentColumn.className = "fortune-suggestions-content";
    contentColumn.appendChild(userEl);
    contentColumn.appendChild(textEl);

    const controlsColumn = document.createElement("div");
    controlsColumn.className = "fortune-suggestions-controls";

    const actionsEl = document.createElement("div");
    actionsEl.className = "fortune-suggestions-actions";

    const isPending =
      !!itemId && fortuneSuggestionsState.pendingIds.has(itemId);

    const approveBtn = document.createElement("button");
    approveBtn.type = "button";
    approveBtn.className =
      "fortune-suggestions-action fortune-suggestions-action--approve";
    const approveLabel = filmText
      ? `Добавить «${filmText}» в рулетку`
      : "Добавить фильм в рулетку";
    approveBtn.setAttribute("aria-label", approveLabel);
    approveBtn.title = "Добавить в рулетку";
    approveBtn.innerHTML = '<span aria-hidden="true">✔</span>';
    approveBtn.disabled = isPending;
    approveBtn.addEventListener("click", () =>
      handleFortuneSuggestionAccept(item)
    );

    const rejectBtn = document.createElement("button");
    rejectBtn.type = "button";
    rejectBtn.className =
      "fortune-suggestions-action fortune-suggestions-action--reject";
    const rejectLabel = filmText
      ? `Удалить «${filmText}» из предложений`
      : "Удалить предложение";
    rejectBtn.setAttribute("aria-label", rejectLabel);
    rejectBtn.title = "Удалить предложение";
    rejectBtn.innerHTML = '<span aria-hidden="true">✕</span>';
    rejectBtn.disabled = isPending;
    rejectBtn.addEventListener("click", () =>
      handleFortuneSuggestionReject(item)
    );

    actionsEl.appendChild(approveBtn);
    actionsEl.appendChild(rejectBtn);

    const searchLabel = filmText || userName;
    if (searchLabel) {
      controlsColumn.appendChild(actionsEl);
      const linksRow = document.createElement("div");
      linksRow.className = "fortune-suggestions-links";
      const encodedLabel = encodeURIComponent(searchLabel);
      const kpAriaLabel = `Открыть поиск Кинопоиска для «${searchLabel}»`;
      const imdbAriaLabel = `Открыть поиск IMDb для «${searchLabel}»`;
      const kinopoiskLink = createFortuneSuggestionSearchLink(
        `https://www.kinopoisk.ru/index.php?kp_query=${encodedLabel}`,
        kpAriaLabel,
        "fortune-items-link-kinopoisk"
      );
      const imdbLink = createFortuneSuggestionSearchLink(
        `https://www.imdb.com/find/?q=${encodedLabel}&s=tt`,
        imdbAriaLabel,
        "fortune-items-link-imdb",
        "images/imdb_icon.webp"
      );
      linksRow.appendChild(kinopoiskLink);
      linksRow.appendChild(imdbLink);
      controlsColumn.appendChild(linksRow);
    } else {
      controlsColumn.appendChild(actionsEl);
    }

    card.appendChild(contentColumn);
    card.appendChild(controlsColumn);
    listItem.appendChild(card);

    if (isPending) {
      listItem.classList.add("fortune-suggestions-item--pending");
    }

    if (highlightIds && highlightKey && highlightIds.has(highlightKey)) {
      listItem.classList.add("fortune-suggestions-item--highlight");
      let highlightRemovalTimer = window.setTimeout(() => {
        listItem.classList.remove("fortune-suggestions-item--highlight");
        highlightRemovalTimer = null;
      }, 2600);
      const handleHighlightAnimationEnd = (event) => {
        if (event.animationName !== "fortuneSuggestionGlow") {
          return;
        }
        listItem.classList.remove("fortune-suggestions-item--highlight");
        if (highlightRemovalTimer) {
          clearTimeout(highlightRemovalTimer);
          highlightRemovalTimer = null;
        }
        listItem.removeEventListener("animationend", handleHighlightAnimationEnd);
      };
      listItem.addEventListener("animationend", handleHighlightAnimationEnd);
    }

    fortuneSuggestionsList.appendChild(listItem);
  });

  if (fortuneSuggestionsState.highlightIds === highlightIds) {
    fortuneSuggestionsState.highlightIds = null;
  }
}

async function fetchFortuneSuggestions(force = false) {
  if (!fortuneSuggestionsContainer) {
    return;
  }

  if (!force && fortuneSuggestionsState.isFetching) {
    return;
  }

  if (
    !force &&
    fortuneSuggestionsState.lastFetch &&
    Date.now() - fortuneSuggestionsState.lastFetch < 500
  ) {
    return;
  }

  let client;
  try {
    client = await waitForSupabaseClientForSuggestions();
  } catch (err) {
    if (!fortuneSuggestionsSupabaseErrorLogged) {
      console.error(
        "Supabase недоступен для загрузки предложенных фильмов",
        err
      );
      fortuneSuggestionsSupabaseErrorLogged = true;
    }
    return;
  }

  if (!client) {
    return;
  }

  fortuneSuggestionsState.isFetching = true;

  try {
    const { data, error } = await client
      .from("movie_suggestions")
      .select("id, created_at, twitch_channel, twitch_user, raw_text")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const suggestions = Array.isArray(data) ? data : [];
    const signature = computeFortuneSuggestionsSignature(suggestions);
    const signatureChanged = fortuneSuggestionsState.signature !== signature;
    const hasRenderedBefore = fortuneSuggestionsState.signature !== null;
    let highlightIds = null;

    if (signatureChanged && hasRenderedBefore) {
      const previousItems = Array.isArray(fortuneSuggestionsState.items)
        ? fortuneSuggestionsState.items
        : [];
      const previouslyKnownIds = new Set(
        previousItems
          .map((item) =>
            item?.id === null || item?.id === undefined ? null : String(item.id)
          )
          .filter(Boolean)
      );
      const freshIds = suggestions
        .map((item) =>
          item?.id === null || item?.id === undefined ? null : String(item.id)
        )
        .filter((id) => id && !previouslyKnownIds.has(id));

      if (freshIds.length) {
        highlightIds = new Set(freshIds);
      }
    }

    fortuneSuggestionsState.items = suggestions;
    fortuneSuggestionsState.signature = signature;
    fortuneSuggestionsState.lastFetch = Date.now();
    if (highlightIds) {
      fortuneSuggestionsState.highlightIds = highlightIds;
      if (!fortuneSuggestionsState.dropdownOpen) {
        fortuneSuggestionsState.notifyNewItems = true;
      }
    } else if (signatureChanged && fortuneSuggestionsState.highlightIds) {
      fortuneSuggestionsState.highlightIds = null;
    }
    if (fortuneSuggestionsState.dropdownOpen) {
      fortuneSuggestionsState.notifyNewItems = false;
    }
    updateFortuneSuggestionsButtonNotifyState();
    updateFortuneSuggestionsBadge(suggestions.length);

    if (signatureChanged) {
      renderFortuneSuggestionsList();
    }
  } catch (err) {
    console.error("Не удалось загрузить предложенные фильмы", err);
  } finally {
    fortuneSuggestionsState.isFetching = false;
  }
}

function startFortuneSuggestionsPolling() {
  if (fortuneSuggestionsState.pollTimerId) {
    return;
  }

  fetchFortuneSuggestions();

  fortuneSuggestionsState.pollTimerId = window.setInterval(() => {
    if (!musicMenu || !musicMenu.classList.contains("open")) {
      stopFortuneSuggestionsPolling();
      return;
    }
    fetchFortuneSuggestions();
  }, FORTUNE_SUGGESTIONS_POLL_INTERVAL);
}

function stopFortuneSuggestionsPolling() {
  if (fortuneSuggestionsState.pollTimerId) {
    clearInterval(fortuneSuggestionsState.pollTimerId);
    fortuneSuggestionsState.pollTimerId = null;
  }
}

function openFortuneSuggestionsDropdown() {
  if (
    !fortuneSuggestionsDropdown ||
    fortuneSuggestionsState.dropdownOpen === true
  ) {
    return;
  }

  fortuneSuggestionsDropdown.removeAttribute("hidden");
  fortuneSuggestionsState.dropdownOpen = true;
  fortuneSuggestionsState.notifyNewItems = false;
  updateFortuneSuggestionsButtonNotifyState();
  updateFortuneSuggestionsBadge(getFortuneSuggestionsCount());
  if (fortuneSuggestionsButton) {
    fortuneSuggestionsButton.setAttribute("aria-expanded", "true");
  }

  if (
    Date.now() - fortuneSuggestionsState.lastFetch >=
    FORTUNE_SUGGESTIONS_POLL_INTERVAL
  ) {
    fetchFortuneSuggestions(true);
  }
}

function closeFortuneSuggestionsDropdown() {
  if (
    !fortuneSuggestionsDropdown ||
    fortuneSuggestionsState.dropdownOpen === false
  ) {
    return;
  }

  fortuneSuggestionsDropdown.setAttribute("hidden", "");
  fortuneSuggestionsState.dropdownOpen = false;
  updateFortuneSuggestionsButtonNotifyState();
  updateFortuneSuggestionsBadge(getFortuneSuggestionsCount());
  if (fortuneSuggestionsButton) {
    fortuneSuggestionsButton.setAttribute("aria-expanded", "false");
  }
}

function toggleFortuneSuggestionsDropdown() {
  if (fortuneSuggestionsState.dropdownOpen) {
    closeFortuneSuggestionsDropdown();
  } else {
    openFortuneSuggestionsDropdown();
  }
}

function handleFortuneSuggestionsOutsideClick(event) {
  if (!fortuneSuggestionsState.dropdownOpen) return;
  if (!fortuneSuggestionsContainer) return;
  const composedPath = typeof event.composedPath === "function"
    ? event.composedPath()
    : null;
  const clickInside = composedPath
    ? composedPath.includes(fortuneSuggestionsContainer)
    : fortuneSuggestionsContainer.contains(event.target);
  if (clickInside) return;
  closeFortuneSuggestionsDropdown();
}

function handleFortuneSuggestionsKeydown(event) {
  if (!fortuneSuggestionsState.dropdownOpen) return;
  if (event.key !== "Escape" && event.key !== "Esc") return;
  closeFortuneSuggestionsDropdown();
  if (fortuneSuggestionsButton) {
    fortuneSuggestionsButton.focus();
  }
}

async function mutateFortuneSuggestion(item, afterDelete) {
  const id = item?.id;
  if (!id || fortuneSuggestionsState.pendingIds.has(id)) {
    return;
  }

  fortuneSuggestionsState.pendingIds.add(id);
  renderFortuneSuggestionsList();

  let client;
  try {
    client = await waitForSupabaseClientForSuggestions();
  } catch (err) {
    console.error(
      "Supabase недоступен для удаления предложенного фильма",
      err
    );
    fortuneSuggestionsState.pendingIds.delete(id);
    renderFortuneSuggestionsList();
    return;
  }

  try {
    const { error } = await client
      .from("movie_suggestions")
      .delete()
      .eq("id", id);

    if (error) {
      throw error;
    }

    fortuneSuggestionsState.items = fortuneSuggestionsState.items.filter(
      (existing) => existing?.id !== id
    );
    fortuneSuggestionsState.signature = computeFortuneSuggestionsSignature(
      fortuneSuggestionsState.items
    );
    fortuneSuggestionsState.lastFetch = Date.now();
    updateFortuneSuggestionsBadge(fortuneSuggestionsState.items.length);
    if (typeof afterDelete === "function") {
      try {
        afterDelete();
      } catch (callbackError) {
        console.error(
          "Ошибка при обработке предложенного фильма после удаления",
          callbackError
        );
      }
    }
  } catch (err) {
    console.error(
      "Не удалось обновить список предложенных фильмов в Supabase",
      err
    );
  } finally {
    fortuneSuggestionsState.pendingIds.delete(id);
    renderFortuneSuggestionsList();
  }
}

function handleFortuneSuggestionAccept(item) {
  const label =
    typeof item?.raw_text === "string" ? item.raw_text.trim() : "";

  mutateFortuneSuggestion(item, () => {
    if (!label) {
      console.warn(
        "Получено пустое название фильма из предложенного списка, пропускаем добавление в рулетку."
      );
      return;
    }
    if (fortuneWheelApi && typeof fortuneWheelApi.addItem === "function") {
      fortuneWheelApi.addItem(label);
    } else {
      console.error(
        "API рулетки недоступно, не удалось добавить фильм из предложений."
      );
    }
  });
}

function handleFortuneSuggestionReject(item) {
  mutateFortuneSuggestion(item);
}

function initializeFortuneSuggestions() {
  if (fortuneSuggestionsState.initialized) {
    return;
  }

  if (!fortuneSuggestionsContainer || !fortuneSuggestionsButton) {
    return;
  }

  fortuneSuggestionsState.initialized = true;

  updateFortuneSuggestionsBadge(0);
  updateFortuneSuggestionsButtonNotifyState();
  if (fortuneSuggestionsEmpty) {
    fortuneSuggestionsEmpty.hidden = true;
  }

  fortuneSuggestionsButton.addEventListener("click", (event) => {
    event.preventDefault();
    toggleFortuneSuggestionsDropdown();
  });

  if (fortuneSuggestionsClose) {
    fortuneSuggestionsClose.addEventListener("click", () => {
      closeFortuneSuggestionsDropdown();
      if (fortuneSuggestionsButton) {
        fortuneSuggestionsButton.focus();
      }
    });
  }

  document.addEventListener("click", handleFortuneSuggestionsOutsideClick);
  document.addEventListener("keydown", handleFortuneSuggestionsKeydown);

  fetchFortuneSuggestions(true);

  if (musicMenu && musicMenu.classList.contains("open")) {
    startFortuneSuggestionsPolling();
  }
}

document.addEventListener("DOMContentLoaded", initializeFortuneSuggestions);

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
    stopFortuneSuggestionsPolling();
    closeFortuneSuggestionsDropdown();
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
    startFortuneSuggestionsPolling();
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

function resetFortuneAutocomplete() {
  fortuneKpResults = [];
  selectedFortuneKPMovie = null;
  if (fortuneAutoResults) {
    fortuneAutoResults.innerHTML = "";
  }

  setFortuneAutocompleteVisible(false);
}

function getFortuneMovieLabel(movie) {
  const baseTitle =
    (movie?.nameRu || movie?.nameEn || movie?.nameOriginal || "").trim();
  if (!baseTitle) {
    return "";
  }
  const yearValue = (movie?.year || "").toString().trim();
  return yearValue ? `${baseTitle} (${yearValue})` : baseTitle;
}

function mapFortuneFilmToMovieCard(movie) {
  return {
    id: 0,
    title: movie?.nameRu || movie?.nameEn || movie?.nameOriginal || "",
    originalTitle: movie?.nameEn || movie?.nameOriginal || "",
    year: movie?.year || "",
    rating: 0,
    kpRating: movie?.rating ?? "-",
    poster:
      movie?.posterUrlPreview ||
      movie?.posterUrl ||
      "https://via.placeholder.com/300x400?text=Нет+постера",
    dateAdded: new Date().toISOString().split("T")[0],
    genre: movie?.genres?.map((g) => g.genre).join(", ") || "",
    orderBy: "",
    orderType: "",
  };
}

function openFortuneMovieModal(movie) {
  if (!fortuneMovieModal || !fortuneMoviePreview) {
    return;
  }

  const label = getFortuneMovieLabel(movie);
  if (fortuneItemInput && label) {
    fortuneItemInput.value = label;
  }

  fortuneMoviePreview.innerHTML = "";
  if (typeof createMovieCard === "function") {
    const card = createMovieCard(mapFortuneFilmToMovieCard(movie), false, false);
    fortuneMoviePreview.appendChild(card);
  }

  fortuneMovieModal.style.display = "block";
  if (fortuneMovieAdd) {
    setTimeout(() => fortuneMovieAdd.focus(), 0);
  }
}

function closeFortuneMovieModal() {
  if (fortuneMovieModal) {
    fortuneMovieModal.style.display = "none";
  }
  selectedFortuneKPMovie = null;
  if (fortuneItemInput) {
    fortuneItemInput.focus();
  }
}

const debouncedFortuneKPSearch = debounce(async (query) => {
  if (!fortuneAutoResults || !fortuneAutoResultsContainer) {
    return;
  }

  const trimmed = (query || "").trim();
  if (!trimmed || !KINOPOISK_API_KEY) {
    resetFortuneAutocomplete();
    return;
  }

  setFortuneAutocompleteVisible(true);
  showSearchLoading("fortuneAutoResultsContainer", "fortuneAutoResults");

  try {
    const url = `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(
      trimmed
    )}&page=1`;
    const res = await fetch(url, {
      headers: {
        "X-API-KEY": KINOPOISK_API_KEY,
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();
    fortuneKpResults = data.films || [];

    fortuneAutoResults.innerHTML = "";
    fortuneKpResults.forEach((film, idx) => {
      const option = document.createElement("div");
      option.className = "autocomplete-option";
      option.dataset.index = idx;
      const label = getFortuneMovieLabel(film);
      option.textContent = label || "Без названия";
      fortuneAutoResults.appendChild(option);
    });

    setFortuneAutocompleteVisible(Boolean(fortuneKpResults.length));
  } catch (err) {
    console.error("Kinopoisk autocomplete error for fortune", err);
    resetFortuneAutocomplete();
  }
}, 120);

if (fortuneAutoResults) {
  fortuneAutoResults.addEventListener("click", (event) => {
    const option = event.target.closest(".autocomplete-option");
    if (!option) {
      return;
    }

    const idx = Number(option.dataset.index);
    selectedFortuneKPMovie = fortuneKpResults[idx] || null;
    if (!selectedFortuneKPMovie) {
      return;
    }

    setFortuneAutocompleteVisible(false);
    openFortuneMovieModal(selectedFortuneKPMovie);
  });
}

if (fortuneMovieClose) {
  fortuneMovieClose.addEventListener("click", closeFortuneMovieModal);
}

if (fortuneMovieCancel) {
  fortuneMovieCancel.addEventListener("click", closeFortuneMovieModal);
}

if (fortuneMovieModal) {
  fortuneMovieModal.addEventListener("click", (event) => {
    if (event.target === fortuneMovieModal) {
      closeFortuneMovieModal();
    }
  });
}

if (fortuneMovieAdd) {
  fortuneMovieAdd.addEventListener("click", () => {
    if (!selectedFortuneKPMovie || !fortuneWheelApi) {
      return;
    }

    const label = getFortuneMovieLabel(selectedFortuneKPMovie);
    if (label) {
      fortuneWheelApi.addItem(label);
      resetFortuneAutocomplete();
      if (fortuneItemInput) {
        fortuneItemInput.value = "";
      }
    }
    closeFortuneMovieModal();
  });
}

if (fortuneItemInput) {
  fortuneItemInput.addEventListener("input", (event) => {
    debouncedFortuneKPSearch(event.target.value || "");
  });
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
    addItem(label, options) {
      addFortuneItem(label, options);
    },
  };
}
