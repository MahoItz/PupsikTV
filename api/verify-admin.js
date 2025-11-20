import {
  extractBearerToken,
  issueAdminToken,
  verifyAdminToken,
} from "./_admin-session.js";

const ALLOWED_METHODS = ["GET", "POST"];

export default function handler(req, res) {
  const method = (req.method || "").toUpperCase();

  if (method === "GET") {
    try {
      const token = extractBearerToken(req.headers.authorization);
      if (!token) {
        return res
          .status(401)
          .json({ ok: false, error: "Missing token" });
      }
      const result = verifyAdminToken(token);
      if (!result.valid) {
        return res.status(401).json({
          ok: false,
          error: result.error || "Invalid token",
          expired: Boolean(result.expired),
        });
      }
      const expiresAt =
        result.payload && typeof result.payload.exp === "number"
          ? new Date(result.payload.exp).toISOString()
          : null;
      return res.status(200).json({
        ok: true,
        expiresAt,
      });
    } catch (err) {
      console.error("Admin token verification error", err);
      return res
        .status(500)
        .json({ ok: false, error: "Server error" });
    }
  }

  if (method === "POST") {
    let password;
    try {
      password =
        req.body?.password ||
        (typeof req.body === "string"
          ? JSON.parse(req.body || "{}").password
          : undefined);
    } catch {
      return res
        .status(401)
        .json({ ok: false, error: "Invalid password" });
    }

    if (password !== process.env.EDIT_PASSWORD) {
      return res
        .status(401)
        .json({ ok: false, error: "Invalid password" });
    }

    try {
      const { token, payload } = issueAdminToken();
      const expiresAt =
        payload && typeof payload.exp === "number"
          ? new Date(payload.exp).toISOString()
          : null;
      return res.status(200).json({
        ok: true,
        token,
        expiresAt,
      });
    } catch (err) {
      console.error("Admin token issue error", err);
      return res
        .status(500)
        .json({ ok: false, error: "Server error" });
    }
  }

  res.setHeader("Allow", ALLOWED_METHODS);
  return res
    .status(405)
    .json({ ok: false, error: "Method Not Allowed" });
}
