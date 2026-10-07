// Keep one rat video active and schedule another after it finishes.

const FORTUNE_KINOPOISK_FILM_URL =
  'https://kinopoiskapiunofficial.tech/api/v2.2/films';

const supabaseClientWaitPromises = new Map();

const orderDetailsModal = document.getElementById('orderDetailsModal');
const orderParentGuideStatus = document.getElementById(
  'orderParentGuideStatus'
);
const orderParentGuideImdbLink = document.getElementById(
  'orderParentGuideImdbLink'
);
const orderParentGuideContent = document.getElementById(
  'orderParentGuideContent'
);
const orderParentGuideSections = {
  sexAndNudity: document.getElementById('orderParentGuideSexSection'),
};
const orderParentGuideLists = {
  sexAndNudity: document.getElementById('orderParentGuideSex'),
};
const gameOrderDetailsDescriptionStatus = document.getElementById(
  'gameOrderDetailsDescriptionStatus'
);
const gameOrderDetailsTranslateDescription = document.getElementById(
  'gameOrderDetailsTranslateDescription'
);
const gameDetailsDescriptionStatus = document.getElementById(
  'gameDetailsDescriptionStatus'
);
const gameDetailsTranslateDescription = document.getElementById(
  'gameDetailsTranslateDescription'
);
let activeGameOrderDetailsId = null;
function setActiveGameOrderDetailsId(id) {
  activeGameOrderDetailsId = id;
}
function clearActiveGameOrderDetailsId() {
  activeGameOrderDetailsId = null;
}
function isGameDescriptionTranslating(gameOrderId) {
  return orderGameDescriptionPrefetches.has(gameOrderId);
}
const playedGameDescriptionPrefetches = new Map();
function isPlayedGameDescriptionTranslating(gameId) {
  return playedGameDescriptionPrefetches.has(gameId);
}

const orderTimingsStatus = document.getElementById('orderTimingsStatus');
const orderTimingsList = document.getElementById('orderTimingsList');
const orderTimingsAuthor = document.getElementById('orderTimingsAuthor');
const orderPlayerTimingsStatus = document.getElementById(
  'orderPlayerTimingsStatus'
);
const orderPlayerTimingsList = document.getElementById(
  'orderPlayerTimingsList'
);

let orderParentGuideRequestId = 0;
let orderCurrentParentGuideData = null;
let orderTimingsRequestId = 0;
let activeOrderDetailsId = null;
let activeOrderDetailsOverride = null;
let activeOrderPlayerId = null;

let fortuneBanwordRegex = null;
let fortuneBanwordHighlightRegex = null;

const FORTUNE_WORD_TOKEN_REGEX =
  /(^|[^\p{L}\p{N}])([\p{L}\p{N}]+(?:[-'’/][\p{L}\p{N}]+)*)/gu;

function escapeHtml(str = '') {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function buildImdbParentGuideUrl(imdbId) {
  const normalizedImdbId = String(imdbId || '').trim();
  if (!normalizedImdbId) {
    return '';
  }

  return `https://www.imdb.com/title/${encodeURIComponent(
    normalizedImdbId
  )}/parentalguide/?ref_=tt_stry_pg`;
}

function setParentGuideImdbLinkState(linkEl, imdbId) {
  if (!linkEl) {
    return;
  }

  const url = buildImdbParentGuideUrl(imdbId);
  const isEnabled = Boolean(url);

  if (isEnabled) {
    linkEl.href = url;
    linkEl.removeAttribute('aria-disabled');
    linkEl.removeAttribute('tabindex');
  } else {
    linkEl.removeAttribute('href');
    linkEl.setAttribute('aria-disabled', 'true');
    linkEl.setAttribute('tabindex', '-1');
  }

  linkEl.classList.toggle('btn-disabled', !isEnabled);
}

function updateOrderParentGuideImdbLink(imdbId) {
  setParentGuideImdbLinkState(orderParentGuideImdbLink, imdbId);
}

function highlightFortuneBanwords(text = '') {
  const safeText = escapeHtml(text || '');
  if (!fortuneBanwordHighlightRegex) {
    return safeText;
  }

  return safeText.replace(
    FORTUNE_WORD_TOKEN_REGEX,
    (match, boundary, token) => {
      if (!token || !fortuneBanwordRegex?.test(token)) {
        return match;
      }

      return `${boundary}<span class="fortune-banword">${token}</span>`;
    }
  );
}

function waitForSupabaseClient(options = {}) {
  const timeoutMs =
    typeof options === 'number' ? options : Number(options?.timeoutMs) || 10000;
  const reuseKey =
    typeof options === 'object' && options?.reuseKey
      ? String(options.reuseKey)
      : null;

  if (supabaseClient && typeof supabaseClient.from === 'function') {
    return Promise.resolve(supabaseClient);
  }

  if (reuseKey && supabaseClientWaitPromises.has(reuseKey)) {
    return supabaseClientWaitPromises.get(reuseKey);
  }

  const waitPromise = new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const attempt = () => {
      if (supabaseClient && typeof supabaseClient.from === 'function') {
        resolve(supabaseClient);
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error('Supabase client is not ready'));
        return;
      }

      setTimeout(attempt, 150);
    };

    attempt();
  });

  if (!reuseKey) {
    return waitPromise;
  }

  supabaseClientWaitPromises.set(reuseKey, waitPromise);

  return waitPromise.finally(() => {
    if (supabaseClientWaitPromises.get(reuseKey) === waitPromise) {
      supabaseClientWaitPromises.delete(reuseKey);
    }
  });
}

function normalizeFortuneTimingsText(text = '') {
  const rawText = typeof text === 'string' ? text : '';
  return rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\t]+/g, '\n');
}

function getFortuneTimingsGroups(metadata = {}) {
  if (Array.isArray(metadata.timingsGroups)) {
    return metadata.timingsGroups;
  }

  const legacyText =
    typeof metadata.timingsText === 'string' ? metadata.timingsText : '';
  const legacyAuthor = metadata.timingsAuthor || null;

  if (legacyText.trim()) {
    return [
      {
        author: legacyAuthor,
        text: legacyText,
      },
    ];
  }

  return [];
}

