/**
 * Pluggable LLM adapter — OpenAI-compatible API (Groq, Together, Fireworks, OpenAI).
 * No feature code should call provider SDKs directly; use complete() or streamChat().
 *
 * Latency notes (Groq docs): total = TTFT + decoding + network. Decoding scales linearly
 * with OUTPUT tokens, and TTFT on 70B+ models grows steeply with INPUT length — so callers
 * should keep context tight (see assistant-context.service) and max_tokens honest.
 *
 * Prompt caching: Groq caches only on gpt-oss models today, but cache-friendly ordering
 * (static instructions first, volatile user/context last) is free and future-proof, so
 * buildMessages() enforces it regardless of provider.
 */

const telemetry = require('./llm-telemetry');

const DEFAULT_TIMEOUT_MS = 4500;
const MIN_RETRY_BUDGET_MS = 900; // don't start a retry we can't finish
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function getConfig() {
  const apiKey = process.env.LLM_API_KEY || process.env.GROQ_API_KEY || '';
  return {
    provider: process.env.LLM_PROVIDER || 'groq',
    apiKey,
    baseUrl: (process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, ''),
    model: process.env.LLM_MODEL || 'openai/gpt-oss-120b',
    // Small/fast model for cheap sub-second jobs (query rewriting, classification).
    fastModel: process.env.LLM_FAST_MODEL || 'openai/gpt-oss-20b',
    // Comma-separated cascade used when the primary model errors out. A retired model
    // answers 404 (not retryable), so without a cascade the copilot silently degrades
    // to rule-based answers the moment a provider drops a model id.
    fallbackModels: String(
      process.env.LLM_FALLBACK_MODELS || 'qwen/qwen3.8-27b,openai/gpt-oss-20b'
    )
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean),
    // Reasoning models bill their private reasoning against max_tokens; at assistant-sized
    // budgets that can consume the whole allowance and return empty content.
    reasoningEffort: process.env.LLM_REASONING_EFFORT || 'low',
    // on_demand = consistent low latency; flex = 10x rate limits, may reject under load.
    serviceTier: process.env.LLM_SERVICE_TIER || '',
    maxAttempts: Number(process.env.LLM_MAX_ATTEMPTS) || 2,
    enabled: process.env.LLM_ENABLED === 'true' || Boolean(apiKey),
  };
}

/** Rough token estimate (~4 chars/token) — for budgeting only, never for billing. */
function approxTokens(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 4);
}

/**
 * Cache-friendly message ordering: stable system instructions first, then any
 * long-lived context, then the volatile turn. Keeps a reusable prefix at the front.
 */
function buildMessages({ systemPrompt, stablePrefix, messages, userPrompt }) {
  const out = [];
  if (systemPrompt) out.push({ role: 'system', content: systemPrompt });
  if (stablePrefix) out.push({ role: 'system', content: stablePrefix });
  if (Array.isArray(messages) && messages.length) out.push(...messages);
  else if (userPrompt) out.push({ role: 'user', content: userPrompt });
  return out;
}

function combineSignals(signals) {
  const live = signals.filter(Boolean);
  if (!live.length) return undefined;
  if (live.length === 1) return live[0];
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
    return AbortSignal.any(live);
  }
  const controller = new AbortController();
  for (const s of live) {
    if (s.aborted) {
      controller.abort();
      break;
    }
    s.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}

function buildBody({ model, chatMessages, maxTokens, temperature, stream, stop, jsonMode }) {
  const config = getConfig();
  const body = {
    model,
    temperature,
    max_tokens: maxTokens,
    messages: chatMessages,
  };
  if (stop && stop.length) body.stop = stop;
  if (stream) {
    body.stream = true;
    // Gives us a final chunk carrying token usage (incl. cached_tokens) for telemetry.
    body.stream_options = { include_usage: true };
  }
  if (jsonMode) body.response_format = { type: 'json_object' };
  if (config.serviceTier) body.service_tier = config.serviceTier;
  if (config.reasoningEffort) body.reasoning_effort = config.reasoningEffort;
  return body;
}

