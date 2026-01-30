async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.OPENROUTER_API;
  if (!apiKey) {
    res.status(500).json({ error: "Missing OPENROUTER_API" });
    return;
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch (err) {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  const model = body.model;
  if (!model) {
    res.status(400).json({ error: "Missing model" });
    return;
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://pupsik-tv.vercel.app",
        "X-Title": "PupsikTV Status Checker",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Respond with '.'" }],
        max_tokens: 1,
        temperature: 0,
      }),
    });

    const httpStatus = response.status;
    let provider = "Unknown";
    let raw = "";

    try {
      const data = await response.json();
      provider = data?.provider || "OpenRouter";
      raw = JSON.stringify(data);
    } catch (e) {
      raw = await response.text();
    }

    if (response.ok) {
      res.status(200).json({
        status: "active",
        http_status: httpStatus,
        provider,
        raw: "OK",
      });
    } else if (httpStatus === 429) {
      res.status(200).json({
        status: "rate_limited",
        http_status: httpStatus,
        provider,
        raw,
      });
    } else if (httpStatus === 404) {
      res.status(200).json({
        status: "unavailable",
        http_status: httpStatus,
        provider,
        raw,
      });
    } else {
      res.status(200).json({
        status: "error",
        http_status: httpStatus,
        provider,
        raw,
      });
    }
  } catch (err) {
    res.status(200).json({
      status: "error",
      http_status: 0,
      provider: "Network",
      raw: err.message,
    });
  }
}

module.exports = handler;
