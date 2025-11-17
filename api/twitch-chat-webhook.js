export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  console.log('twitch-chat-webhook payload:', req.body);
  return res.status(200).json({ ok: true });
}

