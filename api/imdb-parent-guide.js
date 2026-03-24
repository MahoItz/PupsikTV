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
    /\b\d+\s+of\s+\d+\b/,
    /\bvote\b/,
    /see all parent guides?/,
    /^sex\s*(?:&|and)\s*nudity$/,
  ];

  return noisePatterns.some((pattern) => pattern.test(normalizedNoIndex));
}

function sanitizeParentGuideLine(text) {
  let normalized = cleanText(text);
  if (!normalized) {
    return "";
  }

  // IMDb often appends voting helpers to real advisory text:
  // "... 23 of 31 found this to have a severe rating"
  normalized = normalized
    .replace(/\s+\d+\s+of\s+\d+\s+found this to have\b[\s\S]*$/i, "")
    .replace(/\s+\d+\s+out of\s+\d+\s+found this helpful\b[\s\S]*$/i, "")
    .replace(/\s+edit$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return normalized;
}

function dedupeItems(items = []) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const normalized = sanitizeParentGuideLine(item);
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

function parseMirrorParentGuideText(rawText) {
  const text = String(rawText || "");
  if (!text) {
    return [];
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => cleanText(line))
    .filter(Boolean);

  const startIndex = lines.findIndex((line) =>
    /^sex\s*(?:&|and)\s*nudity$/i.test(line)
  );
  if (startIndex === -1) {
    return [];
  }

  const stopSectionPattern =
    /^(violence\s*(?:&|and)\s*gore|profanity|alcohol[, ]+drugs\s*(?:&|and)\s*smoking|frightening\s*(?:&|and)\s*intense\s*scenes)$/i;
  const items = [];

  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    if (stopSectionPattern.test(line)) break;

    const normalized = line
      .replace(/^[-*•]\s*/, "")
      .replace(/^\d+\.\s*/, "")
      .trim();
    if (normalized.length < 4) continue;
    if (isParentGuideNoiseLine(normalized)) continue;
    items.push(normalized);
  }

  return dedupeItems(items);
}

function buildDebugSnapshot(rawText) {
  const text = String(rawText || "");
  if (!text) {
    return {
      length: 0,
      hasCaptcha: false,
      hasConsent: false,
      hasRobotCheck: false,
      excerpt: "",
    };
  }

  const lower = text.toLowerCase();
  return {
    length: text.length,
    hasCaptcha: lower.includes("captcha"),
    hasConsent:
      lower.includes("consent") ||
      lower.includes("privacy choices") ||
      lower.includes("cookie"),
    hasRobotCheck:
      lower.includes("not a robot") ||
      lower.includes("verify you are human") ||
      lower.includes("automated access"),
    excerpt: cleanText(text).slice(0, 600),
  };
}

