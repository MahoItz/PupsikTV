import { translateSections } from "./imdb-parent-guide-utils";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end("Method Not Allowed");
    return;
  }

  const apiKey = process.env.OPENROUTER_API;
  if (!apiKey) {
    res.status(500).json({ error: "Missing OpenRouter API key" });
    return;
  }

  const sections = req.body?.sections;
  if (!sections || typeof sections !== "object") {
    res.status(400).json({ error: "Missing or invalid sections for translation" });
    return;
  }

  try {
    const translated = await translateSections(sections, apiKey);
    res.status(200).json({ translated });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Translation failed", message: err.message || "Unknown error" });
  }
}
