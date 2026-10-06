async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.OPENROUTER_API;
  if (!apiKey) {
    res.status(500).json({ error: 'Missing OPENROUTER_API' });
    return;
  }

  let body;
  try {
    body =
      typeof req.body === 'string'
        ? JSON.parse(req.body || '{}')
        : req.body || {};
  } catch {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  const model = typeof body.model === 'string' ? body.model.trim() : '';
  const text = typeof body.text === 'string' ? body.text.trim() : '';

  if (!model) {
    res.status(400).json({ error: 'Missing model' });
    return;
  }

  if (!text) {
    res.status(200).json({ translated: '' });
    return;
  }

  const messages = [
    {
      role: 'system',
      content:
        'Переведи описание игры на русский язык. ОБЯЗАТЕЛЬНО переведи весь текст на русский язык. НЕ оставляй английский текст. Сохрани форматирование абзацев. Отвечай ТОЛЬКО переведённым текстом, без пояснений и без обёртки в кавычки.',
    },
    {
      role: 'user',
      content: `Translate the following game description into Russian. Return only the Russian translation, preserving paragraphs. Keep proper names where appropriate.\n\n${text}`,
    },
  ];

  try {
    const response = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://pupsik-tv.vercel.app',
          'X-Title': 'PupsikTV Game Description Translator',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2,
          max_tokens: 4000,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        '[translate-description] OpenRouter failed',
        response.status,
        errorText
      );
      res.status(502).json({ error: 'Translation request failed' });
      return;
    }

    const completion = await response.json();
    const choice = completion?.choices?.[0];
    if (choice?.finish_reason === 'length') {
      res.status(502).json({
        error: 'Модель не завершила перевод: достигнут лимит длины ответа.',
      });
      return;
    }
    const content = choice?.message?.content || '';

    let translated = content;
    if (
      Array.isArray(content) &&
      content.every((item) => item && typeof item.text === 'string')
    ) {
      translated = content.map((item) => item.text).join('');
    } else if (
      content &&
      typeof content === 'object' &&
      typeof content.text === 'string'
    ) {
      translated = content.text;
    } else if (typeof content !== 'string') {
      translated = '';
    }

    translated = (translated || '').trim();
    const letters = translated.match(/\p{L}/gu) || [];
    const russianLetters = translated.match(/[а-яё]/giu) || [];
    if (
      !translated ||
      !letters.length ||
      russianLetters.length / letters.length < 0.3
    ) {
      res.status(502).json({
        error:
          'Модель не вернула перевод на русский язык. Повторите попытку или выберите другую модель.',
      });
      return;
    }
    if (
      translated.replace(/\s+/g, ' ').toLowerCase() ===
        text.replace(/\s+/g, ' ').toLowerCase() &&
      !/[а-яё]/iu.test(text)
    ) {
      res
        .status(502)
        .json({ error: 'Модель вернула исходный текст вместо перевода.' });
      return;
    }
    res.status(200).json({ translated });
  } catch (err) {
    console.error('[translate-description] error', err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = handler;
