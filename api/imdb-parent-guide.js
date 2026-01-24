const { createNetlifyHandler } = require("./_netlify-wrapper.js");

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

async function handler(req, res) {
  const { id } = req.query || {};
  if (!id) {
    res.status(400).json({ error: "Missing IMDb title id" });
    return;
  }

  try {
    const imdbUrl = `https://www.imdb.com/title/${encodeURIComponent(id)}/parentalguide/`;
    const imdbHeaders = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "Sec-CH-UA":
        '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      "Sec-CH-UA-Mobile": "?0",
      "Sec-CH-UA-Platform": '"Windows"',
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
    };

    const imdbResponse = await fetch(imdbUrl, {
      headers: imdbHeaders,
    });

    const wafAction = imdbResponse.headers.get("x-amzn-waf-action");
    const serverHeader = imdbResponse.headers.get("server") || "";
    const contentLength = imdbResponse.headers.get("content-length");
    const isCloudfront = serverHeader.toLowerCase().includes("cloudfront");
    const isWafChallenge =
      imdbResponse.status === 202 ||
      (wafAction && wafAction !== "allow") ||
      (isCloudfront && contentLength === "0");

    if (isWafChallenge) {
      res.status(503).json({
        error: "IMDb WAF challenge",
        message:
          "IMDb защитил запрос (WAF challenge). Попробуйте позже или повторите запрос.",
        code: "waf_challenge",
        status: imdbResponse.status,
      });
      return;
    }

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
