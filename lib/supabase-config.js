const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://shwekurmzyzivtworjup.supabase.co';

function readEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function getSupabaseUrl() {
  return SUPABASE_URL;
}

function getSupabasePublicKey() {
  return readEnv(
    'SUPABASE_PUBLIC_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_ANON_KEY'
  );
}

function getSupabaseServerKey() {
  return readEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVER_KEY');
}

function createSupabaseServerClient() {
  const supabaseKey = getSupabaseServerKey();
  if (!supabaseKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVER_KEY)'
    );
  }

  return createClient(SUPABASE_URL, supabaseKey, {
    auth: { persistSession: false },
  });
}

module.exports = {
  createSupabaseServerClient,
  getSupabasePublicKey,
  getSupabaseServerKey,
  getSupabaseUrl,
};
