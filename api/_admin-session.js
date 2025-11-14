import crypto from "crypto";

const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

function base64UrlEncode(str) {
  return Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(str) {
  const normalized = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded =
    normalized + "===".slice((normalized.length + 3) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function getSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error("Missing ADMIN_SESSION_SECRET");
  }
  return secret;
}

function getSessionTtlMs() {
  const raw = process.env.ADMIN_SESSION_TTL_MS;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_SESSION_TTL_MS;
}

function signPayload(encodedPayload, secret) {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(encodedPayload);
  return hmac
    .digest()
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function timingSafeCompare(a, b) {
  const aBuffer = Buffer.from(a, "utf8");
  const bBuffer = Buffer.from(b, "utf8");
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

export function extractBearerToken(headerValue) {
  if (!headerValue || typeof headerValue !== "string") {
    return null;
  }
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export function issueAdminToken() {
  const secret = getSecret();
  const ttlMs = getSessionTtlMs();
  const now = Date.now();
  const payload = {
    iat: now,
    exp: now + ttlMs,
    sid: crypto.randomBytes(16).toString("hex"),
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, secret);
  const token = `${encodedPayload}.${signature}`;
  return { token, payload };
}

export function verifyAdminToken(token) {
  const secret = getSecret();
  if (!token || typeof token !== "string") {
    return { valid: false, error: "Missing token" };
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false, error: "Malformed token" };
  }

  const [encodedPayload, providedSignature] = parts;
  if (!encodedPayload || !providedSignature) {
    return { valid: false, error: "Malformed token" };
  }

  const expectedSignature = signPayload(encodedPayload, secret);
  if (!timingSafeCompare(providedSignature, expectedSignature)) {
    return { valid: false, error: "Invalid signature" };
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    return { valid: false, error: "Invalid payload" };
  }

  if (!payload || typeof payload.exp !== "number") {
    return { valid: false, error: "Invalid payload" };
  }

  if (Date.now() > payload.exp) {
    return { valid: false, error: "Token expired", expired: true };
  }

  return { valid: true, payload };
}

