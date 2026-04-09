const {
  extractBearerToken,
  verifyAdminToken,
} = require('../lib/admin-session.js');
const {
  createSupabaseServerClient,
  getSupabaseUrl,
} = require('../lib/supabase-config.js');

const SUPABASE_URL = getSupabaseUrl();
const STORAGE_BUCKET = 'game-posters';
const ALLOWED_METHODS = ['POST'];
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

function verifyAdminRequest(req) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return { ok: false, status: 401, error: 'Missing token' };
  }

  const verification = verifyAdminToken(token);
  if (!verification.valid) {
    return {
      ok: false,
      status: 401,
      error: verification.error || 'Invalid token',
      expired: Boolean(verification.expired),
    };
  }

  return { ok: true };
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    return JSON.parse(req.body || '{}');
  }
  return req.body;
}

function sanitizeFileStem(value) {
  return String(value || 'boosty-review')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'boosty-review';
}

function getExtension(contentType, fileName) {
  const normalizedType = String(contentType || '').toLowerCase();
  if (normalizedType === 'image/jpeg') return 'jpg';
  if (normalizedType === 'image/png') return 'png';
  if (normalizedType === 'image/webp') return 'webp';
  if (normalizedType === 'image/gif') return 'gif';
  if (normalizedType === 'image/avif') return 'avif';

  const rawName = String(fileName || '').trim().toLowerCase();
  const ext = rawName.includes('.') ? rawName.split('.').pop() : '';
  return ext || 'jpg';
}

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  const [, contentType, base64Data] = match;
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return null;
  }

  const buffer = Buffer.from(base64Data, 'base64');
  if (!buffer.length || buffer.length > MAX_FILE_SIZE_BYTES) {
    return null;
  }

  return {
    buffer,
    contentType,
  };
}

module.exports = async function handler(req, res) {
  const method = String(req.method || '').toUpperCase();
  if (!ALLOWED_METHODS.includes(method)) {
    res.setHeader('Allow', ALLOWED_METHODS.join(', '));
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const access = verifyAdminRequest(req);
  if (!access.ok) {
    return res
      .status(access.status)
      .json({ error: access.error, expired: access.expired || false });
  }

  let payload;
  try {
    payload = parseBody(req);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const title = String(payload?.title || '').trim();
  const fileName = String(payload?.fileName || '').trim();
  const decoded = decodeDataUrl(payload?.dataUrl);

  if (!decoded) {
    return res.status(400).json({ error: 'Invalid image payload' });
  }

  let supabase;
  try {
    supabase = createSupabaseServerClient();
  } catch (error) {
    console.error('Supabase configuration error', error);
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const ext = getExtension(decoded.contentType, fileName);
  const path = `boosty/${sanitizeFileStem(title)}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, decoded.buffer, {
      contentType: decoded.contentType,
      upsert: false,
    });

  if (uploadError) {
    console.error('Failed to upload Boosty review image', uploadError);
    return res.status(500).json({ error: 'Failed to upload image' });
  }

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);

  return res.status(200).json({
    imageUrl: data?.publicUrl || '',
    path,
  });
};