function setOrderMetadata(order, metadata = {}) {
  if (!order) {
    return;
  }

  Object.keys(metadata).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(metadata, key)) {
      order[key] = metadata[key];
    }
  });

  if (order.id && activeOrderDetailsId === order.id) {
    updateOrderParentGuideImdbLink(order.imdbId || null);
  }
}

async function persistOrderParentGuide(orderId, guide) {
  if (!orderId || String(orderId).startsWith('kp-')) {
    return;
  }

  try {
    const token = localStorage.getItem('adminToken') || '';
    const response = await fetch(
      window.Pupsik.apiUrl('/api/admin?action=media-items'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'update_item',
          table: 'Movie_Orders',
          id: orderId,
          changes: { parents_guide: guide },
        }),
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error(
        'Failed to store parent guide for order',
        payload?.error || response.status
      );
    }
  } catch (error) {
    console.error('Failed to store parent guide for order', error);
  }
}

async function persistOrderGameDescription(gameOrderId, descriptionData) {
  if (!gameOrderId || !descriptionData) {
    return;
  }

  try {
    const token = localStorage.getItem('adminToken') || '';
    const response = await fetch(
      window.Pupsik.apiUrl('/api/admin?action=media-items'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'update_item',
          table: 'Game_Orders',
          id: gameOrderId,
          changes: { description: descriptionData },
        }),
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error(
        'Failed to store game description for order',
        payload?.error || response.status
      );
    }
  } catch (error) {
    console.error('Failed to store game description for order', error);
  }
}

async function persistPlayedGameDescription(gameId, descriptionData) {
  if (!gameId || !descriptionData) {
    return;
  }

  try {
    const token = localStorage.getItem('adminToken') || '';
    const response = await fetch(
      window.Pupsik.apiUrl('/api/admin?action=media-items'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'update_item',
          table: 'games',
          id: gameId,
          changes: { description: descriptionData },
        }),
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error(
        'Failed to store game description',
        payload?.error || response.status
      );
    }
  } catch (error) {
    console.error('Failed to store game description', error);
  }
}

const orderGameDescriptionPrefetches = new Map();

function isRussianGameDescriptionTranslation(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  const letters = text.match(/\p{L}/gu) || [];
  const russianLetters = text.match(/[а-яё]/giu) || [];
  return letters.length > 0 && russianLetters.length / letters.length >= 0.3;
}

async function translateGameDescription(text, modelValue) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return '';
  }

  const response = await fetch(
    window.Pupsik.apiUrl('/api/translate-description'),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text.trim(),
        model: modelValue,
      }),
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      payload.error || `Ошибка перевода: код ответа ${response.status}`
    );
  }
  if (!isRussianGameDescriptionTranslation(payload.translated)) {
    throw new Error('Модель не вернула перевод на русский язык.');
  }
  return payload.translated.trim();
}

async function translateGameDescriptionWithFallback(text, primaryModel) {
  let lastError;
  try {
    return await translateGameDescription(text, primaryModel);
  } catch (err) {
    lastError = err;
    console.warn(
      `[translateGameDescription] Primary model [${primaryModel}] failed:`,
      err
    );
  }

  if (typeof aiModelOptions === 'undefined' || !aiModelOptions.length) {
    throw lastError;
  }

  const activeFallbackModels = aiModelOptions
    .filter(
      (opt) =>
        opt.ai_model !== primaryModel &&
        (aiModelStatuses[opt.ai_model]?.status === 'active' ||
          aiModelStatuses[opt.ai_model]?.http_status === 200)
    )
    .map((opt) => opt.ai_model);

  for (const fallbackModel of activeFallbackModels) {
    try {
      console.log(
        `[translateGameDescription] Attempting fallback with model: ${fallbackModel}`
      );
      const result = await translateGameDescription(text, fallbackModel);
      if (typeof updateActiveAiModel === 'function') {
        updateActiveAiModel(fallbackModel);
      }
      return result;
    } catch (err) {
      lastError = err;
      console.warn(
        `[translateGameDescription] Fallback [${fallbackModel}] failed:`,
        err
      );
    }
  }

  throw new Error(
    `Не удалось перевести описание. ${lastError?.message || 'Попробуйте другую модель.'}`
  );
}

async function prefetchOrderGameDescriptionForOrder(gameOrder, options = {}) {
  const { force = false } = options;
  if (!gameOrder || !gameOrder.id || !supabaseClient) {
    return null;
  }

  const desc = gameOrder.description;
  const originalText =
    typeof desc === 'string'
      ? desc
      : desc && typeof desc === 'object' && typeof desc.original === 'string'
        ? desc.original
        : '';
  const hasTranslated =
    desc &&
    typeof desc === 'object' &&
    isRussianGameDescriptionTranslation(desc.translated);

  if (!force && hasTranslated) {
    return desc;
  }

  if (!originalText || !originalText.trim()) {
    return null;
  }

  if (!force && orderGameDescriptionPrefetches.has(gameOrder.id)) {
    return orderGameDescriptionPrefetches.get(gameOrder.id);
  }

  const loadPromise = (async () => {
    const { model: selectedModel } =
      (await loadFortuneTranslationModel()) || {};

    if (!selectedModel) {
      console.warn(
        '[prefetchOrderGameDescription] No translation model configured'
      );
      setGameOrderDescriptionStatus('Модель перевода не настроена.', {
        gameOrderId: gameOrder.id,
      });
      syncGameOrderTranslateButton(gameOrder);
      return desc;
    }

    setGameOrderDescriptionStatus('Переводим...', {
      spinner: true,
      gameOrderId: gameOrder.id,
    });
    syncGameOrderTranslateButton(gameOrder);

    try {
      const translated = await translateGameDescriptionWithFallback(
        originalText,
        selectedModel
      );
      const descriptionData = {
        original: originalText,
        translated: translated || null,
      };

      gameOrder.description = descriptionData;
      setGameOrderDescriptionStatus('', { gameOrderId: gameOrder.id });

      if (typeof renderGames === 'function') {
        renderGames();
      }

      await persistOrderGameDescription(gameOrder.id, descriptionData);

      if (
        activeGameOrderDetailsId === gameOrder.id &&
        typeof setMovieDetailsText === 'function'
      ) {
        const descText = getGameDescriptionDisplayText(descriptionData);
        setMovieDetailsText('gameOrderDetailsDescription', descText, '—');
      }

      syncGameOrderTranslateButton(gameOrder);
      return descriptionData;
    } catch (err) {
      console.error('Failed to translate game description for order', err);
      setGameOrderDescriptionStatus(
        err.message || 'Не удалось перевести описание.',
        { gameOrderId: gameOrder.id }
      );
      syncGameOrderTranslateButton(gameOrder);
      return desc;
    }
  })();

  orderGameDescriptionPrefetches.set(gameOrder.id, loadPromise);

  try {
    return await loadPromise;
  } finally {
    orderGameDescriptionPrefetches.delete(gameOrder.id);
    syncGameOrderTranslateButton(gameOrder);
  }
}

