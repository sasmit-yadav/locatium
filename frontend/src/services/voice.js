import { getMapsApiOrigin } from '../config/api';
import { authFetch } from './auth';

/**
 * Voice support for Ask LOCATIUM.
 *
 * Input  — record with MediaRecorder and transcribe server-side (Groq Whisper). Chosen over the
 *          browser SpeechRecognition API because that is Chromium/Safari-only (Firefox has none),
 *          needs a network round trip anyway, and gives no control over the model or vocabulary.
 *
 * Output — browser speechSynthesis: free, offline, no per-request cost. Its one serious trap is
 *          that Chrome silently truncates utterances past roughly 200-250 characters, so anything
 *          longer must be split into sentence-sized chunks and queued.
 */

/** MediaRecorder mime types in preference order — webm/opus is what Whisper handles best. */
const AUDIO_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

export function isRecordingSupported() {
  return Boolean(
    typeof window !== 'undefined' &&
      navigator?.mediaDevices?.getUserMedia &&
      typeof window.MediaRecorder !== 'undefined'
  );
}

function pickMimeType() {
  if (typeof window.MediaRecorder?.isTypeSupported !== 'function') return '';
  return AUDIO_TYPES.find((t) => window.MediaRecorder.isTypeSupported(t)) || '';
}

/**
 * Start recording. Returns a handle; call `stop()` to get the audio blob, or `cancel()` to discard.
 * The caller is responsible for releasing the mic, which both methods do.
 */
export async function startRecording() {
  if (!isRecordingSupported()) {
    throw new Error('Voice recording is not supported in this browser.');
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch (err) {
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
      throw new Error('Microphone permission was blocked. Allow mic access and try again.', {
        cause: err,
      });
    }
    if (err.name === 'NotFoundError') {
      throw new Error('No microphone found on this device.', { cause: err });
    }
    throw new Error(`Could not access the microphone: ${err.message}`, { cause: err });
  }

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  recorder.addEventListener('dataavailable', (e) => {
    if (e.data?.size) chunks.push(e.data);
  });
  recorder.start();

  const release = () => stream.getTracks().forEach((t) => t.stop());

  return {
    mimeType: mimeType || 'audio/webm',
    get state() {
      return recorder.state;
    },
    cancel() {
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } finally {
        release();
      }
    },
    stop() {
      return new Promise((resolve, reject) => {
        recorder.addEventListener(
          'stop',
          () => {
            release();
            const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
            if (!blob.size) reject(new Error('No audio was captured. Try speaking a little longer.'));
            else resolve(blob);
          },
          { once: true }
        );
        recorder.addEventListener('error', (e) => {
          release();
          reject(new Error(`Recording failed: ${e.error?.message || 'unknown error'}`));
        }, { once: true });
        if (recorder.state !== 'inactive') recorder.stop();
        else release();
      });
    },
  };
}

/**
 * Send recorded audio for transcription.
 * @param {Blob} blob
 * @param {{language?: 'hi'|'en', signal?: AbortSignal}} opts  omit language to auto-detect (best for Hinglish)
 */
export async function transcribeAudio(blob, { language, signal } = {}) {
  const origin = getMapsApiOrigin();
  const qs = language ? `?language=${encodeURIComponent(language)}` : '';
  const res = await authFetch(`${origin}/api/assistant/voice${qs}`, {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'audio/webm' },
    body: blob,
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Transcription failed (${res.status})`);
  return data;
}

/* ------------------------------------------------------------------ */
/* Speech output                                                       */
/* ------------------------------------------------------------------ */

export function isSpeechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Split text into utterance-sized pieces on sentence boundaries.
 * Chrome cuts a single utterance at roughly 200-250 characters, so we stay well under that
 * and re-queue rather than risk a sentence vanishing mid-answer.
 */
export function chunkForSpeech(text, maxLen = 180) {
  const clean = String(text || '')
    .replace(/[*_`#]/g, '') // markdown artefacts read badly aloud
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return [];

  // Split on sentence enders including the Devanagari danda.
  const sentences = clean.match(/[^.!?।\n]+[.!?।]?/g) || [clean];
  const chunks = [];
  let current = '';

  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (s.length > maxLen) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      // Long clause with no punctuation — break on commas, then hard-slice.
      let rest = s;
      while (rest.length > maxLen) {
        const cut = rest.lastIndexOf(',', maxLen);
        const at = cut > maxLen * 0.5 ? cut + 1 : maxLen;
        chunks.push(rest.slice(0, at).trim());
        rest = rest.slice(at).trim();
      }
      if (rest) current = rest;
      continue;
    }
    if ((current + ' ' + s).trim().length > maxLen) {
      chunks.push(current);
      current = s;
    } else {
      current = (current ? `${current} ` : '') + s;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

let activeSpeech = null;

/** Pick the best available voice for a locale, tolerating async voice loading. */
function selectVoice(locale) {
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null;
  const lang = locale.split('-')[0];
  return (
    voices.find((v) => v.lang === locale) ||
    voices.find((v) => v.lang?.startsWith(lang)) ||
    null
  );
}

/**
 * Speak text aloud, chunked and queued.
 * @param {string} text
 * @param {{locale?: string, rate?: number, onStart?: Function, onEnd?: Function, onError?: Function}} opts
 * @returns {{cancel: Function}}
 */
export function speak(text, { locale = 'en-IN', rate = 1, onStart, onEnd, onError } = {}) {
  if (!isSpeechSupported()) {
    onError?.(new Error('Speech output is not supported in this browser.'));
    return { cancel() {} };
  }

  stopSpeaking();

  const chunks = chunkForSpeech(text);
  if (!chunks.length) {
    onEnd?.();
    return { cancel() {} };
  }

  let cancelled = false;
  let index = 0;
  activeSpeech = {
    cancel() {
      cancelled = true;
      window.speechSynthesis.cancel();
    },
  };

  const speakNext = () => {
    if (cancelled || index >= chunks.length) {
      if (!cancelled) onEnd?.();
      activeSpeech = null;
      return;
    }
    const utterance = new SpeechSynthesisUtterance(chunks[index]);
    utterance.lang = locale;
    utterance.rate = rate;
    const voice = selectVoice(locale);
    if (voice) utterance.voice = voice;

    utterance.addEventListener('end', () => {
      index += 1;
      speakNext();
    });
    utterance.addEventListener('error', (e) => {
      // 'interrupted'/'canceled' are expected when the user stops playback.
      if (!cancelled && e.error !== 'interrupted' && e.error !== 'canceled') {
        onError?.(new Error(`Speech failed: ${e.error}`));
      }
      activeSpeech = null;
    });

    if (index === 0) onStart?.();
    window.speechSynthesis.speak(utterance);
  };

  // Voices can load asynchronously on first use; wait once if the list is empty.
  if (!window.speechSynthesis.getVoices()?.length) {
    window.speechSynthesis.addEventListener('voiceschanged', speakNext, { once: true });
    setTimeout(() => {
      if (!cancelled && index === 0 && !window.speechSynthesis.speaking) speakNext();
    }, 250);
  } else {
    speakNext();
  }

  return activeSpeech;
}

export function stopSpeaking() {
  if (!isSpeechSupported()) return;
  activeSpeech?.cancel?.();
  activeSpeech = null;
  window.speechSynthesis.cancel();
}

export function isSpeaking() {
  return isSpeechSupported() && window.speechSynthesis.speaking;
}
