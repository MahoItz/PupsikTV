export default function handler(req, res) {
  const password =
    req.headers["x-admin-password"] ||
    req.query.password ||
    req.body?.password ||
    (typeof req.body === "string"
      ? JSON.parse(req.body || "{}").password
      : undefined);

  const isAdmin = password === process.env.EDIT_PASSWORD;

  const env = { SUPABASE_KEY: process.env.SUPABASE_KEY };

  if (isAdmin) {
    env.KINOPOISK_API_KEY = process.env.KINOPOISK_API_KEY;
    env.RAWG_API_KEY = process.env.RAWG_API_KEY;
    env.STEAMGRIDDB_KEY = process.env.STEAMGRIDDB_KEY;
  }

  res.status(200).json(env);
}
