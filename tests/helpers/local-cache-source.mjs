import { readFileSync } from 'node:fs';

const core = readFileSync(
  new URL('../../script/core.js', import.meta.url),
  'utf8'
);
export const localCacheSource = core.slice(
  core.indexOf('function readLocalJson('),
  core.indexOf('const SUPABASE_URL =')
);
