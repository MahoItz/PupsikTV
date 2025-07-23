export default async function handler(req, res) {
  const key = process.env.STEAMGRIDDB_API_KEY;
  const query = req.query.q;

  if (!key) {
    res.status(500).json({ error: 'STEAMGRIDDB_API_KEY not configured' });
    return;
  }

  if (!query) {
    res.status(400).json({ error: 'Missing q parameter' });
    return;
  }

  try {
    const response = await fetch(
      `https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(query)}`,
      {
        headers: { Authorization: `Bearer ${key}` },
      }
    );
    if (!response.ok) {
      throw new Error(`SteamGridDB request failed: ${response.status}`);
    }
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    console.error('Failed to fetch SteamGridDB results', err);
    res.status(500).end();
  }
}
