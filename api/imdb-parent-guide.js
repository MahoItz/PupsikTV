const SECTION_MARKERS = {
  sexAndNudity: [
    'data-testid="sub-section-nudity"',
    'data-testid="advisory-nudity"',
    'id="nudity"',
    "advisory-sex-content",
    "sex-and-nudity",
    "sexandnudity",
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

const TARGET_SECTION_KEY = "sexAndNudity";
const TARGET_SECTION_PATH_MATCHERS = [
  "sexandnudity",
  "sex_and_nudity",
  "sex-and-nudity",
  "nudity",
  "advisorysexcontent",
  "advisory-sex-content",
];
const TARGET_TEXT_KEYS = ["text", "plainText", "content", "html", "description"];

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

function cleanText(text) {
  return decodeHtmlEntities(
    String(text || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function isParentGuideNoiseLine(text) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const normalizedNoIndex = normalized.replace(/^\d+\.\s*/, "");
  const noisePatterns = [
    /add an item/,
    /rate this title for sex\s*(?:&|and)\s*nudity/,
    /\bfound this to have\b/,
    /\b\d+\s+of\s+\d+\b/,
    /\bvote\b/,
    /see all parent guides?/,
    /^sex\s*(?:&|and)\s*nudity$/,
  ];

  return noisePatterns.some((pattern) => pattern.test(normalizedNoIndex));
}

function dedupeItems(items = []) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const normalized = cleanText(item);
    if (!normalized || normalized.length < 2) {
      continue;
    }
    if (isParentGuideNoiseLine(normalized)) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function extractItemsFromSectionHtml(sectionHtml) {
  const strategyItemHtml = Array.from(
    sectionHtml.matchAll(
      /data-testid="item-html"[\s\S]*?<div class="[^"]*ipc-html-content-inner-div[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
    )
  )
    .map((match) => cleanText(match[1]))
    .filter(Boolean);

  if (strategyItemHtml.length > 0) {
    return dedupeItems(strategyItemHtml);
  }

  const listItems = Array.from(sectionHtml.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi))
    .map((match) => cleanText(match[1]))
    .filter(Boolean);

  if (listItems.length > 0) {
    return dedupeItems(listItems);
  }

  const paragraphItems = Array.from(
    sectionHtml.matchAll(/<(?:p|div)[^>]*>([\s\S]*?)<\/(?:p|div)>/gi)
  )
    .map((match) => cleanText(match[1]))
    .filter((line) => line && line.length > 20);

  return dedupeItems(paragraphItems);
}

function extractByMarkers(html, markers = []) {
  for (const marker of markers) {
    const markerIndex = html.indexOf(marker);
    if (markerIndex === -1) continue;

    const sectionStart = Math.max(
      html.lastIndexOf("<section", markerIndex),
      html.lastIndexOf("<div", markerIndex)
    );
    const searchStart = sectionStart === -1 ? markerIndex : sectionStart;
    const nextBoundaryCandidates = [
      html.indexOf("<section", markerIndex + marker.length),
      html.indexOf("<h2", markerIndex + marker.length),
      html.indexOf("<h3", markerIndex + marker.length),
    ].filter((idx) => idx !== -1);
    const nextBoundary =
      nextBoundaryCandidates.length > 0
        ? Math.min(...nextBoundaryCandidates)
        : html.length;
    const sectionHtml = html.slice(searchStart, nextBoundary);

    const items = extractItemsFromSectionHtml(sectionHtml);
    if (items.length > 0) {
      return items;
    }
  }

  return [];
}

function extractByHeading(html) {
  const headingMatch = /sex\s*(?:&amp;|&|and)\s*nudity/i.exec(html);
  if (!headingMatch || headingMatch.index < 0) {
    return [];
  }

  const headingIndex = headingMatch.index;
  const sectionStart = Math.max(
    html.lastIndexOf("<section", headingIndex),
    html.lastIndexOf("<div", headingIndex),
    headingIndex
  );

  const boundaryRegex =
    /(?:violence\s*(?:&amp;|&|and)\s*gore|profanity|alcohol[, ]+drugs\s*(?:&amp;|&|and)\s*smoking|frightening\s*(?:&amp;|&|and)\s*intense\s*scenes)/i;
  const remaining = html.slice(headingIndex + headingMatch[0].length);
  const boundaryMatch = boundaryRegex.exec(remaining);
  const sectionEnd =
    boundaryMatch && boundaryMatch.index > 0
      ? headingIndex + headingMatch[0].length + boundaryMatch.index
      : Math.min(html.length, headingIndex + 25000);

  const sectionHtml = html.slice(sectionStart, sectionEnd);
  return extractItemsFromSectionHtml(sectionHtml);
}

function safeJsonParse(raw) {
  if (typeof raw !== "string") {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function containsTargetPath(path = "") {
  const normalizedPath = path
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");

  return TARGET_SECTION_PATH_MATCHERS.some((marker) =>
    normalizedPath.includes(marker.replace(/[^a-z0-9_-]/g, ""))
  );
}

function collectTextsFromJson(value, path = "", inTargetSection = false, bucket = []) {
  if (value === null || value === undefined) {
    return bucket;
  }

  if (typeof value === "string") {
    if (inTargetSection) {
      const normalized = cleanText(value);
      if (normalized) {
        bucket.push(normalized);
      }
    }
    return bucket;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectTextsFromJson(item, `${path}[${index}]`, inTargetSection, bucket);
    });
    return bucket;
  }

  if (typeof value === "object") {
    Object.entries(value).forEach(([key, nestedValue]) => {
      const nextPath = path ? `${path}.${key}` : key;
      const keyTarget = containsTargetPath(key);
      const pathTarget = containsTargetPath(nextPath);
      const nextInTargetSection = inTargetSection || keyTarget || pathTarget;

      const normalizedKey = String(key || "").toLowerCase();
      if (
        nextInTargetSection &&
        typeof nestedValue === "string" &&
        TARGET_TEXT_KEYS.includes(normalizedKey)
      ) {
        const normalized = cleanText(nestedValue);
        if (normalized) {
          bucket.push(normalized);
        }
      }

      collectTextsFromJson(nestedValue, nextPath, nextInTargetSection, bucket);
    });
  }

  return bucket;
}

function extractFromEmbeddedJson(html) {
  const scripts = Array.from(
    html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)
  ).map((match) => match[1] || "");

  const scriptCandidates = scripts.filter((raw) =>
    /(sex|nudity|advisory|parental\s*guide)/i.test(raw)
  );

  for (const scriptContent of scriptCandidates) {
    const parsed = safeJsonParse(scriptContent.trim());
    if (!parsed) {
      continue;
    }

    const extracted = dedupeItems(collectTextsFromJson(parsed));
    if (extracted.length > 0) {
      return extracted;
    }
  }

  return [];
}

function hasParentGuideContent(sections = {}) {
  return Object.values(sections).some(
    (items) => Array.isArray(items) && items.length > 0
  );
}

function hasParentGuidePageSignals(html) {
  const lower = String(html || "").toLowerCase();
  return (
    lower.includes("parental guide") ||
    lower.includes("parent guide") ||
    lower.includes("advisory")
  );
}

function hasSexAndNuditySectionSignals(html) {
  const lower = String(html || "").toLowerCase();
  return (
    /sex\s*(?:&amp;|&|and)\s*nudity/i.test(html) ||
    lower.includes("sub-section-nudity") ||
    lower.includes("advisory-nudity") ||
    lower.includes('id="nudity"') ||
    lower.includes("rate this title for sex")
  );
}

function detectBlockedOrInterstitial(html) {
  const lower = String(html || "").toLowerCase();
  const blockingSignals = [
    "captcha",
    "not a robot",
    "verify you are human",
    "automated access",
    "unusual traffic",
    "security check",
    "consent",
    "privacy choices",
    "enable javascript",
  ];
  const parentGuideSignals = [
    "parental guide",
    "sex & nudity",
    "sex and nudity",
    "advisory",
  ];

  const hasBlockingSignal = blockingSignals.some((signal) =>
    lower.includes(signal)
  );
  const hasParentGuideSignal = parentGuideSignals.some((signal) =>
    lower.includes(signal)
  );

  if (hasBlockingSignal) {
    return true;
  }

  return !hasParentGuideSignal && lower.length < 15000;
}

function parseParentGuide(html) {
  const strategyA = extractByMarkers(html, SECTION_MARKERS[TARGET_SECTION_KEY]);
  if (strategyA.length > 0) {
    return {
      sections: { [TARGET_SECTION_KEY]: strategyA },
      meta: {
        strategy: "marker",
        blockedDetected: false,
        emptyReason: null,
      },
    };
  }

  const strategyB = extractFromEmbeddedJson(html);
  if (strategyB.length > 0) {
    return {
      sections: { [TARGET_SECTION_KEY]: strategyB },
      meta: {
        strategy: "embedded_json",
        blockedDetected: false,
        emptyReason: null,
      },
    };
  }

  const strategyC = extractByHeading(html);
  if (strategyC.length > 0) {
    return {
      sections: { [TARGET_SECTION_KEY]: strategyC },
      meta: {
        strategy: "heading_html",
        blockedDetected: false,
        emptyReason: null,
      },
    };
  }

  const blockedDetected = detectBlockedOrInterstitial(html);
  const hasParentGuidePage = hasParentGuidePageSignals(html);
  const hasSexSection = hasSexAndNuditySectionSignals(html);
  const emptyReason =
    hasParentGuidePage && hasSexSection
      ? "section_has_no_items"
      : blockedDetected
      ? "blocked_or_layout_changed"
      : "parse_empty";

  return {
    sections: { [TARGET_SECTION_KEY]: [] },
    meta: {
      strategy: "none",
      blockedDetected,
      emptyReason,
    },
  };
}

async function handler(req, res) {
  const { id } = req.query || {};
  if (!id) {
    res.status(400).json({ error: "Missing IMDb title id" });
    return;
  }

  try {
    const imdbUrl = `https://m.imdb.com/title/${encodeURIComponent(id)}/parentalguide`;
    const mobileUserAgent =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    const maxAttempts = 3;
    const baseDelayMs = 600;
    let imdbResponse = null;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        imdbResponse = await fetch(imdbUrl, {
          headers: {
            "User-Agent": mobileUserAgent,
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            Referer: "https://m.imdb.com/",
          },
          redirect: "follow",
        });

        if (!String(imdbResponse.url || "").startsWith("https://m.imdb.com/")) {
          throw new Error(
            `Unexpected IMDb host after redirects: ${imdbResponse.url || "unknown"}`
          );
        }

        if (imdbResponse.ok) {
          break;
        }

        const shouldRetry =
          imdbResponse.status === 429 || imdbResponse.status >= 500;
        if (!shouldRetry || attempt === maxAttempts) {
          res
            .status(imdbResponse.status)
            .json({ error: "Failed to fetch parental guide" });
          return;
        }
      } catch (err) {
        lastError = err;
        if (attempt === maxAttempts) {
          throw err;
        }
      }

      await new Promise((resolve) =>
        setTimeout(resolve, baseDelayMs * attempt)
      );
    }

    if (!imdbResponse || !imdbResponse.ok) {
      throw lastError || new Error("Failed to fetch IMDb parental guide");
    }

    const html = await imdbResponse.text();
    const parsed = parseParentGuide(html);
    const hasContent = hasParentGuideContent(parsed.sections);

    console.info("[imdb-parent-guide] parse result", {
      imdbId: id,
      strategy: parsed.meta.strategy,
      blockedDetected: parsed.meta.blockedDetected,
      hasContent,
      itemCount: parsed.sections?.sexAndNudity?.length || 0,
    });

    if (hasContent) {
      res.status(200).json({ original: parsed.sections, meta: parsed.meta });
      return;
    }

    if (parsed.meta.emptyReason === "section_has_no_items") {
      res.status(200).json({ original: parsed.sections, meta: parsed.meta });
      return;
    }

    if (parsed.meta.blockedDetected) {
      res.status(502).json({
        error: "IMDb blocked request or layout changed",
        code: "IMDB_BLOCKED_OR_LAYOUT_CHANGED",
        meta: parsed.meta,
      });
      return;
    }

    res.status(424).json({
      error: "Failed to parse IMDb parent guide",
      code: "PARENT_GUIDE_PARSE_EMPTY",
      meta: parsed.meta,
    });
  } catch (err) {
    console.error("[imdb-parent-guide] error", err);
    res.status(500).json({ error: "Server error", message: err.message });
  }
}

module.exports = handler;
