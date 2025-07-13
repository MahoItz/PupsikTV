export default function handler(req, res) {
  const password =
    req.body?.password || (typeof req.body === 'string' ? JSON.parse(req.body || '{}').password : undefined);
  const isValid = password === process.env.EDIT_PASSWORD;
  res.status(isValid ? 200 : 401).json({ ok: isValid });
}