async function prefetchPlayedGameDescriptionForGame(game, options = {}) {
  const { force = false } = options;
  if (!game || !game.id || !supabaseClient) {
    return null;
  }

  const desc = game.description;
  const originalText =
    typeof desc === 'string'
      ? desc
      : desc && typeof desc === 'object' && typeof desc.original === 'string'
        ? desc.original
        : '';
  const hasTranslated =
    desc &&
    typeof desc === 'object' &&
    isRussianGameDescriptionTranslation(desc.translated);

  if (!force && hasTranslated) {
    return desc;
  }

  if (!originalText || !originalText.trim()) {
    setGameDetailsDescriptionStatus('Нет данных для перевода.', {
      gameId: game.id,
    });
    syncGameDetailsTranslateButton(game);
    return null;
  }

  if (!force && playedGameDescriptionPrefetches.has(game.id)) {
    return playedGameDescriptionPrefetches.get(game.id);
  }

  const loadPromise = (async () => {
    const { model: selectedModel } =
      (await loadFortuneTranslationModel()) || {};

    if (!selectedModel) {
      console.warn(
        '[prefetchPlayedGameDescription] No translation model configured'
      );
      setGameDetailsDescriptionStatus('Модель перевода не настроена.', {
        gameId: game.id,
      });
      syncGameDetailsTranslateButton(game);
      return desc;
    }

    setGameDetailsDescriptionStatus('Переводим...', {
      spinner: true,
      gameId: game.id,
    });

    try {
      const translated = await translateGameDescriptionWithFallback(
        originalText,
        selectedModel
      );
      const descriptionData = {
        original: originalText,
        translated: translated || null,
      };

      game.description = descriptionData;
      setGameDetailsDescriptionStatus('', { gameId: game.id });

      if (typeof updateLocalPlayedGame === 'function') {
        updateLocalPlayedGame(game);
      } else if (Array.isArray(allPlayedGames)) {
        const idx = allPlayedGames.findIndex((g) => g.id === game.id);
        if (idx !== -1) {
          allPlayedGames[idx] = game;
        }
        localStorage.setItem('gamesCache', JSON.stringify(allPlayedGames));
      }

      if (typeof renderPlayedGames === 'function') {
        renderPlayedGames();
      }

      await persistPlayedGameDescription(game.id, descriptionData);

      if (
        typeof activeGameDetailsId !== 'undefined' &&
        activeGameDetailsId === game.id &&
        typeof setMovieDetailsText === 'function'
      ) {
        const descText = getGameDescriptionDisplayText(descriptionData);
        setMovieDetailsText('gameDetailsDescription', descText, '—');
      }

      syncGameDetailsTranslateButton(game);
      return descriptionData;
    } catch (err) {
      console.error('Failed to translate game description', err);
      setGameDetailsDescriptionStatus(err.message || 'Ошибка перевода', {
        gameId: game.id,
      });
      syncGameDetailsTranslateButton(game);
      return desc;
    }
  })();

  playedGameDescriptionPrefetches.set(game.id, loadPromise);

  try {
    return await loadPromise;
  } finally {
    playedGameDescriptionPrefetches.delete(game.id);
    syncGameDetailsTranslateButton(game);
  }
}

function getGameDescriptionDisplayText(desc) {
  if (!desc) return '';
  if (typeof desc === 'string') return desc;
  if (desc.translated && typeof desc.translated === 'string') {
    return desc.translated.trim() || desc.original || '';
  }
  return desc.original || '';
}

function setGameOrderDescriptionStatus(message, options = {}) {
  if (!gameOrderDetailsDescriptionStatus) return;
  const { spinner = false, gameOrderId = null } = options;
  if (
    gameOrderId != null &&
    activeGameOrderDetailsId != null &&
    String(gameOrderId) !== String(activeGameOrderDetailsId)
  ) {
    return;
  }
  gameOrderDetailsDescriptionStatus.textContent = message || '';
  gameOrderDetailsDescriptionStatus.classList.toggle(
    'game-order-description-status--loading',
    spinner
  );
  gameOrderDetailsDescriptionStatus.style.display = message
    ? 'inline-flex'
    : 'none';
}

function syncGameOrderTranslateButton(gameOrder) {
  if (!gameOrderDetailsTranslateDescription) return;
  const desc = gameOrder?.description ?? null;
  const originalText =
    typeof desc === 'string'
      ? desc
      : desc && typeof desc === 'object' && typeof desc.original === 'string'
        ? desc.original
        : '';
  const canTranslate = Boolean(originalText && originalText.trim());
  const isBusy =
    gameOrder &&
    typeof gameOrder.id !== 'undefined' &&
    orderGameDescriptionPrefetches.has(gameOrder.id);
  const shouldDisable = !canTranslate || isBusy;
  gameOrderDetailsTranslateDescription.disabled = shouldDisable;
  gameOrderDetailsTranslateDescription.classList.toggle(
    'btn-disabled',
    shouldDisable
  );
}

