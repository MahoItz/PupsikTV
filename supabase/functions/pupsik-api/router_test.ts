import { createRouter } from "./router.js";
import admin from "./generated/api/admin.js";
import external from "./generated/api/external.js";
import boostyReviews from "./generated/api/boosty-reviews.js";
import boostyReviewImage from "./generated/api/boosty-review-image.js";
import kinopoiskActors from "./generated/api/kinopoisk-actors.js";
import trailerWatchlist from "./generated/api/trailer-watchlist.js";
import movieRatings from "./generated/api/movie-ratings.js";
import trailerRatings from "./generated/api/trailer-ratings.js";
import preview from "./generated/api/preview.js";
import translateDescription from "./generated/api/translate-description.js";
import { issueAdminToken, verifyAdminToken } from "./admin-session.js";
import { createHmac } from "node:crypto";

function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

const origin = "https://mahoitz.github.io";
const base = "https://example.supabase.co/functions/v1/pupsik-api";

Deno.test("all API handlers retain authentication and method checks without database writes", async () => {
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
  const router = createRouter({
    external,
    "boosty-reviews": boostyReviews,
    "boosty-review-image": boostyReviewImage,
    "kinopoisk-actors": kinopoiskActors,
    "trailer-watchlist": trailerWatchlist,
    "movie-ratings": movieRatings,
    "trailer-ratings": trailerRatings,
    preview,
    "translate-description": translateDescription,
  });
  for (
    const path of [
      "boosty-reviews",
      "boosty-review-image",
      "kinopoisk-actors",
      "trailer-watchlist",
      "external?provider=igdb",
    ]
  ) {
    const response = await router(
      new Request(`${base}/${path}`, { method: "POST", body: "{}" }),
    );
    assert(
      response.status === 401,
      `${path}: expected 401, got ${response.status}`,
    );
  }
  for (
    const path of [
      "movie-ratings",
      "trailer-ratings",
      "preview",
      "translate-description",
    ]
  ) {
    const response = await router(
      new Request(`${base}/${path}`, { method: "DELETE" }),
    );
    assert(
      response.status === 405,
      `${path}: expected 405, got ${response.status}`,
    );
  }
});

Deno.test("missing admin password cannot authenticate an empty login request", async () => {
  Deno.env.set("ADMIN_SESSION_SECRET", "test-session-secret");
  Deno.env.delete("EDIT_PASSWORD");
  const router = createRouter({ admin });
  const response = await router(
    new Request(`${base}/admin?action=verify-admin`, {
      method: "POST",
      body: "{}",
    }),
  );
  assert(response.status === 500);
  assert(!(await response.json()).token);
});

Deno.test("CORS preflight, blocked origin, health and unknown route", async () => {
  const router = createRouter({});
  const preflight = await router(
    new Request(`${base}/admin`, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    }),
  );
  assert(preflight.status === 204);
  assert(preflight.headers.get("Access-Control-Allow-Origin") === origin);
  assert(
    preflight.headers.get("Access-Control-Allow-Headers")?.includes(
      "Authorization",
    ),
  );
  const blocked = await router(
    new Request(`${base}/health`, {
      headers: { Origin: "https://untrusted.example" },
    }),
  );
  assert(blocked.status === 403);
  assert(!blocked.headers.has("Access-Control-Allow-Origin"));
  const health = await router(new Request(`${base}/health`));
  assert(health.status === 200 && (await health.json()).ok);
  assert((await router(new Request(`${base}/missing`))).status === 404);
});

Deno.test("adapter preserves JSON errors, binary data, query, headers and bodyless 304", async () => {
  const router = createRouter({
    binary: (_req: unknown, res: any) =>
      res.setHeader("Content-Type", "image/webp").send(
        new Uint8Array([1, 2, 3]),
      ),
    cached: (_req: unknown, res: any) =>
      res.status(304).setHeader("ETag", '"test"').end(),
    echo: (req: any, res: any) =>
      res.json({
        query: req.query,
        body: req.body,
        token: req.headers.authorization,
      }),
  });
  const binary = await router(new Request(`${base}/binary`));
  assert(new Uint8Array(await binary.arrayBuffer()).join(",") === "1,2,3");
  const cached = await router(
    new Request(`${base}/cached`, { headers: { Origin: origin } }),
  );
  assert(cached.status === 304 && await cached.text() === "");
  assert(cached.headers.get("Access-Control-Expose-Headers")?.includes("ETag"));
  const echo = await router(
    new Request(`${base}/echo?id=5`, {
      method: "POST",
      headers: { Authorization: "Bearer custom-token" },
      body: "{broken",
    }),
  );
  const payload = await echo.json();
  assert(
    payload.query.id === "5" && payload.body === "{broken" &&
      payload.token === "Bearer custom-token",
  );
});

Deno.test("public configuration exposes only public credentials; admin routes require authentication", async () => {
  Deno.env.set("SUPABASE_PUBLIC_KEY", "public-test-key");
  Deno.env.set("ADMIN_SESSION_SECRET", "test-session-secret");
  Deno.env.set("EDIT_PASSWORD", "test-password");
  const router = createRouter({ admin });
  const env = await router(
    new Request(`${base}/admin?action=env`, { headers: { Origin: origin } }),
  );
  assert(env.status === 200);
  const config = await env.json();
  assert(
    config.SUPABASE_PUBLIC_KEY === "public-test-key" &&
      config.isAdmin === false,
  );
  assert(!JSON.stringify(config).includes("test-session-secret"));
  for (
    const action of [
      "verify-admin",
      "media-items",
      "media-admin",
      "users",
      "game-posters",
    ]
  ) {
    const result = await router(
      new Request(`${base}/admin?action=${action}`, {
        method: "POST",
        body: "{}",
      }),
    );
    assert(
      result.status === 401,
      `${action}: expected 401, got ${result.status}`,
    );
  }
  const badJson = await router(
    new Request(`${base}/admin?action=verify-admin`, {
      method: "POST",
      body: "{broken",
    }),
  );
  assert(badJson.status === 401);
  const login = await router(
    new Request(`${base}/admin?action=verify-admin`, {
      method: "POST",
      body: JSON.stringify({ password: "test-password" }),
    }),
  );
  assert(login.status === 200);
  const session = await login.json();
  assert(typeof session.token === "string");
  const verify = await router(
    new Request(`${base}/admin?action=verify-admin`, {
      headers: { Authorization: `Bearer ${session.token}` },
    }),
  );
  assert(verify.status === 200);
});

Deno.test("Web Crypto sessions retain legacy HMAC signatures, reject tampering and expired tokens", async () => {
  Deno.env.set("ADMIN_SESSION_SECRET", "test-session-secret");
  const issued = await issueAdminToken();
  const [payload, signature] = issued.token.split(".");
  const legacySignature = createHmac("sha256", "test-session-secret").update(
    payload,
  ).digest("base64url");
  assert(signature === legacySignature);
  assert((await verifyAdminToken(issued.token)).valid);
  assert(!(await verifyAdminToken(`${payload}.invalid`)).valid);
  const expiredPayload = btoa(JSON.stringify({ sid: "old", exp: 1 })).replace(
    /=+$/g,
    "",
  );
  const expiredSignature = createHmac("sha256", "test-session-secret").update(
    expiredPayload,
  ).digest("base64url");
  assert(
    (await verifyAdminToken(`${expiredPayload}.${expiredSignature}`)).expired,
  );
});
