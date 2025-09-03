export default function handler(req, res) {
  let password;
  try {
    password =
      req.body?.password ||
      (typeof req.body === "string" ? JSON.parse(req.body || "{}").password : undefined);
  } catch {
    return res.status(401).json({ ok: false, error: "Invalid password" });
  }
  const isValid = password === process.env.EDIT_PASSWORD;
  res.status(isValid ? 200 : 401).json({ ok: isValid });
}
