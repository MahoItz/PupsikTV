import { createClient } from "@supabase/supabase-js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const SUPABASE_URL = "https://shwekurmzyzivtworjup.supabase.co";
const DEFAULT_OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

const SECTION_MARKERS = {
  sexAndNudity: [
    'data-testid="sub-section-nudity"',
    'id="nudity"',
    "advisory-sex-content",
  ],
  violenceAndGore: [
    'data-testid="sub-section-violence"',
    'id="violence"',
    "advisory-violence-content",
  ],
  profanity: [
    'data-testid="sub-section-profanity"',
    'id="profanity"',
    "advisory-profanity-content",
  ],
};

const NAMED_ENTITIES = {
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " ",
};

function decodeHtmlEntities(text) {
  if (typeof text !== "string" || text.length === 0) return "";

  return text
    .replace(/&#x([0-9a-fA-F]+);?/g, (_, hex) => {
      const codePoint = parseInt(hex, 16);
      return Number.isNaN(codePoint) ? _ : String.fromCharCode(codePoint);
    })
    .replace(/&#(\d+);?/g, (_, num) => {
      const codePoint = parseInt(num, 10);
      return Number.isNaN(codePoint) ? _ : String.fromCharCode(codePoint);
    })
    .replace(/&[a-zA-Z#0-9]+;?/g, (entity) => NAMED_ENTITIES[entity] ?? entity);
}

function extractSection(html, markers = []) {
  const cleanText = (text) =>
    decodeHtmlEntities(
      text
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    );

  for (const marker of markers) {
    const markerIndex = html.indexOf(marker);
    if (markerIndex === -1) continue;

    const sectionStart = html.lastIndexOf("<section", markerIndex);
    const searchStart = sectionStart === -1 ? markerIndex : sectionStart;
    const nextSection = html.indexOf("<section", markerIndex + marker.length);
    const sectionHtml = html.slice(
      searchStart,
      nextSection === -1 ? html.length : nextSection
    );

    const itemHtmlMatches = Array.from(
      sectionHtml.matchAll(
        /data-testid="item-html"[\s\S]*?<div class="[^"]*ipc-html-content-inner-div[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
      )
    );

    const items = itemHtmlMatches
      .map((match) => cleanText(match[1]))
      .filter(Boolean);
    if (items.length) return items;

    const legacyItems = sectionHtml
      .split(/<li[^>]*>/i)
      .slice(1)
      .map((item) => cleanText(item.split(/<\/li>/i)[0] || ""))
      .filter(Boolean);

    if (legacyItems.length) return legacyItems;
  }

  return [];
}

async function translateSections(sections, apiKey, selectedModel) {
  const modelToUse = selectedModel || DEFAULT_OPENROUTER_MODEL;
  const body = {
    model: modelToUse,
    messages: [
      {
        role: "system",
        content:
          'Ты переводчик. Переводи с английского на русский. Отвечай строго валидным JSON, без Markdown и пояснений. Не используй английский язык в ответе, кроме случаев имён собственных.',
      },
      {
        role: "user",
        content: JSON.stringify({
          instruction:
            'Переведи ВСЕ строки в "sections" на русский язык. Не меняй структуру. Верни JSON-объект с тем же полем "sections".',
          sections,
        }),
      },
    ],
    temperature: 0.2,
  };

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter request failed: ${response.status}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || "";
  const normalized = content
    .replace(/^```json/gi, "")
    .replace(/```$/g, "")
    .trim();
  try {
    return JSON.parse(normalized);
  } catch (err) {
    throw new Error("Failed to parse translation response");
  }
}

async function loadSelectedOpenRouterModel() {
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseKey) {
    return null;
  }

  try {
    const supabase = createClient(SUPABASE_URL, supabaseKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase
      .from("settings")
      .select("selected_ai_model, ai_model")
      .order("id", { ascending: true });

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    const settingsRow =
      rows.find((item) => item?.selected_ai_model) || rows[0] || null;
    const model =
      typeof settingsRow?.selected_ai_model === "string"
        ? settingsRow.selected_ai_model.trim()
        : typeof settingsRow?.ai_model === "string"
        ? settingsRow.ai_model.trim()
        : null;

    return model || null;
  } catch (err) {
    console.error("[imdb-parent-guide] failed to load ai_model", err);
    return null;
  }
}

export default async function handler(req, res) {
  const { id, skipTranslation } = req.query || {};
  if (!id) {
    res.status(400).json({ error: "Missing IMDb title id" });
    return;
  }

  const apiKey = process.env.OPENROUTER_API;
  const shouldSkipTranslation = skipTranslation === "true";

  try {
    // Parallelize fetching IMDb data and loading AI model settings
    const imdbUrl = `https://www.imdb.com/title/${encodeURIComponent(id)}/parentalguide/`;
    
    const [imdbResponse, selectedModel] = await Promise.all([
      fetch(imdbUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; PupsikTV/1.0)",
        },
      }),
      // Only load model if we might need it (i.e., we have an API key and aren't skipping translation)
      (!shouldSkipTranslation && apiKey) ? loadSelectedOpenRouterModel() : Promise.resolve(null)
    ]);

    if (!imdbResponse.ok) {
      res
        .status(imdbResponse.status)
        .json({ error: "Failed to fetch parental guide" });
      return;
    }

    const html = await imdbResponse.text();
    // console.log(`[imdb-parent-guide] fetched html length: ${html.length}`);

    const sections = Object.fromEntries(
      Object.entries(SECTION_MARKERS).map(([key, markers]) => [
        key,
        extractSection(html, markers),
      ])
    );

    // console.log("[imdb-parent-guide] parsed sections", {
    //   sexAndNudity: sections.sexAndNudity,
    //   violenceAndGore: sections.violenceAndGore,
    //   profanity: sections.profanity,
    // });

    // Prepare content object
    let content = { original: sections, translated: null };

    // If skipTranslation is enabled, return immediately
    if (shouldSkipTranslation) {
      // console.log("[imdb-parent-guide] skipping translation (fast mode)");
      res.status(200).json(content);
      return;
    }

    // Otherwise, proceed with translation
    if (!apiKey) {
      console.warn(
        "[imdb-parent-guide] Missing OpenRouter API key, returning original only"
      );
      res.status(200).json(content);
      return;
    }

    const translation = await translateSections(sections, apiKey, selectedModel);
    content.translated = translation;

    res.status(200).json(content);
  } catch (err) {
    console.error("[imdb-parent-guide] error", err);
    res.status(500).json({ error: "Server error", message: err.message });
  }
}