function setGameDetailsDescriptionStatus(message, options = {}) {
  if (!gameDetailsDescriptionStatus) return;
  const { spinner = false, gameId = null } = options;
  if (
    gameId != null &&
    typeof activeGameDetailsId !== 'undefined' &&
    activeGameDetailsId != null &&
    String(gameId) !== String(activeGameDetailsId)
  ) {
    return;
  }
  gameDetailsDescriptionStatus.textContent = message || '';
  gameDetailsDescriptionStatus.classList.toggle(
    'game-order-description-status--loading',
    spinner
  );
  gameDetailsDescriptionStatus.style.display = message ? 'inline-flex' : 'none';
}

function syncGameDetailsTranslateButton(game) {
  if (!gameDetailsTranslateDescription) return;
  const desc = game?.description ?? null;
  const originalText =
    typeof desc === 'string'
      ? desc
      : desc && typeof desc === 'object' && typeof desc.original === 'string'
        ? desc.original
        : '';
  const canTranslate = Boolean(originalText && originalText.trim());
  const isBusy =
    game &&
    typeof game.id !== 'undefined' &&
    playedGameDescriptionPrefetches.has(game.id);
  const shouldDisable = !canTranslate || isBusy;
  gameDetailsTranslateDescription.disabled = shouldDisable;
  gameDetailsTranslateDescription.classList.toggle(
    'btn-disabled',
    shouldDisable
  );
}

function setOrderParentGuideStatus(message, options = {}) {
  if (!orderParentGuideStatus) {
    return;
  }

  const { spinner = false } = options;
  orderParentGuideStatus.textContent = message;
  orderParentGuideStatus.classList.toggle(
    'fortune-parent-guide__status--loading',
    spinner
  );
}

function setCurrentOrderParentGuideData(data) {
  orderCurrentParentGuideData = data || null;
}

function resetOrderParentGuideSections() {
  Object.entries(orderParentGuideSections).forEach(([key, section]) => {
    if (!section) return;

    section.open = key === 'sexAndNudity';
  });
}

function resetOrderParentGuide(
  message = 'Выберите фильм, чтобы увидеть содержание руководства'
) {
  setOrderParentGuideStatus(message);
  if (orderParentGuideContent) {
    orderParentGuideContent.style.display = 'none';
  }
  resetOrderParentGuideSections();
  Object.values(orderParentGuideLists).forEach((list) => {
    if (list) {
      list.innerHTML = '';
    }
  });
  setCurrentOrderParentGuideData(null);
}

function renderOrderParentGuideList(listEl, items) {
  if (!listEl) {
    return;
  }

  listEl.innerHTML = '';
  if (!items || items.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.textContent = 'Нет данных';
    emptyItem.className = 'fortune-parent-guide__empty';
    listEl.appendChild(emptyItem);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement('li');
    li.innerHTML = highlightFortuneBanwords(item || '');
    listEl.appendChild(li);
  });
}

function renderOrderParentGuide(data) {
  const normalized = normalizeParentGuideData(data);
  const translationStatus = normalized?.translationStatus || null;
  const original = normalized?.original || {};
  const translated = normalized?.translated || null;

  setCurrentOrderParentGuideData(normalized);

  const useTranslated = translated && hasParentGuideContent(translated);

  const sections = useTranslated ? translated : original;
  const hasAny = hasParentGuideContent(sections);

  if (!hasAny) {
    if (orderParentGuideContent) {
      orderParentGuideContent.style.display = 'none';
    }
    setOrderParentGuideStatus('');
    return;
  }

  Object.entries(orderParentGuideLists).forEach(([key, list]) => {
    const items = sections[key] || [];
    renderOrderParentGuideList(list, items);
  });

  if (orderParentGuideContent) {
    orderParentGuideContent.style.display = 'grid';
  }
  if (translationStatus === 'pending') {
    setOrderParentGuideStatus('Переводим информацию...', { spinner: true });
  } else if (translationStatus === 'ready') {
    setOrderParentGuideStatus('Переведено');
  } else if (translationStatus === 'error') {
    setOrderParentGuideStatus('Ошибка перевода');
  } else {
    setOrderParentGuideStatus('Информация загружена');
  }
}

function setOrderParentGuideError(message) {
  if (orderParentGuideContent) {
    orderParentGuideContent.style.display = 'none';
  }
  resetOrderParentGuideSections();
  Object.values(orderParentGuideLists).forEach((list) => {
    if (list) {
      list.innerHTML = '';
    }
  });
  setCurrentOrderParentGuideData(null);
  setOrderParentGuideStatus(message);
}

function applyOrderParentGuideTranslationState(
  order,
  data,
  translationStatus,
  options = {}
) {
  const { translated, requestId = null } = options;
  const updatedGuide = normalizeParentGuideData({
    ...data,
    translated:
      translated !== undefined ? translated : (data?.translated ?? null),
    translationStatus: translationStatus || null,
  });

  setOrderMetadata(order, { parentGuide: updatedGuide });

  if (translationStatus === 'ready' && order?.id) {
    persistOrderParentGuide(order.id, updatedGuide);
  }

  const shouldRender =
    order &&
    activeOrderDetailsId === order.id &&
    orderDetailsModal?.style.display === 'block' &&
    (requestId === null || requestId === orderParentGuideRequestId);

  if (shouldRender) {
    renderOrderParentGuide(updatedGuide);
  }

  return updatedGuide;
}

