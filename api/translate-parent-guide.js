import { createNetlifyHandler } from "./_netlify-wrapper.js";

const PARENT_GUIDE_KEYS = [
  "sexAndNudity",
  "violenceAndGore",
  "profanity",
];

function normalizeSections(sections = {}) {
  return Object.fromEntries(
    PARENT_GUIDE_KEYS.map((key) => {
      const items = Array.isArray(sections[key]) ? sections[key] : [];
      const normalizedItems = items
        .filter((item) => typeof item === "string" && item.trim())
        .map((item) => item.trim());

      return [key, normalizedItems];
    })
  );
}

function hasContent(sections = {}) {
  return PARENT_GUIDE_KEYS.some(
    (key) => Array.isArray(sections[key]) && sections[key].length > 0
  );
}

async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.OPENROUTER_API;
  if (!apiKey) {
    res.status(500).json({ error: "Missing OPENROUTER_API" });
    return;
  }

  let body;
  try {
    body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};
  } catch (err) {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  const model = typeof body.model === "string" ? body.model.trim() : "";
  const sections = normalizeSections(body.sections || {});

  if (!model) {
    res.status(400).json({ error: "Missing model" });
    return;
  }

  if (!hasContent(sections)) {
    res.status(200).json({ translated: sections });
    return;
  }

  const messages = [
    {
      role: "system",
      content:
        "Translate the provided IMDb parents guide entries into Russian. Respond with JSON only using keys sexAndNudity, violenceAndGore, and profanity. Preserve bullet order and number of items.",
    },
    {
      role: "user",
      content: JSON.stringify(sections),
    },
  ];

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://pupsik-tv.vercel.app",
        "X-Title": "PupsikTV Parent Guide Translator",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        max_tokens: 1200,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenRouter translation failed", response.status, errorText);
      res.status(502).json({ error: "Translation request failed" });
      return;
    }

    const completion = await response.json();
    const content = completion?.choices?.[0]?.message?.content || "";

    let parsed;
    try {
      parsed = typeof content === "string" ? JSON.parse(content) : {};
    } catch (err) {
      console.error("Failed to parse translation response", err, content);
      res.status(502).json({ error: "Invalid translation response" });
      return;
    }

    const translated = normalizeSections(parsed || {});
    res.status(200).json({ translated });
  } catch (err) {
    console.error("[translate-parent-guide] error", err);
    res.status(500).json({ error: "Server error" });
  }
}

export default handler;
export const handler = createNetlifyHandler(handler);
