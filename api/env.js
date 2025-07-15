export default function handler(req, res) {
  res.status(200).json({
    SUPABASE_KEY: process.env.SUPABASE_KEY,
    KINOPOISK_API_KEY: process.env.KINOPOISK_API_KEY,
    RAWG_API_KEY: process.env.RAWG_API_KEY,
  });
}
