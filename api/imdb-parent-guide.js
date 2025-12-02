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

function extractSection(html, markers = []) {
  const cleanText = (text) =>
    text
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

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

async function translateSections(sections, apiKey) {
  const selectedModel = (await loadSelectedOpenRouterModel()) || DEFAULT_OPENROUTER_MODEL;
  const body = {
    model: selectedModel,
    messages: [
      {
        role: "system",
        content:
          'Ты — профессиональный переводчик с английского на русский язык. Твоя задача — переводить содержание разделов IMDb "Parents Guide" на естественный, грамотный русский язык. Всегда отвечай строго в виде корректного JSON. Структура JSON должна полностью соответствовать структуре входных данных: те же ключи, те же массивы, та же длина массивов и тот же порядок элементов. Ничего не добавляй и не удаляй. Все строки должны быть переведены исключительно на русский язык. Не используй английский язык в ответе, кроме случаев имён собственных.',
      },
      {
        role: "user",
        content: JSON.stringify({
          instruction:
            'Переведи каждую строку в объекте "sections" на русский язык. Сохрани структуру JSON без изменений: те же ключи, массивы и порядок элементов. Каждый элемент массива должен быть грамотным, естественным русским предложением или фразой. Ответ должен быть строго корректным JSON без каких-либо дополнительных комментариев или текста.',
          sections,
        }),
      },
    ],
    temperature: 0.3,
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
    const settingsRow = rows.find((item) => item?.selected_ai_model) || rows[0] || null;
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
  const { id } = req.query || {};
  if (!id) {
    res.status(400).json({ error: "Missing IMDb title id" });
    return;
  }

  const apiKey = process.env.OPENROUTER_API;
  if (!apiKey) {
    res.status(500).json({ error: "Missing OpenRouter API key" });
    return;
  }

  try {
    const url = `https://www.imdb.com/title/${encodeURIComponent(
      id
    )}/parentalguide/`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PupsikTV/1.0)",
      },
    });

    if (!response.ok) {
      res
        .status(response.status)
        .json({ error: "Failed to fetch parental guide" });
      return;
    }

    const html = await response.text();
    console.log(`[imdb-parent-guide] fetched html length: ${html.length}`);

    const sections = Object.fromEntries(
      Object.entries(SECTION_MARKERS).map(([key, markers]) => [
        key,
        extractSection(html, markers),
      ])
    );

    console.log("[imdb-parent-guide] parsed sections", {
      sexAndNudity: sections.sexAndNudity,
      violenceAndGore: sections.violenceAndGore,
      profanity: sections.profanity,
    });

    const translation = await translateSections(sections, apiKey);

    res.status(200).json({ original: sections, translated: translation });
  } catch (err) {
    res.status(500).json({ error: "Server error", message: err.message });
  }
}
