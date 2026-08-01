/**
 * Pluggable LLM adapter — OpenAI-compatible API (Groq, Together, Fireworks, OpenAI).
 * No feature code should call provider SDKs directly; use complete().
 */

const DEFAULT_TIMEOUT_MS = 4500;

function getConfig() {
  return {
    provider: process.env.LLM_PROVIDER || 'none',
    apiKey: process.env.LLM_API_KEY || process.env.GROQ_API_KEY || '',
    baseUrl: (process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, ''),
    model: process.env.LLM_MODEL || 'llama-3.3-70b-versatile',
    enabled: process.env.LLM_ENABLED === 'true' || Boolean(process.env.LLM_API_KEY || process.env.GROQ_API_KEY),
  };
}

/**
 * @param {{
 *   systemPrompt: string,
 *   userPrompt?: string,
 *   messages?: Array<{role: string, content: string}>,
 *   maxTokens?: number,
 *   temperature?: number,
 *   timeoutMs?: number,
 * }} opts
 */
async function complete({
  systemPrompt,
  userPrompt,
  messages,
  maxTokens = 800,
  temperature = 0.2,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const config = getConfig();
  if (!config.enabled || !config.apiKey) {
    const err = new Error('LLM not configured');
    err.code = 'LLM_DISABLED';
    throw err;
  }

  const chatMessages = Array.isArray(messages) && messages.length
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt || '' },
      ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        temperature,
        max_tokens: maxTokens,
        messages: chatMessages,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const err = new Error(`LLM HTTP ${response.status}`);
      err.code = 'LLM_HTTP_ERROR';
      throw err;
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    return {
      text,
      provider: config.provider,
      model: config.model,
      method: 'llm',
    };
  } finally {
    clearTimeout(timer);
  }
}

function isEnabled() {
  const config = getConfig();
  return config.enabled && Boolean(config.apiKey);
}

module.exports = { complete, isEnabled, getConfig };
