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

function extractNextData(html) {
  const match = html.match(
    /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i
  );
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    return null;
  }
}

function collectAdvisories(node, results) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((item) => collectAdvisories(item, results));
    return;
  }

  const maybeCategory =
    typeof node.category === "string" ? node.category : node.section;
  const maybeText =
    typeof node.text === "string"
      ? node.text
      : typeof node.displayText === "string"
        ? node.displayText
        : typeof node.content === "string"
          ? node.content
          : null;

  if (maybeCategory && maybeText) {
    const key = normalizeCategory(maybeCategory);
    results[key] = results[key] || [];
    results[key].push(maybeText);
  }

  Object.values(node).forEach((value) => collectAdvisories(value, results));
}

function extractSectionsFromNextData(html) {
  const data = extractNextData(html);
  if (!data) return {};
  const results = {};
  collectAdvisories(data, results);
  return results;
}

function normalizeCategory(category) {
  const normalized = category.toLowerCase().replace(/[^a-z]+/g, "-");
  if (normalized.includes("nudity") || normalized.includes("sex")) {
    return "sexAndNudity";
  }
  if (normalized.includes("violence") || normalized.includes("gore")) {
    return "violenceAndGore";
  }
  if (normalized.includes("profanity") || normalized.includes("language")) {
    return "profanity";
  }
  return normalized;
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

    console.log("[imdb-parent-guide] fetch response", {
      url: imdbResponse.url,
      redirected: imdbResponse.redirected,
      status: imdbResponse.status,
      ok: imdbResponse.ok,
      contentType: imdbResponse.headers.get("content-type"),
      contentLength: imdbResponse.headers.get("content-length"),
      location: imdbResponse.headers.get("location"),
    });

    if (!imdbResponse.ok) {
      res
        .status(imdbResponse.status)
        .json({ error: "Failed to fetch parental guide" });
      return;
    }

    const htmlBuffer = Buffer.from(await imdbResponse.arrayBuffer());
    const htmlBytes = htmlBuffer.length;
    const html = htmlBuffer.toString("utf8");
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);

    console.log("[imdb-parent-guide] html diagnostics", {
      length: html.length,
      bytes: htmlBytes,
      hasNextData: html.includes("__NEXT_DATA__"),
      hasRobotCheck: /Robot Check/i.test(html),
      hasCaptcha: /captcha/i.test(html),
      hasAccessDenied: /Access Denied/i.test(html),
      title: titleMatch ? titleMatch[1].trim() : null,
    });

    const nextDataSections = extractSectionsFromNextData(html);

    const sections = Object.fromEntries(
      Object.entries(SECTION_MARKERS).map(([key, markers]) => [
        key,
        (() => {
          const nextItems = (nextDataSections[key] || [])
            .map((item) => decodeHtmlEntities(item).trim())
            .filter((item) => item.length);
          return nextItems.length ? nextItems : extractSection(html, markers);
        })(),
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
