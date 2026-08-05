import { getMapsApiOrigin } from '../config/api';

/**
 * Ask LOCATIUM copilot — non-streaming JSON mode.
 * Kept for callers that want a single result object; the widget uses askLocatiumStream.
 */
export async function askLocatium(payload, { signal } = {}) {
  const origin = getMapsApiOrigin();
  let res;
  try {
    res = await fetch(`${origin}/api/assistant/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...payload, stream: false }),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new Error('Could not reach the copilot. Check your connection and retry.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || `Assistant failed (${res.status})`);
  }
  return data;
}

/**
 * Streaming copilot call. Invokes callbacks as server-sent events arrive so the UI can render
 * the first words within ~100ms instead of waiting for the whole answer.
 *
 * @param {object} payload  question + map context + session memory
 * @param {object} handlers
 * @param {(phase: string, detail: string|null) => void} handlers.onStatus
 * @param {(meta: object) => void} handlers.onMeta     cards/actions, arrives before text
 * @param {(text: string) => void} handlers.onToken    incremental answer text
 * @param {(g: object) => void} handlers.onGuardrail   ungrounded output was replaced
 * @param {(final: object) => void} handlers.onFinal
 * @param {AbortSignal} handlers.signal
 */
export async function askLocatiumStream(payload, handlers = {}) {
  const { onStatus, onMeta, onToken, onGuardrail, onFinal, signal } = handlers;
  const origin = getMapsApiOrigin();

  const res = await fetch(`${origin}/api/assistant/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ ...payload, stream: true }),
    signal,
  });

  if (!res.ok) {
    let message = `Assistant failed (${res.status})`;
    try {
      const data = await res.json();
      message = data.error || data.message || message;
    } catch {
      /* SSE endpoints don't always return JSON errors */
    }
    throw new Error(message);
  }
  if (!res.body) throw new Error('Streaming not supported by this browser.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalPayload = null;

  // SSE frames are separated by a blank line; each frame has `event:` and `data:` lines.
  const handleFrame = (frame) => {
    let event = 'message';
    const dataLines = [];
    for (const rawLine of frame.split('\n')) {
      const line = rawLine.trimEnd();
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length) return;
    let data;
    try {
      data = JSON.parse(dataLines.join('\n'));
    } catch {
      return;
    }

    switch (event) {
      case 'status':
        onStatus?.(data.phase, data.detail ?? null);
        break;
      case 'meta':
        onMeta?.(data);
        break;
      case 'token':
        if (data.text) onToken?.(data.text);
        break;
      case 'guardrail':
        onGuardrail?.(data);
        break;
      case 'final':
        finalPayload = data;
        break;
      case 'error':
        throw new Error(data.message || 'Assistant stream error');
      default:
        break;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let split;
    while ((split = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      handleFrame(frame);
    }
  }
  if (buffer.trim()) handleFrame(buffer);

  if (finalPayload) onFinal?.(finalPayload);
  return finalPayload;
}
