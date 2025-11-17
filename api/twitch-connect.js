import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://shwekurmzyzivtworjup.supabase.co";
const REDIRECT_URI =
  "https://pupsik-1f9n0127k-alexandrs-projects-58e1957c.vercel.app/api/twitch-connect";

function ensureString(value) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return typeof value === "string" ? value : "";
}

export default async function handler(req, res) {
  const method = (req.method || "").toUpperCase();

  if (method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const code = ensureString(req.query.code);
  if (!code) {
    return res.status(400).json({ error: "Missing code parameter" });
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!clientId || !clientSecret) {
    console.error("Missing Twitch OAuth environment configuration");
    return res.status(500).json({ error: "Server configuration error" });
  }

  if (!supabaseKey) {
    console.error("Missing Supabase configuration");
    return res.status(500).json({ error: "Server configuration error" });
  }

  let tokenPayload;
  try {
    const tokenResponse = await fetch(
      "https://id.twitch.tv/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: REDIRECT_URI,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse
        .json()
        .catch(() => ({}));
      console.error("Twitch token exchange failed", {
        status: tokenResponse.status,
        error: errorBody,
      });
      return res.status(502).json({
        error: "Failed to exchange Twitch authorization code",
      });
    }

    tokenPayload = await tokenResponse.json();
  } catch (err) {
    console.error("Twitch token exchange request error", err);
    return res.status(502).json({
      error: "Failed to exchange Twitch authorization code",
    });
  }

  const {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: expiresIn,
    scope,
    token_type: tokenType,
  } = tokenPayload || {};

  if (!accessToken || !refreshToken) {
    console.error("Incomplete Twitch token payload", tokenPayload);
    return res
      .status(502)
      .json({ error: "Incomplete token response from Twitch" });
  }

  const supabase = createClient(SUPABASE_URL, supabaseKey, {
    auth: { persistSession: false },
  });

  const scopeValue = Array.isArray(scope)
    ? scope.join(",")
    : typeof scope === "string"
    ? scope
    : "";

  const { error: supabaseError } = await supabase
    .from("twitch_tokens")
    .upsert(
      {
        id: "singleton",
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: expiresIn ?? null,
        scope: scopeValue,
        token_type: tokenType ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

  if (supabaseError) {
    console.error("Failed to persist Twitch tokens", supabaseError);
    return res.status(500).json({ error: "Failed to save tokens" });
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  return res
    .status(200)
    .send("Twitch подключён, можно закрыть эту вкладку");
}

