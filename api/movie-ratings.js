const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://shwekurmzyzivtworjup.supabase.co';
const RATINGS_TABLE = 'ratings';
const MOVIES_TABLE = 'movies';

function createSupabaseClient() {
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!supabaseKey) {
    throw new Error('Missing SUPABASE key');
  }

  return createClient(SUPABASE_URL, supabaseKey, {
    auth: { persistSession: false },
  });
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    return JSON.parse(req.body || '{}');
  }
  return req.body;
}

function parseTargetId(value) {
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

function normalizeTitle(value) {
  const title = String(value || '')
    .trim()
    .slice(0, 500);
  return title || null;
}

function normalizeTargetType(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return normalized === 'order' ? 'order' : 'movie';
}

async function recalculateMovieRatings(supabase, movieId) {
  const { data, error } = await supabase
    .from(RATINGS_TABLE)
    .select('rating')
    .eq('movie_id', movieId)
    .eq('category', 'Movie');

  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  const ratingSum = rows.reduce(
    (sum, row) => sum + Number(row?.rating || 0),
    0
  );
  const ratingCount = rows.length;

  const { data: updated, error: updateError } = await supabase
    .from(MOVIES_TABLE)
    .update({
      rating_sum: ratingSum,
      rating_count: ratingCount,
    })
    .eq('id', movieId)
    .select('id, rating_sum, rating_count')
    .single();

  if (updateError) throw updateError;
  return updated;
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

  const targetId = parseTargetId(payload?.target_id);
  const rating = parseRating(payload?.rating);
  const userId = normalizeUserId(payload?.user_id);
  const title = normalizeTitle(payload?.title);
  const targetType = normalizeTargetType(payload?.target_type);
  const category = targetType === 'order' ? 'MovieOrder' : 'Movie';

  if (!targetId || rating === null || !userId) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  let supabase;
  try {
    supabase = createSupabaseClient();
  } catch (error) {
    console.error('Supabase configuration error', error);
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const { data: existingRating, error: existingError } = await supabase
      .from(RATINGS_TABLE)
      .select('id')
      .eq('movie_id', targetId)
      .eq('category', category)
      .eq('user_id', userId)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existingRating?.id) {
      const { error: updateError } = await supabase
        .from(RATINGS_TABLE)
        .update({
          rating,
          title,
        })
        .eq('id', existingRating.id);

      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase.from(RATINGS_TABLE).insert({
        movie_id: targetId,
        rating,
        source: 'user',
        category,
        title,
        user_id: userId,
      });

      if (insertError) throw insertError;
    }

    if (targetType === 'movie') {
      const movie = await recalculateMovieRatings(supabase, targetId);
      return res.status(200).json({
        ok: true,
        movie,
        updatedExisting: Boolean(existingRating?.id),
      });
    }

    return res.status(200).json({
      ok: true,
      updatedExisting: Boolean(existingRating?.id),
    });
  } catch (error) {
    console.error('Failed to submit movie rating', error);
    return res.status(500).json({ error: 'Failed to submit movie rating' });
  }
}

module.exports = handler;