async function startOrderParentGuideTranslation(order, data, options = {}) {
  const { requestId = null, force = false } = options;
  const translationStatus = data?.translationStatus || null;

  if (
    !force &&
    (translationStatus === 'pending' || translationStatus === 'ready')
  ) {
    return;
  }

  const normalizedData = normalizeParentGuideData(data);
  const originalSections = normalizedData?.original || {};

  if (!hasParentGuideContent(originalSections)) {
    return;
  }

  const { model: selectedTranslationModel } =
    (await loadFortuneTranslationModel()) || {};

  if (!selectedTranslationModel) {
    applyOrderParentGuideTranslationState(order, normalizedData, 'error', {
      requestId,
    });
    return;
  }

  const pendingGuide = applyOrderParentGuideTranslationState(
    order,
    normalizedData,
    'pending',
    { requestId }
  );

  try {
    const translatedSections = await translateParentGuideSectionsWithFallback(
      originalSections,
      selectedTranslationModel
    );
    applyOrderParentGuideTranslationState(order, pendingGuide, 'ready', {
      translated: translatedSections,
      requestId,
    });
  } catch (err) {
    console.error('Failed to translate parent guide for order', err);
    applyOrderParentGuideTranslationState(order, pendingGuide, 'error', {
      requestId,
    });
  }
}

function showOrderParentGuideFromMetadata(order) {
  if (!order) {
    return false;
  }

  const { parentGuideStatus } = order;

  if (
    order.parentGuide &&
    (!parentGuideStatus || parentGuideStatus === 'ready')
  ) {
    renderOrderParentGuide(order.parentGuide);
    startOrderParentGuideTranslation(order, order.parentGuide, {
      requestId: orderParentGuideRequestId,
    });
    return true;
  }

  if (parentGuideStatus === 'loading') {
    if (order.parentGuide) {
      renderOrderParentGuide(order.parentGuide);
      setOrderParentGuideStatus('Загружаем информацию...', { spinner: true });
    } else {
      setOrderParentGuideStatus('Загружаем информацию...', { spinner: true });
    }
    return true;
  }

  if (parentGuideStatus === 'error') {
    setOrderParentGuideError(
      order.parentGuideError ||
        'Не удалось загрузить родительский гайд. Попробуйте позже.'
    );
    return true;
  }

  return false;
}

async function fetchOrderParentGuideForOrder(order) {
  if (!order) {
    return;
  }

  let imdbId = order.imdbId || null;
  const kinopoiskId = order.kinopoiskId || null;
  const requestId = ++orderParentGuideRequestId;

  setOrderMetadata(order, {
    parentGuideStatus: 'loading',
    parentGuideError: null,
  });
  setOrderParentGuideStatus('Загружаем информацию...', { spinner: true });
  if (orderParentGuideContent) {
    orderParentGuideContent.style.display = 'none';
  }
  Object.values(orderParentGuideLists).forEach((list) => {
    if (list) {
      list.innerHTML = '';
    }
  });

  if (!imdbId && kinopoiskId) {
    setOrderParentGuideStatus('Ищем IMDb ID на Кинопоиске...', {
      spinner: true,
    });
    imdbId = await fetchFortuneImdbId(kinopoiskId);
    if (requestId !== orderParentGuideRequestId) {
      return;
    }
    if (!imdbId) {
      setOrderMetadata(order, {
        parentGuideStatus: 'error',
        parentGuideError: 'Для выбранного фильма нет IMDb ID.',
      });
      setOrderParentGuideError('Для выбранного фильма нет IMDb ID.');
      return;
    }
    setOrderMetadata(order, { imdbId });
  }

  if (!imdbId) {
    setOrderMetadata(order, {
      parentGuideStatus: 'error',
      parentGuideError: 'Для выбранного фильма нет IMDb ID.',
    });
    setOrderParentGuideError('Для выбранного фильма нет IMDb ID.');
    return;
  }

  try {
    const guideData = await loadFortuneParentGuideDataWithRetry(imdbId);
    const normalizedGuideData = normalizeParentGuideData(guideData);
    const hasOriginalContent = hasParentGuideContent(
      normalizedGuideData?.original || {}
    );

    if (!hasOriginalContent && !isExpectedEmptyParentGuide(guideData)) {
      throw createParentGuideLoadError('Parent guide content is empty', {
        code: 'PARENT_GUIDE_PARSE_EMPTY',
      });
    }

    setOrderMetadata(order, {
      parentGuide: normalizedGuideData,
      parentGuideStatus: 'ready',
      parentGuideError: null,
    });

    if (requestId !== orderParentGuideRequestId) {
      return;
    }

    renderOrderParentGuide(normalizedGuideData);
    startOrderParentGuideTranslation(order, normalizedGuideData, {
      requestId,
    });
  } catch (err) {
    console.error('Failed to fetch parent guide for order', err);
    if (requestId !== orderParentGuideRequestId) {
      return;
    }
    setOrderMetadata(order, {
      parentGuideStatus: 'error',
      parentGuideError: getParentGuideErrorMessage(err),
    });
    setOrderParentGuideError(getParentGuideErrorMessage(err));
  }
}

function setOrderTimingsStatus(message) {
  if (orderTimingsStatus) {
    orderTimingsStatus.textContent = message;
  }
}

function setOrderTimingsAuthor(author = null) {
  if (!orderTimingsAuthor) {
    return;
  }

  if (author) {
    orderTimingsAuthor.textContent = author;
    orderTimingsAuthor.style.display = 'inline';
  } else {
    orderTimingsAuthor.textContent = '';
    orderTimingsAuthor.style.display = 'none';
  }
}

function resetOrderTimings(message = 'Выберите фильм, чтобы увидеть тайминги') {
  setOrderTimingsStatus(message);
  setOrderTimingsAuthor(null);
  if (orderTimingsList) {
    orderTimingsList.innerHTML = '';
  }
}

function renderOrderTimingsList(groups = []) {
  if (!orderTimingsList) {
    return;
  }

  orderTimingsList.innerHTML = '';

  const normalizedGroups = Array.isArray(groups)
    ? groups.filter((group) => normalizeFortuneTimingsText(group?.text).trim())
    : [];

  if (normalizedGroups.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'fortune-timings__empty';
    emptyItem.textContent = 'Тайминги отсутствуют.';
    orderTimingsList.appendChild(emptyItem);
    return;
  }

  normalizedGroups.forEach((group) => {
    const listItem = document.createElement('li');
    listItem.className = 'fortune-timings__item';

    const author = (group?.author || '').trim() || 'Автор не указан';
    const authorEl = document.createElement('span');
    authorEl.className = 'fortune-timings__item-author';
    authorEl.textContent = author;

    const textEl = document.createElement('div');
    textEl.className = 'fortune-timings__raw';
    textEl.innerHTML = highlightFortuneBanwords(
      normalizeFortuneTimingsText(group?.text || '')
    );

    listItem.appendChild(authorEl);
    listItem.appendChild(textEl);
    orderTimingsList.appendChild(listItem);
  });
}

