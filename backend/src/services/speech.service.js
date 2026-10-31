/**
 * Speech-to-text for Ask LOCATIUM (voice input).
 *
 * Provider: Groq Whisper (OpenAI-compatible multipart endpoint) — reuses the existing Groq key,
 * accepts the `webm` blobs browsers produce via MediaRecorder, and transcribes 99+ languages
 * including Hindi. Chosen over browser SpeechRecognition for the primary path because that API
 * is Chromium/Safari-only (Firefox has none) and gives no control over the model.
 *
 * Two deliberate quality choices:
 *  - `prompt` biases Whisper's vocabulary toward Haryana place names and land jargon, which is
 *    exactly where a generic model mishears ("Jhajjar", "HSIIDC", "circle rate", "khasra").
 *  - `language` is only pinned when the caller is sure. Hinglish is code-mixed, and forcing a
 *    language on mixed speech degrades it, so auto-detect is the default.
 *
 * Bhashini (MeitY's national language platform) is the natural second provider for a
 * government-facing product; the adapter shape below leaves room for it without touching callers.
 */

const { AppError } = require('../middleware/error.middleware');
const DEFAULT_MODEL = process.env.SPEECH_MODEL || 'whisper-large-v3-turbo';
const DEFAULT_TIMEOUT_MS = Number(process.env.SPEECH_TIMEOUT_MS) || 20000;
const MAX_BYTES = Number(process.env.SPEECH_MAX_BYTES) || 25 * 1024 * 1024; // Groq free-tier ceiling

/** Domain vocabulary hint (Whisper caps `prompt` at 224 tokens — keep it dense). */
const DOMAIN_PROMPT = [
  'Haryana land investment enquiry.',
  'Districts: Gurugram, Faridabad, Sonipat, Panipat, Karnal, Ambala, Hisar, Rohtak, Rewari,',
  'Jhajjar, Palwal, Nuh, Bhiwani, Sirsa, Fatehabad, Jind, Kaithal, Kurukshetra, Yamunanagar,',
  'Panchkula, Mahendragarh, Charkhi Dadri, Bahadurgarh, Manesar, Sohna, Pataudi, Bawal, Dharuhera.',
  'Terms: HSIIDC, HSVP, IMT, CLU, EIA, circle rate, collector rate, khasra, sq yard, acre,',
  'crore, lakh, industrial plot, warehouse, godown, licensed colony, land bank.',
].join(' ');

function getConfig() {
  const apiKey = process.env.SPEECH_API_KEY || process.env.LLM_API_KEY || process.env.GROQ_API_KEY || '';
  return {
    provider: process.env.SPEECH_PROVIDER || 'groq',
    apiKey,
    baseUrl: (process.env.SPEECH_BASE_URL || process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, ''),
    model: DEFAULT_MODEL,
    enabled: process.env.SPEECH_ENABLED !== 'false' && Boolean(apiKey),
  };
}

function isEnabled() {
  return getConfig().enabled;
}

/**
 * Transcribe an audio buffer.
 *
 * @param {object} input
 * @param {Buffer} input.buffer      raw audio bytes
 * @param {string} [input.filename]  used only for the content-type sniff on Groq's side
 * @param {string} [input.mimeType]
 * @param {string} [input.language]  ISO-639-1 ('hi' | 'en'); omit for auto-detect (best for Hinglish)
 * @param {boolean} [input.translate] true → return English text regardless of spoken language
 * @param {AbortSignal} [input.signal]
 * @returns {Promise<{text: string, language: string|null, durationSec: number|null, model: string, provider: string, elapsedMs: number}>}
 */
async function transcribe({
  buffer,
  filename = 'audio.webm',
  mimeType = 'audio/webm',
  language,
  translate = false,
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const config = getConfig();
  if (!config.enabled) {
    const err = AppError.serviceUnavailable('Speech-to-text is not configured');
    err.code = 'SPEECH_DISABLED';
    throw err;
  }
  if (!buffer || !buffer.length) throw AppError.badRequest('Empty audio payload');
  if (buffer.length > MAX_BYTES) {
    throw AppError.payloadTooLarge(
      `Audio too large (${Math.round(buffer.length / 1024)}KB, max ${Math.round(MAX_BYTES / 1024)}KB)`
    );
  }

  const started = Date.now();
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), filename);
  form.append('model', config.model);
  form.append('response_format', 'verbose_json'); // carries detected language + duration
  form.append('temperature', '0');
  form.append('prompt', DOMAIN_PROMPT);
  // Only pin a language when the caller explicitly asked; mixed-language speech does better on auto.
  if (language && !translate) form.append('language', language);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const combined =
    signal && typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([controller.signal, signal])
      : controller.signal;

  // /translations always returns English; /transcriptions keeps the spoken language.
  const path = translate ? '/audio/translations' : '/audio/transcriptions';

  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
      signal: combined,
    });

    if (!response.ok) {
      let detail = '';
      try {
        detail = (await response.text()).slice(0, 300);
      } catch {
        /* ignore */
      }
      // The upstream body can carry provider internals, so it is logged, never returned.
      const err =
        response.status === 429
          ? AppError.tooManyRequests('Speech provider rate limit reached; retry shortly')
          : AppError.badGateway('Speech provider rejected the request');
      err.upstream = `Speech HTTP ${response.status}${detail ? ` — ${detail}` : ''}`;
      throw err;
    }

    const data = await response.json();
    return {
      text: String(data.text || '').trim(),
      language: data.language || language || null,
      durationSec: data.duration != null ? Number(data.duration) : null,
      model: config.model,
      provider: config.provider,
      elapsedMs: Date.now() - started,
    };
  } catch (err) {
    if (err.name === 'AbortError') throw AppError.gatewayTimeout('Transcription timed out');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { transcribe, isEnabled, getConfig, DOMAIN_PROMPT, MAX_BYTES };