async function postChat({ model, chatMessages, maxTokens, temperature, stream, stop, jsonMode, timeoutMs, signal }) {
  const config = getConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const combined = combineSignals([controller.signal, signal]);

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        buildBody({ model, chatMessages, maxTokens, temperature, stream, stop, jsonMode })
      ),
      signal: combined,
    });

    if (!response.ok) {
      let detail = '';
      try {
        detail = (await response.text()).slice(0, 300);
      } catch {
        /* body already consumed / aborted */
      }
      const err = new Error(`LLM HTTP ${response.status}${detail ? ` — ${detail}` : ''}`);
      err.code = 'LLM_HTTP_ERROR';
      err.status = response.status;
      err.retryable = RETRYABLE_STATUS.has(response.status);
      err.retryAfterMs = Number(response.headers.get('retry-after')) * 1000 || null;
      throw err;
    }
    return { response, clearTimer: () => clearTimeout(timer) };
  } catch (err) {
    clearTimeout(timer);
    if (err.code === 'LLM_HTTP_ERROR') throw err;
    // Network / abort / DNS: retryable unless the caller cancelled.
    const cancelledByCaller = Boolean(signal?.aborted);
    const wrapped = new Error(
      cancelledByCaller ? 'LLM request cancelled' : `LLM transport error: ${err.message}`
    );
    wrapped.code = cancelledByCaller ? 'LLM_CANCELLED' : 'LLM_TRANSPORT_ERROR';
    wrapped.retryable = !cancelledByCaller;
    throw wrapped;
  }
}

/** Model cascade: primary first, then configured fallbacks. */
function modelPlan(requestedModel) {
  const config = getConfig();
  const primary = requestedModel || config.model;
  return [primary, ...config.fallbackModels.filter((m) => m !== primary)];
}

function assertEnabled() {
  const config = getConfig();
  if (!config.enabled || !config.apiKey) {
    const err = new Error('LLM not configured');
    err.code = 'LLM_DISABLED';
    throw err;
  }
  return config;
}

function backoffMs(attempt, retryAfterMs) {
  if (retryAfterMs) return Math.min(retryAfterMs, 2000);
  const base = 250 * 2 ** (attempt - 1);
  return Math.round(base + Math.random() * 150); // jitter avoids retry storms
}

/**
 * Non-streaming completion. Backward-compatible with the original adapter contract.
 *
 * @returns {Promise<{text: string, provider: string, model: string, method: 'llm',
 *   usage: object|null, ttftMs: number, elapsedMs: number, attempts: number}>}
 */
