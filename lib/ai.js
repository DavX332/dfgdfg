import CONFIG from '../config.js';

// ИИ-модуль: вызывает OpenAI-совместимый API chat/completions.
// Подходит для GigaChat, YandexGPT, OpenRouter и любых провайдеров
// с тем же форматом. Настройки в .env (см. .env.example).

const AI = {
  apiKey: CONFIG.ai?.apiKey || '',
  baseUrl: CONFIG.ai?.baseUrl || 'https://openrouter.ai/api/v1',
  model: CONFIG.ai?.model || ''
};

function isConfigured() {
  return !!(AI.apiKey && AI.model);
}

/**
 * Отправляет запрос к ИИ и возвращает текст ответа.
 * @param {string} system Системный промпт
 * @param {string} user Пользовательский запрос
 * @param {number} maxTokens
 */
export async function chat(messages, { maxTokens = 2000, temperature = 0.7 } = {}) {
  if (!isConfigured()) {
    const err = new Error('ИИ не настроен: добавьте AI_API_KEY и AI_MODEL в файл .env');
    err.code = 'AI_NOT_CONFIGURED';
    throw err;
  }

  // Повторы при обрыве сети (TLS/ECONNRESET) — сеть к провайдеру бывает нестабильна
  const attempts = 4;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${AI.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${AI.apiKey}`
        },
        body: JSON.stringify({
          model: AI.model,
          messages,
          max_tokens: maxTokens,
          temperature
        })
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = new Error(`Ошибка ИИ (${res.status}): ${text}`);
        err.code = 'AI_ERROR';
        throw err;
      }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        const err = new Error('ИИ вернул пустой ответ');
        err.code = 'AI_EMPTY';
        throw err;
      }
      return content;
    } catch (e) {
      const isNetwork = !e.code || e.code === 'AI_ERROR' && /fetch failed|ECONNRESET|UND_ERR|network/i.test(e.message);
      if (i === attempts - 1 || !isNetwork) throw e;
      await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    }
  }
}