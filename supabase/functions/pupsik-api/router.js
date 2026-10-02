const allowedOrigins = new Set([
  "https://mahoitz.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
const methods = "GET, POST, PUT, PATCH, DELETE, OPTIONS";

export function createRouter(handlers) {
  return async function route(request) {
    const origin = request.headers.get("Origin");
    const headers = new Headers({
      Vary: "Origin",
      "Access-Control-Allow-Methods": methods,
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, apikey, X-API-KEY, x-admin-password, If-None-Match",
      "Access-Control-Expose-Headers": "ETag, Allow",
      "Cache-Control": "no-store",
    });
    if (origin && !allowedOrigins.has(origin)) {
      return Response.json({ error: "Origin not allowed" }, {
        status: 403,
        headers,
      });
    }
    if (origin) headers.set("Access-Control-Allow-Origin", origin);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    const pathname = new URL(request.url).pathname;
    const prefix = "/pupsik-api/";
    const position = pathname.indexOf(prefix);
    const name = position >= 0 ? pathname.slice(position + prefix.length) : "";
    if (name === "health" && request.method === "GET") {
      return Response.json({ ok: true }, { headers });
    }
    const handler = Object.hasOwn(handlers, name) ? handlers[name] : null;
    if (!handler) {
      return Response.json({ error: "Not found" }, { status: 404, headers });
    }
    let status = 200;
    let body = null;
    const response = {
      status(code) {
        status = code;
        return this;
      },
      setHeader(name, value) {
        headers.set(name, String(value));
        return this;
      },
      json(value) {
        headers.set("Content-Type", "application/json; charset=utf-8");
        body = JSON.stringify(value);
        return this;
      },
      send(value) {
        body = value;
        return this;
      },
      end(value) {
        body = value ?? null;
        return this;
      },
    };
    try {
      const req = {
        method: request.method,
        headers: Object.fromEntries(request.headers),
        query: Object.fromEntries(new URL(request.url).searchParams),
        // Keep raw JSON so the existing handlers retain their validation/errors.
        body: ["GET", "HEAD"].includes(request.method)
          ? undefined
          : await request.text(),
      };
      await handler(req, response);
      return new Response(
        request.method === "HEAD" || [204, 304].includes(status) ? null : body,
        { status, headers },
      );
    } catch (error) {
      console.error("API handler failed:", name, error);
      return Response.json({ error: "Server error" }, { status: 500, headers });
    }
  };
}
