const { createSupabaseServerClient } = require('../lib/supabase-config.js');

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    return JSON.parse(req.body || '{}');
  }
  return req.body;
}

function parseTrailerId(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRating(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed * 100) / 100;
  return rounded >= 0 && rounded <= 11 ? rounded : null;
}

function normalizeUserId(value) {
  const userId = String(value || '')
    .trim()
    .slice(0, 255);
  return userId || null;
}

async function handler(req, res) {
  const method = (req.method || '').toUpperCase();
  if (method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let payload;
  try {
    payload = parseBody(req);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const trailerId = parseTrailerId(payload?.trailer_id);
  const rating = parseRating(payload?.rating);
  const userId = normalizeUserId(payload?.user_id);

  if (!trailerId || rating === null || !userId) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  let supabase;
  try {
    supabase = createSupabaseServerClient();
  } catch (error) {
    console.error('Supabase configuration error', error);
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const { data, error } = await supabase.rpc('submit_trailer_rating', {
      p_trailer_id: trailerId,
      p_rating: rating,
      p_user_id: userId,
    });

    if (error) throw error;

    return res.status(200).json(data || { ok: true });
  } catch (error) {
    console.error('Failed to submit trailer rating', error);
    return res.status(500).json({
      error: error?.message || 'Failed to submit trailer rating',
    });
  }
}

module.exports = handler;
