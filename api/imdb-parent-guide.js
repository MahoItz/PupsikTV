const { createNetlifyHandler } = require("./_netlify-wrapper.js");

/**
 * IMDb Parental Guide fetch + HTML fallback parser.
 *
 * Notes:
 * - IMDb may return AWS WAF/CloudFront "challenge" (often status 202 + empty body).
 * - We explicitly detect this and return 503 with a stable error payload for the client.
 * - Headers are intentionally minimal and browser-like (avoid Sec-* / CH-* on server).
 */

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
    .replace(/&#x([0-9a-fA-F]+);?/g, (m, hex) => {
      const codePoint = parseInt(hex, 16);
      return Number.isNaN(codePoint) ? m : String.fromCharCode(codePoint);
    })
    .replace(/&#(\d+);?/g, (m, num) => {
      const codePoint = parseInt(num, 10);
      return Number.isNaN(codePoint) ? m : String.fromCharCode(codePoint);
    })
    .replace(/&[a-zA-Z#0-9]+;?/g, (entity) => NAMED_ENTITIES[entity] ?? entity);
}

function extractSection(html, markers = []) {
  const cleanText = (text) =>
    decodeHtmlEntities(
      String(text || "")
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

    // Current IMDb markup (common case)
    const itemHtmlMatches = Array.from(
      sectionHtml.matchAll(
        /data-testid="item-html"[\s\S]*?<div class="[^"]*ipc-html-content-inner-div[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
      )
    );

    const items = itemHtmlMatches
      .map((match) => cleanText(match[1]))
      .filter(Boolean);

    if (items.length) return items;

    // Legacy fallback (older markup)
    const legacyItems = sectionHtml
      .split(/<li[^>]*>/i)
      .slice(1)
      .map((item) => cleanText(item.split(/<\/li>/i)[0] || ""))
      .filter(Boolean);

    if (legacyItems.length) return legacyItems;
  }

  return [];
}

function buildImdbHeaders() {
  // Keep it minimal and plausible. Avoid browser-only Sec-* and CH-* headers on server.
  return {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-store",
  };
}

function detectWafChallenge(imdbResponse) {
  const wafAction = imdbResponse.headers.get("x-amzn-waf-action"); // allow | challenge | ...
  const server = (imdbResponse.headers.get("server") || "").toLowerCase();
  const xCache = (imdbResponse.headers.get("x-cache") || "").toLowerCase();
  const contentLength = imdbResponse.headers.get("content-length");

  const isCloudfront = server.includes("cloudfront");
  const isEmpty = contentLength === "0";

  // Strong signal: explicit WAF action
  if (wafAction === "challenge") {
    return { isWaf: true, wafAction: "challenge" };
  }

  // Common "soft block": 202 + CloudFront + empty body
  if (imdbResponse.status === 202 && isCloudfront && isEmpty) {
    return { isWaf: true, wafAction: wafAction || "unknown" };
  }

  // Another common signal in your logs: CloudFront error + empty body
  if (isCloudfront && isEmpty && xCache.includes("error from cloudfront")) {
    return { isWaf: true, wafAction: wafAction || "unknown" };
  }

  return { isWaf: false, wafAction: wafAction || null };
}

function pickDiagnostics(imdbResponse, imdbUrl) {
  return {
    requestedUrl: imdbUrl,
    finalUrl: imdbResponse.url,
    status: imdbResponse.status,
    ok: imdbResponse.ok,
    contentType: imdbResponse.headers.get("content-type"),
    contentLength: imdbResponse.headers.get("content-length"),
    server: imdbResponse.headers.get("server"),
    xCache: imdbResponse.headers.get("x-cache"),
    wafAction: imdbResponse.headers.get("x-amzn-waf-action"),
    via: imdbResponse.headers.get("via"),
    cfPop: imdbResponse.headers.get("x-amz-cf-pop"),
  };
}

async function handler(req, res) {
  const { id } = req.query || {};
  if (!id || typeof id !== "string" || !id.trim()) {
    res.status(400).json({ error: "Missing IMDb title id" });
    return;
  }

  const imdbId = id.trim();
  const imdbUrl = `https://www.imdb.com/title/${encodeURIComponent(
    imdbId
  )}/parentalguide/`;

  try {
    // Fetch IMDb
    const imdbResponse = await fetch(imdbUrl, {
      method: "GET",
      redirect: "follow",
      headers: buildImdbHeaders(),
    });

    const diag = pickDiagnostics(imdbResponse, imdbUrl);

    // Detect WAF/CloudFront challenge early
    const waf = detectWafChallenge(imdbResponse);
    if (waf.isWaf) {
      console.warn("[imdb-parent-guide] WAF challenge", { id: imdbId, ...diag });

      res.status(503).json({
        error: "IMDb WAF challenge",
        message:
          "IMDb временно блокирует автоматические запросы (WAF challenge). Попробуйте позже.",
        code: "waf_challenge",
        imdb: {
          status: imdbResponse.status,
          wafAction: diag.wafAction || waf.wafAction,
          server: diag.server,
          xCache: diag.xCache,
          cfPop: diag.cfPop,
        },
      });
      return;
    }

    if (!imdbResponse.ok) {
      console.warn("[imdb-parent-guide] Fetch failed", { id: imdbId, ...diag });

      res.status(imdbResponse.status).json({
        error: "Failed to fetch parental guide",
        code: "imdb_fetch_failed",
        imdb: { status: imdbResponse.status },
      });
      return;
    }

    const html = await imdbResponse.text();

    if (!html || html.length === 0) {
      // Defensive: empty body without explicit WAF headers
      console.warn("[imdb-parent-guide] Empty HTML body", { id: imdbId, ...diag });

      res.status(503).json({
        error: "Empty IMDb response",
        message:
          "IMDb вернул пустой ответ. Вероятно, включилась защита или временная ошибка.",
        code: "empty_html",
        imdb: { status: imdbResponse.status },
      });
      return;
    }

    // Parse sections
    const sections = Object.fromEntries(
      Object.entries(SECTION_MARKERS).map(([key, markers]) => [
        key,
        extractSection(html, markers),
      ])
    );

    const hasAny =
      (sections.sexAndNudity && sections.sexAndNudity.length > 0) ||
      (sections.violenceAndGore && sections.violenceAndGore.length > 0) ||
      (sections.profanity && sections.profanity.length > 0);

    res.status(200).json({
      original: sections,
      empty: !hasAny,
      source: "imdb_html",
    });
  } catch (err) {
    console.error("[imdb-parent-guide] error", err);

    res.status(500).json({
      error: "Server error",
      code: "server_error",
      message:
        err && typeof err.message === "string" && err.message.trim()
          ? err.message
          : "Unknown error",
    });
  }
}

module.exports = handler;
module.exports.handler = createNetlifyHandler(handler);