async function complete({
  systemPrompt,
  stablePrefix,
  userPrompt,
  messages,
  model: requestedModel,
  maxTokens = 800,
  temperature = 0.2,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  stop,
  jsonMode = false,
  signal,
}) {
  const config = assertEnabled();
  const chatMessages = buildMessages({ systemPrompt, stablePrefix, messages, userPrompt });
  const started = Date.now();
  const deadline = started + timeoutMs;
  const plan = modelPlan(requestedModel);

  let attempts = 0;
  let lastErr = null;

  for (let m = 0; m < plan.length; m += 1) {
    const model = plan[m];
    for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
      const remaining = deadline - Date.now();
      if (remaining < MIN_RETRY_BUDGET_MS) break;
      attempts += 1;
      try {
        const { response, clearTimer } = await postChat({
          model,
          chatMessages,
          maxTokens,
          temperature,
          stream: false,
          stop,
          jsonMode,
          timeoutMs: remaining,
          signal,
        });
        try {
          const data = await response.json();
          const text = data.choices?.[0]?.message?.content?.trim() || '';
          if (!text) {
            // 200 with no content (e.g. a reasoning model that spent the whole budget
            // thinking). Treat it as a model failure so the cascade gets its turn.
            const empty = new Error(`LLM returned an empty completion (${model})`);
            empty.code = 'LLM_EMPTY_COMPLETION';
            empty.retryable = false;
            throw empty;
          }
          const elapsedMs = Date.now() - started;
          return {
            text,
            provider: config.provider,
            model,
            method: 'llm',
            usage: data.usage || null,
            finishReason: data.choices?.[0]?.finish_reason || null,
            ttftMs: elapsedMs, // non-streaming: first token == last token
            elapsedMs,
            attempts,
            modelFallback: m > 0,
          };
        } finally {
          clearTimer();
        }
      } catch (err) {
        lastErr = err;
        if (err.code === 'LLM_CANCELLED' || err.code === 'LLM_DISABLED') throw err;
        if (!err.retryable) break; // try next model instead of hammering this one
        const wait = backoffMs(attempt, err.retryAfterMs);
        if (Date.now() + wait + MIN_RETRY_BUDGET_MS > deadline) break;
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }

  throw lastErr || new Error('LLM failed');
}

/**
 * Real token streaming over an OpenAI-compatible SSE response.
 * Yields `{type:'token', text}` as tokens arrive, then one `{type:'done', ...}`.
 *
 * Consuming this instead of complete() is what takes perceived latency from
 * "whole answer after N seconds" to "first words in ~100ms" on Groq.
 */
async function* streamChat({
  systemPrompt,
  stablePrefix,
  userPrompt,
  messages,
  model: requestedModel,
  maxTokens = 800,
  temperature = 0.2,
  timeoutMs = 20000,
  stop,
  signal,
}) {
  const config = assertEnabled();
  const chatMessages = buildMessages({ systemPrompt, stablePrefix, messages, userPrompt });
  const started = Date.now();
  const plan = modelPlan(requestedModel);

  let lastErr = null;

  for (let m = 0; m < plan.length; m += 1) {
    const model = plan[m];
    let opened = false;
    try {
      const { response, clearTimer } = await postChat({
        model,
        chatMessages,
        maxTokens,
        temperature,
        stream: true,
        stop,
        timeoutMs,
        signal,
      });
      opened = true;

      let ttftMs = null;
      let usage = null;
      let finishReason = null;
      let full = '';

      try {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // keep the partial line for the next chunk

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue; // heartbeat/comment
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === '[DONE]') {
              buffer = '';
              break;
            }
            let parsed;
            try {
              parsed = JSON.parse(payload);
            } catch {
              continue; // ignore malformed keepalive fragments
            }
            if (parsed.usage) usage = parsed.usage;
            const choice = parsed.choices?.[0];
            if (choice?.finish_reason) finishReason = choice.finish_reason;
            const delta = choice?.delta?.content;
            if (delta) {
              if (ttftMs == null) ttftMs = Date.now() - started;
              full += delta;
              yield { type: 'token', text: delta };
            }
          }
        }
      } finally {
        clearTimer();
      }

      yield {
        type: 'done',
        text: full,
        provider: config.provider,
        model,
        method: 'llm',
        usage,
        finishReason,
        ttftMs: ttftMs ?? Date.now() - started,
        elapsedMs: Date.now() - started,
        modelFallback: m > 0,
      };
      return;
    } catch (err) {
      lastErr = err;
      if (err.code === 'LLM_CANCELLED' || err.code === 'LLM_DISABLED') throw err;
      // Once tokens have been emitted we cannot silently switch models — the
      // caller already showed partial text, so surface the failure instead.
      if (opened) throw err;
    }
  }

  throw lastErr || new Error('LLM stream failed');
}

function isEnabled() {
  const config = getConfig();
  return config.enabled && Boolean(config.apiKey);
}

module.exports = {
  complete,
  streamChat,
  isEnabled,
  getConfig,
  approxTokens,
  buildMessages,
  telemetry,
};
