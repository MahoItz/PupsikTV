// Admin session restoration
async function verifyAdminPassword(password) {
  if (!password) {
    return { ok: false };
  }
  try {
    const res = await fetch(
      window.Pupsik.apiUrl('/api/admin?action=verify-admin'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      }
    );
    if (!res.ok) {
      return { ok: false };
    }
    const data = await res.json();
    const token = typeof data.token === 'string' ? data.token : null;
    const expiresAt =
      typeof data.expiresAt === 'string' ? data.expiresAt : null;
    return { ok: !!data.ok && !!token, token, expiresAt };
  } catch (err) {
    console.error('Failed to verify admin password', err);
    return { ok: false };
  }
}

async function verifyAdminTokenRequest(token) {
  if (!token) {
    return { ok: false };
  }
  try {
    const res = await fetch(
      window.Pupsik.apiUrl('/api/admin?action=verify-admin'),
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (!res.ok) {
      return { ok: false, invalid: res.status === 401 };
    }
    const data = await res.json();
    const expiresAt =
      typeof data.expiresAt === 'string' ? data.expiresAt : null;
    return { ok: !!data.ok, expiresAt };
  } catch (err) {
    console.error('Failed to validate admin token', err);
    return { ok: false };
  }
}

let adminRestorePending = null;
let adminRestoreRetryAt = 0;
let adminRestoreTimer;

async function restoreAdminSession() {
  if (adminRestorePending) return adminRestorePending;
  adminRestorePending = (async () => {
    await window.PupsikAdminSession.refresh();
    const token = window.PupsikAdminSession.getToken();
    adminToken = token;
    if (!token) return;
    const verification = await verifyAdminTokenRequest(token);
    if (window.PupsikAdminSession.getToken() !== token) return;
    if (!verification.ok) {
      if (verification.invalid) clearAdminSession();
      return;
    }
    try {
      const env = await loadEnv({ token });
      if (window.PupsikAdminSession.getToken() !== token) return;
      if (env && env.isAdmin) {
        isAdmin = true;
        updateAdminSession(token, verification.expiresAt);
        showAdminControls();
        TMDB_ENABLED = Boolean(env.TMDB_ENABLED);
        applyKpApiSelection(selectedKpApiValue);
      }
    } catch (error) {
      console.warn('Admin session settings will be retried', error);
    }
  })().finally(() => {
    adminRestorePending = null;
    adminRestoreRetryAt = Date.now() + 5 * 60000;
    clearTimeout(adminRestoreTimer);
    if (adminToken && !isAdmin) {
      adminRestoreTimer = setTimeout(retryAdminSessionRestore, 5 * 60000);
    }
  });
  return adminRestorePending;
}

function retryAdminSessionRestore() {
  if (
    document.visibilityState !== 'hidden' &&
    adminToken &&
    !isAdmin &&
    Date.now() >= adminRestoreRetryAt &&
    adminElements.length
  ) {
    void restoreAdminSession();
  }
}
document.addEventListener('visibilitychange', retryAdminSessionRestore);
window.addEventListener('online', retryAdminSessionRestore);

// Admin UI
// Loaded on demand for admin login, session restoration and editing.
async function uploadGamePosterToStorage({
  poster,
  file,
  title,
  folder = 'orders',
}) {
  if (
    !file &&
    (!poster ||
      (typeof poster === 'string' && poster.includes(PLACEHOLDER_POSTER_HOST)))
  ) {
    return poster;
  }

  let source = typeof poster === 'string' ? poster : '';

  if (file instanceof File) {
    try {
      source = await readFileAsDataURL(file);
    } catch (err) {
      console.error('Error reading poster file', err);
      return poster;
    }
  } else if (!source) {
    return poster;
  }

  try {
    const token = localStorage.getItem('adminToken') || '';
    const response = await fetch(
      window.Pupsik.apiUrl('/api/admin?action=game-posters'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          source,
          title,
          folder,
        }),
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload?.error || `Poster upload failed: ${response.status}`
      );
    }
    return payload?.publicUrl || poster;
  } catch (err) {
    console.error('Error uploading game poster', err);
    return poster;
  }
}

async function deleteGamePosterFromStorage(posterUrl) {
  const path = getGamePosterStoragePath(posterUrl);
  if (!path) return;

  try {
    const token = localStorage.getItem('adminToken') || '';
    const response = await fetch(
      window.Pupsik.apiUrl('/api/admin?action=game-posters'),
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ posterUrl }),
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload?.error || `Poster delete failed: ${response.status}`
      );
    }
  } catch (error) {
    console.error('Error deleting game poster from storage', error);
  }
}

function toggleSettingsPanel(forceState) {
  if (!settingsPanel) return;

  const isOpen = settingsPanel.classList.contains('open');
  const nextState = typeof forceState === 'boolean' ? forceState : !isOpen;

  settingsPanel.classList.toggle('open', nextState);
  settingsPanel.setAttribute('aria-hidden', nextState ? 'false' : 'true');
  settingsPanel.toggleAttribute('inert', !nextState);

  if (!nextState && settingsPanel.contains(document.activeElement)) {
    const shouldFocusTopLeftToggle =
      settingsToggleButton &&
      topLeftActionsToggle &&
      topLeftActionsMenu &&
      topLeftActionsMenu.hasAttribute('hidden') &&
      topLeftActionsMenu.contains(settingsToggleButton);

    if (shouldFocusTopLeftToggle) {
      topLeftActionsToggle.focus();
    } else if (settingsToggleButton) {
      settingsToggleButton.focus();
    } else {
      document.activeElement.blur();
    }
  }
  if (settingsToggleButton) {
    settingsToggleButton.classList.toggle('is-active', nextState);
    settingsToggleButton.setAttribute(
      'aria-expanded',
      nextState ? 'true' : 'false'
    );
  }
  if (nextState) {
    void ensureCatalogLoaded('settings').then((loaded) => {
      if (loaded && settingsPanel.classList.contains('open')) refreshKpQuota();
    });
  }
}

function setAiModelStatus(message) {
  if (!aiModelStatus) {
    aiModelStatus = document.getElementById('aiModelStatusLabel');
  }
  if (aiModelStatus) {
    aiModelStatus.textContent = message;
  }
}

function getAiModelStatusTooltip(statusInfo) {
  const statuses = {
    active: 'Доступна — модель ответила на проверочный запрос.',
    rate_limited:
      'Временно ограничена — достигнут лимит запросов. Попробуйте позже или выберите другую модель.',
    unavailable: 'Недоступна — проверочный запрос завершился ошибкой.',
  };
  const httpDescriptions = {
    400: 'Некорректный запрос. Модель может не поддерживать переданные параметры.',
    401: 'Ошибка авторизации. Проверьте API-ключ OpenRouter.',
    402: 'Недостаточно средств или кредитов. Проверьте баланс OpenRouter.',
    403: 'Доступ запрещён. Проверьте права доступа и ограничения сервиса.',
    404: 'Модель или адрес запроса не найдены. Проверьте идентификатор модели.',
    408: 'Время ожидания запроса истекло. Попробуйте позже.',
    422: 'Сервис не смог обработать параметры запроса.',
    429: 'Превышен лимит запросов. Подождите и повторите проверку или выберите другую модель.',
    500: 'Внутренняя ошибка сервиса или сбой соединения при проверке. Попробуйте позже.',
    502: 'Сервис получил некорректный ответ от поставщика модели. Попробуйте позже.',
    503: 'Сервис временно недоступен или перегружен. Попробуйте позже.',
    504: 'Модель не ответила вовремя. Повторите проверку или выберите другую модель.',
  };
  const code = Number(statusInfo.http_status);
  const lines = [
    `Статус: ${statuses[statusInfo.status] || 'Неизвестен — повторите проверку модели.'}`,
  ];
  if (Number.isInteger(code) && code >= 100 && code <= 599) {
    const explanation =
      httpDescriptions[code] ||
      (code >= 200 && code < 300
        ? 'Запрос выполнен успешно.'
        : code >= 500
          ? 'Ошибка на стороне сервиса. Попробуйте позже.'
          : code >= 400
            ? 'Сервис отклонил запрос.'
            : 'Получен ответ сервиса.');
    lines.push(`Код ответа ${code}: ${explanation}`);
  } else {
    lines.push('Код ответа отсутствует — повторите проверку модели.');
  }
  if (statusInfo.provider) lines.push(`Сервис: ${statusInfo.provider}`);
  return lines.join('\n');
}

function renderAiModelOptions(options = [], selectedValue = null) {
  if (!aiModelSelect) {
    aiModelSelect = document.getElementById('aiModelSelect');
  }
  if (!aiModelSelect) return;

  const validOptions = Array.isArray(options)
    ? options.filter((option) => option?.ai_model && option?.ai_model_name)
    : [];

  aiModelOptions = validOptions;
  const deleteButton = document.getElementById('deleteAiModelBtn');
  if (deleteButton) deleteButton.disabled = !validOptions.length;

  aiModelSelect.innerHTML = '';

  if (!validOptions.length) {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Модели не найдены';
    aiModelSelect.appendChild(placeholder);
    aiModelSelect.disabled = true;
    selectedAiModelValue = null;
    setAiModelStatus('Добавьте модель для перевода.');
    return;
  }

  validOptions.forEach((option) => {
    const el = document.createElement('option');
    el.value = option.ai_model;

    const statusInfo = aiModelStatuses[option.ai_model];
    let indicator = '';
    let tooltip = '';

    if (statusInfo) {
      if (statusInfo.status === 'active') indicator = '🟢 ';
      else if (statusInfo.status === 'rate_limited') indicator = '🟠 ';
      else indicator = '🔴 ';

      tooltip = getAiModelStatusTooltip(statusInfo);
    }

    el.textContent = `${indicator}${option.ai_model_name}`;
    if (tooltip) el.title = tooltip;

    aiModelSelect.appendChild(el);
  });

  const preferredValue =
    selectedValue || selectedAiModelValue || validOptions[0].ai_model;

  aiModelSelect.value = preferredValue;
  if (!aiModelSelect.value && validOptions.length > 0) {
    aiModelSelect.value = validOptions[0].ai_model;
  }
  selectedAiModelValue = aiModelSelect.value || null;
  aiModelSelect.disabled = false;

  const selectedOption = validOptions.find(
    (option) => option.ai_model === aiModelSelect.value
  );
  if (selectedOption) {
    setAiModelStatus(
      `Текущая модель: ${selectedOption.ai_model_name || selectedOption.ai_model}`
    );
  }
}

async function manageAiModel(method, payload) {
  const form = document.getElementById('addAiModelForm');
  const controls = [
    aiModelSelect,
    document.getElementById('deleteAiModelBtn'),
    document.getElementById('checkAiModelsBtn'),
    ...form.querySelectorAll('input, button'),
  ].filter(Boolean);
  const previousDisabled = controls.map((control) => control.disabled);
  controls.forEach((control) => {
    control.disabled = true;
  });
  setAiModelStatus('Сохраняем список моделей...');
  try {
    const response = await fetch(
      window.Pupsik.apiUrl('/api/admin?action=ai-models'),
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...getAdminAuthHeaders(),
        },
        body: JSON.stringify(payload),
      }
    );
    const result = await response.json();
    if (response.status === 401) clearAdminSession();
    if (!response.ok)
      throw new Error(result.error || 'Не удалось сохранить модели.');
    aiModelStatuses = result.statuses || {};
    selectedAiModelValue = result.selected_ai_model;
    renderAiModelOptions(result.models, result.selected_ai_model);
    if (method === 'POST') form.reset();
  } catch (error) {
    setAiModelStatus(error.message || 'Не удалось сохранить модели.');
  } finally {
    controls.forEach((control, index) => {
      control.disabled = previousDisabled[index];
    });
    aiModelSelect.disabled = !aiModelOptions.length;
    document.getElementById('deleteAiModelBtn').disabled =
      !aiModelOptions.length;
  }
}