function renderOrderTimings(metadata = {}) {
  const groups = getFortuneTimingsGroups(metadata);
  const hasTimings = groups.length > 0;
  const uniqueAuthors = Array.from(
    new Set(groups.map((group) => (group?.author || '').trim()).filter(Boolean))
  );

  renderOrderTimingsList(groups);
  setOrderTimingsAuthor(
    uniqueAuthors.length === 1 ? `Автор: ${uniqueAuthors[0]}` : null
  );
  setOrderTimingsStatus(
    hasTimings ? 'Тайминги загружены' : 'Тайминги не найдены'
  );
}

function setOrderTimingsError(message) {
  renderOrderTimingsList([]);
  setOrderTimingsAuthor(null);
  setOrderTimingsStatus(message);
}

function syncOrderPlayerTimings(order) {
  if (!orderPlayerTimingsStatus || !orderPlayerTimingsList) {
    return;
  }

  activeOrderPlayerId = order?.id ?? null;

  if (!order) {
    orderPlayerTimingsStatus.textContent =
      'Выберите фильм, чтобы увидеть тайминги';
    orderPlayerTimingsList.innerHTML = '';
    return;
  }

  const handledTimings = showOrderTimingsFromMetadata(order);
  if (!handledTimings) {
    if (order.kinopoiskId) {
      fetchOrderTimingsForOrder(order);
    } else {
      setOrderTimingsError('Для выбранного фильма нет ID Кинопоиска.');
    }
  }

  orderPlayerTimingsStatus.textContent = orderTimingsStatus?.textContent || '';
  orderPlayerTimingsList.innerHTML = orderTimingsList?.innerHTML || '';
}

function clearOrderPlayerTimings() {
  activeOrderPlayerId = null;
  if (orderPlayerTimingsStatus) {
    orderPlayerTimingsStatus.textContent = '';
  }
  if (orderPlayerTimingsList) {
    orderPlayerTimingsList.innerHTML = '';
  }
}

function showOrderTimingsFromMetadata(order) {
  if (!order) {
    return false;
  }

  const { timingsStatus } = order;

  if (timingsStatus === 'ready') {
    renderOrderTimings(order);
    return true;
  }

  if (timingsStatus === 'empty') {
    const groups = getFortuneTimingsGroups(order);
    const authors = Array.from(
      new Set(
        groups.map((group) => (group?.author || '').trim()).filter(Boolean)
      )
    );
    setOrderTimingsAuthor(authors.length === 1 ? `Автор: ${authors[0]}` : null);
    renderOrderTimingsList([]);
    setOrderTimingsStatus('Тайминги не найдены');
    return true;
  }

  if (timingsStatus === 'loading') {
    setOrderTimingsStatus('Загружаем тайминги...');
    setOrderTimingsAuthor(null);
    renderOrderTimingsList([]);
    return true;
  }

  if (timingsStatus === 'error') {
    setOrderTimingsError(
      order.timingsError || 'Не удалось загрузить тайминги.'
    );
    return true;
  }

  return false;
}

async function fetchOrderTimingsForOrder(order) {
  if (!order) {
    return;
  }

  const kinopoiskId = order.kinopoiskId || null;
  const requestId = ++orderTimingsRequestId;

  if (!kinopoiskId) {
    setOrderMetadata(order, {
      timingsStatus: 'error',
      timingsError: 'Для выбранного фильма нет ID Кинопоиска.',
    });
    setOrderTimingsError('Для выбранного фильма нет ID Кинопоиска.');
    return;
  }

  setOrderMetadata(order, { timingsStatus: 'loading', timingsError: null });
  setOrderTimingsStatus('Загружаем тайминги...');
  setOrderTimingsAuthor(null);
  renderOrderTimingsList([]);

  try {
    const timingsData = await loadFortuneTimingsData(kinopoiskId);
    if (requestId !== orderTimingsRequestId) {
      return;
    }

    if (
      Array.isArray(timingsData?.timingsGroups) &&
      timingsData.timingsGroups.length > 0
    ) {
      setOrderMetadata(order, {
        timingsStatus: 'ready',
        timingsGroups: timingsData.timingsGroups,
        timingsText: '',
        timingsAuthor: null,
        timingsError: null,
      });
    } else {
      setOrderMetadata(order, {
        timingsStatus: 'empty',
        timingsGroups: [],
        timingsText: '',
        timingsAuthor: null,
        timingsError: null,
      });
    }

    if (activeOrderDetailsId === order.id) {
      showOrderTimingsFromMetadata(order);
    }
    if (activeOrderPlayerId === order.id) {
      syncOrderPlayerTimings(order);
    }
  } catch (err) {
    console.error('Failed to load timings for order', err);
    if (requestId !== orderTimingsRequestId) {
      return;
    }
    setOrderMetadata(order, {
      timingsStatus: 'error',
      timingsError: 'Не удалось загрузить тайминги. Попробуйте позже.',
    });
    if (activeOrderDetailsId === order.id) {
      showOrderTimingsFromMetadata(order);
    }
    if (activeOrderPlayerId === order.id) {
      syncOrderPlayerTimings(order);
    }
  }
}

