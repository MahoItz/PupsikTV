// Same payload/signature format as lib/admin-session.js, using Web Crypto.
const encoder = new TextEncoder();

function secret() {
  const value = Deno.env.get("ADMIN_SESSION_SECRET");
  if (!value) throw new Error("Missing ADMIN_SESSION_SECRET");
  return value;
}

function encode(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(
    /\//g,
    "_",
  ).replace(/=+$/g, "");
}

function decode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const text = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

async function key() {
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export function extractBearerToken(header) {
  return typeof header === "string"
    ? header.match(/^Bearer\s+(.+)$/i)?.[1].trim() || null
    : null;
}

export async function issueAdminToken() {
  const rawTtl = Number.parseInt(
    Deno.env.get("ADMIN_SESSION_TTL_MS") || "",
    10,
  );
  const ttl = Number.isFinite(rawTtl) && rawTtl > 0 ? rawTtl : 604800000;
  const now = Date.now();
  const payload = {
    iat: now,
    exp: now + ttl,
    sid: Array.from(
      crypto.getRandomValues(new Uint8Array(16)),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join(""),
  };
  const encoded = encode(encoder.encode(JSON.stringify(payload)));
  const signature = encode(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", await key(), encoder.encode(encoded)),
    ),
  );
  return { token: `${encoded}.${signature}`, payload };
}

export async function verifyAdminToken(token) {
  const signingKey = await key();
  if (!token || typeof token !== "string") {
    return { valid: false, error: "Missing token" };
  }
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, error: "Malformed token" };
  }
  let payload;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      signingKey,
      decode(parts[1]),
      encoder.encode(parts[0]),
    );
    if (!valid) return { valid: false, error: "Invalid signature" };
    payload = JSON.parse(new TextDecoder().decode(decode(parts[0])));
  } catch {
    return { valid: false, error: "Invalid payload" };
  }
  if (
    !payload || typeof payload.sid !== "string" || !payload.sid ||
    (payload.iat !== undefined && typeof payload.iat !== "number") ||
    (payload.exp !== undefined && typeof payload.exp !== "number")
  ) {
    return { valid: false, error: "Invalid payload" };
  }
  if (typeof payload.exp === "number" && Date.now() > payload.exp) {
    return { valid: false, error: "Token expired", expired: true };
  }
  return { valid: true, payload };
}