async function checkAiModelsStatus() {
  const btn = document.getElementById('checkAiModelsBtn');
  const label = document.getElementById('aiModelStatusLabel');

  if (!btn || !aiModelOptions.length) return;

  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  if (label) label.textContent = 'Проверка моделей...';

  try {
    const response = await fetch(CHECK_AI_MODELS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAdminAuthHeaders(),
      },
      body: JSON.stringify({
        models: aiModelOptions.map((modelInfo) => modelInfo.ai_model),
      }),
    });

    let result = null;
    try {
      result = await response.json();
    } catch {
      result = null;
    }

    if (response.status === 401) {
      clearAdminSession();
    }

    if (!response.ok) {
      throw new Error(
        result?.error || `Failed to check models: ${response.status}`
      );
    }

    aiModelStatuses =
      result?.statuses && typeof result.statuses === 'object'
        ? result.statuses
        : {};

    renderAiModelOptions(aiModelOptions, selectedAiModelValue);
    await persistAiModelStatuses();

    const summary = Object.values(aiModelStatuses).reduce(
      (acc, statusInfo) => {
        if (statusInfo?.status === 'active') acc.active += 1;
        else if (statusInfo?.status === 'rate_limited') acc.rateLimited += 1;
        else acc.unavailable += 1;
        return acc;
      },
      { active: 0, rateLimited: 0, unavailable: 0 }
    );

    if (label) {
      label.textContent = `Проверено: ${summary.active} доступно, ${summary.rateLimited} с лимитом, ${summary.unavailable} недоступно`;
      setTimeout(() => {
        label.textContent = 'Проверка завершена';
      }, 5000);
    }
  } catch (error) {
    console.error('Failed to check AI models', error);
    if (label) {
      label.textContent = `Ошибка проверки: ${error.message || error}`;
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

async function persistAiModelStatuses() {
  if (!adminToken) {
    console.warn('Cannot persist AI statuses: admin token missing');
    return;
  }

  try {
    await persistSettingsPayload({ ai_model_statuses: aiModelStatuses });
    console.log('AI model statuses persisted to Supabase');
  } catch (err) {
    console.error('Failed to persist AI statuses', err);
  }
}

async function persistAiModelSelection(modelValue, modelName) {
  const payload = {
    selected_ai_model: modelValue || null,
    selected_ai_model_name: modelName || null,
  };

  await persistSettingsPayload(payload);
}

async function handleAiModelChange(event) {
  const selectEl = event?.target;
  if (!selectEl) return;

  const modelValue = selectEl.value || null;
  await updateActiveAiModel(modelValue);
}

async function updateActiveAiModel(modelValue) {
  const option = aiModelOptions.find((item) => item.ai_model === modelValue);
  const modelName = option?.ai_model_name || modelValue;

  selectedAiModelValue = modelValue;

  // Update dropdown if it exists
  if (aiModelSelect) {
    aiModelSelect.value = modelValue || '';
  }

  setAiModelStatus('Сохраняем выбранную модель...');

  try {
    await persistAiModelSelection(modelValue, modelName || null);
    if (modelName) {
      setAiModelStatus(`Текущая модель: ${modelName}`);
    } else {
      setAiModelStatus('Модель обновлена.');
    }
    console.log(`AI system successfully switched to: ${modelName}`);
  } catch (err) {
    console.error('Failed to persist model switch', err);
    setAiModelStatus('Не удалось сохранить модель. Попробуйте ещё раз.');
  }
}

async function refreshKpQuota() {
  const adminToken = localStorage.getItem('adminToken') || '';
  if (!KINOPOISK_API_KEY || !adminToken) {
    if (kpQuotaInfo) kpQuotaInfo.style.display = 'none';
    return;
  }

  const btn = document.getElementById('refreshKpQuotaBtn');
  const icon = btn?.querySelector('i');
  const originalHtml = btn?.innerHTML;

  if (btn) btn.disabled = true;
  if (icon) icon.classList.add('fa-spin');

  try {
    const url = `https://kinopoiskapiunofficial.tech/api/v1/api_keys/${KINOPOISK_API_KEY}`;
    const res = await fetch(url, {
      headers: {
        'X-API-KEY': KINOPOISK_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Quota fetch failed with ${res.status}`);
    }

    const data = await res.json();

    if (kpQuotaInfo) kpQuotaInfo.style.display = 'flex';
    if (kpDailyQuota) {
      const daily = data.dailyQuota || { value: 0, used: 0 };
      kpDailyQuota.textContent = `${daily.value - daily.used} / ${daily.value}`;
    }
  } catch (err) {
    console.error('Error refreshing Kinopoisk quota', err);
    if (kpQuotaInfo) kpQuotaInfo.style.display = 'none';
  } finally {
    if (btn) btn.disabled = false;
    if (icon) icon.classList.remove('fa-spin');
  }
}

async function persistKpApiSelection(value) {
  const normalizedValue = normalizeKpApiValue(value);
  await persistSettingsPayload({ kp_api: normalizedValue });
}

async function handleKpApiChange(event) {
  const selectEl = event?.target;
  if (!selectEl) return;

  const normalizedValue = normalizeKpApiValue(selectEl.value || 'API 1');

  selectEl.disabled = true;
  setKpApiStatus('Сохраняем выбранный API...');

  try {
    await persistKpApiSelection(normalizedValue);
    applyKpApiSelection(normalizedValue);
  } catch (err) {
    console.error('Failed to save Kinopoisk API selection', err);
    setKpApiStatus('Не удалось сохранить API. Попробуйте ещё раз.');
  } finally {
    selectEl.disabled = false;
  }
}

function capitalizeWords(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (!word) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

function hasUppercaseLetters(value) {
  return /[A-ZА-ЯЁ]/.test(String(value || ''));
}

function createAutocompleteFetcher({
  source,
  resultsVar,
  selectedVar,
  containerId,
  listId,
  onPreview,
  onReset,
}) {
  let activeRequestId = 0;

  const clearState = () => {
    resultsVar.set([]);
    selectedVar.set(null);
    if (onReset) {
      onReset();
    }
    const list = document.getElementById(listId);
    if (list) list.innerHTML = '';
  };

  const toggleContainer = (isVisible) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.style.display = isVisible ? 'block' : 'none';
  };

  const runSearch = async (query) => {
    const trimmedQuery = (query || '').trim();
    const requestId = ++activeRequestId;

    if (!trimmedQuery) {
      if (requestId !== activeRequestId) return;
      toggleContainer(false);
      clearState();
      if (onPreview) onPreview();
      return;
    }

    const sourceConfig = source(trimmedQuery) || {};
    const {
      url,
      options,
      mapResults,
      formatItem,
      handleError,
      fallbackQueries,
    } = sourceConfig;

    const fallbackList = Array.isArray(fallbackQueries)
      ? fallbackQueries
      : typeof fallbackQueries === 'function'
        ? fallbackQueries(trimmedQuery)
        : [];

    const queries = [trimmedQuery, ...(fallbackList || [])]
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .filter((item, idx, arr) => arr.indexOf(item) === idx);

    try {
      for (const nextQuery of queries) {
        if (requestId !== activeRequestId) return;
        const nextConfig = source(nextQuery) || {};
        const nextUrl = nextConfig.url || url;
        const nextOptions = nextConfig.options || options;
        const nextMapResults = nextConfig.mapResults || mapResults;
        const nextFormatItem = nextConfig.formatItem || formatItem;
        const nextHandleError = nextConfig.handleError || handleError;

        const res = await fetch(nextUrl, nextOptions);
        if (requestId !== activeRequestId) return;
        if (!res.ok) {
          if (nextHandleError) {
            await nextHandleError(res);
          }
          if (requestId !== activeRequestId) return;
          toggleContainer(false);
          clearState();
          if (onPreview) onPreview();
          return;
        }

        const data = await res.json();
        if (requestId !== activeRequestId) return;
        const results = (nextMapResults ? nextMapResults(data) : data) || [];
        resultsVar.set(results);

        if (!results.length) {
          continue;
        }

        const list = document.getElementById(listId);
        if (!list) return;

        list.innerHTML = '';
        results.forEach((item, idx) => {
          const div = document.createElement('div');
          div.className = 'autocomplete-option';
          div.dataset.index = idx;
          div.textContent = nextFormatItem
            ? nextFormatItem(item)
            : item?.name || '';
          list.appendChild(div);
        });

        if (requestId !== activeRequestId) return;
        toggleContainer(true);
        return;
      }

      toggleContainer(false);
      clearState();
      if (onPreview) onPreview();
      return;
    } catch (err) {
      if (requestId !== activeRequestId) return;
      console.error('Autocomplete fetch error', err);
      toggleContainer(false);
      clearState();
      if (onPreview) onPreview();
    }
  };

  return debounce((query) => runSearch(query), 100);
}

const debouncedKPSearch = createAutocompleteFetcher({
  source: (query) => ({
    url: `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(query)}&page=1`,
    fallbackQueries: () => {
      const trimmed = String(query || '').trim();
      if (!trimmed) return [];
      if (hasUppercaseLetters(trimmed)) return [];
      return [capitalizeWords(trimmed)];
    },
    options: {
      headers: {
        'X-API-KEY': KINOPOISK_API_KEY,
        'Content-Type': 'application/json',
      },
    },
    mapResults: (data) => data.films || [],
    formatItem: (m) => {
      const year = m.year || '';
      const name = m.nameRu || m.nameEn || '';
      return `${name}${year ? ` (${year})` : ''}`;
    },
    handleError: handleKinopoiskErrorResponse,
  }),
  resultsVar: { set: (value) => (kpResults = value) },
  selectedVar: { set: (value) => (selectedKPMovie = value) },
  containerId: 'autoResultsContainer',
  listId: 'autoResults',
  onPreview: showKPPreview,
});

const debouncedWatchlistKPSearch = createAutocompleteFetcher({
  source: (query) => ({
    url: `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(query)}&page=1`,
    fallbackQueries: () => {
      const trimmed = String(query || '').trim();
      if (!trimmed) return [];
      if (hasUppercaseLetters(trimmed)) return [];
      return [capitalizeWords(trimmed)];
    },
    options: {
      headers: {
        'X-API-KEY': KINOPOISK_API_KEY,
        'Content-Type': 'application/json',
      },
    },
    mapResults: (data) => data.films || [],
    formatItem: (m) => {
      const year = m.year || '';
      const name = m.nameRu || m.nameEn || '';
      return `${name}${year ? ` (${year})` : ''}`;
    },
    handleError: handleKinopoiskErrorResponse,
  }),
  resultsVar: { set: (value) => (kpOrderResults = value) },
  selectedVar: { set: (value) => (selectedKPOrderMovie = value) },
  containerId: 'watchAutoResultsContainer',
  listId: 'watchAutoResults',
  onPreview: showWatchlistKPPreview,
});

const debouncedRAWGSearch = createAutocompleteFetcher({
  source: (query) => ({
    url: buildIgdbUrl('search', { search: query, page_size: 5 }),
    options: { headers: getAdminAuthorizationHeaders() },
    mapResults: (data) => data.results || [],
    formatItem: (g) => {
      const year = g.released ? g.released.split('-')[0] : '';
      return `${g.name}${year ? ` (${year})` : ''}`;
    },
  }),
  resultsVar: { set: (value) => (rawgResults = value) },
  selectedVar: { set: (value) => (selectedRAWGGame = value) },
  containerId: 'gameAutoResultsContainer',
  listId: 'gameAutoResults',
  onPreview: showRAWGPreview,
  onReset: () => {
    steamGridPoster = null;
    steamGridPosters = [];
    resetRawgPosterCache();
  },
});

const debouncedPlayedRAWGSearch = createAutocompleteFetcher({
  source: (query) => ({
    url: buildIgdbUrl('search', { search: query, page_size: 5 }),
    options: { headers: getAdminAuthorizationHeaders() },
    mapResults: (data) => data.results || [],
    formatItem: (g) => {
      const year = g.released ? g.released.split('-')[0] : '';
      return `${g.name}${year ? ` (${year})` : ''}`;
    },
  }),
  resultsVar: { set: (value) => (rawgResults = value) },
  selectedVar: { set: (value) => (selectedRAWGGame = value) },
  containerId: 'playedGameAutoResultsContainer',
  listId: 'playedGameAutoResults',
  onPreview: showPlayedGamePreview,
  onReset: () => {
    steamGridPoster = null;
    steamGridPosters = [];
    resetRawgPosterCache();
  },
});

async function hydrateSelectedIgdbGame(game) {
  if (!game?.id) return game;
  try {
    const response = await fetch(buildIgdbUrl('game', { id: game.id }), {
      headers: getAdminAuthorizationHeaders(),
    });
    if (!response.ok)
      throw new Error(`IGDB details failed: ${response.status}`);
    const details = await response.json();
    return details ? { ...game, ...details } : game;
  } catch (error) {
    console.error('IGDB details error', error);
    return game;
  }
}

async function handleKPSearch() {
  const btn = document.getElementById('autoSearchBtn');
  const loader = document.getElementById('autoSearchLoading');
  if (loader) loader.style.display = 'inline-block';
  if (btn) btn.disabled = true;
  const title = document.getElementById('autoTitle').value.trim();
  if (!title) {
    alert('Введите название фильма');
    if (loader) loader.style.display = 'none';
    if (btn) btn.disabled = false;
    return;
  }

  try {
    const url = `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(
      title
    )}&page=1`;
    const res = await fetch(url, {
      headers: {
        'X-API-KEY': KINOPOISK_API_KEY,
        'Content-Type': 'application/json',
      },
    });
    const container = document.getElementById('autoResultsContainer');
    const list = document.getElementById('autoResults');
    if (!res.ok) {
      await handleKinopoiskErrorResponse(res);
      kpResults = [];
      selectedKPMovie = null;
      if (list) list.innerHTML = '';
      if (container) container.style.display = 'none';
      return;
    }
    const data = await res.json();
    kpResults = data.films || [];
    if (!kpResults.length && !hasUppercaseLetters(title)) {
      const altTitle = capitalizeWords(title);
      if (altTitle && altTitle !== title) {
        const altRes = await fetch(
          `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(
            altTitle
          )}&page=1`,
          {
            headers: {
              'X-API-KEY': KINOPOISK_API_KEY,
              'Content-Type': 'application/json',
            },
          }
        );
        if (altRes.ok) {
          const altData = await altRes.json();
          kpResults = altData.films || [];
        }
      }
    }
    list.innerHTML = '';
    kpResults.forEach((m, idx) => {
      const div = document.createElement('div');
      div.className = 'autocomplete-option';
      div.dataset.index = idx;
      const year = m.year || '';
      const name = m.nameRu || m.nameEn || '';
      div.textContent = `${name}${year ? ` (${year})` : ''}`;
      list.appendChild(div);
    });
    if (kpResults.length > 0) {
      container.style.display = 'block';
      selectedKPMovie = kpResults[0];
      showKPPreview();
    } else {
      container.style.display = 'none';
      selectedKPMovie = null;
      showKPPreview();
      alert('Ничего не найдено');
    }
  } catch (err) {
    console.error('Kinopoisk search error', err);
  }
  if (loader) loader.style.display = 'none';
  if (btn) btn.disabled = false;
}

async function handleWatchlistSearch() {
  const btn = document.getElementById('watchAutoSearchBtn');
  const loader = document.getElementById('watchAutoSearchLoading');
  if (loader) loader.style.display = 'inline-block';
  if (btn) btn.disabled = true;
  const title = document.getElementById('watchAutoTitle').value.trim();
  if (!title) {
    alert('Введите название фильма');
    if (loader) loader.style.display = 'none';
    if (btn) btn.disabled = false;
    return;
  }

  try {
    const url = `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(
      title
    )}&page=1`;
    const res = await fetch(url, {
      headers: {
        'X-API-KEY': KINOPOISK_API_KEY,
        'Content-Type': 'application/json',
      },
    });
    const container = document.getElementById('watchAutoResultsContainer');
    const list = document.getElementById('watchAutoResults');
    if (!res.ok) {
      await handleKinopoiskErrorResponse(res);
      kpOrderResults = [];
      selectedKPOrderMovie = null;
      if (list) list.innerHTML = '';
      if (container) container.style.display = 'none';
      return;
    }
    const data = await res.json();
    kpOrderResults = data.films || [];
    if (!kpOrderResults.length && !hasUppercaseLetters(title)) {
      const altTitle = capitalizeWords(title);
      if (altTitle && altTitle !== title) {
        const altRes = await fetch(
          `${KINOPOISK_SEARCH_URL}?keyword=${encodeURIComponent(
            altTitle
          )}&page=1`,
          {
            headers: {
              'X-API-KEY': KINOPOISK_API_KEY,
              'Content-Type': 'application/json',
            },
          }
        );
        if (altRes.ok) {
          const altData = await altRes.json();
          kpOrderResults = altData.films || [];
        }
      }
    }
    list.innerHTML = '';
    kpOrderResults.forEach((m, idx) => {
      const div = document.createElement('div');
      div.className = 'autocomplete-option';
      div.dataset.index = idx;
      const year = m.year || '';
      const name = m.nameRu || m.nameEn || '';
      div.textContent = `${name}${year ? ` (${year})` : ''}`;
      list.appendChild(div);
    });
    if (kpOrderResults.length > 0) {
      container.style.display = 'block';
      selectedKPOrderMovie = kpOrderResults[0];
      showWatchlistKPPreview();
    } else {
      container.style.display = 'none';
      selectedKPOrderMovie = null;
      showWatchlistKPPreview();
      alert('Ничего не найдено');
    }
  } catch (err) {
    console.error('Kinopoisk search error', err);
  }
  if (loader) loader.style.display = 'none';
  if (btn) btn.disabled = false;
}

function showKPPreview() {
  const preview = document.getElementById('autoPreview');
  if (!preview) return;
  preview.innerHTML = '';
  if (!selectedKPMovie) {
    preview.style.display = 'none';
    return;
  }
  const movie = {
    id: 0,
    title: selectedKPMovie.nameRu || selectedKPMovie.nameEn || '',
    originalTitle: selectedKPMovie.nameEn || '',
    year: selectedKPMovie.year || '',
    rating: getCurrentRating('ratingStars'),
    kpRating: selectedKPMovie.rating || '-',
    poster:
      selectedKPMovie.posterUrlPreview ||
      selectedKPMovie.posterUrl ||
      'https://via.placeholder.com/300x400?text=Нет+постера',
    dateAdded: new Date().toISOString().split('T')[0],
    genre: selectedKPMovie.genres?.map((g) => g.genre).join(', ') || '',
  };
  preview.appendChild(createMovieCard(movie, false, false));
  preview.style.display = 'block';
}

const watchlistPreviewDetailsCache = new Map();

const watchlistPreviewDetailsPending = new Map();

const watchlistPreviewStaffCache = new Map();

const watchlistPreviewStaffPending = new Map();

function getWatchlistPreviewDetails(filmId) {
  if (!filmId || !KINOPOISK_API_KEY) {
    return Promise.resolve(null);
  }
  if (watchlistPreviewDetailsCache.has(filmId)) {
    return Promise.resolve(watchlistPreviewDetailsCache.get(filmId));
  }
  if (watchlistPreviewDetailsPending.has(filmId)) {
    return watchlistPreviewDetailsPending.get(filmId);
  }

  const loadPromise = fetch(
    `${KINOPOISK_FILM_URL}/${encodeURIComponent(filmId)}`,
    {
      headers: {
        'X-API-KEY': KINOPOISK_API_KEY,
        'Content-Type': 'application/json',
      },
    }
  )
    .then(async (res) => {
      if (!res.ok) {
        await handleKinopoiskErrorResponse(res);
        return null;
      }
      return res.json();
    })
    .then((data) => {
      watchlistPreviewDetailsCache.set(filmId, data || null);
      return data || null;
    })
    .catch((err) => {
      console.error('Kinopoisk preview details error', err);
      watchlistPreviewDetailsCache.set(filmId, null);
      return null;
    })
    .finally(() => {
      watchlistPreviewDetailsPending.delete(filmId);
    });

  watchlistPreviewDetailsPending.set(filmId, loadPromise);
  return loadPromise;
}

function getWatchlistPreviewStaff(filmId) {
  if (!filmId || !KINOPOISK_API_KEY) {
    return Promise.resolve({ actors: [], directors: [] });
  }
  if (watchlistPreviewStaffCache.has(filmId)) {
    return Promise.resolve(watchlistPreviewStaffCache.get(filmId));
  }
  if (watchlistPreviewStaffPending.has(filmId)) {
    return watchlistPreviewStaffPending.get(filmId);
  }

  const loadPromise = fetchKPFilmStaff(filmId)
    .then((staff) => {
      const normalized = staff || { actors: [], directors: [] };
      watchlistPreviewStaffCache.set(filmId, normalized);
      return normalized;
    })
    .catch((err) => {
      console.error('Kinopoisk preview staff error', err);
      const fallback = { actors: [], directors: [] };
      watchlistPreviewStaffCache.set(filmId, fallback);
      return fallback;
    })
    .finally(() => {
      watchlistPreviewStaffPending.delete(filmId);
    });

  watchlistPreviewStaffPending.set(filmId, loadPromise);
  return loadPromise;
}

function showWatchlistKPPreview() {
  const preview = document.getElementById('watchAutoPreview');
  if (!preview) return;
  preview.innerHTML = '';
  if (!selectedKPOrderMovie) {
    preview.style.display = 'none';
    return;
  }
  const filmId = selectedKPOrderMovie.filmId || null;
  const hasDetails = filmId && watchlistPreviewDetailsCache.has(filmId);
  const hasStaff = filmId && watchlistPreviewStaffCache.has(filmId);
  const details = hasDetails ? watchlistPreviewDetailsCache.get(filmId) : null;
  const staff = hasStaff ? watchlistPreviewStaffCache.get(filmId) : null;

  if (filmId && KINOPOISK_API_KEY) {
    if (!hasDetails) {
      getWatchlistPreviewDetails(filmId).then(() => {
        if (selectedKPOrderMovie?.filmId === filmId) {
          showWatchlistKPPreview();
        }
      });
    }
    if (!hasStaff) {
      getWatchlistPreviewStaff(filmId).then(() => {
        if (selectedKPOrderMovie?.filmId === filmId) {
          showWatchlistKPPreview();
        }
      });
    }
  }

  if (
    selectedKPOrderMovie.filmLength === undefined &&
    filmId &&
    KINOPOISK_API_KEY &&
    !details?.filmLength
  ) {
    fetchKPFilmLength(filmId).then((len) => {
      selectedKPOrderMovie.filmLength = len;
      showWatchlistKPPreview();
    });
  }

  if (selectedKPOrderMovie.filmLength === undefined && details?.filmLength) {
    selectedKPOrderMovie.filmLength = details.filmLength;
  }

  const countryText = Array.isArray(details?.countries)
    ? details.countries
        .map((c) => c.country)
        .filter(Boolean)
        .join(', ')
    : '';
  const directorText = Array.isArray(staff?.directors)
    ? staff.directors.join(', ')
    : '';
  const order = {
    id: filmId ? `kp-${filmId}` : `kp-${Date.now()}`,
    __virtual: true,
    title: selectedKPOrderMovie.nameRu || selectedKPOrderMovie.nameEn || '',
    originalTitle: selectedKPOrderMovie.nameEn || '',
    year: selectedKPOrderMovie.year || '',
    length: selectedKPOrderMovie.filmLength || null,
    kpRating:
      details?.ratingKinopoisk ||
      details?.ratingImdb ||
      selectedKPOrderMovie.rating ||
      '-',
    poster:
      selectedKPOrderMovie.posterUrlPreview ||
      selectedKPOrderMovie.posterUrl ||
      'https://via.placeholder.com/300x400?text=Нет+постера',
    genres: selectedKPOrderMovie.genres?.map((g) => g.genre).join(', ') || '',
    description: details?.description || details?.shortDescription || '',
    country: countryText,
    director: directorText,
    actors: staff?.actors || [],
    kinopoiskId: filmId || null,
    imdbId: details?.imdbId || null,
    orderBy: document.getElementById('watchOrderBy').value || '',
    orderType: document.getElementById('watchOrderType').value || '',
    dateAdded: new Date().toISOString().split('T')[0],
  };
  preview.appendChild(createOrderCard(order, false, false));
  preview.style.display = 'block';
}

async function handleGameSearch() {
  const btn = document.getElementById('gameAutoSearchBtn');
  const loader = document.getElementById('gameAutoSearchLoading');
  if (loader) loader.style.display = 'inline-block';
  if (btn) btn.disabled = true;
  const title = document.getElementById('gameAutoTitle').value.trim();
  if (!title) {
    alert('Введите название игры');
    if (loader) loader.style.display = 'none';
    if (btn) btn.disabled = false;
    return;
  }

  try {
    const res = await fetch(
      buildIgdbUrl('search', { search: title, page_size: 5 }),
      {
        headers: getAdminAuthorizationHeaders(),
      }
    );
    if (!res.ok) throw new Error(`IGDB search failed: ${res.status}`);
    const data = await res.json();
    rawgResults = data.results || [];
    const container = document.getElementById('gameAutoResultsContainer');
    const list = document.getElementById('gameAutoResults');
    list.innerHTML = '';
    rawgResults.forEach((g, idx) => {
      const div = document.createElement('div');
      div.className = 'autocomplete-option';
      div.dataset.index = idx;
      const year = g.released ? g.released.split('-')[0] : '';
      div.textContent = `${g.name}${year ? ` (${year})` : ''}`;
      list.appendChild(div);
    });
    if (rawgResults.length > 0) {
      container.style.display = 'block';
      selectedRAWGGame = await hydrateSelectedIgdbGame(rawgResults[0]);
      await fetchSteamGridPosters(selectedRAWGGame.name);
      showRAWGPreview();
    } else {
      container.style.display = 'none';
      selectedRAWGGame = null;
      steamGridPoster = null;
      steamGridPosters = [];
      resetRawgPosterCache();
      showRAWGPreview();
      alert('Ничего не найдено');
    }
  } catch (err) {
    console.error('IGDB search error', err);
  }
  if (loader) loader.style.display = 'none';
  if (btn) btn.disabled = false;
}

function showRAWGPreview() {
  const preview = document.getElementById('gameAutoPreview');
  if (!preview) return;
  preview.innerHTML = '';
  if (!selectedRAWGGame) {
    preview.style.display = 'none';
    return;
  }
  const rawgPosterUrl = selectedRAWGGame.background_image || '';
  if (!steamGridPoster && rawgPosterUrl) {
    ensureRawgOptimizedPoster(rawgPosterUrl, () => {
      if (
        selectedRAWGGame &&
        selectedRAWGGame.background_image === rawgPosterUrl
      ) {
        showRAWGPreview();
      }
    });
  }
  const optimizedRawgPoster = getRawgOptimizedPosterFor(rawgPosterUrl);
  const game = {
    title: selectedRAWGGame.name || '',
    genres: selectedRAWGGame.genres?.map((g) => g.name).join(', ') || '',
    year: selectedRAWGGame.released
      ? selectedRAWGGame.released.split('-')[0]
      : '',
    poster:
      steamGridPoster ||
      optimizedRawgPoster ||
      rawgPosterUrl ||
      'https://via.placeholder.com/300x400?text=Нет+постера',
    orderBy: document.getElementById('gameOrderBy').value || '',
    orderType: document.getElementById('gameOrderType').value || '',
    released: selectedRAWGGame.released || null,
    playtime: selectedRAWGGame.playtime || null,
    dateAdded: new Date().toISOString().split('T')[0],
  };
  const card = createGameCard(game, false);
  preview.appendChild(card);
  createPosterOverlay(
    card.querySelector('.order-poster'),
    steamGridPosters,
    true
  );
  preview.style.display = 'block';
}

async function handlePlayedGameSearch() {
  const btn = document.getElementById('playedGameAutoSearchBtn');
  const loader = document.getElementById('playedGameAutoSearchLoading');
  if (loader) loader.style.display = 'inline-block';
  if (btn) btn.disabled = true;
  const title = document.getElementById('playedGameAutoTitle').value.trim();
  if (!title) {
    alert('Введите название игры');
    if (loader) loader.style.display = 'none';
    if (btn) btn.disabled = false;
    return;
  }

  try {
    const res = await fetch(
      buildIgdbUrl('search', { search: title, page_size: 5 }),
      {
        headers: getAdminAuthorizationHeaders(),
      }
    );
    if (!res.ok) throw new Error(`IGDB search failed: ${res.status}`);
    const data = await res.json();
    rawgResults = data.results || [];
    const container = document.getElementById('playedGameAutoResultsContainer');
    const list = document.getElementById('playedGameAutoResults');
    list.innerHTML = '';
    rawgResults.forEach((g, idx) => {
      const div = document.createElement('div');
      div.className = 'autocomplete-option';
      div.dataset.index = idx;
      const year = g.released ? g.released.split('-')[0] : '';
      div.textContent = `${g.name}${year ? ` (${year})` : ''}`;
      list.appendChild(div);
    });
    if (rawgResults.length > 0) {
      container.style.display = 'block';
      selectedRAWGGame = await hydrateSelectedIgdbGame(rawgResults[0]);
      await fetchSteamGridPosters(selectedRAWGGame.name);
      showPlayedGamePreview();
    } else {
      container.style.display = 'none';
      selectedRAWGGame = null;
      steamGridPoster = null;
      resetRawgPosterCache();
      showPlayedGamePreview();
      alert('Ничего не найдено');
    }
  } catch (err) {
    console.error('IGDB search error', err);
  }
  if (loader) loader.style.display = 'none';
  if (btn) btn.disabled = false;
}

function showPlayedGamePreview() {
  const preview = document.getElementById('playedGameAutoPreview');
  if (!preview) return;
  preview.innerHTML = '';
  if (!selectedRAWGGame) {
    preview.style.display = 'none';
    return;
  }
  const rawgPosterUrl = selectedRAWGGame.background_image || '';
  if (!steamGridPoster && rawgPosterUrl) {
    ensureRawgOptimizedPoster(rawgPosterUrl, () => {
      if (
        selectedRAWGGame &&
        selectedRAWGGame.background_image === rawgPosterUrl
      ) {
        showPlayedGamePreview();
      }
    });
  }
  const optimizedRawgPoster = getRawgOptimizedPosterFor(rawgPosterUrl);
  const game = {
    title: selectedRAWGGame.name || '',
    genres: selectedRAWGGame.genres?.map((g) => g.name).join(', ') || '',
    year: selectedRAWGGame.released
      ? selectedRAWGGame.released.split('-')[0]
      : '',
    poster:
      steamGridPoster ||
      optimizedRawgPoster ||
      rawgPosterUrl ||
      'https://via.placeholder.com/300x400?text=Нет+постера',
    rating: getCurrentRating('playedGameRatingStars'),
    orderBy: document.getElementById('playedGameOrderBy').value || '',
    orderType: document.getElementById('playedGameOrderType').value || '',
    released: selectedRAWGGame.released || null,
    playtime: selectedRAWGGame.playtime || null,
    dateAdded: new Date().toISOString().split('T')[0],
  };
  const card = createPlayedGameCard(game, false, false);
  preview.appendChild(card);
  createPosterOverlay(
    card.querySelector('.movie-poster'),
    steamGridPosters,
    true
  );
  preview.style.display = 'block';
}

let isSubmittingWatchlistOrder = false;

let isSubmittingGameOrder = false;

let isSubmittingMovieAdd = false;

function toggleSubmitLoading(button, isLoading, label) {
  if (!button) return;
  if (isLoading) {
    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }
    const safeLabel = label || 'Добавляем...';
    button.innerHTML = `<span class="loading-spinner" aria-hidden="true"></span><span>${safeLabel}</span>`;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.classList.add('is-loading');
  } else {
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.classList.remove('is-loading');
  }
}

function normalizeActorsForStorage(value, limit = 15) {
  if (Array.isArray(value)) {
    return value
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, limit)
      .join(', ');
  }
  if (typeof value === 'string') {
    return value;
  }
  return '';
}

async function resolveKinopoiskImdbId(kinopoiskId, currentImdbId) {
  if (currentImdbId || !kinopoiskId) {
    return currentImdbId || null;
  }
  if (typeof fetchKinopoiskImdbId !== 'function' || !KINOPOISK_API_KEY) {
    return currentImdbId || null;
  }
  return fetchKinopoiskImdbId(kinopoiskId);
}

function syncGameModeSelectGroup(groupName) {
  const selects = Array.from(
    document.querySelectorAll(`[data-sync-game-mode="${groupName}"]`)
  );
  if (!selects.length) return;

  selects.forEach((select) => {
    select.addEventListener('change', () => {
      const nextValue = normalizeGameMode(select.value);
      selects.forEach((otherSelect) => {
        if (otherSelect !== select) {
          otherSelect.value = nextValue;
        }
      });
    });
  });
}

function getSelectedGameMode(mode, autoSelectId, manualSelectId) {
  const sourceId = mode === 'auto' ? autoSelectId : manualSelectId;
  return normalizeGameMode(document.getElementById(sourceId)?.value);
}

syncGameModeSelectGroup('add-game');

syncGameModeSelectGroup('played-game');

function mapInsertedMovieOrder(data, orderData) {
  return {
    id: data.id,
    title: data.order_title,
    originalTitle: data.order_origin_title,
    genres: data.order_genres,
    poster: data.order_poster,
    year: data.order_year || '',
    length: data.order_length || null,
    planDate: data.plan_date || null,
    kpRating: data.kinopoisk_rate,
    kinopoiskId: data.kp_id || orderData.kinopoiskId,
    imdbId: data.imdb_id || orderData.imdbId || null,
    orderBy: data.order_by,
    orderType: data.order_type,
    dateAdded: data.created_at,
    parentGuide: null,
    parentGuideStatus: null,
    parentGuideError: null,
    description: orderData.description,
    country: orderData.country,
    actors: orderData.actors,
    director: orderData.director,
    watchSource: normalizeWatchSource(
      data.watch_source || orderData.watchSource
    ),
  };
}

async function saveMovieOrder(orderData) {
  const normalizedTitle = String(orderData?.title || '').trim();
  if (!normalizedTitle) {
    return { ok: false, reason: 'missing_title' };
  }

  const normalizedOrder = {
    ...orderData,
    title: normalizedTitle,
    originalTitle: String(orderData?.originalTitle || '').trim(),
    year: orderData?.year || '',
    kpRating: orderData?.kpRating || '-',
    poster:
      orderData?.poster ||
      'https://via.placeholder.com/300x400?text=РќРµС‚+РїРѕСЃС‚РµСЂР°',
    genres: orderData?.genres || '',
    description: orderData?.description || '',
    country: orderData?.country || '',
    actors: Array.isArray(orderData?.actors) ? orderData.actors : [],
    director: orderData?.director || '',
    orderBy: String(orderData?.orderBy || '').trim(),
    orderType: orderData?.orderType || '',
    watchSource: normalizeWatchSource(orderData?.watchSource),
    length: orderData?.length || null,
    kinopoiskId: orderData?.kinopoiskId || null,
    imdbId: orderData?.imdbId || null,
  };

  const duplicateOrder = watchlist.some(
    (o) =>
      o.title.trim().toLowerCase() ===
        normalizedOrder.title.trim().toLowerCase() &&
      Number(o.year) === Number(normalizedOrder.year)
  );
  if (duplicateOrder) {
    if (typeof showDuplicateModal === 'function') {
      showDuplicateModal();
    }
    return { ok: false, reason: 'duplicate' };
  }

  normalizedOrder.imdbId = await resolveKinopoiskImdbId(
    normalizedOrder.kinopoiskId,
    normalizedOrder.imdbId
  );

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
          action: 'create_item',
          table: 'Movie_Orders',
          changes: {
            order_title: normalizedOrder.title,
            order_origin_title: normalizedOrder.originalTitle,
            order_year: normalizedOrder.year,
            order_genres: normalizedOrder.genres,
            order_poster: normalizedOrder.poster,
            order_by: normalizedOrder.orderBy,
            order_type: normalizedOrder.orderType,
            kinopoisk_rate: normalizedOrder.kpRating,
            kp_id: normalizedOrder.kinopoiskId,
            imdb_id: normalizedOrder.imdbId,
            order_length: normalizedOrder.length,
            description: normalizedOrder.description,
            country: normalizedOrder.country,
            actors: normalizeActorsForStorage(normalizedOrder.actors),
            director: normalizedOrder.director,
            watch_source: normalizedOrder.watchSource,
          },
        }),
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload?.error || `Movie order create failed: ${response.status}`
      );
    }
    const data = payload?.row;
    if (!data) throw new Error('Movie order create returned no row');

    const newOrder = mapInsertedMovieOrder(data, normalizedOrder);
    watchlist.push(newOrder);
    renderWatchlist();

    if (typeof prefetchOrderParentGuideForOrder === 'function') {
      prefetchOrderParentGuideForOrder(newOrder);
    }

    if (typeof recordUserOrder === 'function') {
      await recordUserOrder({
        userName: normalizedOrder.orderBy,
        type: 'movies',
      });
    }

    return { ok: true, order: newOrder };
  } catch (err) {
    console.error('Error adding order', err);
    return { ok: false, reason: 'error', error: err };
  }
}

document
  .getElementById('addMovieForm')
  .addEventListener('submit', async function (e) {
    e.preventDefault();

    const submitBtn = this.querySelector('button[type="submit"]');
    if (isSubmittingMovieAdd) return;

    const rating = getRatingValue('ratingInput');
    const watchSource = normalizeWatchSource(
      document.getElementById('movieWatchSource')?.value
    );
    if (!isRatingValid(rating)) {
      alert('Неверная оценка');
      document.getElementById('ratingInput').reportValidity();
      return;
    }

    const rouletteOrderByValue =
      rouletteAutofillActive && rouletteOrderByInput
        ? rouletteOrderByInput.value.trim()
        : '';
    if (rouletteAutofillActive && rouletteOrderByInput) {
      const hasOrderBy = rouletteOrderByInput.value.trim().length > 0;
      if (!hasOrderBy) {
        rouletteOrderByInput.reportValidity();
        const modalContent = rouletteOrderByInput.closest('.modal-content');
        if (modalContent && typeof modalContent.scrollTo === 'function') {
          modalContent.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        rouletteOrderByInput.focus();
        return;
      }
    }

    let movieData;

    if (currentMode === 'auto') {
      const title = document.getElementById('autoTitle').value;
      if (!title) {
        alert('Введите название фильма');
        return;
      }

      if (!selectedKPMovie) {
        showSearchReminderModal();
        return;
      }

      if (selectedKPMovie) {
        const sel = selectedKPMovie;
        const staff = sel.filmId ? await fetchKPFilmStaff(sel.filmId) : null;
        movieData = {
          title: sel.nameRu || sel.nameEn || '',
          originalTitle: sel.nameEn || '',
          year: sel.year || new Date().getFullYear(),
          rating: rating,
          kpRating: sel.rating || '-',
          kinopoiskId: extractKinopoiskIdFromValue(sel.filmId),
          imdbId: sel.imdbId || null,
          poster:
            sel.posterUrlPreview ||
            sel.posterUrl ||
            'https://via.placeholder.com/300x400?text=Нет+постера',
          dateAdded: new Date().toISOString().split('T')[0],
          genre: sel.genres?.map((g) => g.genre).join(', ') || '',
          description: sel.description || '',
          country: sel.countries?.map((c) => c.country).join(', ') || '',
          actors: staff?.actors || [],
          director: (staff?.directors || []).join(', '),
          orderBy: '',
          orderType: '',
          watchSource,
        };
      } else {
        movieData = {
          title: title,
          year: new Date().getFullYear(),
          rating: rating,
          kpRating: '-',
          kinopoiskId: null,
          imdbId: null,
          poster: 'https://via.placeholder.com/300x400?text=Постер',
          dateAdded: new Date().toISOString().split('T')[0],
          genre: 'Неизвестно',
          description: '',
          country: '',
          actors: [],
          director: '',
          orderBy: '',
          orderType: '',
          watchSource,
        };
      }
    } else {
      const fileInput = document.getElementById('manualPoster');
      let poster = 'https://via.placeholder.com/300x400?text=Нет+постера';
      if (fileInput.files && fileInput.files[0]) {
        try {
          poster = await readFileAsDataURL(fileInput.files[0]);
        } catch (err) {
          console.error('Error reading file', err);
        }
      }
      movieData = {
        title: document.getElementById('manualTitle').value,
        originalTitle: document.getElementById('manuaOriginTitle').value,
        year:
          parseInt(document.getElementById('manualYear').value) ||
          new Date().getFullYear(),
        rating: rating,
        kpRating: '-',
        kinopoiskId: null,
        imdbId: null,
        poster: poster,
        dateAdded: new Date().toISOString().split('T')[0],
        genre: document.getElementById('manualGenre').value || 'Неизвестно',
        description: '',
        country: '',
        actors: [],
        director: '',
        orderBy: '',
        orderType: '',
        watchSource,
      };
    }

    if (rouletteAutofillActive && rouletteOrderByValue) {
      movieData.orderBy = rouletteOrderByValue;
      movieData.orderType = ROULETTE_ORDER_TYPE;
    }

    const duplicate =
      allMovies.some(
        (m) =>
          m.title.trim().toLowerCase() ===
            movieData.title.trim().toLowerCase() &&
          Number(m.year) === Number(movieData.year)
      ) ||
      watchlist.some(
        (o) =>
          o.title.trim().toLowerCase() ===
            movieData.title.trim().toLowerCase() &&
          Number(o.year) === Number(movieData.year)
      );
    if (duplicate) {
      showDuplicateModal();
      return;
    }

    movieData.imdbId = await resolveKinopoiskImdbId(
      movieData.kinopoiskId,
      movieData.imdbId
    );

    isSubmittingMovieAdd = true;
    toggleSubmitLoading(submitBtn, true, 'Добавляем фильм...');

    const shouldClearRouletteWinner =
      Boolean(rouletteLastWinner) &&
      (!rouletteAutofillActive ||
        movieData.title.trim() !== rouletteLastWinner ||
        (movieData.year &&
          String(movieData.year).trim().length > 0 &&
          String(movieData.year).trim() !== String(new Date().getFullYear())) ||
        (selectedKPMovie &&
          (selectedKPMovie.nameRu || selectedKPMovie.nameEn || '').trim() !==
            rouletteLastWinner));

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
            action: 'create_item',
            table: 'movies',
            changes: {
              title: movieData.title,
              original_title: movieData.originalTitle || '',
              genres: movieData.genre,
              poster: movieData.poster,
              year: movieData.year,
              rating_numeric: movieData.rating,
              rating_OMDB: movieData.kpRating,
              kp_id: movieData.kinopoiskId,
              imdb_id: movieData.imdbId,
              date: movieData.dateAdded,
              order_by: movieData.orderBy || null,
              order_type: movieData.orderType || null,
              rating_sum: 0,
              rating_count: 0,
              description: movieData.description,
              country: movieData.country,
              actors: normalizeActorsForStorage(movieData.actors),
              director: movieData.director,
              watch_source: movieData.watchSource,
            },
          }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload?.error || `Movie create failed: ${response.status}`
        );
      }
      const data = payload?.row;
      if (!data) throw new Error('Movie create returned no row');

      allMovies.unshift({
        id: data.id,
        title: data.title,
        originalTitle: data.original_title,
        genre: data.genres,
        poster: data.poster,
        year: data.year,
        rating: data.rating_numeric,
        kpRating: data.rating_OMDB,
        kinopoiskId: data.kp_id || null,
        imdbId: data.imdb_id || null,
        dateAdded: data.date,
        orderBy: data.order_by && data.order_by !== 'null' ? data.order_by : '',
        orderType: data.order_type,
        ratingSum: Number(data.rating_sum ?? 0) || 0,
        ratingCount: Number(data.rating_count ?? 0) || 0,
        userRating: null,
        description: movieData.description,
        country: movieData.country,
        actors: movieData.actors,
        director: movieData.director,
        watchSource: normalizeWatchSource(
          data.watch_source || movieData.watchSource
        ),
      });
      localStorage.setItem('moviesCache', JSON.stringify(allMovies));

      if (shouldClearRouletteWinner) {
        await clearRouletteLastWinner({ updateInput: false });
      }
    } catch (err) {
      console.error('Error adding movie to Supabase', err);
    } finally {
      isSubmittingMovieAdd = false;
      toggleSubmitLoading(submitBtn, false);
    }

    currentPage = 1;
    renderMovies();
    closeModal('addMovieModal', true);
  });

document
  .getElementById('addWatchlistForm')
  .addEventListener('submit', async function (e) {
    e.preventDefault();

    const submitBtn = this.querySelector('button[type="submit"]');
    if (isSubmittingWatchlistOrder) return;

    const orderBy = document.getElementById('watchOrderBy').value;
    const orderType = document.getElementById('watchOrderType').value;
    const watchSource = normalizeWatchSource(
      document.getElementById('watchSource')?.value
    );

    let orderData;
    let filmLength = null;

    const titleInput =
      currentWatchlistMode === 'auto'
        ? document.getElementById('watchAutoTitle').value
        : '';

    if (currentWatchlistMode === 'auto') {
      if (!titleInput) {
        alert('Введите название фильма');
        return;
      }

      if (!selectedKPOrderMovie) {
        showSearchReminderModal();
        return;
      }
    }

    isSubmittingWatchlistOrder = true;
    toggleSubmitLoading(submitBtn, true, 'Добавляем заказ...');

    try {
      if (currentWatchlistMode === 'auto') {
        if (selectedKPOrderMovie) {
          const sel = selectedKPOrderMovie;
          if (sel.filmLength === undefined && sel.filmId) {
            sel.filmLength = await fetchKPFilmLength(sel.filmId);
          }
          filmLength = sel.filmLength || null;
          const staff = sel.filmId ? await fetchKPFilmStaff(sel.filmId) : null;
          orderData = {
            title: sel.nameRu || sel.nameEn || '',
            originalTitle: sel.nameEn || '',
            year: sel.year || '',
            kinopoiskId: extractKinopoiskIdFromValue(sel.filmId),
            imdbId: sel.imdbId || null,
            kpRating: sel.rating || '-',
            poster:
              sel.posterUrlPreview ||
              sel.posterUrl ||
              'https://via.placeholder.com/300x400?text=Нет+постера',
            genres: sel.genres?.map((g) => g.genre).join(', ') || '',
            description: sel.description || '',
            country: sel.countries?.map((c) => c.country).join(', ') || '',
            actors: staff?.actors || [],
            director: (staff?.directors || []).join(', '),
            orderBy: orderBy,
            orderType: orderType,
            watchSource,
            length: filmLength,
          };
        } else {
          orderData = {
            title: titleInput,
            originalTitle: '',
            year: '',
            kinopoiskId: null,
            imdbId: null,
            kpRating: '-',
            poster: 'https://via.placeholder.com/300x400?text=Нет+постера',
            genres: '',
            description: '',
            country: '',
            actors: [],
            director: '',
            orderBy: orderBy,
            orderType: orderType,
            watchSource,
            length: filmLength,
          };
        }
      } else {
        const fileInput = document.getElementById('watchManualPoster');
        let poster = 'https://via.placeholder.com/300x400?text=Нет+постера';
        if (fileInput.files && fileInput.files[0]) {
          try {
            poster = await readFileAsDataURL(fileInput.files[0]);
          } catch (err) {
            console.error('Error reading file', err);
          }
        }
        orderData = {
          title: document.getElementById('watchManualTitle').value,
          originalTitle: document.getElementById('watchManualOriginTitle')
            .value,
          year: document.getElementById('watchManualYear').value || '',
          kinopoiskId: extractKinopoiskIdFromValue(
            document.getElementById('watchManualTitle').value
          ),
          imdbId: null,
          kpRating: '-',
          poster: poster,
          genres: document.getElementById('watchManualGenre').value || '',
          description: '',
          country: '',
          actors: [],
          director: '',
          orderBy: orderBy,
          orderType: orderType,
          watchSource,
          length: filmLength,
        };
      }

      const saveResult = await saveMovieOrder(orderData);

      if (saveResult?.ok) {
        closeModal('addWatchlistModal', true);
        this.reset();
        selectedKPOrderMovie = null;
        kpOrderResults = [];
        showWatchlistKPPreview();
      }
    } finally {
      isSubmittingWatchlistOrder = false;
      toggleSubmitLoading(submitBtn, false);
    }
  });

document
  .getElementById('addGameForm')
  ?.addEventListener('submit', async function (e) {
    e.preventDefault();

    const submitBtn = this.querySelector('button[type="submit"]');
    if (isSubmittingGameOrder) return;

    const orderType = document.getElementById('gameOrderType').value;
    const orderBy = document.getElementById('gameOrderBy').value;
    const gameMode = getSelectedGameMode(
      currentGameMode,
      'gameAutoModeSelect',
      'gameManualModeSelect'
    );

    let gameData;
    let posterFile = null;

    const titleInput =
      currentGameMode === 'auto'
        ? document.getElementById('gameAutoTitle').value
        : '';

    if (currentGameMode === 'auto') {
      if (!titleInput) {
        alert('Введите название игры');
        return;
      }
    }

    isSubmittingGameOrder = true;
    toggleSubmitLoading(submitBtn, true, 'Добавляем игру...');

    try {
      if (currentGameMode === 'auto') {
        if (selectedRAWGGame) {
          const g = selectedRAWGGame;
          const rawgPosterUrl = g.background_image || '';
          const optimizedSteamPoster = steamGridPoster
            ? await readRemoteImageAsOptimizedDataURL(steamGridPoster)
            : null;
          const optimizedRawgPoster =
            !steamGridPoster && rawgPosterUrl
              ? await ensureRawgOptimizedPoster(rawgPosterUrl)
              : null;

          // Fetch full game details for description and extra info
          let fullGameDetails = null;
          if (g.id) {
            try {
              const detailsRes = await fetch(
                buildIgdbUrl('game', { id: g.id }),
                {
                  headers: getAdminAuthorizationHeaders(),
                }
              );
              if (detailsRes.ok) {
                fullGameDetails = await detailsRes.json();
              }
            } catch (err) {
              console.error('Error fetching full game details', err);
            }
          }

          gameData = {
            title: g.name || titleInput,
            year: g.released ? g.released.split('-')[0] : '',
            genres: g.genres?.map((x) => x.name).join(', ') || '',
            poster:
              optimizedSteamPoster ||
              steamGridPoster ||
              optimizedRawgPoster ||
              rawgPosterUrl ||
              'https://via.placeholder.com/300x400?text=Нет+постера',
            orderBy: orderBy,
            orderType: orderType,
            gameMode: gameMode,
            // New fields
            description:
              fullGameDetails?.description_raw ||
              fullGameDetails?.description ||
              '',
            rating: fullGameDetails?.rating || g.rating || null,
            metacritic: fullGameDetails?.metacritic || g.metacritic || null,
            released: fullGameDetails?.released || g.released || null,
            playtime: fullGameDetails?.playtime || g.playtime || null,
            playtimeHastily: fullGameDetails?.playtimeHastily ?? null,
            playtimeNormally: fullGameDetails?.playtimeNormally ?? null,
            playtimeCompletely: fullGameDetails?.playtimeCompletely ?? null,
            playtimeCount: fullGameDetails?.playtimeCount ?? null,
            platforms:
              fullGameDetails?.platforms
                ?.map((p) => p.platform.name)
                .join(', ') ||
              g.platforms?.map((p) => p.platform.name).join(', ') ||
              '',
            developers:
              fullGameDetails?.developers?.map((d) => d.name).join(', ') || '',
            publishers:
              fullGameDetails?.publishers?.map((p) => p.name).join(', ') || '',
            rawgId: g.id || null,
          };
        } else {
          gameData = {
            title: titleInput,
            year: '',
            genres: '',
            poster: 'https://via.placeholder.com/300x400?text=Нет+постера',
            orderBy: orderBy,
            orderType: orderType,
            gameMode: gameMode,
            description: '',
            rating: null,
            metacritic: null,
            released: null,
            playtime: null,
            playtimeHastily: null,
            playtimeNormally: null,
            playtimeCompletely: null,
            playtimeCount: null,
            platforms: '',
            developers: '',
            publishers: '',
            rawgId: null,
          };
        }
      } else {
        const fileInput = document.getElementById('gamePoster');
        posterFile = fileInput.files?.[0] || null;
        let poster = 'https://via.placeholder.com/300x400?text=Нет+постера';
        if (posterFile) {
          try {
            poster = await readFileAsDataURL(posterFile);
          } catch (err) {
            console.error('Error reading file', err);
          }
        }

        gameData = {
          title: document.getElementById('gameTitle').value,
          year: document.getElementById('gameYear').value || '',
          genres: document.getElementById('gameGenres').value || '',
          poster: poster,
          orderBy: orderBy,
          orderType: orderType,
          gameMode: gameMode,
          description: '',
          rating: null,
          metacritic: null,
          released: null,
          playtime: null,
          playtimeHastily: null,
          playtimeNormally: null,
          playtimeCompletely: null,
          playtimeCount: null,
          platforms: '',
          developers: '',
          publishers: '',
          rawgId: null,
        };
      }

      try {
        gameData.poster = await uploadGamePosterToStorage({
          poster: gameData.poster,
          file: posterFile,
          title: gameData.title,
          folder: 'orders',
        });

        const descriptionValue =
          gameData.description && String(gameData.description).trim()
            ? { original: gameData.description, translated: null }
            : null;

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
              action: 'create_item',
              table: 'Game_Orders',
              changes: {
                game_title: gameData.title,
                game_year: gameData.year,
                game_genres: gameData.genres,
                game_poster: gameData.poster,
                game_order_by: gameData.orderBy,
                game_order_type: gameData.orderType,
                game_mode: gameData.gameMode || null,
                description: descriptionValue,
                rawg_rating: gameData.rating,
                metacritic: gameData.metacritic,
                released: gameData.released,
                playtime: gameData.playtime,
                playtime_hastily: gameData.playtimeHastily,
                playtime_normally: gameData.playtimeNormally,
                playtime_completely: gameData.playtimeCompletely,
                playtime_count: gameData.playtimeCount,
                platforms: gameData.platforms,
                developers: gameData.developers,
                publishers: gameData.publishers,
                rawg_id: gameData.rawgId,
              },
            }),
          }
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            payload?.error || `Game order create failed: ${response.status}`
          );
        }
        const data = payload?.row;
        if (!data) throw new Error('Game order create returned no row');

        const newGameOrder = {
          id: data.id,
          title: data.game_title,
          genres: data.game_genres,
          poster: data.game_poster,
          year: data.game_year || '',
          planDate: data.game_plan_date || null,
          orderBy: data.game_order_by,
          orderType: data.game_order_type,
          gameMode: normalizeGameMode(data.game_mode),
          dateAdded: data.created_at,
          description: data.description || '',
          rating: data.rawg_rating || null,
          metacritic: data.metacritic || null,
          released: data.released || null,
          playtime: data.playtime || null,
          playtimeHastily: data.playtime_hastily ?? null,
          playtimeNormally: data.playtime_normally ?? null,
          playtimeCompletely: data.playtime_completely ?? null,
          playtimeCount: data.playtime_count ?? null,
          platforms: data.platforms || '',
          developers: data.developers || '',
          publishers: data.publishers || '',
          rawgId: data.rawg_id || null,
          streamsCompleted: Math.min(
            3,
            Math.max(0, Number.parseInt(data.streams_completed, 10) || 0)
          ),
        };
        gameOrders.push(newGameOrder);
        renderGames();

        if (
          typeof prefetchOrderGameDescriptionForOrder === 'function' &&
          descriptionValue
        ) {
          prefetchOrderGameDescriptionForOrder(newGameOrder);
        }

        if (typeof recordUserOrder === 'function') {
          await recordUserOrder({ userName: gameData.orderBy, type: 'games' });
        }
      } catch (err) {
        console.error('Error adding game', err);
      }

      closeModal('addGameModal', true);
      this.reset();
      selectedRAWGGame = null;
      steamGridPoster = null;
      steamGridPosters = [];
      resetRawgPosterCache();
      rawgResults = [];
      showRAWGPreview();
    } finally {
      isSubmittingGameOrder = false;
      toggleSubmitLoading(submitBtn, false);
    }
  });

document
  .getElementById('addPlayedGameForm')
  ?.addEventListener('submit', async function (e) {
    e.preventDefault();

    const orderBy = document.getElementById('playedGameOrderBy').value;
    const orderType = document.getElementById('playedGameOrderType').value;
    const rating = getRatingValue('playedGameRatingInput');
    if (!isRatingValid(rating)) {
      alert('Неверная оценка');
      document.getElementById('playedGameRatingInput').reportValidity();
      return;
    }

    let gameData;
    let posterFile = null;
    const gameMode = getSelectedGameMode(
      currentPlayedGameMode,
      'playedGameAutoModeSelect',
      'playedGameManualModeSelect'
    );

    if (currentPlayedGameMode === 'auto') {
      const titleInput = document.getElementById('playedGameAutoTitle').value;
      if (!titleInput) {
        alert('Введите название игры');
        return;
      }

      if (!selectedRAWGGame) {
        showSearchReminderModal();
        return;
      }

      const g = selectedRAWGGame;
      const rawgPosterUrl = g.background_image || '';
      const optimizedSteamPoster = steamGridPoster
        ? await readRemoteImageAsOptimizedDataURL(steamGridPoster)
        : null;
      const optimizedRawgPoster =
        !steamGridPoster && rawgPosterUrl
          ? await ensureRawgOptimizedPoster(rawgPosterUrl)
          : null;
      let fullGameDetails = null;
      if (g.id) {
        try {
          const detailsRes = await fetch(buildIgdbUrl('game', { id: g.id }), {
            headers: getAdminAuthorizationHeaders(),
          });
          if (detailsRes.ok) fullGameDetails = await detailsRes.json();
        } catch (err) {
          console.error('Error fetching full game details', err);
        }
      }
      gameData = {
        title: g.name || titleInput,
        year: g.released ? g.released.split('-')[0] : '',
        genres: g.genres?.map((x) => x.name).join(', ') || '',
        poster:
          optimizedSteamPoster ||
          steamGridPoster ||
          optimizedRawgPoster ||
          rawgPosterUrl ||
          'https://via.placeholder.com/300x400?text=Нет+постера',
        rating: rating,
        orderBy: orderBy,
        orderType: orderType,
        gameMode: gameMode,
        rawgId: g.id || null,
        description: fullGameDetails?.description_raw || '',
        rawgRating: fullGameDetails?.rating ?? null,
        metacritic: fullGameDetails?.metacritic ?? null,
        released: fullGameDetails?.released ?? g.released ?? null,
        playtime: fullGameDetails?.playtime ?? null,
        playtimeHastily: fullGameDetails?.playtimeHastily ?? null,
        playtimeNormally: fullGameDetails?.playtimeNormally ?? null,
        playtimeCompletely: fullGameDetails?.playtimeCompletely ?? null,
        playtimeCount: fullGameDetails?.playtimeCount ?? null,
        platforms:
          fullGameDetails?.platforms?.map((p) => p.platform.name).join(', ') ||
          '',
        developers:
          fullGameDetails?.developers?.map((d) => d.name).join(', ') || '',
        publishers:
          fullGameDetails?.publishers?.map((p) => p.name).join(', ') || '',
      };
    } else {
      const fileInput = document.getElementById('playedGamePoster');
      posterFile = fileInput.files?.[0] || null;
      let poster = 'https://via.placeholder.com/300x400?text=Нет+постера';
      if (posterFile) {
        try {
          poster = await readFileAsDataURL(posterFile);
        } catch (err) {
          console.error('Error reading file', err);
        }
      }

      gameData = {
        title: document.getElementById('playedGameTitle').value,
        year: document.getElementById('playedGameYear').value || '',
        genres: document.getElementById('playedGameGenres').value || '',
        poster: poster,
        rating: rating,
        orderBy: orderBy,
        orderType: orderType,
        gameMode: gameMode,
      };
    }

    const duplicate = allPlayedGames.some(
      (g) =>
        g.title.trim().toLowerCase() === gameData.title.trim().toLowerCase()
    );
    if (duplicate) {
      showDuplicateModal();
      return;
    }

    try {
      gameData.poster = await uploadGamePosterToStorage({
        poster: gameData.poster,
        file: posterFile,
        title: gameData.title,
        folder: 'played',
      });

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
            action: 'create_item',
            table: 'games',
            changes: {
              title: gameData.title,
              genres: gameData.genres,
              poster: gameData.poster,
              year: gameData.year,
              rating_numeric: gameData.rating,
              date: new Date().toISOString().split('T')[0],
              order_by: gameData.orderBy,
              order_type: gameData.orderType,
              game_mode: gameData.gameMode || null,
              game_rating_sum: 0,
              game_rating_count: 0,
              description: gameData.description || null,
              rawg_rating: gameData.rawgRating ?? null,
              metacritic: gameData.metacritic ?? null,
              released: gameData.released ?? null,
              playtime: gameData.playtime ?? null,
              playtime_hastily: gameData.playtimeHastily ?? null,
              playtime_normally: gameData.playtimeNormally ?? null,
              playtime_completely: gameData.playtimeCompletely ?? null,
              playtime_count: gameData.playtimeCount ?? null,
              platforms: gameData.platforms || '',
              developers: gameData.developers || '',
              publishers: gameData.publishers || '',
              rawg_id: gameData.rawgId ?? null,
            },
          }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload?.error || `Played game create failed: ${response.status}`
        );
      }
      const data = payload?.row;
      if (!data) throw new Error('Played game create returned no row');

      allPlayedGames.unshift({
        id: data.id,
        title: data.title,
        genres: data.genres,
        poster: data.poster,
        year: data.year,
        rating: data.rating_numeric,
        dateAdded: data.date,
        orderBy: data.order_by && data.order_by !== 'null' ? data.order_by : '',
        orderType: data.order_type,
        gameMode: normalizeGameMode(data.game_mode),
        description: data.description || '',
        rawgRating: data.rawg_rating ?? null,
        metacritic: data.metacritic ?? null,
        released: data.released ?? null,
        playtime: data.playtime ?? null,
        playtimeHastily: data.playtime_hastily ?? null,
        playtimeNormally: data.playtime_normally ?? null,
        playtimeCompletely: data.playtime_completely ?? null,
        playtimeCount: data.playtime_count ?? null,
        platforms: data.platforms || '',
        developers: data.developers || '',
        publishers: data.publishers || '',
        rawgId: data.rawg_id ?? null,
        ratingSum: Number(data.game_rating_sum ?? 0) || 0,
        ratingCount: Number(data.game_rating_count ?? 0) || 0,
        userRating: null,
      });
      localStorage.setItem('gamesCache', JSON.stringify(allPlayedGames));
    } catch (err) {
      console.error('Error adding game', err);
    }

    gamePage = 1;
    renderPlayedGames();
    closeModal('addPlayedGameModal', true);
    this.reset();
    selectedRAWGGame = null;
    steamGridPoster = null;
    steamGridPosters = [];
    resetRawgPosterCache();
    rawgResults = [];
    showPlayedGamePreview();
  });

async function submitRating() {
  if (isSubmittingRating) return;
  const rating = getRatingValue('rateMovieInput');
  if (!isRatingValid(rating)) {
    alert('Неверная оценка');
    document.getElementById('rateMovieInput').reportValidity();
    return;
  }

  // Находим фильм в watchlist по id
  const itemIndex = watchlist.findIndex((item) => item.id === ratingMovieId);
  if (itemIndex !== -1) {
    let source;
    try {
      source = await ensureCatalogItemDetails('watchlist', ratingMovieId);
    } catch (error) {
      console.warn('Unable to load order before promotion', error);
      showToastNotification('Не удалось загрузить подробности заказа. Повторите попытку.', 'error');
      return;
    }
    if (!source || isSubmittingRating || source.id !== ratingMovieId) return;
    const watchedMovie = {
      title: source.title,
      originalTitle: source.originalTitle || '',
      year: source.year,
      rating: rating,
      kpRating: source.kpRating,
      kinopoiskId: source.kinopoiskId || null,
      imdbId: source.imdbId || null,
      poster:
        source.poster || 'https://via.placeholder.com/300x400?text=Нет+постера',
      dateAdded: new Date().toISOString().split('T')[0],
      genre: source.genres || '',
      description: source.description || '',
      country: source.country || '',
      actors: source.actors || [],
      director: source.director || '',
      orderBy: source.orderBy || '',
      orderType: source.orderType || '',
      watchSource: normalizeWatchSource(source.watchSource),
      studios: source.studios || null,
    };
    const duplicateWatchedMovie = allMovies.some(
      (m) =>
        m.title.trim().toLowerCase() ===
          watchedMovie.title.trim().toLowerCase() &&
        Number(m.year) === Number(watchedMovie.year)
    );
    if (duplicateWatchedMovie) {
      showDuplicateModal(
        'Такой фильм уже есть в списке просмотренных. Можно удалить его из заказанных.',
        {
          actionLabel: 'Удалить',
          onAction: async () => {
            closeModal('duplicateModal');
            closeModal('rateMovieModal', true);
            await performDeleteOrder(source.id);
          },
        }
      );
      return;
    }
    const confirmBtn = document.querySelector('#rateMovieModal .btn-primary');
    isSubmittingRating = true;
    if (confirmBtn) confirmBtn.disabled = true;
    try {
      watchedMovie.imdbId = await resolveKinopoiskImdbId(
        watchedMovie.kinopoiskId,
        watchedMovie.imdbId
      );
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
            action: 'promote_movie_order',
            orderId: source.id,
            movie: {
              title: watchedMovie.title,
              original_title: watchedMovie.originalTitle,
              genres: watchedMovie.genre,
              poster: watchedMovie.poster,
              year: watchedMovie.year,
              rating_numeric: watchedMovie.rating,
              rating_OMDB: watchedMovie.kpRating,
              kp_id: watchedMovie.kinopoiskId,
              imdb_id: watchedMovie.imdbId,
              date: watchedMovie.dateAdded,
              order_by: watchedMovie.orderBy,
              order_type: watchedMovie.orderType,
              description: watchedMovie.description,
              country: watchedMovie.country,
              actors: normalizeActorsForStorage(watchedMovie.actors),
              director: watchedMovie.director,
              studios: watchedMovie.studios,
              watch_source: watchedMovie.watchSource,
            },
          }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload?.error || `Movie promotion failed: ${response.status}`
        );
      }
      const data = payload?.row;
      const pendingRatingSum = Number(payload?.pendingRatingSum ?? 0) || 0;
      const pendingRatingCount = Number(payload?.pendingRatingCount ?? 0) || 0;
      if (!data) throw new Error('Movie promotion returned no row');

      const newMovie = {
        id: data.id,
        title: data.title,
        originalTitle: data.original_title,
        genre: data.genres,
        poster: data.poster,
        year: data.year,
        rating: data.rating_numeric,
        kpRating: data.rating_OMDB,
        kinopoiskId: data.kp_id || watchedMovie.kinopoiskId,
        imdbId: data.imdb_id || watchedMovie.imdbId || null,
        ratingSum: Number(data.rating_sum ?? pendingRatingSum) || 0,
        ratingCount: Number(data.rating_count ?? pendingRatingCount) || 0,
        dateAdded: data.date,
        orderBy: data.order_by && data.order_by !== 'null' ? data.order_by : '',
        orderType: data.order_type,
        userRating:
          pendingRatingCount > 0
            ? Math.round((pendingRatingSum / pendingRatingCount) * 10) / 10
            : null,
        description: watchedMovie.description,
        country: watchedMovie.country,
        actors: watchedMovie.actors,
        director: watchedMovie.director,
        studios: data.studios ?? watchedMovie.studios,
        watchSource: normalizeWatchSource(
          data.watch_source || watchedMovie.watchSource
        ),
      };

      allMovies.unshift(newMovie);
      localStorage.setItem('moviesCache', JSON.stringify(allMovies));
      const completedOrderIndex = watchlist.findIndex((item) => item.id === source.id);
      if (completedOrderIndex !== -1) watchlist.splice(completedOrderIndex, 1);
      currentPage = 1;
      renderMovies();
      renderWatchlist();
      closeModal('rateMovieModal', true);
    } catch (err) {
      console.error('Error adding rated movie to Supabase', err);
      alert(
        'Не удалось переместить фильм в список просмотренных. Попробуйте ещё раз.'
      );
    } finally {
      isSubmittingRating = false;
      if (confirmBtn) confirmBtn.disabled = false;
    }
  }
}

async function submitGameRating() {
  const rating = getRatingValue('rateGameInput');
  if (!isRatingValid(rating)) {
    alert('Неверная оценка');
    document.getElementById('rateGameInput').reportValidity();
    return;
  }
  const idx = gameOrders.findIndex((g) => g.id === ratingGameId);
  if (idx !== -1) {
    let source;
    try {
      source = await ensureCatalogItemDetails('gameOrders', ratingGameId);
    } catch (error) {
      console.warn('Unable to load order before promotion', error);
      showToastNotification('Не удалось загрузить подробности заказа. Повторите попытку.', 'error');
      return;
    }
    if (!source || source.id !== ratingGameId) return;
    const descriptionValue = (() => {
      if (!source?.description) return null;
      if (typeof source.description === 'object') return source.description;
      if (typeof source.description === 'string') {
        const trimmed = source.description.trim();
        return trimmed ? { original: trimmed, translated: null } : null;
      }
      return null;
    })();
    const played = {
      title: source.title,
      year: source.year,
      rating: rating,
      genres: source.genres || '',
      poster:
        source.poster || 'https://via.placeholder.com/300x400?text=Нет+постера',
      dateAdded: new Date().toISOString().split('T')[0],
      orderBy: source.orderBy || '',
      orderType: source.orderType || '',
      gameMode: normalizeGameMode(source.gameMode),
      description: descriptionValue,
      rawgRating: source.rating ?? null,
      metacritic: source.metacritic ?? null,
      released: source.released ?? null,
      playtime: source.playtime ?? null,
      playtimeHastily: source.playtimeHastily ?? null,
      playtimeNormally: source.playtimeNormally ?? null,
      playtimeCompletely: source.playtimeCompletely ?? null,
      playtimeCount: source.playtimeCount ?? null,
      platforms: source.platforms ?? '',
      developers: source.developers ?? '',
      publishers: source.publishers ?? '',
      rawgId: source.rawgId ?? null,
    };
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
            action: 'promote_game_order',
            orderId: source.id,
            game: {
              title: played.title,
              genres: played.genres,
              poster: played.poster,
              year: played.year,
              rating_numeric: played.rating,
              date: played.dateAdded,
              order_by: played.orderBy,
              order_type: played.orderType,
              game_mode: played.gameMode || null,
              game_rating_sum: 0,
              game_rating_count: 0,
              description: played.description,
              rawg_rating: played.rawgRating,
              metacritic: played.metacritic,
              released: played.released,
              playtime: played.playtime,
              playtime_hastily: played.playtimeHastily,
              playtime_normally: played.playtimeNormally,
              playtime_completely: played.playtimeCompletely,
              playtime_count: played.playtimeCount,
              platforms: played.platforms,
              developers: played.developers,
              publishers: played.publishers,
              rawg_id: played.rawgId,
            },
          }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload?.error || `Game promotion failed: ${response.status}`
        );
      }
      const data = payload?.row;
      if (!data) throw new Error('Game promotion returned no row');

      const newGame = {
        id: data.id,
        title: data.title,
        genres: data.genres,
        poster: data.poster,
        year: data.year,
        rating: data.rating_numeric,
        dateAdded: data.date,
        orderBy: data.order_by && data.order_by !== 'null' ? data.order_by : '',
        orderType: data.order_type,
        gameMode: normalizeGameMode(data.game_mode),
        description: data.description ?? played.description ?? '',
        rawgRating: data.rawg_rating ?? played.rawgRating ?? null,
        metacritic: data.metacritic ?? played.metacritic ?? null,
        released: data.released ?? played.released ?? null,
        playtime: data.playtime ?? played.playtime ?? null,
        playtimeHastily:
          data.playtime_hastily ?? played.playtimeHastily ?? null,
        playtimeNormally:
          data.playtime_normally ?? played.playtimeNormally ?? null,
        playtimeCompletely:
          data.playtime_completely ?? played.playtimeCompletely ?? null,
        playtimeCount: data.playtime_count ?? played.playtimeCount ?? null,
        platforms: data.platforms ?? played.platforms ?? '',
        developers: data.developers ?? played.developers ?? '',
        publishers: data.publishers ?? played.publishers ?? '',
        rawgId: data.rawg_id ?? played.rawgId ?? null,
        ratingSum: Number(data.game_rating_sum ?? 0) || 0,
        ratingCount: Number(data.game_rating_count ?? 0) || 0,
        userRating: null,
      };

      allPlayedGames.unshift(newGame);
      localStorage.setItem('gamesCache', JSON.stringify(allPlayedGames));
      const completedOrderIndex = gameOrders.findIndex((item) => item.id === source.id);
      if (completedOrderIndex !== -1) gameOrders.splice(completedOrderIndex, 1);
      renderPlayedGames();
      renderGames();
      closeModal('rateGameModal', true);
    } catch (err) {
      console.error('Error adding rated game', err);
      alert(
        'Не удалось переместить игру в список пройденных. Попробуйте ещё раз.'
      );
    }
  }
}

document
  .getElementById('editMovieForm')
  .addEventListener('submit', async function (e) {
    e.preventDefault();

    const movie = allMovies.find((m) => m.id === editingMovieId);
    if (!movie) return;

    const rating = getRatingValue('editRatingInput');
    if (!isRatingValid(rating)) {
      alert('Неверная оценка');
      document.getElementById('editRatingInput').reportValidity();
      return;
    }

    const titleValue = document.getElementById('editTitle').value;
    const yearValue = parseInt(document.getElementById('editYear').value, 10);
    const genreInput = document.getElementById('editGenre').value;
    const orderByInput = document.getElementById('editMovieOrderBy').value;
    const orderTypeInput = document.getElementById('editMovieOrderType').value;
    const updatedMovie = {
      title: titleValue,
      year: Number.isFinite(yearValue) ? yearValue : movie.year,
      genre: genreInput ? genreInput : movie.genre,
      orderBy: orderByInput ? orderByInput : movie.orderBy,
      orderType: orderTypeInput ? orderTypeInput : movie.orderType,
      rating,
      poster: editPosterData || movie.poster,
    };

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
            table: 'movies',
            id: editingMovieId,
            changes: {
              title: updatedMovie.title,
              genres: updatedMovie.genre,
              poster: updatedMovie.poster,
              year: updatedMovie.year,
              rating_numeric: updatedMovie.rating,
              rating_OMDB: movie.kpRating,
              order_by: updatedMovie.orderBy,
              order_type: updatedMovie.orderType || null,
            },
          }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload?.error || `Movie update failed: ${response.status}`
        );
      }

      movie.title = updatedMovie.title;
      movie.year = updatedMovie.year;
      movie.genre = updatedMovie.genre;
      movie.orderBy = updatedMovie.orderBy;
      movie.orderType = updatedMovie.orderType;
      movie.rating = updatedMovie.rating;
      movie.poster = updatedMovie.poster;
      movie.dateAdded =
        movie.dateAdded || new Date().toISOString().split('T')[0];

      localStorage.setItem('moviesCache', JSON.stringify(allMovies));
      renderMovies();
      editPosterData = null;
      closeModal('editMovieModal', true);
    } catch (err) {
      console.error('Error updating movie in Supabase', err);
      alert('Не удалось сохранить изменения фильма. Попробуйте ещё раз.');
    }
  });

document
  .getElementById('planDateForm')
  ?.addEventListener('submit', async function (e) {
    e.preventDefault();

    if (planDateOrderId === null) return;

    const isGamePlan = planDateOrderType === 'game';
    const orders = isGamePlan ? gameOrders : watchlist;
    const order = orders.find((o) => o.id === planDateOrderId);
    const dateInput = document.getElementById('planDateInput');
    const timeInput = document.getElementById('planTimeInput');
    const dateValue = dateInput?.value?.trim();
    const timeValue = timeInput?.value?.trim();

    let planValue = null;

    if (dateValue && !timeValue) {
      const dateOnly = new Date(`${dateValue}T00:00`);

      if (Number.isNaN(dateOnly.getTime())) {
        alert('Некорректная дата. Проверьте ввод.');
        return;
      }

      planValue = `${dateValue}T00:00`;
    } else if (!dateValue && timeValue) {
      alert('Чтобы указать время, заполните дату или очистите оба поля.');
      return;
    } else if (dateValue && timeValue) {
      const combinedValue = new Date(`${dateValue}T${timeValue}`);

      if (Number.isNaN(combinedValue.getTime())) {
        alert('Некорректная дата или время. Проверьте ввод.');
        return;
      }

      planValue = combinedValue.toISOString();
    }

    try {
      const column = isGamePlan ? 'game_plan_date' : 'plan_date';
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
            table: isGamePlan ? 'Game_Orders' : 'Movie_Orders',
            id: planDateOrderId,
            changes: { [column]: planValue },
          }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload?.error || `Plan date update failed: ${response.status}`
        );
      }
      const data = payload?.row;

      if (order) {
        order.planDate = data?.[column] || null;
      }

      if (isGamePlan) {
        renderGames();
      } else {
        renderWatchlist();
      }
      closeModal('planDateModal');
    } catch (err) {
      console.error('Error updating plan date', err);
      alert('Не удалось сохранить время просмотра. Попробуйте ещё раз.');
    } finally {
      planDateOrderId = null;
      planDateOrderType = 'movie';
    }
  });

document
  .getElementById('editPlayedGameForm')
  ?.addEventListener('submit', async function (e) {
    e.preventDefault();

    const game = allPlayedGames.find((g) => g.id === editingPlayedGameId);
    if (!game) return;

    const previousPoster = game.poster;
    const rating = getRatingValue('editPlayedGameRatingInput');
    if (!isRatingValid(rating)) {
      alert('Неверная оценка');
      document.getElementById('editPlayedGameRatingInput').reportValidity();
      return;
    }

    const updatedGame = {
      title: document.getElementById('editPlayedGameTitle').value,
      year: document.getElementById('editPlayedGameYear').value,
      genres: document.getElementById('editPlayedGameGenres').value,
      rating,
      orderBy: document.getElementById('editPlayedGameOrderBy').value,
      orderType: document.getElementById('editPlayedGameOrderType').value,
      poster: editPlayedGamePosterData || game.poster,
    };

    try {
      let shouldDeletePreviousPoster = false;
      if (
        editPlayedGamePosterData &&
        editPlayedGamePosterData !== previousPoster
      ) {
        const uploadedPoster = await uploadGamePosterToStorage({
          poster: editPlayedGamePosterData,
          title: updatedGame.title,
          folder: 'played',
        });
        if (!getGamePosterStoragePath(uploadedPoster)) {
          throw new Error('Не удалось сохранить постер в storage.');
        }
        updatedGame.poster = uploadedPoster;
        shouldDeletePreviousPoster =
          previousPoster &&
          previousPoster !== updatedGame.poster &&
          Boolean(getGamePosterStoragePath(previousPoster));
      }

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
            id: editingPlayedGameId,
            changes: {
              title: updatedGame.title,
              genres: updatedGame.genres,
              poster: updatedGame.poster,
              year: updatedGame.year,
              rating_numeric: updatedGame.rating,
              order_by: updatedGame.orderBy,
              order_type: updatedGame.orderType,
            },
          }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload?.error || `Played game update failed: ${response.status}`
        );
      }

      if (shouldDeletePreviousPoster) {
        await deleteGamePosterFromStorage(previousPoster);
      }
      Object.assign(game, updatedGame);
      localStorage.setItem('gamesCache', JSON.stringify(allPlayedGames));
      renderPlayedGames();
      editPlayedGamePosterData = null;
      closeModal('editPlayedGameModal', true);
    } catch (err) {
      console.error('Error updating played game', err);
      alert(
        'Не удалось сохранить изменения пройденной игры. Попробуйте ещё раз.'
      );
    }
  });

function resetForm() {
  document.getElementById('addMovieForm').reset();
  document.getElementById('addWatchlistForm').reset();
  document.getElementById('addGameForm')?.reset();
  document.getElementById('addPlayedGameForm')?.reset();
  document.getElementById('editPlayedGameForm')?.reset();

  // Очистка состояния автопоиска фильмов
  kpResults = [];
  selectedKPMovie = null;
  const autoResults = document.getElementById('autoResults');
  if (autoResults) autoResults.innerHTML = '';
  const autoResultsContainer = document.getElementById('autoResultsContainer');
  if (autoResultsContainer) autoResultsContainer.style.display = 'none';
  const autoPreview = document.getElementById('autoPreview');
  if (autoPreview) {
    autoPreview.innerHTML = '';
    autoPreview.style.display = 'none';
  }
  if (typeof showKPPreview === 'function') {
    showKPPreview();
  }

  // Очистка состояния автопоиска заказанных фильмов
  kpOrderResults = [];
  selectedKPOrderMovie = null;
  const watchAutoResults = document.getElementById('watchAutoResults');
  if (watchAutoResults) watchAutoResults.innerHTML = '';
  const watchAutoResultsContainer = document.getElementById(
    'watchAutoResultsContainer'
  );
  if (watchAutoResultsContainer)
    watchAutoResultsContainer.style.display = 'none';
  const watchAutoPreview = document.getElementById('watchAutoPreview');
  if (watchAutoPreview) {
    watchAutoPreview.innerHTML = '';
    watchAutoPreview.style.display = 'none';
  }
  if (typeof showWatchlistKPPreview === 'function') {
    showWatchlistKPPreview();
  }

  // Очистка состояния автопоиска игр
  rawgResults = [];
  selectedRAWGGame = null;
  steamGridPoster = null;
  steamGridPosters = [];
  resetRawgPosterCache();
  const gameAutoResults = document.getElementById('gameAutoResults');
  if (gameAutoResults) gameAutoResults.innerHTML = '';
  const gameAutoResultsContainer = document.getElementById(
    'gameAutoResultsContainer'
  );
  if (gameAutoResultsContainer) gameAutoResultsContainer.style.display = 'none';
  const gameAutoPreview = document.getElementById('gameAutoPreview');
  if (gameAutoPreview) {
    gameAutoPreview.innerHTML = '';
    gameAutoPreview.style.display = 'none';
  }
  const playedGameAutoResults = document.getElementById(
    'playedGameAutoResults'
  );
  if (playedGameAutoResults) playedGameAutoResults.innerHTML = '';
  const playedGameAutoResultsContainer = document.getElementById(
    'playedGameAutoResultsContainer'
  );
  if (playedGameAutoResultsContainer)
    playedGameAutoResultsContainer.style.display = 'none';
  const playedGameAutoPreview = document.getElementById(
    'playedGameAutoPreview'
  );
  if (playedGameAutoPreview) {
    playedGameAutoPreview.innerHTML = '';
    playedGameAutoPreview.style.display = 'none';
  }
  if (typeof showRAWGPreview === 'function') {
    showRAWGPreview();
  }
  if (typeof showPlayedGamePreview === 'function') {
    showPlayedGamePreview();
  }

  setRatingStars('ratingStars', null);
  setRatingStars('editRatingStars', 0);
  setRatingStars('editPlayedGameRatingStars', 0);
  setRatingStars('playedGameRatingStars', null);
  setRatingStars('rateMovieStars', null);
  syncRouletteAutofillState();
}

function openAddMovieModal() {
  const modal = document.getElementById('addMovieModal');
  const watchSourceSelect = document.getElementById('movieWatchSource');
  if (watchSourceSelect && !watchSourceSelect.value) {
    watchSourceSelect.value = 'stream';
  }
  if (modal) {
    modal.style.display = 'block';
  }
}

function openAddToWatchlistModal() {
  const watchSourceSelect = document.getElementById('watchSource');
  if (watchSourceSelect && !watchSourceSelect.value) {
    watchSourceSelect.value = 'stream';
  }
  document.getElementById('addWatchlistModal').style.display = 'block';
}

function openRateModal(id) {
  ratingMovieId = id;
  const item = watchlist.find((w) => w.id === id);
  if (item) {
    const duplicateWatchedMovie = allMovies.some(
      (m) =>
        m.title.trim().toLowerCase() === item.title.trim().toLowerCase() &&
        Number(m.year) === Number(item.year)
    );
    if (duplicateWatchedMovie) {
      showDuplicateModal(
        'Такой фильм уже есть в списке просмотренных. Можно удалить его из заказанных.',
        {
          actionLabel: 'Удалить',
          onAction: async () => {
            closeModal('duplicateModal');
            await performDeleteOrder(item.id);
          },
        }
      );
      return;
    }
  }
  if (item) {
    document.getElementById('rateMovieTitle').textContent = item.title;
    document.getElementById('rateMoviePoster').src = item.poster;
  } else {
    document.getElementById('rateMovieTitle').textContent = '';
    document.getElementById('rateMoviePoster').src =
      'https://via.placeholder.com/300x400?text=Нет+постера';
  }
  document.getElementById('rateMovieModal').style.display = 'block';
  setRatingStars('rateMovieStars', null);
  setupRatingStars('rateMovieStars');
  const confirmBtn = document.querySelector('#rateMovieModal .btn-primary');
  if (confirmBtn) confirmBtn.disabled = isSubmittingRating;
}

function openRateGameModal(id) {
  ratingGameId = id;
  const item = gameOrders.find((g) => g.id === id);
  if (item) {
    document.getElementById('rateGameTitle').textContent = item.title;
    document.getElementById('rateGamePoster').src = item.poster;
  } else {
    document.getElementById('rateGameTitle').textContent = '';
    document.getElementById('rateGamePoster').src =
      'https://via.placeholder.com/300x400?text=Нет+постера';
  }
  document.getElementById('rateGameModal').style.display = 'block';
  setRatingStars('rateGameStars', null);
  setupRatingStars('rateGameStars');
}

function openEditModal(id) {
  editingMovieId = id;
  const movie = allMovies.find((m) => m.id === id);

  document.getElementById('editTitle').value = movie.title;
  document.getElementById('editYear').value = movie.year;
  document.getElementById('editGenre').value = movie.genre || '';
  document.getElementById('editMovieOrderBy').value = movie.orderBy || '';
  document.getElementById('editMovieOrderType').value = movie.orderType || '';
  document.getElementById('editPosterPreview').src = movie.poster;
  document.getElementById('editPoster').value = '';
  editPosterData = null;

  // Установка рейтинга.
  setRatingStars('editRatingStars', movie.rating);
  setupRatingStars('editRatingStars');

  const delBtn = document.getElementById('deleteMovieBtn');
  if (delBtn) {
    delBtn.onclick = () => {
      closeModal('editMovieModal');
      openConfirmDeleteMovieModal(id);
    };
  }
  document.getElementById('editMovieModal').style.display = 'block';
}

async function performDeleteMovie(id) {
  const index = allMovies.findIndex((m) => m.id === id);
  if (index === -1) {
    return;
  }

  const [removedMovie] = allMovies.splice(index, 1);
  renderMovies();

  try {
    const token = localStorage.getItem('adminToken') || '';
    const response = await fetch(
      window.Pupsik.apiUrl('/api/admin?action=media-admin'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'delete_item',
          table: 'movies',
          id,
        }),
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload?.error || `Movie delete failed: ${response.status}`
      );
    }

    localStorage.setItem('moviesCache', JSON.stringify(allMovies));
    if (typeof removeUserOrder === 'function' && removedMovie?.orderBy) {
      await removeUserOrder({ userName: removedMovie.orderBy, type: 'movies' });
    }
  } catch (err) {
    console.error('Error deleting movie from Supabase', err);
    allMovies.splice(index, 0, removedMovie);
    localStorage.setItem('moviesCache', JSON.stringify(allMovies));
    renderMovies();
    alert(
      'Не удалось удалить фильм. Возможно, не хватает прав или запись уже удалена. Изменения отменены.'
    );
  }
}

async function performDeleteOrder(id) {
  const index = watchlist.findIndex((o) => o.id === id);
  if (index === -1) {
    return;
  }

  const [removedOrder] = watchlist.splice(index, 1);
  renderWatchlist();

  try {
    const token = localStorage.getItem('adminToken') || '';
    const response = await fetch(
      window.Pupsik.apiUrl('/api/admin?action=media-admin'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'delete_item',
          table: 'Movie_Orders',
          id,
        }),
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload?.error || `Movie order delete failed: ${response.status}`
      );
    }

    if (typeof removeUserOrder === 'function' && removedOrder?.orderBy) {
      await removeUserOrder({ userName: removedOrder.orderBy, type: 'movies' });
    }
  } catch (err) {
    console.error('Error deleting order from Supabase', err);
    watchlist.splice(index, 0, removedOrder);
    renderWatchlist();
    alert(
      'Не удалось удалить заказанный фильм. Возможно, не хватает прав или запись уже удалена. Изменения отменены.'
    );
  }
}

async function performDeleteGameOrder(id) {
  const index = gameOrders.findIndex((g) => g.id === id);
  if (index === -1) {
    return;
  }

  const [removedOrder] = gameOrders.splice(index, 1);
  renderGames();

  try {
    const token = localStorage.getItem('adminToken') || '';
    const response = await fetch(
      window.Pupsik.apiUrl('/api/admin?action=media-admin'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'delete_item',
          table: 'Game_Orders',
          id,
          posterUrl: removedOrder?.poster || '',
        }),
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload?.error || `Game order delete failed: ${response.status}`
      );
    }
  } catch (err) {
    console.error('Error deleting game order from Supabase', err);
    gameOrders.splice(index, 0, removedOrder);
    renderGames();
    alert(
      'Не удалось удалить заказанную игру. Возможно, не хватает прав или запись уже удалена. Изменения отменены.'
    );
  }
}

function markGameDone(id) {
  openRateGameModal(id);
}

function openEditPlayedGameModal(id) {
  editingPlayedGameId = id;
  const game = allPlayedGames.find((g) => g.id === id);
  if (!game) return;
  const preview = document.getElementById('editPlayedGamePosterPreview');
  const overlay = preview.parentElement.nextElementSibling;
  if (overlay && overlay.classList.contains('poster-overlay')) overlay.remove();
  steamGridPoster = null;
  steamGridPosters = [];
  resetRawgPosterCache();
  document.getElementById('editPlayedGameTitle').value = game.title;
  document.getElementById('editPlayedGameYear').value = game.year || '';
  document.getElementById('editPlayedGameGenres').value = game.genres || '';
  document.getElementById('editPlayedGameOrderBy').value = game.orderBy || '';
  document.getElementById('editPlayedGameOrderType').value =
    game.orderType || '';
  preview.src = game.poster;
  document.getElementById('editPlayedGamePoster').value = '';
  setRatingStars('editPlayedGameRatingStars', game.rating);
  setupRatingStars('editPlayedGameRatingStars');
  editPlayedGamePosterData = null;
  const delBtn = document.getElementById('deletePlayedGameBtn');
  if (delBtn) {
    delBtn.onclick = () => {
      closeModal('editPlayedGameModal');
      openConfirmDeletePlayedGameModal(id);
    };
  }
  document.getElementById('editPlayedGameModal').style.display = 'block';
}

function openAddGameModal() {
  document.getElementById('addGameModal').style.display = 'block';
}

function openAddPlayedGameModal() {
  document.getElementById('addPlayedGameModal').style.display = 'block';
  setRatingStars('playedGameRatingStars', null);
  setupRatingStars('playedGameRatingStars');
}

function openConfirmDeleteMovieModal(id) {
  deleteMovieId = id;
  document.getElementById('confirmDeleteMovieModal').style.display = 'block';
}

async function confirmDeleteMovie() {
  if (deleteMovieId !== null) {
    await performDeleteMovie(deleteMovieId);
    const movieDetailsModal = document.getElementById('movieDetailsModal');
    if (
      movieDetailsModal &&
      movieDetailsModal.style.display === 'block' &&
      movieDetailsModal.dataset.recordId === String(deleteMovieId)
    ) {
      closeModal('movieDetailsModal');
    }
    deleteMovieId = null;
  }
  closeModal('confirmDeleteMovieModal');
}

function openConfirmDeletePlayedGameModal(id) {
  deletePlayedGameId = id;
  document.getElementById('confirmDeletePlayedGameModal').style.display =
    'block';
}

async function confirmDeletePlayedGame() {
  if (deletePlayedGameId !== null) {
    await deletePlayedGame(deletePlayedGameId);
    const gameDetailsModal = document.getElementById('gameDetailsModal');
    if (
      gameDetailsModal &&
      gameDetailsModal.style.display === 'block' &&
      gameDetailsModal.dataset.recordId === String(deletePlayedGameId)
    ) {
      closeModal('gameDetailsModal');
    }
    deletePlayedGameId = null;
  }
  closeModal('confirmDeletePlayedGameModal');
}

function openConfirmDeleteOrderModal(id) {
  deleteOrderId = id;
  document.getElementById('confirmDeleteOrderModal').style.display = 'block';
}

async function confirmDeleteOrder() {
  if (deleteOrderId !== null) {
    await performDeleteOrder(deleteOrderId);
    deleteOrderId = null;
  }
  closeModal('confirmDeleteOrderModal');
}

function openConfirmDeleteGameOrderModal(id) {
  deleteGameOrderId = id;
  document.getElementById('confirmDeleteGameOrderModal').style.display =
    'block';
}

async function confirmDeleteGameOrder() {
  if (deleteGameOrderId !== null) {
    await performDeleteGameOrder(deleteGameOrderId);
    deleteGameOrderId = null;
  }
  closeModal('confirmDeleteGameOrderModal');
}

const PLAN_MONTH_NAMES = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

let planCalendarYear = null;

let planCalendarMonth = null;

function renderPlanCalendar(selectedDateStr = '') {
  const grid = document.getElementById('planCalendarGrid');
  const label = document.getElementById('planCalendarMonthLabel');
  const dateInput = document.getElementById('planDateInput');
  if (!grid || planCalendarYear === null || planCalendarMonth === null) return;

  const today = new Date();
  const selectedDate = selectedDateStr ? new Date(selectedDateStr) : null;

  const firstDay = new Date(planCalendarYear, planCalendarMonth, 1);
  const daysInMonth = new Date(
    planCalendarYear,
    planCalendarMonth + 1,
    0
  ).getDate();
  const monthName = PLAN_MONTH_NAMES[planCalendarMonth];
  if (label) {
    label.textContent = `${monthName} ${planCalendarYear}`;
  }

  grid.innerHTML = '';

  const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  weekdays.forEach((name) => {
    const cell = document.createElement('div');
    cell.className = 'plan-calendar-weekday';
    cell.textContent = name;
    grid.appendChild(cell);
  });

  const firstWeekday = (firstDay.getDay() + 6) % 7;
  for (let i = 0; i < firstWeekday; i += 1) {
    const empty = document.createElement('div');
    empty.className = 'plan-calendar-day is-outside';
    grid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'plan-calendar-day';
    cell.textContent = String(day);

    const cellDate = new Date(planCalendarYear, planCalendarMonth, day);
    const cellDateStr = formatDateLocal(cellDate);

    if (
      cellDate.getFullYear() === today.getFullYear() &&
      cellDate.getMonth() === today.getMonth() &&
      cellDate.getDate() === today.getDate()
    ) {
      cell.classList.add('is-today');
    }

    if (selectedDate && formatDateLocal(selectedDate) === cellDateStr) {
      cell.classList.add('is-selected');
    }

    cell.addEventListener('click', () => {
      if (dateInput) {
        dateInput.value = cellDateStr;
      }
      renderPlanCalendar(cellDateStr);
    });

    grid.appendChild(cell);
  }
}

function openPlanDateModal(id, type = 'movie') {
  planDateOrderId = id;
  planDateOrderType = type;
  const isGamePlan = type === 'game';
  const orders = isGamePlan ? gameOrders : watchlist;
  const order = orders.find((o) => o.id === id);
  const titleEl = document.getElementById('planDateMovieTitle');
  if (titleEl) {
    titleEl.textContent = order?.title || '';
  }
  const dateEl = document.getElementById('planDateInput');
  const timeEl = document.getElementById('planTimeInput');

  let dateValue = '';
  let timeValue = '';

  if (order?.planDate) {
    dateValue = formatDateLocal(order.planDate);
    timeValue = formatTimeLocal(order.planDate);
  } else {
    // Auto-calculate from last scheduled item
    const scheduled = orders.filter((o) => o.planDate && o.id !== id);
    if (scheduled.length > 0) {
      // Find max date+time
      const last = scheduled.reduce((prev, current) => {
        return new Date(prev.planDate) > new Date(current.planDate)
          ? prev
          : current;
      });

      if (last && last.length) {
        const lastDate = new Date(last.planDate);
        const duration = parseDuration(last.length);

        // Add duration and 10 min break
        const targetTime = new Date(
          lastDate.getTime() + (duration + 10) * 60000
        );

        // Round up to nearest 5 min
        const m = targetTime.getMinutes();
        const r = m % 5;
        if (r !== 0) {
          targetTime.setMinutes(m + (5 - r));
          targetTime.setSeconds(0);
          targetTime.setMilliseconds(0);
        }

        // Set date to last movie's date (per instructions)
        dateValue = formatDateLocal(last.planDate);

        // Set time to calculated time
        const hh = String(targetTime.getHours()).padStart(2, '0');
        const mm = String(targetTime.getMinutes()).padStart(2, '0');
        timeValue = `${hh}:${mm}`;
      }
    }
  }

  if (!dateValue) {
    dateValue = formatDateLocal(new Date());
  }
  if (!timeValue) {
    const now = new Date();
    const minutes = now.getMinutes();
    const rounded = minutes % 5 === 0 ? minutes : minutes + (5 - (minutes % 5));
    now.setMinutes(rounded);
    now.setSeconds(0);
    now.setMilliseconds(0);
    timeValue = formatTimeLocal(now);
  }

  if (dateEl) {
    dateEl.value = dateValue;
  }
  if (timeEl) {
    timeEl.value = timeValue;
  }
  const baseDate = dateValue ? new Date(dateValue) : new Date();
  planCalendarYear = baseDate.getFullYear();
  planCalendarMonth = baseDate.getMonth();
  renderPlanCalendar(dateValue);
  document.getElementById('planDateModal').style.display = 'block';
}

function switchMode(mode) {
  currentMode = mode;

  // Обновление кнопок
  document
    .querySelectorAll('#addMovieModal .mode-btn')
    .forEach((btn) => btn.classList.remove('active'));
  event.target.classList.add('active');

  // Показ/скрытие форм
  if (mode === 'auto') {
    document.getElementById('autoMode').style.display = 'block';
    document.getElementById('manualMode').style.display = 'none';
  } else {
    document.getElementById('autoMode').style.display = 'none';
    document.getElementById('manualMode').style.display = 'block';
  }
}

function switchWatchlistMode(mode) {
  currentWatchlistMode = mode;

  document
    .querySelectorAll('#addWatchlistModal .mode-btn')
    .forEach((btn) => btn.classList.remove('active'));
  event.target.classList.add('active');

  if (mode === 'auto') {
    document.getElementById('watchAutoMode').style.display = 'block';
    document.getElementById('watchManualMode').style.display = 'none';
  } else {
    document.getElementById('watchAutoMode').style.display = 'none';
    document.getElementById('watchManualMode').style.display = 'block';
  }
}

function switchGameMode(mode) {
  currentGameMode = mode;

  document
    .querySelectorAll('#addGameModal .mode-btn')
    .forEach((btn) => btn.classList.remove('active'));
  event.target.classList.add('active');

  if (mode === 'auto') {
    document.getElementById('gameAutoMode').style.display = 'block';
    document.getElementById('gameManualMode').style.display = 'none';
    document.getElementById('gameAutoModeField').style.display = 'block';
    document.getElementById('gameManualModeField').style.display = 'none';
  } else {
    document.getElementById('gameAutoMode').style.display = 'none';
    document.getElementById('gameManualMode').style.display = 'block';
    document.getElementById('gameAutoModeField').style.display = 'none';
    document.getElementById('gameManualModeField').style.display = 'block';
  }
}

function switchPlayedGameMode(mode) {
  currentPlayedGameMode = mode;

  document
    .querySelectorAll('#addPlayedGameModal .mode-btn')
    .forEach((btn) => btn.classList.remove('active'));
  event.target.classList.add('active');

  if (mode === 'auto') {
    document.getElementById('playedGameAutoMode').style.display = 'block';
    document.getElementById('playedGameManualMode').style.display = 'none';
    document.getElementById('playedGameAutoModeField').style.display = 'block';
    document.getElementById('playedGameManualModeField').style.display = 'none';
  } else {
    document.getElementById('playedGameAutoMode').style.display = 'none';
    document.getElementById('playedGameManualMode').style.display = 'block';
    document.getElementById('playedGameAutoModeField').style.display = 'none';
    document.getElementById('playedGameManualModeField').style.display =
      'block';
  }
}
async function updateGameOrderStreams(gameId, nextValue) {
  const game = gameOrders.find((item) => item.id === gameId);
  if (!game) return;

  const normalizedValue = normalizeGameOrderStreams(nextValue);
  const previousValue = normalizeGameOrderStreams(game.streamsCompleted);
  if (normalizedValue === previousValue) return;

  game.streamsCompleted = normalizedValue;
  renderGames();

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
          id: gameId,
          changes: { streams_completed: normalizedValue },
        }),
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload?.error || `Game order streams update failed: ${response.status}`
      );
    }

    game.streamsCompleted = normalizeGameOrderStreams(
      payload?.row?.streams_completed
    );
    renderGames();
  } catch (err) {
    console.error('Error updating game order streams', err);
    game.streamsCompleted = previousValue;
    renderGames();
    alert(
      'Не удалось сохранить количество проведённых стримов по игре. Попробуйте ещё раз.'
    );
  }
}

async function clearPlanDate(orderId) {
  const order = watchlist.find((o) => o.id === orderId);
  if (!order) return;

  const previousPlan = order.planDate;
  order.planDate = null;
  renderWatchlist();

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
          changes: { plan_date: null },
        }),
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload?.error || `Plan date clear failed: ${response.status}`
      );
    }
  } catch (err) {
    console.error('Error clearing plan date', err);
    order.planDate = previousPlan;
    renderWatchlist();
    alert('Не удалось удалить запланированное время. Попробуйте ещё раз.');
  }
}

async function clearGamePlanDate(gameId) {
  const game = gameOrders.find((g) => g.id === gameId);
  if (!game) return;

  const previousPlan = game.planDate;
  game.planDate = null;
  renderGames();

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
          id: gameId,
          changes: { game_plan_date: null },
        }),
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload?.error || `Game plan date clear failed: ${response.status}`
      );
    }
  } catch (err) {
    console.error('Error clearing game plan date', err);
    game.planDate = previousPlan;
    renderGames();
    alert('Не удалось удалить запланированное время. Попробуйте ещё раз.');
  }
}

async function deletePlayedGame(id) {
  const idx = allPlayedGames.findIndex((g) => g.id === id);
  if (idx === -1) {
    return;
  }

  const [removedGame] = allPlayedGames.splice(idx, 1);
  const hadUserRating = hasRatedGame(id);
  const previousRatingValue = hadUserRating ? ratedGames[id] : null;
  renderPlayedGames();

  try {
    const token = localStorage.getItem('adminToken') || '';
    const response = await fetch(
      window.Pupsik.apiUrl('/api/admin?action=media-admin'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'delete_item',
          table: 'games',
          id,
          posterUrl: removedGame?.poster || '',
        }),
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload?.error || `Played game delete failed: ${response.status}`
      );
    }

    if (hadUserRating) {
      delete ratedGames[id];
      localStorage.setItem('ratedGames', JSON.stringify(ratedGames));
    }
    localStorage.setItem('gamesCache', JSON.stringify(allPlayedGames));
  } catch (err) {
    console.error('Error deleting game', err);
    allPlayedGames.splice(idx, 0, removedGame);
    if (hadUserRating && previousRatingValue !== null) {
      ratedGames[id] = previousRatingValue;
      localStorage.setItem('ratedGames', JSON.stringify(ratedGames));
    }
    localStorage.setItem('gamesCache', JSON.stringify(allPlayedGames));
    renderPlayedGames();
    alert(
      'Не удалось удалить пройденную игру. Возможно, не хватает прав или запись уже удалена. Изменения отменены.'
    );
  }
}

async function setupDetailsPosterEditor(key, record) {
  const config = detailsEditConfigs[key];
  const posterEditor = config?.posterEditor;
  if (!posterEditor || !record) return;

  cleanupDetailsPosterEditor(key, { restorePoster: false });

  const previewEl = document.getElementById(posterEditor.imageId);
  if (!previewEl) return;

  const originalPoster = record[posterEditor.localKey] || previewEl.src || '';
  const state = {
    previewEl,
    originalPoster,
    pendingPoster: originalPoster,
    triggerButton: null,
    overlay: null,
  };
  detailsPosterEditState.set(key, state);

  const title = String(record.title || record.game_title || '').trim();
  const result = await fetchSteamGridPostersForTitle(title);
  if (detailsPosterEditState.get(key) !== state) return;

  const posters = [];
  const seen = new Set();
  const appendPoster = (poster) => {
    const url = poster?.url || poster?.thumb || '';
    const thumb = poster?.thumb || poster?.url || '';
    const dedupeKey = `${url}|${thumb}`;
    if (!url || seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    posters.push({ url, thumb });
  };

  appendPoster({ url: originalPoster, thumb: originalPoster });
  (result?.posters || []).forEach(appendPoster);

  if (posters.length < 2) {
    return;
  }

  state.overlay = createPosterOverlay(previewEl, posters, false, {
    absoluteBelow: true,
    selectedPoster: originalPoster,
    syncGlobalSelection: false,
    onSelect: ({ selectedPoster }) => {
      state.pendingPoster = selectedPoster || state.pendingPoster;
    },
  });

  if (!state.overlay) {
    return;
  }

  state.overlay.style.display = 'none';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'poster-overlay-close';
  closeBtn.setAttribute('aria-label', 'Закрыть выбор постера');
  closeBtn.textContent = '×';
  closeBtn.onclick = () => {
    state.overlay.style.display = 'none';
  };
  state.overlay.appendChild(closeBtn);

  const triggerButton = document.createElement('button');
  triggerButton.type = 'button';
  triggerButton.className = 'btn btn-secondary details-poster-change-btn';
  triggerButton.textContent = 'Заменить постер';
  triggerButton.onclick = () => {
    state.overlay.style.display = 'flex';
  };

  previewEl.parentElement.appendChild(triggerButton);
  state.triggerButton = triggerButton;
}

function buildSelectFromSource(sourceId, value) {
  const select = document.createElement('select');
  select.className = 'details-edit-select';
  const source = document.getElementById(sourceId);
  if (source) {
    Array.from(source.options).forEach((opt) => {
      const cloned = opt.cloneNode(true);
      select.appendChild(cloned);
    });
  } else {
    const fallbackOptions = [
      { value: '', label: 'Не указано' },
      { value: 'Донат', label: 'Донат' },
      { value: 'Шары', label: 'Шары' },
      { value: 'Баллы канала', label: 'Баллы канала' },
      { value: 'Аукцион', label: 'Аукцион' },
      { value: 'Рулетка', label: 'Рулетка' },
    ];
    fallbackOptions.forEach((opt) => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      select.appendChild(option);
    });
  }
  if (value !== undefined && value !== null) {
    select.value = value;
  }
  return select;
}

function createDetailsInput(field, record) {
  const currentValue = record ? record[field.localKey] : '';
  if (field.type === 'select') {
    return buildSelectFromSource(field.selectSourceId, currentValue || '');
  }
  if (field.type === 'textarea') {
    const textarea = document.createElement('textarea');
    textarea.className = 'details-edit-textarea';
    textarea.value = currentValue || '';
    return textarea;
  }
  const input = document.createElement('input');
  input.className = 'details-edit-input';
  if (field.type === 'rating') {
    input.type = 'number';
    input.min = '0';
    input.max = '11';
    input.step = '0.01';
  } else if (field.type === 'date') {
    input.type = 'date';
    input.value = getDetailsDateInputValue(currentValue);
    return input;
  } else if (field.type === 'datetime-local') {
    input.type = 'datetime-local';
    input.value =
      typeof formatDateTimeLocal === 'function'
        ? formatDateTimeLocal(currentValue)
        : '';
    return input;
  } else {
    input.type = field.type === 'number' ? 'number' : 'text';
  }
  input.value = currentValue ?? '';
  return input;
}

function normalizeDetailsValue(field, inputValue, record) {
  if (field.type === 'number') {
    const parsed = parseInt(inputValue, 10);
    if (!Number.isFinite(parsed)) {
      return record ? record[field.localKey] : null;
    }
    return parsed;
  }
  if (field.type === 'rating') {
    if (hasTooManyFractionDigits(String(inputValue ?? ''))) {
      return record ? record[field.localKey] : null;
    }
    const parsed = parseRatingInputValue(String(inputValue ?? ''));
    if (!Number.isFinite(parsed)) {
      return record ? record[field.localKey] : null;
    }
    const clamped = Math.min(11, Math.max(0, parsed));
    return roundRatingToTwoDigits(clamped);
  }
  if (field.type === 'date') {
    const normalized = String(inputValue ?? '').trim();
    if (!normalized) return null;
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized)
      ? normalized
      : record
        ? record[field.localKey]
        : null;
  }
  if (field.type === 'datetime-local') {
    const normalized = String(inputValue ?? '').trim();
    if (!normalized) return null;
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      return record ? record[field.localKey] : null;
    }
    return parsed.toISOString();
  }
  if (typeof inputValue === 'string') {
    return inputValue.trim();
  }
  return inputValue;
}

function setDetailsValueText(valueId, value) {
  const empty = value === null || value === undefined || value === '';
  setMovieDetailsText(valueId, empty ? '' : value, '—');
}

async function enterDetailsEdit(key) {
  const config = detailsEditConfigs[key];
  if (!config) return;
  const modal = document.getElementById(config.modalId);
  if (!modal) return;
  let record = getRecordByType(config.recordType, modal.dataset.recordId);
  if (!record) return;
  const recordId = record.id;
  const catalog = { movie: 'movies', playedGame: 'playedGames', order: 'watchlist', gameOrder: 'gameOrders' }[config.recordType];
  if (record._detailsLoaded === false) {
    try {
      record = await ensureCatalogItemDetails(catalog, recordId);
    } catch (error) {
      console.warn('Unable to load details before editing', error);
      showToastNotification('Не удалось загрузить подробности. Повторите попытку.', 'error');
      return;
    }
    if (!record || modal.style.display === 'none' || String(modal.dataset.recordId) !== String(recordId)) return;
  }

  config.fields.forEach((field) => {
    const span = document.getElementById(field.valueId);
    if (!span || span.dataset.editing === 'true') return;
    span.closest('[hidden]')?.removeAttribute('hidden');
    span.dataset.editing = 'true';
    span.dataset.originalText = span.textContent ?? '';
    const input = createDetailsInput(field, record);
    input.dataset.detailsField = `${key}:${field.key}`;
    span.textContent = '';
    span.appendChild(input);
  });

  if (config.posterEditor) {
    setupDetailsPosterEditor(key, record);
  }

  const actions = modal.querySelector(`[data-details-actions="${key}"]`);
  if (actions) actions.classList.add('is-visible');
  const toggle = modal.querySelector(`[data-details-edit="${key}"]`);
  if (toggle) toggle.setAttribute('aria-pressed', 'true');
}

function exitDetailsEdit(key, { restore = true } = {}) {
  const config = detailsEditConfigs[key];
  if (!config) return;
  const modal = document.getElementById(config.modalId);
  if (!modal) return;

  config.fields.forEach((field) => {
    const span = document.getElementById(field.valueId);
    if (!span || span.dataset.editing !== 'true') return;
    const original = span.dataset.originalText ?? '';
    const current = span.textContent ?? '';
    span.dataset.editing = 'false';
    span.removeAttribute('data-original-text');
    span.innerHTML = '';
    span.textContent = restore ? original : current;
  });

  cleanupDetailsPosterEditor(key, { restorePoster: restore });

  const actions = modal.querySelector(`[data-details-actions="${key}"]`);
  if (actions) actions.classList.remove('is-visible');
  const toggle = modal.querySelector(`[data-details-edit="${key}"]`);
  if (toggle) toggle.setAttribute('aria-pressed', 'false');
}

async function saveDetailsEdit(key) {
  const config = detailsEditConfigs[key];
  if (!config) return;
  const modal = document.getElementById(config.modalId);
  if (!modal) return;
  const record = getRecordByType(config.recordType, modal.dataset.recordId);
  if (!record) return;

  const updates = {};
  const payload = {};
  let hasChanges = false;
  let previousPosterToDelete = null;

  config.fields.forEach((field) => {
    const span = document.getElementById(field.valueId);
    const input = span?.querySelector(
      `[data-details-field="${key}:${field.key}"]`
    );
    if (!input) return;
    const value = normalizeDetailsValue(field, input.value, record);
    updates[field.key] = value;
    const current = record[field.localKey];
    if (String(current ?? '') !== String(value ?? '')) {
      hasChanges = true;
    }
    if (field.dbKey) {
      if (field.key === 'orderType' || field.key === 'orderBy') {
        payload[field.dbKey] = value ? value : null;
      } else {
        payload[field.dbKey] = value;
      }
    }
  });

  if (updates.playtimeNormally !== undefined) {
    const minutes = Number(updates.playtimeNormally);
    const hours =
      Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes / 60) : null;
    updates.playtime = hours;
    payload.playtime = hours;
    if (String(record.playtime ?? '') !== String(hours ?? '')) {
      hasChanges = true;
    }
  }

  if (config.posterEditor) {
    const state = detailsPosterEditState.get(key);
    const currentPoster = record[config.posterEditor.localKey] || '';
    const pendingPoster = state?.pendingPoster || currentPoster;
    if (pendingPoster !== currentPoster) {
      hasChanges = true;
    }
  }

  if (!hasChanges) {
    exitDetailsEdit(key, { restore: true });
    return;
  }

  try {
    if (config.posterEditor) {
      const state = detailsPosterEditState.get(key);
      const localKey = config.posterEditor.localKey;
      const dbKey = config.posterEditor.dbKey;
      const currentPoster = record[localKey] || '';
      const pendingPoster = state?.pendingPoster || currentPoster;
      if (pendingPoster !== currentPoster) {
        const uploadedPoster = await uploadGamePosterToStorage({
          poster: pendingPoster,
          title: record.title || '',
          folder: config.posterEditor.folder,
        });
        updates[localKey] = uploadedPoster;
        payload[dbKey] = uploadedPoster;
        previousPosterToDelete =
          currentPoster &&
          currentPoster !== uploadedPoster &&
          getGamePosterStoragePath(currentPoster)
            ? currentPoster
            : null;
      }
    }

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
          table: config.table,
          id: record.id,
          changes: payload,
        }),
      }
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        result?.error || `Details update failed: ${response.status}`
      );
    }

    config.fields.forEach((field) => {
      if (updates[field.key] !== undefined) {
        if (field.key === 'orderType' || field.key === 'orderBy') {
          record[field.localKey] = updates[field.key] || '';
        } else if (field.key === 'watchSource') {
          record[field.localKey] = normalizeWatchSource(updates[field.key]);
        } else {
          record[field.localKey] = updates[field.key];
        }
      }
    });
    if (updates.playtime !== undefined) {
      record.playtime = updates.playtime;
    }

    if (
      config.posterEditor &&
      updates[config.posterEditor.localKey] !== undefined
    ) {
      record[config.posterEditor.localKey] =
        updates[config.posterEditor.localKey];
      const posterEl = document.getElementById(config.posterEditor.imageId);
      if (posterEl) {
        posterEl.src =
          record[config.posterEditor.localKey] || DEFAULT_POSTER_PLACEHOLDER;
      }
    }

    if (config.recordType === 'movie') {
      localStorage.setItem('moviesCache', JSON.stringify(allMovies));
      renderMovies();
    } else if (config.recordType === 'playedGame') {
      localStorage.setItem('gamesCache', JSON.stringify(allPlayedGames));
      renderPlayedGames();
    } else if (config.recordType === 'order') {
      renderWatchlist();
    } else if (config.recordType === 'gameOrder') {
      renderGames();
    }

    config.fields.forEach((field) => {
      const value = updates[field.key];
      setDetailsValueText(
        field.valueId,
        formatDetailsDisplayValue(field, value)
      );
    });

    if (previousPosterToDelete) {
      await deleteGamePosterFromStorage(previousPosterToDelete);
    }

    exitDetailsEdit(key, { restore: false });
    if (key === 'gameDetails-about') {
      renderGameDetailsModal(record, modal);
    } else if (key === 'gameOrderDetails-about') {
      openGameOrderDetailsModal(record.id);
    }
  } catch (err) {
    console.error('Failed to save details edit', err);
    alert('Не удалось сохранить изменения. Попробуйте ещё раз.');
  }
}

function initDetailsInlineEdits() {
  if (detailsInlineEditsBound) return;
  detailsInlineEditsBound = true;

  document.addEventListener('click', (event) => {
    const editBtn = event.target.closest('[data-details-edit]');
    if (editBtn) {
      const key = editBtn.dataset.detailsEdit;
      const config = detailsEditConfigs[key];
      if (!config) return;
      const modal = document.getElementById(config.modalId);
      const isEditing = modal
        ?.querySelector(`[data-details-actions="${key}"]`)
        ?.classList.contains('is-visible');
      if (isEditing) {
        exitDetailsEdit(key, { restore: true });
      } else {
        enterDetailsEdit(key);
      }
      return;
    }

    const saveBtn = event.target.closest('[data-details-save]');
    if (saveBtn) {
      const key = saveBtn.dataset.detailsSave;
      saveDetailsEdit(key);
    }
  });
}

function initAdminFeatures() {
  settingsPanel = document.getElementById('settingsPanel');
  settingsToggleButton = document.getElementById('settingsToggleButton');
  settingsPanelCloseButton = document.getElementById(
    'settingsPanelCloseButton'
  );
  aiModelSelect = document.getElementById('aiModelSelect');
  aiModelStatus = document.getElementById('aiModelStatusLabel');
  if (loadedSettingsRows) {
    const selected = loadedSettingsRows.find((row) => row?.selected_ai_model);
    renderAiModelOptions(
      loadedSettingsRows,
      selected?.selected_ai_model || null
    );
  }
  kpApiSelect = document.getElementById('kpApiSelect');
  kpApiStatus = document.getElementById('kpApiStatus');
  refreshKpQuotaBtn = document.getElementById('refreshKpQuotaBtn');
  kpQuotaInfo = document.getElementById('kpQuotaInfo');
  kpDailyQuota = document.getElementById('kpDailyQuota');

  victoryVolumeSlider = document.getElementById('victoryVolumeSlider');
  victoryVolumeValue = document.getElementById('victoryVolumeValue');
  loseVolumeSlider = document.getElementById('loseVolumeSlider');
  loseVolumeValue = document.getElementById('loseVolumeValue');
  rouletteSpinVolumeSlider = document.getElementById(
    'rouletteSpinVolumeSlider'
  );
  rouletteSpinVolumeValue = document.getElementById('rouletteSpinVolumeValue');

  if (settingsToggleButton && settingsPanel) {
    settingsToggleButton.addEventListener('click', () => {
      void runFeatureAction('admin', 'toggleSettingsPanel', []);
    });
    settingsToggleButton.setAttribute('aria-expanded', 'false');
  }
  if (settingsPanelCloseButton) {
    settingsPanelCloseButton.addEventListener('click', closeSettingsPanel);
  }
  if (aiModelSelect) {
    aiModelSelect.addEventListener('change', handleAiModelChange);
  }
  document
    .getElementById('addAiModelForm')
    ?.addEventListener('submit', (event) => {
      event.preventDefault();
      const ai_model_name = document
        .getElementById('aiModelNameInput')
        .value.trim();
      const ai_model = document.getElementById('aiModelInput').value.trim();
      if (!ai_model_name || !ai_model) {
        setAiModelStatus('Заполните название и идентификатор модели.');
        return;
      }
      void manageAiModel('POST', { ai_model_name, ai_model });
    });
  document.getElementById('deleteAiModelBtn')?.addEventListener('click', () => {
    if (aiModelSelect.value)
      void manageAiModel('DELETE', { ai_model: aiModelSelect.value });
  });
  if (kpApiSelect) {
    kpApiSelect.addEventListener('change', handleKpApiChange);
  }
  if (refreshKpQuotaBtn) {
    refreshKpQuotaBtn.addEventListener('click', () => refreshKpQuota());
  }

  applyVictoryVolume(victoryVolume);
  if (victoryVolumeSlider) {
    victoryVolumeSlider.addEventListener('input', handleVictoryVolumeInput);
    victoryVolumeSlider.addEventListener('change', handleVictoryVolumeChange);
  }
  applyLoseVolume(loseVolume);
  if (loseVolumeSlider) {
    loseVolumeSlider.addEventListener('input', handleLoseVolumeInput);
    loseVolumeSlider.addEventListener('change', handleLoseVolumeChange);
  }
  applyRouletteSpinVolume(rouletteSpinVolume);
  if (rouletteSpinVolumeSlider) {
    rouletteSpinVolumeSlider.addEventListener(
      'input',
      handleRouletteSpinVolumeInput
    );
    rouletteSpinVolumeSlider.addEventListener(
      'change',
      handleRouletteSpinVolumeChange
    );
  }

  initDetailsInlineEdits();
  initUserPickers();
  setupRatingStars();
  initFileUpload();
  const planPrev = document.getElementById('planCalendarPrev');
  const planNext = document.getElementById('planCalendarNext');
  if (planPrev && planNext) {
    planPrev.addEventListener('click', () => {
      if (typeof planCalendarMonth !== 'number') return;
      if (planCalendarMonth === 0) {
        planCalendarMonth = 11;
        planCalendarYear -= 1;
      } else {
        planCalendarMonth -= 1;
      }
      const current = document.getElementById('planDateInput')?.value || '';
      renderPlanCalendar(current);
    });

    planNext.addEventListener('click', () => {
      if (typeof planCalendarMonth !== 'number') return;
      if (planCalendarMonth === 11) {
        planCalendarMonth = 0;
        planCalendarYear += 1;
      } else {
        planCalendarMonth += 1;
      }
      const current = document.getElementById('planDateInput')?.value || '';
      renderPlanCalendar(current);
    });
  }

  const adminForm = document.getElementById('adminLoginForm');
  if (adminForm)
    adminForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (isAdmin) {
        logoutAdmin();
      } else {
        const pw = document.getElementById('adminPassword').value;
        const result = await verifyAdminPassword(pw);
        if (result.ok && result.token) {
          const token = result.token;
          updateAdminSession(token, result.expiresAt);
          try {
            const env = await loadEnv({ token });
            if (env && env.isAdmin) {
              updateAdminSession(token, result.expiresAt);
              isAdmin = true;
              showAdminControls();
              TMDB_ENABLED = Boolean(env.TMDB_ENABLED);
              applyKpApiSelection(selectedKpApiValue);
              if (settingsPanel?.classList.contains('open')) {
                await ensureCatalogLoaded('settings');
              }
              closeModal('adminModal');
            } else {
              alert(
                'Не удалось подтвердить сессию администратора. Попробуйте ещё раз.'
              );
            }
          } catch (err) {
            console.error('Failed to load environment for admin session', err);
            alert(
              'Не удалось получить настройки сервера. Попробуйте ещё раз позже.'
            );
          }
        } else {
          alert('Неверный пароль');
        }
      }
    });
  const twitchConnectBtn = document.getElementById('adminTwitchConnectBtn');
  if (twitchConnectBtn) {
    twitchConnectBtn.addEventListener('click', startTwitchAdminConnect);
  }
  const searchBtn = document.getElementById('autoSearchBtn');
  const resultsContainer = document.getElementById('autoResults');
  const titleInput = document.getElementById('autoTitle');
  if (searchBtn) searchBtn.addEventListener('click', handleKPSearch);
  if (titleInput)
    titleInput.addEventListener('input', () => {
      const q = titleInput.value.trim();
      syncRouletteAutofillState();
      if (q) {
        showSearchLoading('autoResultsContainer', 'autoResults');
      } else {
        document.getElementById('autoResultsContainer').style.display = 'none';
        if (rouletteLastWinner || rouletteAutofillActive) {
          clearRouletteLastWinner({ updateInput: false });
        }
      }
      debouncedKPSearch(q);
    });
  if (resultsContainer)
    resultsContainer.addEventListener('click', function (e) {
      const option = e.target.closest('.autocomplete-option');
      if (!option) return;
      const idx = parseInt(option.dataset.index, 10);
      selectedKPMovie = kpResults[idx] || null;
      if (selectedKPMovie) {
        titleInput.value =
          selectedKPMovie.nameRu || selectedKPMovie.nameEn || '';
      }
      syncRouletteAutofillState();
      showKPPreview();
      document.getElementById('autoResultsContainer').style.display = 'none';
    });

  if (titleInput) {
    titleInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Backspace' && event.key !== 'Delete') {
        return;
      }

      const currentValue = titleInput.value;
      const selectionStart = titleInput.selectionStart ?? currentValue.length;
      const selectionEnd = titleInput.selectionEnd ?? selectionStart;

      let resultingValue = currentValue;

      if (selectionStart !== selectionEnd) {
        resultingValue =
          currentValue.slice(0, selectionStart) +
          currentValue.slice(selectionEnd);
      } else if (event.key === 'Backspace' && selectionStart > 0) {
        resultingValue =
          currentValue.slice(0, selectionStart - 1) +
          currentValue.slice(selectionEnd);
      } else if (
        event.key === 'Delete' &&
        selectionStart < currentValue.length
      ) {
        resultingValue =
          currentValue.slice(0, selectionStart) +
          currentValue.slice(selectionEnd + 1);
      }

      Promise.resolve().then(() => {
        if (!rouletteLastWinner) {
          return;
        }

        const trimmed = (resultingValue || '').trim();
        if (!trimmed || trimmed !== rouletteLastWinner) {
          clearRouletteLastWinner({ updateInput: false });
        }
      });
    });
  }

  const watchSearchBtn = document.getElementById('watchAutoSearchBtn');
  const watchResultsContainer = document.getElementById('watchAutoResults');
  const watchTitleInput = document.getElementById('watchAutoTitle');
  if (watchSearchBtn)
    watchSearchBtn.addEventListener('click', handleWatchlistSearch);
  if (watchTitleInput)
    watchTitleInput.addEventListener('input', () => {
      const q = watchTitleInput.value.trim();
      if (q) {
        showSearchLoading('watchAutoResultsContainer', 'watchAutoResults');
      } else {
        document.getElementById('watchAutoResultsContainer').style.display =
          'none';
      }
      debouncedWatchlistKPSearch(q);
    });
  if (watchResultsContainer)
    watchResultsContainer.addEventListener('click', function (e) {
      const option = e.target.closest('.autocomplete-option');
      if (!option) return;
      const idx = parseInt(option.dataset.index, 10);
      selectedKPOrderMovie = kpOrderResults[idx] || null;
      if (selectedKPOrderMovie) {
        watchTitleInput.value =
          selectedKPOrderMovie.nameRu || selectedKPOrderMovie.nameEn || '';
      }
      showWatchlistKPPreview();
      document.getElementById('watchAutoResultsContainer').style.display =
        'none';
    });

  const gameSearchBtn = document.getElementById('gameAutoSearchBtn');
  const gameResultsContainer = document.getElementById('gameAutoResults');
  const gameTitleInput = document.getElementById('gameAutoTitle');
  if (gameSearchBtn) gameSearchBtn.addEventListener('click', handleGameSearch);
  if (gameTitleInput)
    gameTitleInput.addEventListener('input', () => {
      const q = gameTitleInput.value.trim();
      if (q) {
        showSearchLoading('gameAutoResultsContainer', 'gameAutoResults');
      } else {
        document.getElementById('gameAutoResultsContainer').style.display =
          'none';
      }
      debouncedRAWGSearch(q);
    });
  if (gameResultsContainer)
    gameResultsContainer.addEventListener('click', async function (e) {
      const option = e.target.closest('.autocomplete-option');
      if (!option) return;
      const idx = parseInt(option.dataset.index, 10);
      selectedRAWGGame = rawgResults[idx] || null;
      const gameResultsWrap = document.getElementById(
        'gameAutoResultsContainer'
      );
      if (gameResultsWrap) gameResultsWrap.style.display = 'none';
      if (selectedRAWGGame) {
        showSelectionLoading('gameAutoPreview', 'Добавляем игру...');
      }
      if (selectedRAWGGame) {
        gameTitleInput.value = selectedRAWGGame.name || '';
        selectedRAWGGame = await hydrateSelectedIgdbGame(selectedRAWGGame);
        await fetchSteamGridPosters(selectedRAWGGame.name);
      }
      showRAWGPreview();
      const preview = document.getElementById('gameAutoPreview');
      if (preview) preview.removeAttribute('aria-busy');
    });

  const playedSearchBtn = document.getElementById('playedGameAutoSearchBtn');
  const playedResultsContainer = document.getElementById(
    'playedGameAutoResults'
  );
  const playedTitleInput = document.getElementById('playedGameAutoTitle');
  if (playedSearchBtn)
    playedSearchBtn.addEventListener('click', handlePlayedGameSearch);
  if (playedTitleInput)
    playedTitleInput.addEventListener('input', () => {
      const q = playedTitleInput.value.trim();
      if (q) {
        showSearchLoading(
          'playedGameAutoResultsContainer',
          'playedGameAutoResults'
        );
      } else {
        document.getElementById(
          'playedGameAutoResultsContainer'
        ).style.display = 'none';
      }
      debouncedPlayedRAWGSearch(q);
    });
  if (playedResultsContainer)
    playedResultsContainer.addEventListener('click', async function (e) {
      const option = e.target.closest('.autocomplete-option');
      if (!option) return;
      const idx = parseInt(option.dataset.index, 10);
      selectedRAWGGame = rawgResults[idx] || null;
      const playedResultsWrap = document.getElementById(
        'playedGameAutoResultsContainer'
      );
      if (playedResultsWrap) playedResultsWrap.style.display = 'none';
      if (selectedRAWGGame) {
        showSelectionLoading('playedGameAutoPreview', 'Добавляем игру...');
      }
      if (selectedRAWGGame) {
        playedTitleInput.value = selectedRAWGGame.name || '';
        selectedRAWGGame = await hydrateSelectedIgdbGame(selectedRAWGGame);
        await fetchSteamGridPosters(selectedRAWGGame.name);
      }
      showPlayedGamePreview();
      const preview = document.getElementById('playedGameAutoPreview');
      if (preview) preview.removeAttribute('aria-busy');
    });

  const preview = document.getElementById('editPosterPreview');
  const input = document.getElementById('editPoster');
  if (preview && input) {
    preview.addEventListener('click', () => input.click());
    input.addEventListener('change', async function () {
      if (this.files && this.files[0]) {
        try {
          editPosterData = await readFileAsDataURL(this.files[0]);
          preview.src = editPosterData;
        } catch (err) {
          console.error('Error reading file', err);
        }
      }
    });
  }

  const playedPreview = document.getElementById('editPlayedGamePosterPreview');
  const playedInput = document.getElementById('editPlayedGamePoster');
  if (playedPreview && playedInput) {
    playedPreview.addEventListener('click', () => playedInput.click());
    playedInput.addEventListener('change', async function () {
      if (this.files && this.files[0]) {
        try {
          editPlayedGamePosterData = await readFileAsDataURL(this.files[0]);
          playedPreview.src = editPlayedGamePosterData;
        } catch (err) {
          console.error('Error reading file', err);
        }
      }
    });
  }

  const playedEditBtn = document.getElementById('editPlayedGamePosterBtn');
  if (playedEditBtn && playedPreview) {
    playedEditBtn.addEventListener('click', async () => {
      const title = document.getElementById('editPlayedGameTitle').value.trim();
      if (!title) {
        alert('Введите название игры');
        return;
      }
      await fetchSteamGridPosters(title);
      if (!steamGridPoster) {
        alert('Постеры не найдены');
        return;
      }
      const overlay = playedPreview.parentElement.nextElementSibling;
      if (overlay && overlay.classList.contains('poster-overlay'))
        overlay.remove();
      playedPreview.src = steamGridPoster;
      editPlayedGamePosterData = steamGridPoster;
      try {
        const optimized =
          await readRemoteImageAsOptimizedDataURL(steamGridPoster);
        if (optimized) {
          editPlayedGamePosterData = optimized;
          if (playedPreview.src === steamGridPoster) {
            playedPreview.src = optimized;
          }
        }
      } catch (err) {
        console.error('Error optimizing SteamGrid poster', err);
      }
      createPosterOverlay(playedPreview, steamGridPosters, true);
    });
  }
}

function buildGamePosterFileName(title) {
  const safeTitle = (title || 'game')
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${safeTitle || 'game'}-${suffix}`;
}

let rawgOptimizedPoster = null;

let rawgOptimizedPosterSource = null;

let rawgOptimizedPosterPromise = null;

const POSTER_MAX_WIDTH = 440;

const POSTER_MAX_HEIGHT = 660;

const POSTER_OUTPUT_QUALITY = 0.78;

const SUPPORTS_WEBP = (() => {
  try {
    const canvas = document.createElement('canvas');
    return canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
})();

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function optimizeImageBlobToDataURL(blob) {
  const img = new Image();
  const objectUrl = URL.createObjectURL(blob);

  await new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = (err) => reject(err);
    img.src = objectUrl;
  });

  URL.revokeObjectURL(objectUrl);

  const srcWidth = img.naturalWidth || img.width;
  const srcHeight = img.naturalHeight || img.height;

  if (!srcWidth || !srcHeight) {
    return fileToDataUrl(blob);
  }

  const scale = Math.min(
    POSTER_MAX_WIDTH / srcWidth,
    POSTER_MAX_HEIGHT / srcHeight,
    1
  );
  const targetWidth = Math.round(srcWidth * scale);
  const targetHeight = Math.round(srcHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) {
    return fileToDataUrl(blob);
  }

  if (!SUPPORTS_WEBP) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
  }

  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  const outputType = SUPPORTS_WEBP ? 'image/webp' : 'image/jpeg';
  const blobResult = await new Promise((resolve) =>
    canvas.toBlob(resolve, outputType, POSTER_OUTPUT_QUALITY)
  );

  if (!blobResult) {
    return canvas.toDataURL(outputType, POSTER_OUTPUT_QUALITY);
  }

  return await fileToDataUrl(blobResult);
}