function updateOrderDetailsExtras(order) {
  if (!orderDetailsModal || (!orderParentGuideStatus && !orderTimingsStatus)) {
    return;
  }

  activeOrderDetailsId = order?.id ?? null;
  activeOrderDetailsOverride = order?.__virtual ? order : null;
  resetOrderParentGuide();
  resetOrderTimings();
  updateOrderParentGuideImdbLink(order?.imdbId || null);

  if (!order) {
    return;
  }

  const handledGuide = showOrderParentGuideFromMetadata(order);
  if (!handledGuide) {
    if (order.parentGuideStatus === 'loading') {
      setOrderParentGuideStatus('Загружаем информацию...', { spinner: true });
    } else if (order.parentGuideStatus === 'error') {
      setOrderParentGuideError(
        order.parentGuideError ||
          'Не удалось загрузить родительский гайд. Попробуйте позже.'
      );
    } else {
      setOrderParentGuideStatus('Parent guide еще не загружен.');
    }
  }

  const handledTimings = showOrderTimingsFromMetadata(order);
  if (!handledTimings) {
    if (order.kinopoiskId) {
      fetchOrderTimingsForOrder(order);
    } else {
      setOrderTimingsError('Для выбранного фильма нет ID Кинопоиска.');
    }
  }
}

function normalizeParentGuideSections(sections = {}) {
  const normalizeItems = (value) =>
    Array.isArray(value)
      ? value
          .filter((item) => typeof item === 'string' && item.trim())
          .map((item) => item.trim())
      : [];

  return {
    sexAndNudity: normalizeItems(sections.sexAndNudity),
  };
}

function normalizeParentGuideData(data) {
  if (!data) {
    return null;
  }

  const normalized = { ...data };
  normalized.original = normalizeParentGuideSections(data.original || {});
  normalized.translated = data.translated
    ? normalizeParentGuideSections(data.translated)
    : null;
  normalized.translationStatus = data.translationStatus || null;

  return normalized;
}

function hasParentGuideContent(sections = {}) {
  return Object.values(sections).some(
    (items) => Array.isArray(items) && items.length > 0
  );
}

let fortuneTranslationModelCache = null;

async function loadFortuneTranslationModel() {
  if (fortuneTranslationModelCache?.model) {
    return fortuneTranslationModelCache;
  }

  if (!supabaseClient || typeof supabaseClient.from !== 'function') {
    return { model: null, name: null };
  }

  try {
    const { data, error } = await supabaseClient
      .from('settings')
      .select('selected_ai_model, selected_ai_model_name')
      .order('id', { ascending: true });

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    const selectedRow =
      rows.find((item) => item?.selected_ai_model) || rows[0] || null;

    const model = selectedRow?.selected_ai_model || null;
    const name = selectedRow?.selected_ai_model_name || null;

    fortuneTranslationModelCache = { model, name };
    return fortuneTranslationModelCache;
  } catch (err) {
    console.error('Failed to load translation model from Supabase', err);
    return { model: null, name: null };
  }
}

async function translateParentGuideSections(originalSections, modelValue) {
  return normalizeParentGuideSections(originalSections);
}

async function translateParentGuideSectionsWithFallback(
  originalSections,
  primaryModel
) {
  return translateParentGuideSections(originalSections, primaryModel);
}

