const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://shwekurmzyzivtworjup.supabase.co";
const WATCHLIST_TABLE = "trailer_watchlist";
const RATINGS_TABLE = "trailer_ratings";

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

function parseTrailerId(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRating(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed * 100) / 100;
  return rounded >= 0 && rounded <= 11 ? rounded : null;
}

function normalizeUserId(value) {
  const userId = String(value || "").trim().slice(0, 255);
  return userId || null;
}

async function recalculateTrailerRatings(supabase, trailerId) {
  const { data, error } = await supabase
    .from(RATINGS_TABLE)
    .select("rating")
    .eq("trailer_id", trailerId);

  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  const ratingSum = rows.reduce((sum, row) => sum + Number(row?.rating || 0), 0);
  const ratingCount = rows.length;

  const { data: updated, error: updateError } = await supabase
    .from(WATCHLIST_TABLE)
    .update({
      viewer_rating_sum: ratingSum,
      viewer_rating_count: ratingCount,
    })
    .eq("id", trailerId)
    .select("id, viewer_rating_sum, viewer_rating_count")
    .single();

  if (updateError) throw updateError;
  return updated;
}

async function handler(req, res) {
  const method = (req.method || "").toUpperCase();
  if (method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  let payload;
  try {
    payload = parseBody(req);
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  const trailerId = parseTrailerId(payload?.trailer_id);
  const rating = parseRating(payload?.rating);
  const userId = normalizeUserId(payload?.user_id);

  if (!trailerId || rating === null || !userId) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  let supabase;
  try {
    supabase = createSupabaseClient();
  } catch (error) {
    console.error("Supabase configuration error", error);
    return res.status(500).json({ error: "Server configuration error" });
  }

  try {
    const { error: insertError } = await supabase
      .from(RATINGS_TABLE)
      .insert({
        trailer_id: trailerId,
        rating,
        user_id: userId,
        source: "user",
      });

    if (insertError) {
      const message = String(insertError?.message || "");
      if (/duplicate key|unique/i.test(message)) {
        return res.status(409).json({ error: "Вы уже оценили этот трейлер" });
      }
      throw insertError;
    }

    const updated = await recalculateTrailerRatings(supabase, trailerId);
    return res.status(200).json({ ok: true, trailer: updated });
  } catch (error) {
    console.error("Failed to submit trailer rating", error);
    return res.status(500).json({ error: "Failed to submit trailer rating" });
  }
}

module.exports = handler;