async function readFileAsDataURL(file) {
  if (!file || !file.type || !file.type.startsWith('image/')) {
    return fileToDataUrl(file);
  }

  try {
    return await optimizeImageBlobToDataURL(file);
  } catch (err) {
    return fileToDataUrl(file);
  }
}

async function readRemoteImageAsOptimizedDataURL(url) {
  if (!url || typeof url !== 'string') {
    return url;
  }
  if (url.startsWith('data:')) {
    return url;
  }
  try {
    const fetchUrl = proxyPosterUrl(url);
    const res = await fetch(fetchUrl, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) return url;
    const blob = await res.blob();
    if (!blob.type || !blob.type.startsWith('image/')) return url;
    return await optimizeImageBlobToDataURL(blob);
  } catch (err) {
    return url;
  }
}

function resetRawgPosterCache() {
  rawgOptimizedPoster = null;
  rawgOptimizedPosterSource = null;
  rawgOptimizedPosterPromise = null;
}

function ensureRawgOptimizedPoster(url, onUpdate) {
  if (!url) {
    resetRawgPosterCache();
    return null;
  }
  if (rawgOptimizedPosterSource === url && rawgOptimizedPoster) {
    return rawgOptimizedPoster;
  }
  if (rawgOptimizedPosterPromise && rawgOptimizedPosterSource === url) {
    return rawgOptimizedPosterPromise;
  }

  rawgOptimizedPosterSource = url;
  rawgOptimizedPoster = null;

  rawgOptimizedPosterPromise = readRemoteImageAsOptimizedDataURL(url)
    .then((optimized) => {
      if (rawgOptimizedPosterSource !== url) return null;
      rawgOptimizedPoster = optimized || url;
      rawgOptimizedPosterPromise = null;
      if (typeof onUpdate === 'function') onUpdate(rawgOptimizedPoster);
      return rawgOptimizedPoster;
    })
    .catch(() => {
      if (rawgOptimizedPosterSource !== url) return null;
      rawgOptimizedPoster = url;
      rawgOptimizedPosterPromise = null;
      if (typeof onUpdate === 'function') onUpdate(rawgOptimizedPoster);
      return url;
    });

  return rawgOptimizedPosterPromise;
}

