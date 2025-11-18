import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://shwekurmzyzivtworjup.supabase.co";
const REDIRECT_URI = "https://pupsik-tv.vercel.app/api/twitch-connect";
const CHAT_WEBHOOK_URL =
  process.env.TWITCH_EVENTSUB_CALLBACK_URL ||
  "https://pupsik-tv.vercel.app/api/twitch-chat-webhook";
const EVENTSUB_SECRET = process.env.TWITCH_EVENTSUB_SECRET || "";

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

  let broadcasterUserId;

  try {
    const userResponse = await fetch("https://api.twitch.tv/helix/users", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-Id": clientId,
      },
    });

    if (!userResponse.ok) {
      const errorBody = await userResponse.json().catch(() => ({}));
      console.error("Failed to fetch Twitch user data", {
        status: userResponse.status,
        error: errorBody,
      });
      return res
        .status(502)
        .json({ error: "Failed to fetch Twitch user information" });
    }

    const userPayload = await userResponse.json();
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
    broadcaster_id: broadcasterUserId,
    type: "channel.chat.message",
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
            user_id: subscriptionUserId,
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

