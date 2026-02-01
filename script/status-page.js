const API_BASE_PATH = "/api";
const SUPABASE_URL = "https://shwekurmzyzivtworjup.supabase.co";
const TRANSLATION_MODEL_STORAGE_KEY = "status_translation_model";

const checkConfigs = {
  backend: {
    label: "Backend API",
    async run({ updateDetail }) {
      const envResponse = await fetchEnv();
      if (!envResponse.ok) {
        if (envResponse.status === 401) {
          return {
            level: "warning",
            message: `Нужен админ-доступ для проверки /api/env. ${formatErrorDetails(envResponse)}`,
          };
        }
        return {
          level: "error",
          message: `Не удалось получить /api/env. ${formatErrorDetails(envResponse)}`,
        };
      }
      updateDetail(`ENV: OK • TMDB enabled: ${envResponse.data?.TMDB_ENABLED ? "да" : "нет"}`);
      return { level: "ok", message: "Сервер отвечает корректно." };
    },
  },
  supabase: {
    label: "Supabase",
    async run() {
      const envResponse = await fetchEnv();
      if (!envResponse.ok) {
        return {
          level: envResponse.status === 401 ? "warning" : "error",
          message:
            envResponse.status === 401
              ? "Нужен админ-доступ, чтобы получить ключ Supabase."
              : `Не удалось получить доступ к ENV. ${formatErrorDetails(envResponse)}`,
        };
      }

      const key = envResponse.data?.SUPABASE_KEY;
      if (!key) {
        return { level: "error", message: "SUPABASE_KEY не найден." };
      }

      const { ok, status } = await timedFetch(
        `${SUPABASE_URL}/rest/v1/settings?select=id&limit=1`,
        {
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
          },
        }
      );

      if (!ok) {
        return {
          level: "error",
          message: `Supabase недоступен. ${formatErrorDetails({ status })}`,
        };
      }

      return { level: "ok", message: "Supabase отвечает." };
    },
  },
  translations: {
    label: "Переводы",
    async run({ updateDetail }) {
      const input = document.getElementById("translationModel");
      const model = input?.value.trim();
      const listContainer = document.querySelector("[data-model-list]");

      if (listContainer) {
        listContainer.textContent = "Загружаем список моделей...";
      }

      const modelsResponse = await fetchTranslationModels();
      const models = modelsResponse.models || [];

      if (modelsResponse.error && listContainer) {
        listContainer.textContent = `Ошибка загрузки моделей. ${formatErrorDetails(modelsResponse.error)}`;
      }

      if (!models.length && model) {
        models.push({ id: model, name: model });
      }

      if (!models.length) {
        if (listContainer) {
          listContainer.textContent =
            "Нет списка моделей. Введите модель для проверки.";
        }
        return { level: "warning", message: "Введите модель перевода." };
      }

      if (model) {
        localStorage.setItem(TRANSLATION_MODEL_STORAGE_KEY, model);
      }

      const results = await checkModelsStatus(models, listContainer);
      const summary = summarizeModelStatuses(results);
      updateDetail(summary.detail);

      return { level: summary.level, message: summary.message };
    },
  },
  tmdb: {
    label: "TMDB",
    async run() {
      const url = `${buildApiUrl("/tmdb")}?imdbId=tt0133093`;
      const result = await timedFetch(url);
      const { ok, status } = result;
      if (!ok) {
        return {
          level: "error",
          message: `TMDB недоступен. ${formatErrorDetails({ status, ...result })}`,
        };
      }
      return { level: "ok", message: "TMDB отвечает." };
    },
  },
  steamgriddb: {
    label: "SteamGridDB",
    async run() {
      const url = `${buildApiUrl("/steamgriddb")}?search=Portal`;
      const result = await timedFetch(url);
      const { ok, status } = result;
      if (!ok) {
        return {
          level: "error",
          message: `SteamGridDB недоступен. ${formatErrorDetails({ status, ...result })}`,
        };
      }
      return { level: "ok", message: "Постеры получены." };
    },
  },
  imdb: {
    label: "IMDb Parent Guide",
    async run() {
      const url = `${buildApiUrl("/imdb-parent-guide")}?id=tt0133093`;
      const result = await timedFetch(url);
      const { ok, status } = result;
      if (!ok) {
        return {
          level: "error",
          message: `IMDb Parent Guide недоступен. ${formatErrorDetails({ status, ...result })}`,
        };
      }
      return { level: "ok", message: "Данные получены." };
    },
  },
};

