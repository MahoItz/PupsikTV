const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const SUPABASE_URL = "https://shwekurmzyzivtworjup.supabase.co";
const DEFAULT_OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

async function loadSelectedOpenRouterModel() {
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseKey) {
    return null;
  }

  try {
    const { createClient } = await import("@supabase/supabase-js");

    const supabase = createClient(SUPABASE_URL, supabaseKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase
      .from("settings")
      .select("selected_ai_model, ai_model")
      .order("id", { ascending: true });

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    const settingsRow = rows.find((item) => item?.selected_ai_model) || rows[0] || null;
    const model =
      typeof settingsRow?.selected_ai_model === "string"
        ? settingsRow.selected_ai_model.trim()
        : typeof settingsRow?.ai_model === "string"
          ? settingsRow.ai_model.trim()
          : null;

    return model || null;
  } catch (err) {
    console.error("[imdb-parent-guide-utils] failed to load ai_model", err);
    return null;
  }
}

async function translateSections(sections, apiKey) {
  const selectedModel = (await loadSelectedOpenRouterModel()) || DEFAULT_OPENROUTER_MODEL;
  const body = {
    model: selectedModel,
    messages: [
      {
        role: "system",
        content:
          'Ты — профессиональный переводчик с английского на русский язык. Твоя задача — переводить содержание разделов IMDb "Parents Guide" на естественный, грамотный русский язык. Всегда отвечай строго в виде корректного JSON. Структура JSON должна полностью соответствовать структуре входных данных: те же ключи, те же массивы, та же длина массивов и тот же порядок элементов. Ничего не добавляй и не удаляй. Все строки должны быть переведены исключительно на русский язык. Не используй английский язык в ответе, кроме случаев имён собственных.',
      },
      {
        role: "user",
        content: JSON.stringify({
          instruction:
            'Переведи каждую строку в объекте "sections" на русский язык. Сохрани структуру JSON без изменений: те же ключи, массивы и порядок элементов. Каждый элемент массива должен быть грамотным, естественным русским предложением или фразой. Ответ должен быть строго корректным JSON без каких-либо дополнительных комментариев или текста.',
          sections,
        }),
      },
    ],
    temperature: 0.3,
  };

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter request failed: ${response.status}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || "";
  const normalized = content
    .replace(/^```json/gi, "")
    .replace(/```$/g, "")
    .trim();
  try {
    return JSON.parse(normalized);
  } catch (err) {
    throw new Error("Failed to parse translation response");
  }
}

export { loadSelectedOpenRouterModel, translateSections };
