const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://shwekurmzyzivtworjup.supabase.co";
const COMMAND_PREFIX = "!кино";

function toStringOrNull(value) {
  return typeof value === "string" ? value : null;
}

function normalizeLogin(value) {
  const login = toStringOrNull(value);
  return login ? login.toLowerCase() : null;
}

function extractMessageText(event) {
  const fragments = Array.isArray(event?.message?.fragments)
    ? event.message.fragments
    : null;

  if (fragments?.length) {
    const combined = fragments
      .map((fragment) => (typeof fragment?.text === "string" ? fragment.text : ""))
      .join("");
    if (combined.trim()) {
      return combined;
    }
  }

  if (typeof event?.message?.text === "string") {
    return event.message.text;
  }

  if (typeof event?.message === "string") {
    return event.message;
  }

  return "";
}

function extractBroadcaster(event) {
  return (
    normalizeLogin(event?.broadcaster_user_login) ||
    normalizeLogin(event?.broadcaster_user_name)
  );
}

function extractChatter(event) {
  return normalizeLogin(event?.chatter_user_login) || normalizeLogin(event?.chatter_user_name);
}

async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  const messageType = req.headers["twitch-eventsub-message-type"];

  if (messageType === "webhook_callback_verification") {
    const challenge = typeof req.body?.challenge === "string" ? req.body.challenge : null;

    if (!challenge) {
      return res.status(400).end();
    }

    return res.status(200).send(challenge);
  }

  if (messageType === "notification") {
    const { subscription, event } = req.body || {};

    if (subscription?.type !== "channel.chat.message") {
      return res.status(200).end();
    }

    const messageText = extractMessageText(event);
    const trimmedText = messageText.trim();

    if (!trimmedText.toLowerCase().startsWith(COMMAND_PREFIX)) {
      return res.status(200).end();
    }

    const twitchChannel = extractBroadcaster(event);
    const twitchUser = extractChatter(event);
    const suggestionText = trimmedText.slice(COMMAND_PREFIX.length).trim();
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseKey) {
      console.error("Missing Supabase configuration");
      return res.status(200).end();
    }

    if (!twitchChannel || !twitchUser) {
      console.error("Unable to determine Twitch channel or chatter", {
        channel: twitchChannel,
        user: twitchUser,
      });
      return res.status(200).end();
    }

    try {
      const supabase = createClient(SUPABASE_URL, supabaseKey, {
        auth: { persistSession: false },
      });

      const { error } = await supabase.from("movie_suggestions").insert({
        twitch_channel: twitchChannel,
        twitch_user: twitchUser,
        raw_text: suggestionText,
        status: "new",
      });

      if (error) {
        console.error("Failed to store movie suggestion", error);
      } else {
        console.log("Stored movie suggestion from Twitch chat", {
          twitchChannel,
          twitchUser,
          suggestionText,
        });
      }
    } catch (err) {
      console.error("Unexpected Supabase error", err);
    }

    return res.status(200).end();
  }

  return res.status(400).end();
}

module.exports = handler;
