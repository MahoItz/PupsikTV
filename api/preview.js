const ALLOWED_METHODS = ['GET'];
const ALLOWED_HOST_SUFFIXES = ['boosty.to'];
const REQUEST_TIMEOUT_MS = 8000;

function isAllowedHost(hostname) {
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)
  );
}

function resolveFetch() {
  if (typeof globalThis.fetch === 'function') {
    return { fetch: globalThis.fetch };
  }

  const candidates = [
    {
      name: 'undici',
      getFetch: (moduleExports) => moduleExports?.fetch,
    },
    {
      name: 'node-fetch',
      getFetch: (moduleExports) => moduleExports?.default ?? moduleExports,
    },
  ];

  for (const candidate of candidates) {
    try {
      const moduleExports = require(candidate.name);
      const fetchImpl = candidate.getFetch(moduleExports);
      if (typeof fetchImpl === 'function') {
        globalThis.fetch = fetchImpl;
        return { fetch: fetchImpl };
      }
    } catch {
      continue;
    }
  }

  return {
    error: 'Fetch API is not available in this environment.',
  };
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function extractMetaContent(html, propertyName) {
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${propertyName}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      'i'
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${propertyName}["'][^>]*>`,
      'i'
    ),
    new RegExp(
      `<meta[^>]+name=["']${propertyName}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      'i'
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${propertyName}["'][^>]*>`,
      'i'
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtmlEntities(match[1].trim());
    }
  }

  return '';
}

function getPreviewImageUrl(html, pageUrl) {
  const rawValue =
    extractMetaContent(html, 'og:image') || extractMetaContent(html, 'twitter:image');

  if (!rawValue) {
    return '';
  }

  try {
    return new URL(rawValue, pageUrl).toString();
  } catch {
    return '';
  }
}

module.exports = async function handler(req, res) {
  const method = String(req.method || '').toUpperCase();
  if (!ALLOWED_METHODS.includes(method)) {
    res.setHeader('Allow', ALLOWED_METHODS.join(', '));
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const rawUrl = String(req.query?.url || '').trim();
  if (!rawUrl) {
    return res.status(400).json({ error: 'Missing url' });
  }

  let targetUrl;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid url' });
  }

  if (!['http:', 'https:'].includes(targetUrl.protocol)) {
    return res.status(400).json({ error: 'Unsupported protocol' });
  }

  if (!isAllowedHost(targetUrl.hostname)) {
    return res.status(400).json({ error: 'Only Boosty URLs are allowed' });
  }

  const { fetch: fetchImpl, error: fetchError } = resolveFetch();
  if (!fetchImpl) {
    return res.status(500).json({ error: fetchError });
  }

  const abortController =
    typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutId = abortController
    ? setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS)
    : null;

  try {
    const response = await fetchImpl(targetUrl.toString(), {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'PupsikTVPreviewBot/1.0',
      },
      redirect: 'follow',
      signal: abortController?.signal,
    });

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: `Failed to fetch page: ${response.status}` });
    }

    const finalUrl = new URL(response.url || targetUrl.toString());
    if (!isAllowedHost(finalUrl.hostname)) {
      return res.status(400).json({ error: 'Redirected to unsupported host' });
    }

    const html = await response.text();
    const image = getPreviewImageUrl(html, finalUrl.toString());

    if (!image) {
      return res.status(404).json({ error: 'Preview image not found' });
    }

    return res.status(200).json({ image });
  } catch (error) {
    const isAbortError = error?.name === 'AbortError';
    return res.status(isAbortError ? 504 : 500).json({
      error: isAbortError ? 'Preview request timed out' : 'Failed to fetch preview',
    });
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};
