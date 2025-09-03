export default function handler(req, res) {
  let password;
  try {
    password =
      req.headers["x-admin-password"] ||
      req.query.password ||
      req.body?.password ||
      (typeof req.body === "string"
        ? JSON.parse(req.body || "{}").password
        : undefined);
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  const isAdmin = password === process.env.EDIT_PASSWORD;

  if (!isAdmin) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const env = {
    SUPABASE_KEY: process.env.SUPABASE_KEY,
    KINOPOISK_API_KEY: process.env.KINOPOISK_API_KEY,
    RAWG_API_KEY: process.env.RAWG_API_KEY,
  };

  res.status(200).json(env);
}
