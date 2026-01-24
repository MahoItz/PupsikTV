const { createNetlifyHandler } = require("./_netlify-wrapper.js");

const SECTION_MARKERS = {
  sexAndNudity: [
    'data-testid="advisory-section-nudity"',
    'data-testid="section-nudity"',
    'data-testid="sub-section-nudity"',
    'id="nudity"',
    "advisory-sex-content",
    "Sex &amp; Nudity",
  ],
  violenceAndGore: [
    'data-testid="advisory-section-violence"',
    'data-testid="section-violence"',
    'data-testid="sub-section-violence"',
    'id="violence"',
    "advisory-violence-content",
    "Violence &amp; Gore",
  ],
  profanity: [
    'data-testid="advisory-section-profanity"',
    'data-testid="section-profanity"',
    'data-testid="sub-section-profanity"',
    'id="profanity"',
    "advisory-profanity-content",
    "Profanity",
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
      (text || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    );
  const hasContent = (text) => typeof text === "string" && text.trim().length;

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

    const itemHtmlMatches = [
      ...sectionHtml.matchAll(
        /data-testid="item-html"[\s\S]*?<div class="[^"]*ipc-html-content-inner[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
      ),
      ...sectionHtml.matchAll(
        /data-testid="(?:item-|parentalguide-item-|advisory-item-)?(?:content|description)"[^>]*>([\s\S]*?)<\/(?:div|span|p)>/gi
      ),
      ...sectionHtml.matchAll(
        /class="[^"]*ipc-html-content-inner[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
      ),
    ];

    const items = itemHtmlMatches
      .map((match) => cleanText(match[1]))
      .filter(hasContent);
    if (items.length) return Array.from(new Set(items));

    const legacyItems = sectionHtml
      .split(/<li[^>]*>/i)
      .slice(1)
      .map((item) => cleanText(item.split(/<\/li>/i)[0] || ""))
      .filter(hasContent);

    if (legacyItems.length) return legacyItems;
  }

  return [];
}

async function handler(req, res) {
  const { id } = req.query || {};
  if (!id) {
    res.status(400).json({ error: "Missing IMDb title id" });
    return;
  }

  try {
    const imdbUrl = `https://www.imdb.com/title/${encodeURIComponent(id)}/parentalguide/`;

    const imdbResponse = await fetch(imdbUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PupsikTV/1.0)",
      },
    });

    if (!imdbResponse.ok) {
      res
        .status(imdbResponse.status)
        .json({ error: "Failed to fetch parental guide" });
      return;
    }

    const html = await imdbResponse.text();

    const sections = Object.fromEntries(
      Object.entries(SECTION_MARKERS).map(([key, markers]) => [
        key,
        extractSection(html, markers),
      ])
    );

    res.status(200).json({ original: sections });
  } catch (err) {
    console.error("[imdb-parent-guide] error", err);
    res.status(500).json({ error: "Server error", message: err.message });
  }
}

module.exports = handler;
module.exports.handler = createNetlifyHandler(handler);
