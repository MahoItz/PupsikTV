import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://shwekurmzyzivtworjup.supabase.co";
const COMMAND_PREFIX = ["!заказ", "!кино"];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const messageType = req.headers['twitch-eventsub-message-type'];

  if (messageType === 'webhook_callback_verification') {
    const challenge = typeof req.body?.challenge === 'string' ? req.body.challenge : null;

    if (!challenge) {
      return res.status(400).end();
    }

    return res.status(200).send(challenge);
  }

  if (messageType === 'notification') {
    const { subscription, event } = req.body || {};

    console.log('Twitch EventSub notification:', { subscription, event });

    const messageText =
      typeof event?.message?.text === "string" ? event.message.text : "";
    const trimmedText = messageText.trimStart();

    if (trimmedText.toLowerCase().startsWith(COMMAND_PREFIX)) {
      const twitchChannel =
        typeof event?.broadcaster_user_name === "string"
          ? event.broadcaster_user_name
          : typeof event?.broadcaster_user_login === "string"
          ? event.broadcaster_user_login
          : null;
      const twitchUser =
        typeof event?.chatter_user_name === "string"
          ? event.chatter_user_name
          : typeof event?.chatter_user_login === "string"
          ? event.chatter_user_login
          : null;

      const rawText = trimmedText.slice(COMMAND_PREFIX.length).trim();
      const supabaseKey = process.env.SUPABASE_KEY;

      if (!supabaseKey) {
        console.error("Missing Supabase configuration");
      } else if (!twitchChannel || !twitchUser) {
        console.error("Unable to determine Twitch channel or user from event");
      } else {
        try {
          const supabase = createClient(SUPABASE_URL, supabaseKey, {
            auth: { persistSession: false },
          });

          const { error } = await supabase.from("movie_suggestions").insert({
            twitch_channel: twitchChannel,
            twitch_user: twitchUser,
            raw_text: rawText,
            status: "new",
          });

          if (error) {
            console.error("Failed to store movie suggestion", error);
          }
        } catch (err) {
          console.error("Unexpected Supabase error", err);
        }
      }
    }

    return res.status(200).end();
  }

  return res.status(400).end();
}