function getRawgOptimizedPosterFor(url) {
  if (!url) return null;
  if (rawgOptimizedPosterSource === url && rawgOptimizedPoster) {
    return rawgOptimizedPoster;
  }
  return null;
}

async function fetchSteamGridPostersForTitle(title) {
  if (!title) {
    return {
      selectedPoster: null,
      posters: [],
    };
  }
  try {
    const res = await fetch(
      window.Pupsik.apiUrl(
        `/api/external?provider=steamgriddb&search=${encodeURIComponent(title)}`
      )
    );
    if (!res.ok) {
      return {
        selectedPoster: null,
        posters: [],
      };
    }
    const data = await res.json();
    const posters = Array.isArray(data.posters) ? data.posters : [];
    const normalizedPosters = posters
      .map((g) => {
        if (typeof g === 'string') {
          const proxied = proxyPosterUrl(g);
          return { url: proxied, thumb: proxied };
        }
        if (!g) return null;
        const url = g.url || g.thumb || null;
        const thumb = g.thumb || g.url || url;
        if (!url) return null;
        return {
          url: proxyPosterUrl(url),
          thumb: proxyPosterUrl(thumb),
        };
      })
      .filter(Boolean);
    return {
      selectedPoster:
        normalizedPosters[0]?.thumb || normalizedPosters[0]?.url || null,
      posters: normalizedPosters,
    };
  } catch (err) {
    console.error('SteamGridDB fetch error', err);
    return {
      selectedPoster: null,
      posters: [],
    };
  }
}

