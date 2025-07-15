# PupsikTV

This project is a small static site with serverless functions used on Vercel.

## Environment variables

The site expects several environment variables to be available at build or runtime:

- `SUPABASE_KEY` – key used to connect to Supabase.
- `KINOPOISK_API_KEY` – API key for the unofficial Kinopoisk API.
- `RAWG_API_KEY` – API key for RAWG game database.
- `EDIT_PASSWORD` – password required for admin authentication.

Make sure these are configured in your deployment environment.
