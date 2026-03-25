const { createClient } = require("@supabase/supabase-js");
const { extractBearerToken, verifyAdminToken } = require("./_admin-session.js");

const SUPABASE_URL = "https://shwekurmzyzivtworjup.supabase.co";
const TABLE_NAME = "boosty_reviews";
const SELECT_FIELDS = "id, title, url, image, meta, created_at, updated_at";
const ALLOWED_METHODS = ["GET", "POST", "DELETE"];
const PG_UNDEFINED_TABLE = "42P01";
const PG_INSUFFICIENT_PRIVILEGE = "42501";
const PG_UNIQUE_VIOLATION = "23505";

function createSupabaseClient() {
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!supabaseKey) {
    throw new Error("Missing SUPABASE key");
  }

  return createClient(SUPABASE_URL, supabaseKey, {
    auth: { persistSession: false },
  });
}

function verifyAdminRequest(req) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return { ok: false, status: 401, error: "Missing token" };
  }

  const verification = verifyAdminToken(token);
  if (!verification.valid) {
    return {
      ok: false,
      status: 401,
      error: verification.error || "Invalid token",
      expired: Boolean(verification.expired),
    };
  }

  return { ok: true };
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    return JSON.parse(req.body || "{}");
  }
  return req.body;
}

function normalizeString(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function isMissingTableError(error) {
  return String(error?.code || "") === PG_UNDEFINED_TABLE;
}

function isPermissionError(error) {
  return String(error?.code || "") === PG_INSUFFICIENT_PRIVILEGE;
}

function isUniqueError(error) {
  return String(error?.code || "") === PG_UNIQUE_VIOLATION;
}

function normalizeCreatePayload(payload) {
  const title = normalizeString(payload?.title, 300);
  const url = normalizeString(payload?.url, 1000);

  if (!title || !url) {
    return null;
  }

  return {
    title,
    url,
    image: normalizeString(payload?.image, 1000) || null,
    meta: normalizeString(payload?.meta, 150) || null,
  };
}

function parseId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isFinite(id) ? id : null;
}

async function listReviews(supabase, res) {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select(SELECT_FIELDS)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load Boosty reviews", error);
    if (isMissingTableError(error)) {
      return res.status(200).json({
        items: [],
        setupRequired: true,
        message:
          "Таблица boosty_reviews ещё не создана. Примените SQL-миграцию для списка обзоров Boosty.",
      });
    }
    if (isPermissionError(error)) {
      return res.status(500).json({
        error:
          "Недостаточно прав для чтения boosty_reviews. Для server API нужен SUPABASE_SERVICE_ROLE_KEY либо отдельные RLS policy.",
      });
    }
    return res.status(500).json({ error: "Failed to load Boosty reviews" });
  }

  return res.status(200).json({ items: data || [] });
}

async function createReview(supabase, req, res) {
  const access = verifyAdminRequest(req);
  if (!access.ok) {
    return res
      .status(access.status)
      .json({ error: access.error, expired: access.expired || false });
  }

  let payload;
  try {
    payload = parseBody(req);
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  const normalized = normalizeCreatePayload(payload || {});
  if (!normalized) {
    return res.status(400).json({ error: "Invalid Boosty review payload" });
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert(normalized)
    .select(SELECT_FIELDS)
    .single();

  if (error) {
    console.error("Failed to create Boosty review", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        error:
          "Таблица boosty_reviews ещё не создана. Примените SQL-миграцию для списка обзоров Boosty.",
        setupRequired: true,
      });
    }
    if (isUniqueError(error)) {
      return res.status(409).json({
        error: "Такая ссылка Boosty уже добавлена.",
      });
    }
    if (isPermissionError(error)) {
      return res.status(500).json({
        error:
          "Недостаточно прав для записи в boosty_reviews. Добавьте SUPABASE_SERVICE_ROLE_KEY в серверные env либо настройте RLS policy.",
      });
    }
    return res.status(500).json({ error: "Failed to create Boosty review" });
  }

  return res.status(201).json({ item: data });
}

async function deleteReview(supabase, req, res) {
  const access = verifyAdminRequest(req);
  if (!access.ok) {
    return res
      .status(access.status)
      .json({ error: access.error, expired: access.expired || false });
  }

  let payload = {};
  try {
    payload = parseBody(req);
  } catch {
    payload = {};
  }

  const id = parseId(req.query?.id ?? payload?.id);
  if (!id) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const { error } = await supabase.from(TABLE_NAME).delete().eq("id", id);
  if (error) {
    console.error("Failed to delete Boosty review", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        error:
          "Таблица boosty_reviews ещё не создана. Примените SQL-миграцию для списка обзоров Boosty.",
        setupRequired: true,
      });
    }
    if (isPermissionError(error)) {
      return res.status(500).json({
        error:
          "Недостаточно прав для удаления из boosty_reviews. Добавьте SUPABASE_SERVICE_ROLE_KEY в серверные env либо настройте RLS policy.",
      });
    }
    return res.status(500).json({ error: "Failed to delete Boosty review" });
  }

  return res.status(200).json({ ok: true });
}

module.exports = async function handler(req, res) {
  const method = (req.method || "").toUpperCase();
  if (!ALLOWED_METHODS.includes(method)) {
    res.setHeader("Allow", ALLOWED_METHODS.join(", "));
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  let supabase;
  try {
    supabase = createSupabaseClient();
  } catch (error) {
    console.error("Supabase configuration error", error);
    return res.status(500).json({ error: "Server configuration error" });
  }

  if (method === "GET") {
    return listReviews(supabase, res);
  }

  if (method === "POST") {
    return createReview(supabase, req, res);
  }

  return deleteReview(supabase, req, res);
};
