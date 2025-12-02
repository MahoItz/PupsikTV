import { translateSections } from "./imdb-parent-guide-utils";

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

export default async function handler(req, res) {
  const { id, translate = "true" } = req.query || {};
  if (!id) {
    res.status(400).json({ error: "Missing IMDb title id" });
    return;
  }

  const shouldTranslate = String(translate).toLowerCase() !== "false";

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

    if (!shouldTranslate) {
      res.status(200).json({ original: sections, translated: null });
      return;
    }

    const translation = await translateSections(sections, apiKey);

    res.status(200).json({ original: sections, translated: translation });
  } catch (err) {
    res.status(500).json({ error: "Server error", message: err.message });
  }
}
