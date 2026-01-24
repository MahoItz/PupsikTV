const { createNetlifyHandler } = require("./_netlify-wrapper.js");

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

const SECTION_KEY_ALIASES = {
  sexAndNudity: [
    "sexAndNudity",
    "sex_and_nudity",
    "sexNudity",
    "sex",
    "nudity",
    "nudity_info",
  ],
  violenceAndGore: [
    "violenceAndGore",
    "violence_and_gore",
    "violenceGore",
    "violence",
    "gore",
    "violence_info",
    "gore_info",
  ],
  profanity: [
    "profanity",
    "language",
    "profanityLanguage",
    "languageProfanity",
    "profanity_info",
    "language_info",
  ],
};

const ITEM_TEXT_KEYS = [
  "text",
  "content",
  "description",
  "detail",
  "comment",
  "summary",
  "body",
  "warning",
  "label",
];

function cleanText(value) {
  if (typeof value !== "string") return "";

  return decodeHtmlEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitNumberedText(text) {
  if (!text) return [];

  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const items = [];
  lines.forEach((line) => {
    const match = line.match(/^\d+\.\s*(.+)$/);
    if (match) {
      items.push(match[1]);
      return;
    }
    if (items.length === 0) {
      items.push(line);
    } else {
      items[items.length - 1] = `${items[items.length - 1]} ${line}`.trim();
    }
  });

  return items;
}

function extractItemText(item) {
  if (typeof item === "string") return cleanText(item);
  if (typeof item === "number") return String(item);
  if (!item || typeof item !== "object") return "";

  for (const key of ITEM_TEXT_KEYS) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) {
      return cleanText(value);
    }
  }

  const severity =
    typeof item.severity === "string" && item.severity.trim()
      ? item.severity.trim()
      : "";

  if (typeof item.text === "string" && item.text.trim()) {
    return severity ? `${severity}: ${cleanText(item.text)}` : cleanText(item.text);
  }

  return "";
}

function normalizeSectionValue(value, collected = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => normalizeSectionValue(item, collected));
    return collected;
  }

  if (typeof value === "string") {
    const text = cleanText(value);
    if (text) {
      const splitItems = splitNumberedText(text);
      if (splitItems.length > 1) {
        splitItems.forEach((item) => {
          const cleanedItem = cleanText(item);
          if (cleanedItem) collected.push(cleanedItem);
        });
      } else {
        collected.push(text);
      }
    }
    return collected;
  }

  if (!value || typeof value !== "object") {
    return collected;
  }

  const nestedCollections = [
    value.items,
    value.list,
    value.entries,
    value.data,
    value.warnings,
    value.guides,
    value.sections,
  ];

  for (const nested of nestedCollections) {
    if (nested !== undefined) {
      normalizeSectionValue(nested, collected);
    }
  }

  const itemText = extractItemText(value);
  if (itemText) {
    collected.push(itemText);
  }

  return collected;
}

function findSectionValue(sectionSource, aliases) {
  if (!sectionSource || typeof sectionSource !== "object") {
    return undefined;
  }

  for (const key of aliases) {
    if (sectionSource[key] !== undefined) {
      return sectionSource[key];
    }
  }

  return undefined;
}

function extractSections(payload) {
  const sources = [
    payload?.original,
    payload?.sections,
    payload?.parentalGuide,
    payload?.parental_guide,
    payload?.data,
    payload,
  ].filter(Boolean);

  const result = {};

  for (const [sectionKey, aliases] of Object.entries(SECTION_KEY_ALIASES)) {
    let value;
    for (const source of sources) {
      value = findSectionValue(source, aliases);
      if (value !== undefined) break;
    }

    result[sectionKey] = Array.from(new Set(normalizeSectionValue(value)));
  }

  return result;
}

async function handler(req, res) {
  const { id } = req.query || {};
  if (!id) {
    res.status(400).json({ error: "Missing IMDb title id" });
    return;
  }

  try {
    const apiUrl = `https://api4.rhserv.vu/imdb_parental_guide/${encodeURIComponent(id)}`;

    const apiResponse = await fetch(apiUrl);

    if (!apiResponse.ok) {
      res
        .status(apiResponse.status)
        .json({ error: "Failed to fetch parental guide" });
      return;
    }

    const payload = await apiResponse.json();
    const sections = extractSections(payload);

    res.status(200).json({ original: sections });
  } catch (err) {
    console.error("[imdb-parent-guide] error", err);
    res.status(500).json({ error: "Server error", message: err.message });
  }
}

module.exports = handler;
module.exports.handler = createNetlifyHandler(handler);
