const {
  extractBearerToken,
  verifyAdminToken,
} = require('../lib/admin-session.js');
const { createSupabaseServerClient } = require('../lib/supabase-config.js');

const ALLOWED_METHODS = ['PATCH'];
const ALLOWED_COLUMNS = new Set([
  'roulette_last_winner',
  'ai_model_statuses',
  'selected_ai_model',
  'selected_ai_model_name',
  'kp_api',
  'victory_volume',
  'lose_volume',
  'spin_volume',
]);

function verifyAdminRequest(req) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return { ok: false, status: 401, error: 'Missing token' };
  }

  const verification = verifyAdminToken(token);
  if (!verification.valid) {
    return {
      ok: false,
      status: 401,
      error: verification.error || 'Invalid token',
      expired: Boolean(verification.expired),
    };
  }

  return { ok: true };
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    return JSON.parse(req.body || '{}');
  }
  return req.body;
}

function pickAllowedColumns(payload) {
  const changes = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (ALLOWED_COLUMNS.has(key)) {
      changes[key] = value;
    }
  }
  return changes;
}

async function upsertSettingsRow(supabase, changes) {
  const { data, error } = await supabase
    .from('settings')
    .select('id')
    .order('id', { ascending: true })
    .limit(1);

  if (error) throw error;

  const existing = Array.isArray(data) && data.length > 0 ? data[0] : null;

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from('settings')
      .update(changes)
      .eq('id', existing.id);
    if (updateError) throw updateError;

    return { id: existing.id, changes };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('settings')
    .insert(changes)
    .select('id')
    .single();

  if (insertError) throw insertError;

  return { id: inserted?.id || null, changes };
}

async function handler(req, res) {
  const method = (req.method || '').toUpperCase();
  if (!ALLOWED_METHODS.includes(method)) {
    res.setHeader('Allow', ALLOWED_METHODS);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const access = verifyAdminRequest(req);
  if (!access.ok) {
    return res
      .status(access.status)
      .json({ error: access.error, expired: access.expired || false });
  }

  let payload;
  try {
    payload = parseBody(req);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const changes = pickAllowedColumns(payload);
  if (!Object.keys(changes).length) {
    return res.status(400).json({ error: 'No allowed settings fields provided' });
  }

  try {
    const supabase = createSupabaseServerClient();
    const result = await upsertSettingsRow(supabase, changes);
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error('Failed to persist settings', error);
    return res.status(500).json({
      error:
        error?.message || 'Failed to persist settings',
    });
  }
}

module.exports = handler;
