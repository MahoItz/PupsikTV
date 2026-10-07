// Optional features are classic scripts so existing HTML handlers keep working.
const featureRequests = new Map();
const featureScripts = {
  admin: ['script/admin.js', 'script/users.js', 'script/copy-scheduled.js'],
  roulette: ['script/roulette.js'],
  diagnostics: ['script/diagnostic.js'],
};
const featureScriptRequests = new Map();

function loadFeatureScript(path) {
  if (featureScriptRequests.has(path)) return featureScriptRequests.get(path);
  const request = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = window.Pupsik.assetUrl(path);
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      featureScriptRequests.delete(path);
      reject(
        new Error(
          'Не удалось загрузить дополнительный код. Попробуйте ещё раз.'
        )
      );
    };
    document.head.appendChild(script);
  });
  featureScriptRequests.set(path, request);
  return request;
}

function loadFeature(feature) {
  if (featureRequests.has(feature)) return featureRequests.get(feature);
  if (!featureScripts[feature])
    return Promise.reject(new Error('Unknown feature: ' + feature));
  const request = (async () => {
    for (const path of featureScripts[feature]) await loadFeatureScript(path);
    if (feature === 'admin') initAdminFeatures();
    if (feature === 'roulette') await ensureCatalogLoaded('settings');
  })().catch((error) => {
    featureRequests.delete(feature);
    throw error;
  });
  featureRequests.set(feature, request);
  return request;
}

async function runFeatureAction(feature, name, args, receiver = window) {
  try {
    await loadFeature(feature);
    return await window[name].apply(receiver, args);
  } catch (error) {
    console.error('Optional feature failed', error);
    showToastNotification(error.message, 'error');
    return undefined;
  }
}

// Small entry points preserve onclick handlers while implementations load once.
for (const name of [
  'openAddMovieModal',
  'openAddToWatchlistModal',
  'openRateModal',
  'openRateGameModal',
  'openEditModal',
  'performDeleteMovie',
  'performDeleteOrder',
  'performDeleteGameOrder',
  'markGameDone',
  'openEditPlayedGameModal',
  'openAddGameModal',
  'openAddPlayedGameModal',
  'openConfirmDeleteMovieModal',
  'confirmDeleteMovie',
  'openConfirmDeletePlayedGameModal',
  'confirmDeletePlayedGame',
  'openConfirmDeleteOrderModal',
  'confirmDeleteOrder',
  'openConfirmDeleteGameOrderModal',
  'confirmDeleteGameOrder',
  'renderPlanCalendar',
  'openPlanDateModal',
  'switchMode',
  'switchWatchlistMode',
  'switchGameMode',
  'switchPlayedGameMode',
  'submitRating',
  'submitGameRating',
  'resetForm',
  'toggleSettingsPanel',
  'checkAiModelsStatus',
  'updateGameOrderStreams',
  'clearPlanDate',
  'clearGamePlanDate',
  'deletePlayedGame',
  'copyScheduledMoviesToClipboard',
]) {
  window[name] = function (...args) {
    return runFeatureAction('admin', name, args, this);
  };
}

// Stop the first click until listeners exist, then replay it exactly once.
const featureTriggers = {
  musicMenuButton: 'roulette',
  rulesPanelToggleButton: 'roulette',
  diagnosticToggleButton: 'diagnostics',
};
const loadedClickFeatures = new Set();
const pendingFeatureClicks = new Set();
document.addEventListener(
  'click',
  (event) => {
    const button = event.target.closest?.('#headerLogo .header-mouse, button');
    const feature = button?.matches('#headerLogo .header-mouse')
      ? 'admin'
      : featureTriggers[button?.id];
    if (!feature || loadedClickFeatures.has(feature)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (pendingFeatureClicks.has(feature)) return;
    pendingFeatureClicks.add(feature);
    button.setAttribute('aria-busy', 'true');
    void loadFeature(feature)
      .then(() => {
        loadedClickFeatures.add(feature);
        button.click();
      })
      .catch((error) => {
        console.error('Optional feature failed', error);
        showToastNotification(error.message, 'error');
      })
      .finally(() => {
        pendingFeatureClicks.delete(feature);
        button.removeAttribute('aria-busy');
      });
  },
  true
);
