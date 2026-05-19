# PupsikTV

This repository contains the source code for the PupsikTV website. The project is a static site that relies on a few serverless API routes contained in the `api` directory.

## Setup

1. Install Node.js (version 16 or newer).
2. Clone this repository.
3. Create a `.env` file in the project root and provide the required environment variables:

```
SUPABASE_PUBLIC_KEY=<your public anon/publishable key>
SUPABASE_SERVICE_ROLE_KEY=<required for server API routes>
KINOPOISK_API_KEY=<optional, used for admin search>
RAWG_API_KEY=<optional, used for admin search>
EDIT_PASSWORD=<admin password>
ADMIN_SESSION_SECRET=<required for admin token signing>
ADMIN_SESSION_TTL_MS=<optional, admin session TTL in milliseconds, default 604800000 (7 days)>
```

## Running locally

Serve the project with any static file server. One simple option is to use [`serve`](https://www.npmjs.com/package/serve):

```bash
npx serve
```

Open the printed URL in your browser to view the site. The serverless API routes under `api/` will read the environment variables from your `.env` file when deployed to a platform such as Vercel.
