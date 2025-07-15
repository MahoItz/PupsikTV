export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
    window.SUPABASE_KEY = '${process.env.SUPABASE_KEY}';
    window.KINOPOISK_API_KEY = '${process.env.KINOPOISK_API_KEY}';
    window.RAWG_API_KEY = '${process.env.RAWG_API_KEY}';
  `);
}
