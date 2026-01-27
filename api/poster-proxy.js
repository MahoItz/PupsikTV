const ALLOWED_HOST_SUFFIXES = [
  "steamgriddb.com",
  "rawg.io",
  "media.rawg.io",
];

function isAllowedHost(hostname) {
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)
  );
}

async function handler(req, res) {
  const url = req.query.url;
  if (!url) {
    res.status(400).json({ error: "Missing url" });
    return;
  }

  let target;
  try {
    target = new URL(url);
  } catch (err) {
    res.status(400).json({ error: "Invalid url" });
    return;
  }

  if (!["http:", "https:"].includes(target.protocol)) {
    res.status(400).json({ error: "Unsupported protocol" });
    return;
  }

  if (!isAllowedHost(target.hostname)) {
    res.status(400).json({ error: "Host not allowed" });
    return;
  }

  try {
    const response = await fetch(target.toString());
    if (!response.ok) {
      res.status(response.status).json({ error: "Image request failed" });
      return;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType =
      response.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.status(200).send(buffer);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
}

module.exports = handler;
