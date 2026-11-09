// Loaded before the other scripts so startup failures can also be reported.
const toastHistory = new Map();
const activeToasts = [];

function showToastNotification(message, type = 'success', options = {}) {
  if (!message) return;
  if (!document.body) {
    document.addEventListener(
      'DOMContentLoaded',
      () => showToastNotification(message, type, options),
      { once: true }
    );
    return;
  }
  const normalizedType = ['success', 'warning', 'error'].includes(type)
    ? type
    : 'success';
  const key = options.key || `${normalizedType}:${message}`;
  const now = Date.now();
  const cooldown =
    options.cooldown ?? (normalizedType === 'success' ? 2000 : 30000);
  for (const [entry, time] of toastHistory) {
    if (now - time > 60000) toastHistory.delete(entry);
  }
  if (toastHistory.has(key) && now - toastHistory.get(key) < cooldown) return;
  if (activeToasts.some((entry) => entry.key === key)) return;
  if (toastHistory.size >= 100)
    toastHistory.delete(toastHistory.keys().next().value);
  toastHistory.set(key, now);

  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-relevant', 'additions');
    document.body.appendChild(container);
  }
  // Never queue stale errors to appear minutes later.
  if (activeToasts.length >= 2) {
    (
      activeToasts.find((entry) => entry.type === 'success') || activeToasts[0]
    ).dismiss();
  }
  const toast = document.createElement('div');
  toast.className = `toast-notification toast-${normalizedType}`;
  const label = document.createElement('span');
  label.textContent = String(message);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast-close';
  close.setAttribute('aria-label', 'Закрыть уведомление');
  close.textContent = '×';
  toast.append(label, close);
  container.appendChild(toast);
  let timer;
  let removed = false;
  const entry = {
    key,
    type: normalizedType,
    dismiss() {
      if (removed) return;
      removed = true;
      clearTimeout(timer);
      activeToasts.splice(activeToasts.indexOf(entry), 1);
      toast.remove();
      if (!container.hasChildNodes()) container.remove();
    },
  };
  activeToasts.push(entry);
  close.addEventListener('click', entry.dismiss);
  requestAnimationFrame(() => {
    if (!removed) toast.classList.add('visible');
  });
  timer = setTimeout(
    entry.dismiss,
    options.duration ?? (normalizedType === 'success' ? 2600 : 8000)
  );
}

