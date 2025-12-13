const { extractBearerToken, verifyAdminToken } = require("./_admin-session.js");
const { createNetlifyHandler } = require("./_netlify-wrapper.js");

function handler(req, res) {
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
  };

  if (process.env.TMDB_API) {
    env.TMDB_API = process.env.TMDB_API;
  }

  if (isAdmin) {
    if (process.env.KINOPOISK_API_KEY) {
      env.KINOPOISK_API_KEY = process.env.KINOPOISK_API_KEY;
    }
    if (process.env.KINOPOISK_API_KEY2) {
      env.KINOPOISK_API_KEY2 = process.env.KINOPOISK_API_KEY2;
    }
    if (process.env.RAWG_API_KEY) {
      env.RAWG_API_KEY = process.env.RAWG_API_KEY;
    }
    if (process.env.TWITCH_CLIENT_ID) {
      env.TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
    }
  }

  res.status(200).json(env);
}

module.exports = handler;
module.exports.handler = createNetlifyHandler(handler);
