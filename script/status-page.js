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
            message: "Нужен админ-доступ для проверки /api/env.",
          };
        }
        return {
          level: "error",
          message: envResponse.message || "Не удалось получить /api/env.",
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
              : envResponse.message || "Не удалось получить доступ к ENV.",
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
          message: `Supabase недоступен (код ${status}).`,
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

      if (!model) {
        return { level: "warning", message: "Введите модель перевода." };
      }

      localStorage.setItem(TRANSLATION_MODEL_STORAGE_KEY, model);

      const { ok, status, json } = await timedFetch(buildApiUrl("/check-model"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });

      if (!ok) {
        return {
          level: "error",
          message: `Сервис перевода недоступен (код ${status}).`,
        };
      }

      const state = json?.status || "unknown";
      updateDetail(`Статус модели: ${state} • HTTP ${json?.http_status ?? "-"}`);

      if (state === "active") {
        return { level: "ok", message: "Модель доступна." };
      }

      if (state === "rate_limited") {
        return { level: "warning", message: "Модель ограничена по лимитам." };
      }

      return { level: "error", message: "Модель недоступна." };
    },
  },
  tmdb: {
    label: "TMDB",
    async run() {
      const url = `${buildApiUrl("/tmdb")}?imdbId=tt0133093`;
      const { ok, status } = await timedFetch(url);
      if (!ok) {
        return { level: "error", message: `TMDB недоступен (код ${status}).` };
      }
      return { level: "ok", message: "TMDB отвечает." };
    },
  },
  steamgriddb: {
    label: "SteamGridDB",
    async run() {
      const url = `${buildApiUrl("/steamgriddb")}?search=Portal`;
      const { ok, status } = await timedFetch(url);
      if (!ok) {
        return {
          level: "error",
          message: `SteamGridDB недоступен (код ${status}).`,
        };
      }
      return { level: "ok", message: "Постеры получены." };
    },
  },
  imdb: {
    label: "IMDb Parent Guide",
    async run() {
      const url = `${buildApiUrl("/imdb-parent-guide")}?id=tt0133093`;
      const { ok, status } = await timedFetch(url);
      if (!ok) {
        return {
          level: "error",
          message: `IMDb Parent Guide недоступен (код ${status}).`,
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
