# PupsikTV

This repository contains the source code for the PupsikTV website. The project is a static site that relies on a few serverless API routes contained in the `api` directory.

## Setup

1. Install Node.js (version 16 or newer).
2. Clone this repository.
3. Provide the required environment variables either via your deployment settings (e.g. Vercel) or by creating a `.env` file for local development:

```
SUPABASE_KEY=<your supabase key>
KINOPOISK_API_KEY=<optional, used for admin search>
RAWG_API_KEY=<optional, used for admin search>
STEAMGRIDDB_API_KEY=<optional, used for SteamGridDB search>
EDIT_PASSWORD=<admin password>
```

Only `SUPABASE_KEY` and `EDIT_PASSWORD` are required for basic operation. The other keys enable additional admin features.

## Running locally

Serve the project with any static file server. One simple option is to use [`serve`](https://www.npmjs.com/package/serve):

```bash
npx serve
```

Open the printed URL in your browser to view the site. The serverless API routes under `api/` read environment variables from your deployment platform or the `.env` file when running locally.
