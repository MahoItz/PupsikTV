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

  const env = { SUPABASE_KEY: process.env.SUPABASE_KEY };

  if (isAdmin) {
    env.KINOPOISK_API_KEY = process.env.KINOPOISK_API_KEY;
    env.RAWG_API_KEY = process.env.RAWG_API_KEY;
  }

  res.status(200).json(env);
}
