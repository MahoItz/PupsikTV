function normalizeBody(event) {
  if (!event) return undefined;
  if (!event.body) return event.body;
  if (event.isBase64Encoded) {
    return Buffer.from(event.body, "base64").toString("utf8");
  }
  return event.body;
}

function parseBody(event) {
  const rawBody = normalizeBody(event);
  const contentType =
    event?.headers?.["content-type"] || event?.headers?.["Content-Type"];

  if (typeof contentType === "string" && contentType.includes("application/json")) {
    try {
      return typeof rawBody === "string" && rawBody.length
        ? JSON.parse(rawBody)
        : rawBody;
    } catch (err) {
      console.error("Failed to parse JSON body", err);
      return rawBody;
    }
  }

  return rawBody;
}

function createResponseResolver(resolve) {
  return {
    _statusCode: 200,
    _headers: {},
    _sent: false,
    status(code) {
      this._statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this._headers[name] = value;
    },
    json(data) {
      if (!this._headers["Content-Type"]) {
        this._headers["Content-Type"] = "application/json";
      }
      this.send(JSON.stringify(data));
    },
    send(body) {
      if (this._sent) return;
      this._sent = true;
      resolve({
        statusCode: this._statusCode || 200,
        headers: this._headers,
        body: typeof body === "string" ? body : JSON.stringify(body ?? ""),
      });
    },
    end(body) {
      this.send(body ?? "");
    },
  };
}

function createNetlifyHandler(handler) {
  return async function netlifyHandler(event, context) {
    return await new Promise((resolve) => {
      const req = {
        method: event?.httpMethod,
        headers: event?.headers || {},
        query: event?.queryStringParameters || {},
        body: parseBody(event),
      };

      const res = createResponseResolver(resolve);

      try {
        const maybePromise = handler(req, res, context);
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.catch((err) => {
            console.error("Handler execution error", err);
            if (!res._sent) {
              res.status(500).json({ error: "Internal Server Error" });
            }
          });
        }
      } catch (err) {
        console.error("Handler execution error", err);
        if (!res._sent) {
          res.status(500).json({ error: "Internal Server Error" });
        }
      }
    });
  };
}

module.exports = {
  createNetlifyHandler,
};
