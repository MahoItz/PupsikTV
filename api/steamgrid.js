import https from 'https';

function sgdbRequest(path) {
  const options = {
    hostname: 'www.steamgriddb.com',
    path,
    headers: {
      Authorization: `Bearer ${process.env.STEAMGRIDDB_API_KEY}`,
    },
  };

  return new Promise((resolve, reject) => {
    https
      .get(options, (resp) => {
        let data = '';
        resp.on('data', (chunk) => {
          data += chunk;
        });
        resp.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', reject);
  });
}

export default async function handler(req, res) {
  const query = (req.query.q || '').toString().trim();
  if (!query) {
    res.status(400).json({ error: 'Missing query' });
    return;
  }

  try {
    const searchData = await sgdbRequest(`/api/v2/search/autocomplete/${encodeURIComponent(query)}`);
    const gameId = searchData?.data?.[0]?.id;
    if (!gameId) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    const posterData = await sgdbRequest(`/api/v2/grids/game/${gameId}?dimensions=600x900`);
    const url = posterData?.data?.[0]?.url || null;

    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(url ? 200 : 404).json(url ? { url } : { error: 'Poster not found' });
  } catch (err) {
    console.error('SteamGridDB fetch failed', err);
    res.status(500).json({ error: 'SteamGridDB request failed' });
  }
}
