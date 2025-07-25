export default async function handler(req, res) {
  const search = req.query.search || '';
  if (!search) {
    res.status(400).json({ error: 'Missing search' });
    return;
  }
  const key = process.env.STEAMGRIDDB_API_KEY;
  if (!key) {
    res.status(500).json({ error: 'Missing API key' });
    return;
  }
  try {
    const headers = { Authorization: `Bearer ${key}` };
    const searchUrl = `https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(search)}`;
    const searchRes = await fetch(searchUrl, { headers });
    if (!searchRes.ok) {
      res.status(searchRes.status).json({ error: 'Search request failed' });
      return;
    }
    const searchData = await searchRes.json();
    const id = searchData.data && searchData.data[0] ? searchData.data[0].id : null;
    if (!id) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const gridUrl = `https://www.steamgriddb.com/api/v2/grids/game/${id}?dimensions=600x900`;
    const gridRes = await fetch(gridUrl, { headers });
    if (!gridRes.ok) {
      res.status(gridRes.status).json({ error: 'Grid request failed' });
      return;
    }
    const gridData = await gridRes.json();
    const posters = Array.isArray(gridData.data)
      ? gridData.data.map((g) => g.url)
      : [];
    res.status(200).json({ posters });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}
