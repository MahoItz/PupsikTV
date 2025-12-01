const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const SECTION_IDS = {
  sexAndNudity: 'advisory-sex-content',
  violenceAndGore: 'advisory-violence-content',
  profanity: 'advisory-profanity-content',
};

function extractSection(html, sectionId) {
  const safeId = String(sectionId || '').replace(/[^a-zA-Z0-9_-]/g, '');

  if (!safeId) return [];

  const idIndex = html.indexOf(`id="${safeId}"`);
  if (idIndex === -1) return [];

  const sectionStart = html.lastIndexOf('<section', idIndex);
  if (sectionStart === -1) return [];

  const sectionEnd = html.indexOf('</section>', idIndex);
  if (sectionEnd === -1) return [];

  const sectionHtml = html.slice(sectionStart, sectionEnd + '</section>'.length);

  const items = sectionHtml.split(/<li[^>]*>/i).slice(1);
  const cleanText = (text) => text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const results = items
    .map((item) => {
      const listItem = item.split(/<\/li>/i)[0] || '';
      const severityMatch = listItem.match(/data-testid="advisory-severity-vote"[^>]*>(.*?)<\/span>/i);
      const contentMatch = listItem.match(/<p[^>]*>([\s\S]*?)<\/p>/i) || listItem.match(/([\s\S]*)/);
      const content = cleanText(contentMatch ? contentMatch[1] : '');
      const severity = severityMatch ? cleanText(severityMatch[1]) : '';
      const combined = severity ? `${severity}: ${content}` : content;
      return combined.trim();
    })
    .filter(Boolean);

  return results;
}

async function translateSections(sections, apiKey) {
  const body = {
    model: 'openai/gpt-oss-20b:free',
    messages: [
      {
        role: 'system',
        content:
          'You translate IMDb parental guide content into Russian. Respond strictly with JSON matching the provided keys and arrays.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          instruction: 'Translate each array value to Russian, keeping the same array length and order.',
          sections,
        }),
      },
    ],
    temperature: 0.3,
  };

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter request failed: ${response.status}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || '';
  const normalized = content.replace(/^```json/gi, '').replace(/```$/g, '').trim();
  try {
    return JSON.parse(normalized);
  } catch (err) {
    throw new Error('Failed to parse translation response');
  }
}

export default async function handler(req, res) {
  const { id } = req.query || {};
  if (!id) {
    res.status(400).json({ error: 'Missing IMDb title id' });
    return;
  }

  const apiKey = process.env.OPENROUTER_API;
  if (!apiKey) {
    res.status(500).json({ error: 'Missing OpenRouter API key' });
    return;
  }

  try {
    const url = `https://www.imdb.com/title/${encodeURIComponent(id)}/parentalguide/`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PupsikTV/1.0)',
      },
    });

    if (!response.ok) {
      res.status(response.status).json({ error: 'Failed to fetch parental guide' });
      return;
    }

    const html = await response.text();
    const sections = Object.fromEntries(
      Object.entries(SECTION_IDS).map(([key, sectionId]) => [key, extractSection(html, sectionId)])
    );

    const translation = await translateSections(sections, apiKey);

    res.status(200).json({ original: sections, translated: translation });
  } catch (err) {
    res.status(500).json({ error: 'Server error', message: err.message });
  }
}