async function fetchSteamGridPosters(title) {
  steamGridPoster = null;
  steamGridPosters = [];
  const result = await fetchSteamGridPostersForTitle(title);
  steamGridPoster = result.selectedPoster;
  steamGridPosters = result.posters;
}

function createPosterOverlay(
  targetImg,
  posters,
  placeBelow = false,
  options = {}
) {
  if (!targetImg || !Array.isArray(posters) || posters.length < 2) return;
  const overlay = document.createElement('div');
  overlay.className = 'poster-overlay' + (placeBelow ? ' below' : '');
  if (options.absoluteBelow) {
    overlay.classList.add('poster-overlay--absolute-below');
  }

  const prev = document.createElement('div');
  prev.className = 'overlay-arrow prev';
  prev.textContent = '‹'; // ‹

  const next = document.createElement('div');
  next.className = 'overlay-arrow next';
  next.textContent = '›'; // ›

  const container = document.createElement('div');
  container.className = 'thumb-container';

  const maxVisible = 4;
  let startIdx = 0;
  let selectedPoster = options.selectedPoster || targetImg.src;
  const onSelect =
    typeof options.onSelect === 'function' ? options.onSelect : null;
  const syncGlobalSelection = options.syncGlobalSelection !== false;

  function render() {
    container.innerHTML = '';
    const endIdx = Math.min(startIdx + maxVisible, posters.length);
    for (let i = startIdx; i < endIdx; i++) {
      const entry = posters[i];
      const poster =
        typeof entry === 'string'
          ? { url: entry, thumb: entry }
          : {
              url: entry?.url || entry?.thumb,
              thumb: entry?.thumb || entry?.url || null,
            };
      if (!poster.url) continue;
      const wrapper = document.createElement('div');
      wrapper.className = 'thumb-wrapper';
      const thumbUrl = poster.thumb || poster.url;
      if (selectedPoster === thumbUrl) {
        wrapper.classList.add('active');
      }

      const spinner = document.createElement('div');
      spinner.className = 'loading-spinner';
      wrapper.appendChild(spinner);

      const img = document.createElement('img');
      img.className = 'poster-thumb';
      if (selectedPoster === thumbUrl) {
        img.classList.add('selected');
      }
      img.style.display = 'none';
      img.onload = () => {
        spinner.remove();
        img.style.display = '';
      };
      img.onerror = () => {
        spinner.remove();
      };
      img.src = thumbUrl;
      img.onclick = () => {
        if (syncGlobalSelection) {
          steamGridPoster = thumbUrl;
        }
        targetImg.src = thumbUrl;
        selectedPoster = thumbUrl;
        if (!onSelect && targetImg.id === 'editPlayedGamePosterPreview') {
          editPlayedGamePosterData = thumbUrl;
        }
        if (!onSelect && targetImg.id === 'editPlayedGamePosterPreview') {
          const selection = thumbUrl;
          readRemoteImageAsOptimizedDataURL(selection)
            .then((optimized) => {
              if (!optimized || selection !== selectedPoster) return;
              if (targetImg.id === 'editPlayedGamePosterPreview') {
                editPlayedGamePosterData = optimized;
              }
              if (targetImg.src === selection) {
                targetImg.src = optimized;
              }
            })
            .catch((err) => {
              console.error('Error optimizing SteamGrid poster', err);
            });
        }
        if (onSelect) {
          onSelect({
            selectedPoster: thumbUrl,
            poster,
            targetImg,
          });
        }
        render();
      };
      wrapper.appendChild(img);
      container.appendChild(wrapper);
    }

    prev.style.visibility = startIdx > 0 ? 'visible' : 'hidden';
    next.style.visibility = endIdx < posters.length ? 'visible' : 'hidden';
  }

  prev.onclick = () => {
    if (startIdx > 0) {
      startIdx = Math.max(0, startIdx - maxVisible);
      render();
    }
  };

  next.onclick = () => {
    if (startIdx + maxVisible < posters.length) {
      startIdx += maxVisible;
      render();
    }
  };

  overlay.appendChild(prev);
  overlay.appendChild(container);
  overlay.appendChild(next);

  if (options.absoluteBelow) {
    const parent = targetImg.parentElement;
    parent.style.position = 'relative';
    parent.appendChild(overlay);
  } else if (placeBelow) {
    const parent = targetImg.parentElement;
    parent.insertAdjacentElement('afterend', overlay);
  } else {
    targetImg.parentElement.style.position = 'relative';
    targetImg.parentElement.appendChild(overlay);
  }

  render();
  return overlay;
}

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
    const preview = wrapper.parentElement.querySelector('.poster-preview');

    fileInput.addEventListener('change', async function (e) {
      const file = e.target.files[0];
      if (file) {
        await showSelectedFile(file, label, fileName, removeBtn, preview);
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

    label.addEventListener('drop', async function (e) {
      e.preventDefault();
      label.classList.remove('drag-over');

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('image/')) {
          const dt = new DataTransfer();
          dt.items.add(file);
          fileInput.files = dt.files;
          await showSelectedFile(file, label, fileName, removeBtn, preview);
        }
      }
    });

    removeBtn.addEventListener('click', function () {
      clearFile(fileInput, label, fileName, removeBtn, preview);
    });
  });
}

async function showSelectedFile(file, label, fileName, removeBtn, preview) {
  label.classList.add('has-file');
  label.querySelector('.main-text').textContent = 'Файл выбран';
  label.querySelector('.sub-text').textContent = 'Нажмите для замены';

  fileName.textContent = file.name;
  fileName.style.display = 'block';
  removeBtn.style.display = 'flex';

  if (preview) {
    try {
      const dataUrl = await readFileAsDataURL(file);
      preview.src = dataUrl;
      preview.style.display = 'block';
    } catch (err) {
      console.error('Error reading file', err);
    }
  }
}

function clearFile(fileInput, label, fileName, removeBtn, preview) {
  fileInput.value = '';
  label.classList.remove('has-file');
  label.querySelector('.main-text').textContent = 'Выберите файл изображения';
  label.querySelector('.sub-text').textContent = 'или перетащите его сюда';

  fileName.style.display = 'none';
  removeBtn.style.display = 'none';

  if (preview) {
    preview.src = 'images/placeholder-poster.webp';
    preview.style.display = 'none';
  }
}
