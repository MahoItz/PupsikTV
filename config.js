// Support both Node (process.env) and browser globals for configuration
const env =
  typeof process !== 'undefined' && process?.env
    ? process.env
    : globalThis;

export const SUPABASE_KEY = env.SUPABASE_KEY || env.SUPABASE_API_KEY;
export const KINOPOISK_API_KEY = env.KINOPOISK_API_KEY;
export const RAWG_API_KEY = env.RAWG_API_KEY;
