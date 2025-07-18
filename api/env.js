export default function handler(req, res) {
  const password =
    req.headers["x-admin-password"] ||
    req.query.password ||
    req.body?.password ||
    (typeof req.body === "string"
      ? JSON.parse(req.body || "{}").password
      : undefined);

  if (password !== process.env.EDIT_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  res.status(200).json({
    SUPABASE_KEY: process.env.SUPABASE_KEY,
    KINOPOISK_API_KEY: process.env.KINOPOISK_API_KEY,
    RAWG_API_KEY: process.env.RAWG_API_KEY,
  });
}
