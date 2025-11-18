export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const messageType = req.headers['twitch-eventsub-message-type'];

  if (messageType === 'webhook_callback_verification') {
    const challenge = typeof req.body?.challenge === 'string' ? req.body.challenge : null;

    if (!challenge) {
      return res.status(400).end();
    }

    return res.status(200).send(challenge);
  }

  if (messageType === 'notification') {
    console.log('Twitch EventSub notification:', req.body);
    return res.status(200).end();
  }

  return res.status(400).end();
}