async function fetchFortuneImdbId(kinopoiskId) {
  if (!kinopoiskId || !KINOPOISK_API_KEY) {
    return null;
  }

  try {
    const response = await fetch(
      `${FORTUNE_KINOPOISK_FILM_URL}/${encodeURIComponent(kinopoiskId)}`,
      {
        headers: {
          'X-API-KEY': KINOPOISK_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const handled = await handleKinopoiskErrorResponse(response);
      if (!handled) {
        throw new Error(`Kinopoisk film request failed: ${response.status}`);
      }
      return null;
    }

    const data = await response.json();
    return data?.imdbId || null;
  } catch (err) {
    console.error('Failed to fetch IMDb ID from Kinopoisk', err);
    return null;
  }
}

function createParentGuideLoadError(message, details = {}) {
  const error = new Error(message || 'Parent guide load failed');
  if (details && typeof details === 'object') {
    Object.assign(error, details);
  }
  return error;
}

function getParentGuideErrorMessage(err) {
  const code = err?.code || '';
  if (
    code === 'IMDB_BLOCKED_OR_LAYOUT_CHANGED' ||
    code === 'PARENT_GUIDE_PARSE_EMPTY'
  ) {
    return 'IMDb временно недоступен или изменил разметку.';
  }

  return 'Не удалось загрузить родительский гайд. Попробуйте позже.';
}

function isExpectedEmptyParentGuide(payload) {
  return payload?.meta?.emptyReason === 'section_has_no_items';
}

async function loadFortuneParentGuideData(imdbId) {
  if (!imdbId) {
    throw new Error('Missing IMDb ID for parent guide request');
  }
  return {
    original: { sexAndNudity: [] },
    translated: null,
    meta: { emptyReason: 'section_has_no_items', disabled: true },
  };
}

async function loadFortuneParentGuideDataWithRetry(imdbId, options = {}) {
  const { attempts = 3, baseDelayMs = 800 } = options;

  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await loadFortuneParentGuideData(imdbId);
    } catch (err) {
      lastError = err;
      if (attempt >= attempts) {
        break;
      }

      const backoffMs = baseDelayMs * attempt;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  throw lastError || new Error('Unknown parent guide load error');
}

async function loadFortuneTimingsData(kinopoiskId) {
  if (!kinopoiskId) {
    return null;
  }

  const client = await waitForSupabaseClient({
    timeoutMs: 10000,
    reuseKey: 'fortune-suggestions',
  });
  const { data, error } = await client
    .from('timings')
    .select('timing_text, username')
    .eq('kp_id', String(kinopoiskId));

  if (error) {
    throw error;
  }

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const groupsMap = new Map();

  data.forEach((row) => {
    const author = (row?.username || '').trim() || 'Автор не указан';
    const text = typeof row?.timing_text === 'string' ? row.timing_text : '';

    if (!text.trim()) {
      return;
    }

    const existing = groupsMap.get(author) || [];
    existing.push(text);
    groupsMap.set(author, existing);
  });

  const timingsGroups = Array.from(groupsMap.entries())
    .map(([author, texts]) => ({
      author,
      text: texts.join('\n\n'),
    }))
    .filter((group) => Boolean((group?.text || '').trim()));

  if (timingsGroups.length === 0) {
    return { timingsGroups: [] };
  }

  return { timingsGroups };
}

if (gameOrderDetailsTranslateDescription) {
  gameOrderDetailsTranslateDescription.addEventListener('click', () => {
    if (activeGameOrderDetailsId == null) {
      return;
    }
    const gameOrder = Array.isArray(gameOrders)
      ? gameOrders.find(
          (item) => String(item.id) === String(activeGameOrderDetailsId)
        )
      : null;
    if (!gameOrder) {
      return;
    }
    prefetchOrderGameDescriptionForOrder(gameOrder, { force: true });
  });
}

if (gameDetailsTranslateDescription) {
  gameDetailsTranslateDescription.addEventListener('click', () => {
    if (
      typeof activeGameDetailsId === 'undefined' ||
      activeGameDetailsId == null
    ) {
      return;
    }
    const game = Array.isArray(allPlayedGames)
      ? allPlayedGames.find(
          (item) => String(item.id) === String(activeGameDetailsId)
        )
      : null;
    if (!game) {
      return;
    }
    prefetchPlayedGameDescriptionForGame(game, { force: true });
  });
}

const orderParentGuidePrefetches = new Map();

function getActiveOrderDetails() {
  if (activeOrderDetailsOverride) {
    return activeOrderDetailsOverride;
  }
  if (!activeOrderDetailsId || !Array.isArray(watchlist)) {
    return null;
  }

  return watchlist.find((order) => order.id === activeOrderDetailsId) || null;
}

async function prefetchOrderParentGuideForOrder(order, options = {}) {
  const { force = false } = options;
  if (!order || !order.id || !supabaseClient) {
    return null;
  }

  if (!force && order.parentGuide && order.parentGuideStatus === 'ready') {
    return order.parentGuide;
  }

  if (!force && orderParentGuidePrefetches.has(order.id)) {
    return orderParentGuidePrefetches.get(order.id);
  }

  const loadPromise = (async () => {
    let imdbId = order.imdbId || null;
    const kinopoiskId = order.kinopoiskId || null;

    setOrderMetadata(order, {
      parentGuideStatus: 'loading',
      parentGuideError: null,
    });
    if (
      activeOrderDetailsId === order.id &&
      orderDetailsModal?.style.display === 'block'
    ) {
      setOrderParentGuideStatus('Загружаем информацию...', { spinner: true });
    }

    if (!imdbId && kinopoiskId) {
      imdbId = await fetchFortuneImdbId(kinopoiskId);
      if (imdbId) {
        setOrderMetadata(order, { imdbId });
      }
    }

    if (!imdbId) {
      setOrderMetadata(order, {
        parentGuideStatus: 'error',
        parentGuideError: 'Для выбранного фильма нет IMDb ID.',
      });
      if (
        activeOrderDetailsId === order.id &&
        orderDetailsModal?.style.display === 'block'
      ) {
        setOrderParentGuideError('Для выбранного фильма нет IMDb ID.');
      }
      return null;
    }

    try {
      const guideData = await loadFortuneParentGuideDataWithRetry(imdbId);
      const normalizedGuideData = normalizeParentGuideData(guideData);

      if (!normalizedGuideData) {
        setOrderMetadata(order, {
          parentGuideStatus: 'error',
          parentGuideError:
            'Не удалось загрузить родительский гайд. Попробуйте позже.',
        });
        return null;
      }

      const hasOriginalContent = hasParentGuideContent(
        normalizedGuideData.original || {}
      );
      if (!hasOriginalContent && !isExpectedEmptyParentGuide(guideData)) {
        const emptyError = createParentGuideLoadError(
          'Parent guide content is empty',
          {
            code: 'PARENT_GUIDE_PARSE_EMPTY',
          }
        );
        throw emptyError;
      }
      const { model: selectedTranslationModel } =
        (await loadFortuneTranslationModel()) || {};

      const initialTranslationStatus = hasOriginalContent
        ? selectedTranslationModel
          ? 'pending'
          : 'error'
        : null;

      const baseGuide = normalizeParentGuideData({
        original: normalizedGuideData.original || {},
        translated: null,
        translationStatus: initialTranslationStatus,
      });

      setOrderMetadata(order, {
        parentGuide: baseGuide,
        parentGuideStatus: 'ready',
        parentGuideError: null,
      });
      if (
        activeOrderDetailsId === order.id &&
        orderDetailsModal?.style.display === 'block'
      ) {
        renderOrderParentGuide(baseGuide);
      }

      await persistOrderParentGuide(order.id, baseGuide);

      if (initialTranslationStatus !== 'pending') {
        return baseGuide;
      }

      let translated = null;
      let translationStatus = 'ready';

      try {
        translated = await translateParentGuideSectionsWithFallback(
          normalizedGuideData.original,
          selectedTranslationModel
        );
      } catch (err) {
        console.error('Failed to translate parent guide for order', err);
        translationStatus = 'error';
      }

      const storedGuide = normalizeParentGuideData({
        original: normalizedGuideData.original || {},
        translated,
        translationStatus,
      });

      setOrderMetadata(order, {
        parentGuide: storedGuide,
        parentGuideStatus: 'ready',
        parentGuideError: null,
      });
      if (
        activeOrderDetailsId === order.id &&
        orderDetailsModal?.style.display === 'block'
      ) {
        renderOrderParentGuide(storedGuide);
      }

      await persistOrderParentGuide(order.id, storedGuide);

      return storedGuide;
    } catch (err) {
      console.error('Failed to prefetch parent guide for order', err);
      setOrderMetadata(order, {
        parentGuideStatus: 'error',
        parentGuideError: getParentGuideErrorMessage(err),
      });
      if (
        activeOrderDetailsId === order.id &&
        orderDetailsModal?.style.display === 'block'
      ) {
        setOrderParentGuideError(getParentGuideErrorMessage(err));
      }
      return null;
    }
  })();

  orderParentGuidePrefetches.set(order.id, loadPromise);

  try {
    return await loadPromise;
  } finally {
    orderParentGuidePrefetches.delete(order.id);
  }
}
