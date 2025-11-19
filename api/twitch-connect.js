import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://shwekurmzyzivtworjup.supabase.co";
const REDIRECT_URI = "https://pupsik-tv.vercel.app/api/twitch-connect";
const CHAT_WEBHOOK_URL =
  process.env.TWITCH_EVENTSUB_CALLBACK_URL ||
  "https://pupsik-tv.vercel.app/api/twitch-chat-webhook";
const EVENTSUB_SECRET = process.env.TWITCH_EVENTSUB_SECRET || "";
const TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

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

  let broadcasterUserId;

  try {
    const userPayload = await fetchTwitchUser({
      supabase,
      clientId,
      clientSecret,
    });

    const users = Array.isArray(userPayload?.data) ? userPayload.data : [];
    const [firstUser] = users;

    if (!firstUser?.id) {
      console.error("Unexpected Twitch user payload", userPayload);
      return res
        .status(502)
        .json({ error: "Unable to determine Twitch user information" });
    }

    broadcasterUserId = firstUser.id;
  } catch (err) {
    console.error("Twitch user lookup failed", err);
    return res
      .status(502)
      .json({ error: "Failed to fetch Twitch user information" });
  }

  try {
    await ensureChatSubscription({
      clientId,
      clientSecret,
      broadcasterUserId,
      callbackUrl: CHAT_WEBHOOK_URL,
      secret: EVENTSUB_SECRET,
    });
  } catch (err) {
    console.error("Failed to ensure Twitch chat subscription", err);
    return res
      .status(500)
      .json({ error: "Failed to ensure Twitch chat subscription" });
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  return res
    .status(200)
    .send("Twitch подключён, можно закрыть эту вкладку");
}

async function fetchTwitchUser({ supabase, clientId, clientSecret }) {
  const response = await makeAuthenticatedTwitchRequest({
    supabase,
    clientId,
    clientSecret,
    url: "https://api.twitch.tv/helix/users",
    options: { method: "GET" },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    console.error("Failed to fetch Twitch user data", {
      status: response.status,
      error: errorBody,
    });
    throw new Error("Failed to fetch Twitch user information");
  }

  return response.json();
}

async function makeAuthenticatedTwitchRequest({
  supabase,
  clientId,
  clientSecret,
  url,
  options,
}) {
  if (!supabase) {
    throw new Error("Supabase client is required for Twitch requests");
  }

  if (!clientId || !clientSecret) {
    throw new Error("Missing Twitch OAuth configuration");
  }

  const requestOptions = options || {};
  const { headers = {}, ...restOptions } = requestOptions;

  let tokenData = await ensureFreshAccessToken({
    supabase,
    clientId,
    clientSecret,
  });

  let response = await fetch(url, {
    ...restOptions,
    headers: {
      ...headers,
      Authorization: `Bearer ${tokenData.access_token}`,
      "Client-Id": clientId,
    },
  });

  if (response.status !== 401 && response.status !== 403) {
    return response;
  }

  tokenData = await refreshTwitchToken({
    supabase,
    clientId,
    clientSecret,
  });

  response = await fetch(url, {
    ...restOptions,
    headers: {
      ...headers,
      Authorization: `Bearer ${tokenData.access_token}`,
      "Client-Id": clientId,
    },
  });

  return response;
}

function shouldRefreshToken(token) {
  const expiresInMs = Number(token?.expires_in || 0) * 1000;

  if (!Number.isFinite(expiresInMs) || expiresInMs <= 0) {
    return false;
  }

  const updatedAt = token?.updated_at ? Date.parse(token.updated_at) : NaN;

  if (!Number.isFinite(updatedAt)) {
    return false;
  }

  return Date.now() - updatedAt >= Math.max(0, expiresInMs - TOKEN_REFRESH_THRESHOLD_MS);
}

async function ensureFreshAccessToken({ supabase, clientId, clientSecret }) {
  let tokenRow = await getStoredTwitchToken(supabase);

  if (!tokenRow?.access_token) {
    throw new Error("Missing Twitch access token in storage");
  }

  if (shouldRefreshToken(tokenRow)) {
    tokenRow = await refreshTwitchToken({ supabase, clientId, clientSecret });
  }

  return tokenRow;
}

async function getStoredTwitchToken(supabase) {
  const { data, error } = await supabase
    .from("twitch_tokens")
    .select("*")
    .eq("id", "singleton")
    .single();

  if (error) {
    throw new Error(`Failed to load Twitch token: ${error.message}`);
  }

  return data;
}

export async function refreshTwitchToken({ supabase, clientId, clientSecret }) {
  if (!supabase) {
    throw new Error("Supabase client is required for refresh");
  }

  if (!clientId || !clientSecret) {
    throw new Error("Missing Twitch OAuth configuration");
  }

  const { data: storedToken, error: loadError } = await supabase
    .from("twitch_tokens")
    .select("refresh_token, scope, expires_in, token_type")
    .eq("id", "singleton")
    .single();

  if (loadError) {
    throw new Error(`Failed to load Twitch refresh token: ${loadError.message}`);
  }

  const refreshToken = storedToken?.refresh_token;

  if (!refreshToken) {
    throw new Error("Missing Twitch refresh token in storage");
  }

  const tokenResponse = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.json().catch(() => ({}));
    throw new Error(
      `Twitch token refresh failed: ${tokenResponse.status} ${JSON.stringify(errorBody)}`
    );
  }

  const refreshedPayload = await tokenResponse.json();
  const refreshedAt = new Date().toISOString();
  const normalizedScope = Array.isArray(refreshedPayload?.scope)
    ? refreshedPayload.scope.join(",")
    : typeof refreshedPayload?.scope === "string"
    ? refreshedPayload.scope
    : storedToken?.scope || "";

  const { error: persistError } = await supabase.from("twitch_tokens").upsert(
    {
      id: "singleton",
      access_token: refreshedPayload.access_token,
      refresh_token: refreshedPayload.refresh_token || refreshToken,
      expires_in:
        refreshedPayload.expires_in ?? storedToken?.expires_in ?? null,
      scope: normalizedScope,
      token_type: refreshedPayload.token_type ?? storedToken?.token_type ?? null,
      updated_at: refreshedAt,
    },
    { onConflict: "id" }
  );

  if (persistError) {
    throw new Error(
      `Failed to persist refreshed Twitch token: ${persistError.message}`
    );
  }

  return {
    ...storedToken,
    ...refreshedPayload,
    scope: normalizedScope,
    updated_at: refreshedAt,
  };
}

