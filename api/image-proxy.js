const PRESETS = {
  ordered: { width: 240, height: 360 },
  played: { width: 300, height: 450 },
};

const SUPPORTED_OUTPUTS = ["image/avif", "image/webp"];
const CACHE_CONTROL_VALUE =
  "public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400";

function normalizePreset(rawPreset) {
  if (!rawPreset) return null;
  const value = String(rawPreset).toLowerCase();
  if (["ordered", "order", "game-order", "game_order"].includes(value)) {
    return "ordered";
  }
  if (["played", "done", "completed", "game-played", "game_played"].includes(value)) {
    return "played";
  }
  return null;
}

function resolveOutputFormat(acceptHeader) {
  const accept = typeof acceptHeader === "string" ? acceptHeader : "";
  if (accept.includes("image/avif")) return "avif";
  if (accept.includes("image/webp")) return "webp";
  return "jpg";
}

function buildSourceUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  try {
    const parsed = new URL(rawUrl);
    if (!/^https?:$/.test(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch (err) {
    return null;
  }
}

function buildProxyUrl(sourceUrl, preset, outputFormat) {
  const { width, height } = PRESETS[preset];
  const proxyUrl = new URL("https://wsrv.nl/");
  proxyUrl.searchParams.set("url", sourceUrl);
  proxyUrl.searchParams.set("w", String(width));
  proxyUrl.searchParams.set("h", String(height));
  proxyUrl.searchParams.set("fit", "cover");
  if (outputFormat === "avif") {
    proxyUrl.searchParams.set("output", "avif");
  } else if (outputFormat === "webp") {
    proxyUrl.searchParams.set("output", "webp");
  }
  return proxyUrl;
}

async function handleImageRequest({ sourceUrl, preset, acceptHeader }) {
  const outputFormat = resolveOutputFormat(acceptHeader);
  const proxyUrl = buildProxyUrl(sourceUrl, preset, outputFormat);
  const response = await fetch(proxyUrl, {
    headers: {
      "User-Agent": "PupsikTV image proxy",
      Accept: SUPPORTED_OUTPUTS.join(","),
    },
  });

  if (!response.ok) {
    const error = new Error("Failed to fetch proxy image");
    error.status = response.status;
    throw error;
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());

  return {
    buffer,
    contentType,
    outputFormat,
  };
}

async function handler(req, res) {
  const sourceUrl = buildSourceUrl(req.query?.url || req.query?.src);
  const preset = normalizePreset(req.query?.preset || req.query?.type);

  if (!sourceUrl) {
    res.status(400).json({ error: "Missing or invalid image URL." });
    return;
  }

  if (!preset || !PRESETS[preset]) {
    res.status(400).json({ error: "Missing or invalid preset." });
    return;
  }

  try {
    const { buffer, contentType } = await handleImageRequest({
      sourceUrl,
      preset,
      acceptHeader: req.headers?.accept || req.headers?.Accept,
    });

    res.status(200);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", CACHE_CONTROL_VALUE);
    res.setHeader("Vary", "Accept");
    res.end(buffer);
  } catch (err) {
    console.error("[image-proxy] Failed to proxy image", err);
    const status = Number.isInteger(err.status) ? err.status : 500;
    res.status(status).json({ error: "Failed to process image." });
  }
}

async function netlifyHandler(event) {
  const query = event?.queryStringParameters || {};
  const sourceUrl = buildSourceUrl(query.url || query.src);
  const preset = normalizePreset(query.preset || query.type);

  if (!sourceUrl) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing or invalid image URL." }),
    };
  }

  if (!preset || !PRESETS[preset]) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing or invalid preset." }),
    };
  }

  try {
    const { buffer, contentType } = await handleImageRequest({
      sourceUrl,
      preset,
      acceptHeader: event?.headers?.accept || event?.headers?.Accept,
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": CACHE_CONTROL_VALUE,
        Vary: "Accept",
      },
      body: buffer.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error("[image-proxy] Failed to proxy image", err);
    const status = Number.isInteger(err.status) ? err.status : 500;
    return {
      statusCode: status,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Failed to process image." }),
    };
  }
}

module.exports = handler;
module.exports.handler = netlifyHandler;