async function handler(req, res) {
  const { id } = req.query || {};
  const debugMode = String(req.query?.debug || "") === "1";
  if (!id) {
    res.status(400).json({ error: "Missing IMDb title id" });
    return;
  }

  try {
    const encodedId = encodeURIComponent(id);
    const imdbCandidates = [
      {
        source: "mobile",
        allowedHost: "m.imdb.com",
        url: `https://m.imdb.com/title/${encodedId}/parentalguide`,
      },
      {
        source: "mobile",
        allowedHost: "m.imdb.com",
        url: `https://m.imdb.com/title/${encodedId}/parentalguide/`,
      },
      {
        source: "mobile",
        allowedHost: "m.imdb.com",
        url: `https://m.imdb.com/title/${encodedId}/parentalguide?ref_=tt_stry_pg`,
      },
      {
        source: "mobile",
        allowedHost: "m.imdb.com",
        url: `https://m.imdb.com/title/${encodedId}/parentalguide/?ref_=tt_stry_pg`,
      },
      {
        source: "desktop_fallback",
        allowedHost: "www.imdb.com",
        url: `https://www.imdb.com/title/${encodedId}/parentalguide`,
      },
      {
        source: "desktop_fallback",
        allowedHost: "www.imdb.com",
        url: `https://www.imdb.com/title/${encodedId}/parentalguide/?ref_=tt_stry_pg`,
      },
      {
        source: "mirror_mobile_fallback",
        allowedHost: null,
        url: `https://r.jina.ai/http://m.imdb.com/title/${encodedId}/parentalguide`,
      },
      {
        source: "mirror_desktop_fallback",
        allowedHost: null,
        url: `https://r.jina.ai/http://www.imdb.com/title/${encodedId}/parentalguide`,
      },
    ];
    const mobileUserAgent =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    const maxAttempts = 2;
    const baseDelayMs = 600;
    let lastError = null;
    let fallbackResult = null;
    const candidateDebug = [];

    for (const candidate of imdbCandidates) {
      const { url: imdbUrl, allowedHost, source } = candidate;
      let imdbResponse = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          imdbResponse = await fetch(imdbUrl, {
            headers: {
              "User-Agent": mobileUserAgent,
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.9",
              Referer: "https://m.imdb.com/",
              "Cache-Control": "no-cache",
              Pragma: "no-cache",
            },
            redirect: "follow",
          });

          if (
            allowedHost &&
            !String(imdbResponse.url || "").startsWith(
              `https://${allowedHost}/`
            )
          ) {
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
            lastError = new Error(
              `IMDb request failed ${imdbResponse.status} for ${imdbUrl}`
            );
          }
        } catch (err) {
          lastError = err;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, baseDelayMs * attempt)
        );
      }

      if (!imdbResponse || !imdbResponse.ok) {
        if (debugMode) {
          candidateDebug.push({
            source,
            url: imdbUrl,
            status: imdbResponse?.status || null,
            ok: false,
          });
        }
        continue;
      }

      const html = await imdbResponse.text();
      if (debugMode) {
        candidateDebug.push({
          source,
          url: imdbUrl,
          status: imdbResponse.status,
          ok: true,
          finalUrl: imdbResponse.url || null,
          snapshot: buildDebugSnapshot(html),
        });
      }
      const parsed = parseParentGuide(html);
      let hasContent = hasParentGuideContent(parsed.sections);
      let parsedResult = parsed;

      if (!hasContent && source.startsWith("mirror_")) {
        const mirrorItems = parseMirrorParentGuideText(html);
        if (mirrorItems.length > 0) {
          parsedResult = {
            sections: { sexAndNudity: mirrorItems },
            meta: {
              strategy: "mirror_text_section",
              blockedDetected: false,
              emptyReason: null,
            },
          };
          hasContent = true;
        }
      }

      console.info("[imdb-parent-guide] parse result", {
        imdbId: id,
        source,
        strategy: parsedResult.meta.strategy,
        blockedDetected: parsedResult.meta.blockedDetected,
        hasContent,
        itemCount: parsedResult.sections?.sexAndNudity?.length || 0,
      });

      if (hasContent) {
        res
          .status(200)
          .json({
            original: parsedResult.sections,
            meta: {
              ...parsedResult.meta,
              source,
              ...(debugMode ? { debug: candidateDebug } : {}),
            },
          });
        return;
      }

      if (parsedResult.meta.emptyReason === "section_has_no_items") {
        res
          .status(200)
          .json({
            original: parsedResult.sections,
            meta: {
              ...parsedResult.meta,
              source,
              ...(debugMode ? { debug: candidateDebug } : {}),
            },
          });
        return;
      }

      fallbackResult = {
        parsed: parsedResult,
        source,
      };
    }

    if (fallbackResult?.parsed?.meta?.blockedDetected) {
      res.status(200).json({
        original: fallbackResult.parsed.sections,
        code: "IMDB_BLOCKED_OR_LAYOUT_CHANGED",
        meta: {
          ...fallbackResult.parsed.meta,
          source: fallbackResult.source,
          ...(debugMode ? { debug: candidateDebug } : {}),
        },
      });
      return;
    }

    if (fallbackResult?.parsed) {
      res.status(424).json({
        error: "Failed to parse IMDb parent guide",
        code: "PARENT_GUIDE_PARSE_EMPTY",
        meta: {
          ...fallbackResult.parsed.meta,
          source: fallbackResult.source,
          ...(debugMode ? { debug: candidateDebug } : {}),
        },
      });
      return;
    }

    throw lastError || new Error("Failed to fetch IMDb parental guide");

  } catch (err) {
    console.error("[imdb-parent-guide] error", err);
    res.status(500).json({ error: "Server error", message: err.message });
  }
}

module.exports = handler;