globalThis.PupsikProblems = (() => {
  const critical = new Map();
  let banner;
  let bannerObserver;

  function describe(error, fallback = 'Повторите попытку позже.') {
    if (navigator.onLine === false)
      return 'Нет подключения к интернету. Проверьте сеть и повторите попытку.';
    const name = error?.name || '';
    const message = String(error?.message || '');
    const status = Number(
      error?.status ||
        error?.statusCode ||
        message.match(
          /(?:HTTP|status|failed:|код(?: ответа)?)\s*[:=]?\s*(\d{3})/i
        )?.[1]
    );
    if (name === 'TimeoutError' || /timeout|timed out/i.test(message))
      return 'Сервер не ответил вовремя. Повторите попытку позже.';
    if (status === 401)
      return 'Сессия истекла или требуется вход. Войдите заново.';
    if (status === 403 || error?.code === '42501')
      return 'Сервер отказал в доступе. Обратитесь к администратору сайта.';
    if (status === 404 || error?.code === 'PGRST116')
      return 'Запрошенные данные не найдены. Обновите страницу.';
    if (status === 409 || error?.code === '23505')
      return 'Данные уже существуют или изменились. Обновите список перед повторной попыткой.';
    if (status === 413)
      return 'Файл слишком большой. Выберите файл меньшего размера.';
    if (status === 400 || status === 422)
      return 'Сервер не принял данные. Проверьте заполненные поля и повторите действие.';
    if (status === 415)
      return 'Этот формат файла не поддерживается. Выберите другой файл.';
    if (status === 429)
      return 'Слишком много запросов или исчерпан лимит сервиса. Подождите перед повторной попыткой.';
    if (status >= 500 && status <= 599)
      return `Сервис временно недоступен (HTTP ${status}). Повторите попытку позже.`;
    if (
      name === 'SyntaxError' ||
      /invalid .*response|invalid .*payload/i.test(message)
    )
      return 'Сервер вернул некорректные данные. Повторите попытку позже.';
    if (/failed to fetch|network|load failed|fetch failed/i.test(message))
      return 'Не удалось связаться с сервером. Проверьте сеть; запрос также мог быть заблокирован браузером или расширением.';
    if (name === 'NotAllowedError' || name === 'SecurityError')
      return 'Браузер запретил действие. Проверьте разрешения сайта.';
    if (name === 'QuotaExceededError')
      return 'Хранилище браузера заполнено. Освободите место; локальные настройки могли не сохраниться.';
    return fallback;
  }

  function renderBanner() {
    if (!document.body) return;
    if (!critical.size) {
      banner?.remove();
      bannerObserver?.disconnect();
      banner = null;
      document.documentElement.style.removeProperty('--problem-banner-height');
      return;
    }
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'siteProblemBanner';
      banner.className = 'fatal-error-banner';
      banner.setAttribute('role', 'status');
      banner.setAttribute('aria-live', 'polite');
      document.body.prepend(banner);
      if (typeof ResizeObserver === 'function') {
        bannerObserver = new ResizeObserver(updateBannerHeight);
        bannerObserver.observe(banner);
      }
    }
    const messages = [...critical.values()];
    const message =
      messages.slice(0, 3).join(' ') +
      (messages.length > 3
        ? ` Ещё недоступных разделов: ${messages.length - 3}.`
        : '');
    if (banner.textContent !== message) banner.textContent = message;
    updateBannerHeight();
  }

  function updateBannerHeight() {
    document.documentElement.style.setProperty(
      '--problem-banner-height',
      `${banner?.getBoundingClientRect().height || 0}px`
    );
  }

  function report(key, message, error, options = {}) {
    // AbortError normally means that the user replaced/cancelled a request.
    if (error?.name === 'AbortError') return;
    if (error) console.error(`[${key}] ${message}`, error);
    // The offline banner already explains the common cause; avoid repeating it
    // in every section and leaving stale "no internet" text after reconnection.
    const detail =
      options.detail === false ||
      (options.critical && navigator.onLine === false)
        ? ''
        : describe(error, options.fallback);
    const text = detail ? `${message} ${detail}` : message;
    if (options.critical) {
      critical.set(key, text);
      renderBanner();
    } else {
      if (navigator.onLine === false && critical.has('offline')) return;
      showToastNotification(text, options.type || 'error', {
        key,
        cooldown: options.cooldown ?? 30000,
      });
    }
  }

  function clear(key) {
    if (critical.delete(key)) renderBanner();
  }

  function offline() {
    report(
      'offline',
      'Нет подключения к интернету. Загруженные данные доступны, но новые данные и сохранение могут не работать.',
      null,
      { critical: true, detail: false }
    );
  }
  window.addEventListener('offline', offline);
  window.addEventListener('online', () => {
    clear('offline');
    showToastNotification(
      'Подключение к сети появилось. Повторите незавершённое действие; данные можно обновить перезагрузкой страницы.',
      'warning',
      { key: 'online' }
    );
  });
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      renderBanner();
      if (!window.Pupsik)
        report(
          'configuration',
          'Не удалось загрузить конфигурацию сайта. Проверьте сеть и обновите страницу.',
          null,
          { critical: true, detail: false }
        );
      if (navigator.onLine === false) offline();
    },
    { once: true }
  );
  window.addEventListener('resize', updateBannerHeight);

  window.addEventListener(
    'error',
    (event) => {
      const target = event.target;
      if (target && target !== window) {
        const tag = target.tagName;
        if (tag === 'SCRIPT') {
          if (target.dataset.optionalFeature) return;
          report(
            'script-load',
            'Не удалось загрузить часть кода сайта. Некоторые функции недоступны. Проверьте сеть и обновите страницу.',
            null,
            { critical: true, detail: false }
          );
        } else if (tag === 'LINK' && target.rel === 'stylesheet') {
          report(
            'style-load',
            'Часть оформления сайта не загрузилась. Если элементы выглядят неправильно, обновите страницу.',
            null,
            { type: 'warning', detail: false, cooldown: 60000 }
          );
        } else if (tag === 'IMG') {
          report(
            'image-load',
            'Некоторые изображения не загрузились. Текстовые данные доступны; попробуйте обновить страницу позже.',
            null,
            { type: 'warning', detail: false, cooldown: 60000 }
          );
        } else if (
          (tag === 'AUDIO' || tag === 'VIDEO') &&
          target.error?.code !== 1
        ) {
          report(
            'media-load',
            'Не удалось загрузить или воспроизвести медиафайл. Проверьте сеть или выберите другой источник.',
            null,
            { type: 'warning', detail: false, cooldown: 60000 }
          );
        }
        return;
      }
      if (event.filename) {
        try {
          if (new URL(event.filename, location.href).origin !== location.origin)
            return;
        } catch {
          return;
        }
      } else if (!event.error) return; // Opaque third-party "Script error."
      report(
        'unexpected-error',
        'Произошла ошибка в работе страницы. Если действие не выполнилось, обновите страницу и повторите его.',
        event.error,
        { detail: false }
      );
    },
    true
  );
  window.addEventListener('unhandledrejection', (event) => {
    report(
      'unexpected-error',
      'Не удалось завершить действие на странице.',
      event.reason
    );
  });

  return Object.freeze({ report, clear, describe });
})();