const envCache = { data: null, status: null, error: null };

function buildApiUrl(path) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_PATH}${normalized}`;
}

function getAdminToken() {
  return localStorage.getItem("adminToken") || null;
}

async function fetchEnv() {
  if (envCache.data || envCache.error) {
    return {
      ok: Boolean(envCache.data),
      status: envCache.status,
      data: envCache.data,
      message: envCache.error,
    };
  }

  const headers = {};
  const token = getAdminToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const { ok, status, json, text } = await timedFetch(buildApiUrl("/env"), {
    headers,
  });

  if (!ok) {
    envCache.status = status;
    envCache.error = text || "Не удалось получить /api/env";
    return {
      ok: false,
      status,
      message: envCache.error,
    };
  }

  envCache.data = json;
  envCache.status = status;
  return { ok: true, status, data: json };
}

function formatErrorDetails({ status, json, text, message }) {
  const parts = [];
  if (status !== undefined) {
    parts.push(`Код: ${status || "нет ответа"}`);
  }
  if (json?.error) {
    parts.push(`Ошибка: ${json.error}`);
  } else if (json?.message) {
    parts.push(`Ошибка: ${json.message}`);
  }
  if (text) {
    parts.push(`Ответ: ${text}`);
  }
  if (message && !parts.includes(message)) {
    parts.push(message);
  }
  return parts.length ? `(${parts.join(" • ")})` : "";
}

async function timedFetch(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const start = performance.now();

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const duration = Math.round(performance.now() - start);
    const contentType = response.headers.get("content-type") || "";
    let json = null;
    let text = "";

    if (contentType.includes("application/json")) {
      try {
        json = await response.json();
      } catch (err) {
        text = "Не удалось прочитать JSON";
      }
    } else {
      try {
        text = await response.text();
      } catch (err) {
        text = "";
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      json,
      text,
      duration,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      json: null,
      text: err.name === "AbortError" ? "Таймаут запроса" : err.message,
      duration: Math.round(performance.now() - start),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTranslationModels() {
  const envResponse = await fetchEnv();
  if (!envResponse.ok) {
    return { models: [], error: envResponse };
  }

  const key = envResponse.data?.SUPABASE_KEY;
  if (!key) {
    return { models: [], error: { message: "SUPABASE_KEY не найден." } };
  }

  const query = "select=ai_model,ai_model_name&ai_model=not.is.null";
  const { ok, json } = await timedFetch(
    `${SUPABASE_URL}/rest/v1/settings?${query}`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    }
  );

  if (!ok || !Array.isArray(json)) {
    return { models: [], error: { message: "Не удалось получить список моделей." } };
  }

  const unique = new Map();
  json.forEach((row) => {
    const id = row?.ai_model;
    if (!id) return;
    unique.set(id, {
      id,
      name: row?.ai_model_name || id,
    });
  });

  return { models: Array.from(unique.values()) };
}

async function checkModelsStatus(models, listContainer) {
  const results = [];
  const concurrencyLimit = 3;
  const queue = [...models];

  if (listContainer) {
    listContainer.innerHTML = "";
  }

  async function runWorker() {
    while (queue.length > 0) {
      const modelInfo = queue.shift();
      const { ok, status, json, text } = await timedFetch(
        buildApiUrl("/check-model"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: modelInfo.id }),
        }
      );

      const state = json?.status || (ok ? "unknown" : "error");
      const detail =
        state === "error" || !ok
          ? formatErrorDetails({ status, json, text })
          : `HTTP ${json?.http_status ?? status}`;

      const entry = {
        ...modelInfo,
        ok,
        status: state,
        detail,
      };
      results.push(entry);

      if (listContainer) {
        listContainer.appendChild(renderModelItem(entry));
      }
    }
  }

  const workers = Array(Math.min(concurrencyLimit, queue.length))
    .fill(null)
    .map(() => runWorker());

  await Promise.all(workers);

  if (listContainer && results.length === 0) {
    listContainer.textContent = "Не удалось получить список моделей.";
  }

  return results;
}

function renderModelItem(model) {
  const item = document.createElement("div");
  item.className = "status-models__item";

  const name = document.createElement("div");
  name.className = "status-models__name";
  name.textContent = model.name;

  const status = document.createElement("div");
  const statusClass =
    model.status === "active"
      ? "status-models__status--ok"
      : model.status === "rate_limited"
      ? "status-models__status--warning"
      : "status-models__status--error";
  status.className = `status-models__status ${statusClass}`;
  status.textContent = model.status;

  item.appendChild(name);
  item.appendChild(status);

  if (model.detail) {
    const meta = document.createElement("span");
    meta.className = "status-models__meta";
    meta.textContent = model.detail;
    name.appendChild(meta);
  }

  return item;
}

function summarizeModelStatuses(results) {
  if (!results.length) {
    return {
      level: "warning",
      message: "Нет доступных моделей для проверки.",
      detail: "Список моделей пуст.",
    };
  }

  const errorModels = results.filter((item) => item.status === "error");
  const limitedModels = results.filter((item) => item.status === "rate_limited");
  const unavailableModels = results.filter((item) => item.status === "unavailable");
  const hasError = errorModels.length > 0;
  const hasLimited = limitedModels.length > 0;
  const hasUnavailable = unavailableModels.length > 0;
  const okCount = results.filter((item) => item.status === "active").length;

  let level = "ok";
  if (hasError || hasUnavailable) {
    level = "error";
  } else if (hasLimited) {
    level = "warning";
  }

  return {
    level,
    message: `Проверено моделей: ${results.length}. Активно: ${okCount}.`,
    detail: hasError
      ? `Ошибки у моделей: ${errorModels.map((item) => item.name).join(", ")}.`
      : hasUnavailable
      ? `Недоступны модели: ${unavailableModels.map((item) => item.name).join(", ")}.`
      : hasLimited
      ? `Ограничены по лимитам: ${limitedModels.map((item) => item.name).join(", ")}.`
      : "Все модели отвечают.",
  };
}

function setBadge(badge, level) {
  badge.classList.remove(
    "status-badge--pending",
    "status-badge--ok",
    "status-badge--warning",
    "status-badge--error"
  );

  if (level === "pending") {
    badge.classList.add("status-badge--pending");
    badge.textContent = "Проверка";
  } else if (level === "ok") {
    badge.classList.add("status-badge--ok");
    badge.textContent = "OK";
  } else if (level === "warning") {
    badge.classList.add("status-badge--warning");
    badge.textContent = "Внимание";
  } else if (level === "error") {
    badge.classList.add("status-badge--error");
    badge.textContent = "Ошибка";
  } else {
    badge.textContent = "Ожидание";
  }
}

function formatTime() {
  return new Date().toLocaleTimeString();
}

async function runCheck(card, config) {
  const badge = card.querySelector("[data-status]");
  const detail = card.querySelector("[data-detail]");
  const latency = card.querySelector("[data-latency]");
  const time = card.querySelector("[data-time]");
  const button = card.querySelector("[data-run]");

  if (!badge || !detail || !latency || !time || !button) return;

  setBadge(badge, "pending");
  detail.textContent = "Выполняем проверку...";
  button.disabled = true;

  const start = performance.now();

  try {
    const result = await config.run({
      updateDetail: (text) => {
        detail.textContent = text;
      },
    });

    setBadge(badge, result.level);
    detail.textContent = result.message;
  } catch (err) {
    setBadge(badge, "error");
    detail.textContent = err.message || "Неизвестная ошибка";
  } finally {
    const duration = Math.round(performance.now() - start);
    latency.textContent = `⏱ ${duration} мс`;
    time.textContent = `Последняя проверка: ${formatTime()}`;
    button.disabled = false;
  }
}

function setupChecks() {
  document.querySelectorAll(".status-card").forEach((card) => {
    const key = card.dataset.check;
    const config = checkConfigs[key];
    const button = card.querySelector("[data-run]");

    if (!config || !button) return;

    button.addEventListener("click", () => runCheck(card, config));
  });

  const runAllBtn = document.getElementById("runAllChecks");
  if (runAllBtn) {
    runAllBtn.addEventListener("click", async () => {
      runAllBtn.disabled = true;
      const cards = Array.from(document.querySelectorAll(".status-card"));
      for (const card of cards) {
        const key = card.dataset.check;
        const config = checkConfigs[key];
        if (config) {
          await runCheck(card, config);
        }
      }
      runAllBtn.disabled = false;
    });
  }

  const translationInput = document.getElementById("translationModel");
  if (translationInput) {
    const saved = localStorage.getItem(TRANSLATION_MODEL_STORAGE_KEY);
    if (saved) {
      translationInput.value = saved;
    }
  }
}

window.addEventListener("DOMContentLoaded", setupChecks);