async function ensureChatSubscription({
  clientId,
  clientSecret,
  broadcasterUserId,
  callbackUrl,
  secret,
}) {
  if (!clientId || !clientSecret) {
    throw new Error("Missing Twitch app credentials");
  }

  if (!callbackUrl) {
    throw new Error("Missing EventSub callback URL");
  }

  if (!secret) {
    throw new Error("Missing EventSub secret");
  }

  if (!broadcasterUserId) {
    throw new Error("Missing broadcaster user ID");
  }

  const envChatUserId =
    typeof process.env.TWITCH_CHAT_USER_ID === "string"
      ? process.env.TWITCH_CHAT_USER_ID.trim()
      : "";
  const subscriptionUserId = envChatUserId || broadcasterUserId;

  if (!subscriptionUserId) {
    throw new Error("Missing user ID for chat subscription");
  }

  let appAccessToken;

  try {
    const tokenResponse = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
      }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.json().catch(() => ({}));
      throw new Error(
        `App access token request failed: ${tokenResponse.status} ${JSON.stringify(
          errorBody
        )}`
      );
    }

    const tokenData = await tokenResponse.json();
    appAccessToken = tokenData?.access_token;

    if (!appAccessToken) {
      throw new Error("Missing app access token in response");
    }
  } catch (err) {
    throw new Error(`Unable to fetch app access token: ${err.message}`);
  }

  const authHeaders = {
    Authorization: `Bearer ${appAccessToken}`,
    "Client-Id": clientId,
  };

  const query = new URLSearchParams({
    user_id: subscriptionUserId,
  });

  try {
    const existingResponse = await fetch(
      `https://api.twitch.tv/helix/eventsub/subscriptions?${query}`,
      {
        method: "GET",
        headers: authHeaders,
      }
    );

    if (!existingResponse.ok) {
      const errorBody = await existingResponse.json().catch(() => ({}));
      throw new Error(
        `Failed to list EventSub subscriptions: ${existingResponse.status} ${JSON.stringify(
          errorBody
        )}`
      );
    }

    const existingPayload = await existingResponse.json();
    const subscriptions = Array.isArray(existingPayload?.data)
      ? existingPayload.data
      : [];

    const activeSubscription = subscriptions.find((subscription) => {
      const status = subscription?.status || "";
      const hasValidStatus =
        status === "enabled" ||
        status === "webhook_callback_verification_pending" ||
        status === "verification_pending";
      return (
        hasValidStatus &&
        subscription?.transport?.callback === callbackUrl &&
        subscription?.type === "channel.chat.message" &&
        subscription?.condition?.broadcaster_user_id === broadcasterUserId &&
        subscription?.condition?.user_id === subscriptionUserId
      );
    });

    if (activeSubscription) {
      return;
    }

    const outdatedSubscriptions = subscriptions.filter((subscription) => {
      const status = subscription?.status || "";
      const hasValidStatus =
        status === "enabled" ||
        status === "webhook_callback_verification_pending" ||
        status === "verification_pending";
      return (
        hasValidStatus &&
        subscription?.transport?.callback === callbackUrl &&
        subscription?.type === "channel.chat.message" &&
        subscription?.condition?.broadcaster_user_id === broadcasterUserId &&
        subscription?.condition?.user_id !== subscriptionUserId
      );
    });

    for (const subscription of outdatedSubscriptions) {
      const deleteResponse = await fetch(
        `https://api.twitch.tv/helix/eventsub/subscriptions?id=${subscription.id}`,
        {
          method: "DELETE",
          headers: authHeaders,
        }
      );

      if (!deleteResponse.ok) {
        const errorBody = await deleteResponse.json().catch(() => ({}));
        throw new Error(
          `Failed to delete outdated EventSub subscription ${subscription.id}: ${deleteResponse.status} ${JSON.stringify(
            errorBody
          )}`
        );
      }
    }
  } catch (err) {
    throw new Error(`Unable to verify EventSub subscriptions: ${err.message}`);
  }

  try {
    const createResponse = await fetch(
      "https://api.twitch.tv/helix/eventsub/subscriptions",
      {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "channel.chat.message",
          version: "1",
          condition: {
            broadcaster_user_id: broadcasterUserId,
            // user_id: subscriptionUserId,
          },
          transport: {
            method: "webhook",
            callback: callbackUrl,
            secret,
          },
        }),
      }
    );

    if (!createResponse.ok) {
      const errorBody = await createResponse.json().catch(() => ({}));
      throw new Error(
        `EventSub subscription creation failed: ${createResponse.status} ${JSON.stringify(
          errorBody
        )}`
      );
    }
  } catch (err) {
    throw new Error(`Unable to create EventSub subscription: ${err.message}`);
  }
}

