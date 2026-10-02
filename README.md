# PupsikTV

This repository contains the source code for the PupsikTV website. The project is a static site that relies on a few serverless API routes contained in the `api` directory.

The production target is GitHub Pages with a Supabase Edge Function for the API.
See [the deployment guide](DEPLOYMENT.md) for step-by-step setup, secrets and checks.
The existing `api/` handlers remain the source of truth; `npm run build:edge`
generates Deno-compatible modules before publishing `pupsik-api`.

## Setup

1. Install Node.js (version 22 or newer).
2. Clone this repository.
3. Create a `.env` file in the project root and provide the required environment variables:

```
SUPABASE_PUBLIC_KEY=<your public anon/publishable key>
SUPABASE_SERVICE_ROLE_KEY=<required for server API routes>
KINOPOISK_API_KEY=<optional, used for admin search>
TWITCH_IGDB_CLIENT_ID=<Twitch Client ID, used for admin game search>
TWITCH_IGDB_CLIENT_SECRET=<Twitch Client Secret, used only by server API>
EDIT_PASSWORD=<admin password>
ADMIN_SESSION_SECRET=<required for admin token signing>
ADMIN_SESSION_TTL_MS=<optional, admin session TTL in milliseconds, default 604800000 (7 days)>
```

## Running locally

Serve the project with any static file server. One simple option is to use [`serve`](https://www.npmjs.com/package/serve):

```bash
npx serve
```

Open the printed URL in your browser to view the site. The browser calls the
Supabase API configured in `script/site-config.js`; a static server does not run
the handlers under `api/`. See [the deployment guide](DEPLOYMENT.md) to run or
publish the generated Edge Function and configure its server-side secrets.
