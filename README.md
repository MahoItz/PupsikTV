# PupsikTV

This project is a small static site with serverless functions used on Vercel.

## Environment variables

The site expects several environment variables to be available at build or runtime.
When running purely in the browser you can also define them as globals on
`window` (for example via an inline script):

- `SUPABASE_KEY` – key used to connect to Supabase. The alternative name
  `SUPABASE_API_KEY` is also recognised for backward compatibility.
- `KINOPOISK_API_KEY` – API key for the unofficial Kinopoisk API.
- `RAWG_API_KEY` – API key for RAWG game database.
- `EDIT_PASSWORD` – password required for admin authentication.

Make sure these are configured in your deployment environment.
