const { createClient } = require("@supabase/supabase-js");
const { extractBearerToken, verifyAdminToken } = require("./_admin-session.js");

const SUPABASE_URL = "https://shwekurmzyzivtworjup.supabase.co";
const ALLOWED_METHODS = ["PATCH"];

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

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    return JSON.parse(req.body || "{}");
  }
  return req.body;
}

function normalizeKpApiValue(value) {
  if (value === "API 2" || value === "API 3") {
    return value;
  }
  return "API 1";
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

async function handler(req, res) {
  const method = (req.method || "").toUpperCase();
  if (!ALLOWED_METHODS.includes(method)) {
    res.setHeader("Allow", ALLOWED_METHODS);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const access = verifyAdminRequest(req);
  if (!access.ok) {
    return res.status(access.status).json({
      error: access.error,
      expired: access.expired || false,
    });
  }

  let payload;
  try {
    payload = parseBody(req);
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  const kpApi = normalizeKpApiValue(payload?.kp_api);

  let supabase;
  try {
    supabase = createSupabaseClient();
  } catch (error) {
    console.error("Supabase configuration error", error);
    return res.status(500).json({ error: "Server configuration error" });
  }

  try {
    const { data: existing, error: selectError } = await supabase
      .from("settings")
      .select("id")
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (selectError) {
      throw selectError;
    }

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from("settings")
        .update({ kp_api: kpApi })
        .eq("id", existing.id);

      if (updateError) {
        throw updateError;
      }
    } else {
      const { error: insertError } = await supabase
        .from("settings")
        .insert({ kp_api: kpApi });

      if (insertError) {
        throw insertError;
      }
    }

    return res.status(200).json({ ok: true, kp_api: kpApi });
  } catch (error) {
    console.error("Failed to update Kinopoisk API selection", error);
    return res.status(500).json({ error: "Failed to update Kinopoisk API selection" });
  }
}

module.exports = handler;
