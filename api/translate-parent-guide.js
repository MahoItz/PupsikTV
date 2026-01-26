const { createNetlifyHandler } = require("./_netlify-wrapper.js");

const PARENT_GUIDE_KEYS = ["sexAndNudity"];

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

function extractJsonString(raw = "") {
  if (typeof raw !== "string") {
    return null;
  }

  let text = raw;

  // Remove Markdown code fences like ```json ... ``` or ``` ... ```
  text = text.replace(/```(?:json)?\s*([\s\S]*?)```/gi, "$1");

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    return null;
  }

  return text.slice(firstBrace, lastBrace + 1);
}

function safeJsonParse(rawText, contextLabel) {
  const jsonString = extractJsonString(rawText);

  if (!jsonString) {
    console.warn(`[translate-parent-guide] Missing JSON payload in ${contextLabel}`);
    return null;
  }

  try {
    return JSON.parse(jsonString);
  } catch (err) {
    console.error(`[translate-parent-guide] Failed to parse JSON from ${contextLabel}`, err, rawText);
    return null;
  }
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
        "Переведи это руководство для родителей на русский язык. Отправь ответ только в формате JSON, используя ключ sexAndNudity. Сохрани порядок пунктов списка и их количество.",
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

    const responseClone = response.clone();
    let completion;

    try {
      completion = await response.json();
    } catch (err) {
      const fallbackText = await responseClone.text();
      console.warn(
        "[translate-parent-guide] Response was not valid JSON, attempting to parse as text",
        err
      );
      completion = safeJsonParse(fallbackText, "completion response");
    }

    if (typeof completion === "string") {
      completion = safeJsonParse(completion, "completion response");
    }

    console.info("[translate-parent-guide] completion format", {
      type: typeof completion,
      hasChoices: Array.isArray(completion?.choices),
    });

    if (!completion) {
      res
        .status(200)
        .json({
          translated: sections,
          warning: "Could not parse translation response; returning original sections.",
        });
      return;
    }

    const content = completion?.choices?.[0]?.message?.content || "";
    let contentText = content;

    if (
      Array.isArray(content) &&
      content.every((item) => item && typeof item.text === "string")
    ) {
      contentText = content.map((item) => item.text).join("");
    } else if (content && typeof content === "object" && typeof content.text === "string") {
      contentText = content.text;
    }

    let parsed;
    parsed = safeJsonParse(contentText, "message content");

    if (!parsed) {
      res
        .status(200)
        .json({
          translated: sections,
          warning: "Could not parse translation message content; returning original sections.",
        });
      return;
    }

    const translated = normalizeSections(parsed || {});
    res.status(200).json({ translated });
  } catch (err) {
    console.error("[translate-parent-guide] error", err);
    res.status(500).json({ error: "Server error" });
  }
}

module.exports = handler;
module.exports.handler = createNetlifyHandler(handler);
