const { createClient } = require("@supabase/supabase-js");
const {
  extractBearerToken,
  issueAdminToken,
  verifyAdminToken,
} = require("../lib/admin-session.js");

const SUPABASE_URL = "https://shwekurmzyzivtworjup.supabase.co";
const ALLOWED_ACTIONS = ["env", "verify-admin"];

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

async function loadSelectedKinopoiskApi() {
  try {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
      .from("settings")
      .select("kp_api")
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Failed to load selected Kinopoisk API", error);
      return "API 1";
    }

    return data?.kp_api || "API 1";
  } catch (error) {
    console.error("Supabase configuration error while loading kp_api", error);
    return "API 1";
  }
}

async function handleEnv(req, res) {
  let password;
  try {
    password =
      req.headers["x-admin-password"] ||
      req.query.password ||
      req.body?.password ||
      (typeof req.body === "string"
        ? JSON.parse(req.body || "{}").password
        : undefined);
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  let isAdmin = false;
  const authToken = extractBearerToken(req.headers.authorization);

  if (authToken) {
    try {
      const verification = verifyAdminToken(authToken);
      if (!verification.valid) {
        return res.status(401).json({
          error: verification.error || "Invalid token",
          expired: Boolean(verification.expired),
        });
      }
      isAdmin = true;
    } catch (err) {
      console.error("Admin token verification error", err);
      return res.status(500).json({ error: "Server error" });
    }
  }

  if (!isAdmin && password) {
    if (password !== process.env.EDIT_PASSWORD) {
      return res.status(401).json({ error: "Invalid password" });
    }
    isAdmin = true;
  }

  if (!process.env.SUPABASE_KEY) {
    return res.status(500).json({ error: "Missing SUPABASE_KEY" });
  }

  const env = {
    SUPABASE_KEY: process.env.SUPABASE_KEY,
    isAdmin,
    TMDB_ENABLED: Boolean(process.env.TMDB_API),
  };

  if (isAdmin) {
    env.KINOPOISK_API_SELECTED = await loadSelectedKinopoiskApi();

    if (process.env.KINOPOISK_API_KEY) {
      env.KINOPOISK_API_KEY = process.env.KINOPOISK_API_KEY;
    }
    if (process.env.KINOPOISK_API_KEY2) {
      env.KINOPOISK_API_KEY2 = process.env.KINOPOISK_API_KEY2;
    }
    if (process.env.KINOPOISK_API_KEY3) {
      env.KINOPOISK_API_KEY3 = process.env.KINOPOISK_API_KEY3;
    }
    if (process.env.RAWG_API_KEY) {
      env.RAWG_API_KEY = process.env.RAWG_API_KEY;
    }
    if (process.env.TWITCH_CLIENT_ID) {
      env.TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
    }
  }

  return res.status(200).json(env);
}

function getTokenExpiresAt(payload) {
  return payload && typeof payload.exp === "number"
    ? new Date(payload.exp).toISOString()
    : null;
}

function handleVerifyAdmin(req, res) {
  const method = (req.method || "").toUpperCase();

  if (method === "GET") {
    try {
      const token = extractBearerToken(req.headers.authorization);
      if (!token) {
        return res.status(401).json({ ok: false, error: "Missing token" });
      }

      const result = verifyAdminToken(token);
      if (!result.valid) {
        return res.status(401).json({
          ok: false,
          error: result.error || "Invalid token",
          expired: Boolean(result.expired),
        });
      }

      return res.status(200).json({
        ok: true,
        expiresAt: getTokenExpiresAt(result.payload),
      });
    } catch (err) {
      console.error("Admin token verification error", err);
      return res.status(500).json({ ok: false, error: "Server error" });
    }
  }

  if (method === "POST") {
    let password;
    try {
      password =
        req.body?.password ||
        (typeof req.body === "string"
          ? JSON.parse(req.body || "{}").password
          : undefined);
    } catch {
      return res.status(401).json({ ok: false, error: "Invalid password" });
    }

    if (password !== process.env.EDIT_PASSWORD) {
      return res.status(401).json({ ok: false, error: "Invalid password" });
    }

    try {
      const { token, payload } = issueAdminToken();
      return res.status(200).json({
        ok: true,
        token,
        expiresAt: getTokenExpiresAt(payload),
      });
    } catch (err) {
      console.error("Admin token issue error", err);
      return res.status(500).json({ ok: false, error: "Server error" });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ ok: false, error: "Method Not Allowed" });
}

module.exports = async function handler(req, res) {
  const action = String(req.query?.action || "").trim().toLowerCase();

  if (!ALLOWED_ACTIONS.includes(action)) {
    return res.status(400).json({
      error: "Unknown admin action",
      allowedActions: ALLOWED_ACTIONS,
    });
  }

  if (action === "env") {
    return handleEnv(req, res);
  }

  return handleVerifyAdmin(req, res);
};
