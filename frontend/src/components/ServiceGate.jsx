import { useCallback, useEffect, useState } from 'react';
import { LoaderCircle, RefreshCw, ServerOff } from 'lucide-react';
import { getMapsApiOrigin } from '../config/api';

const RETRY_DELAY_MS = 4_000;
const REQUEST_TIMEOUT_MS = 80_000;

export function ServiceGate({ children }) {
  const [state, setState] = useState({ status: 'checking', message: '' });

  const check = useCallback(async () => {
    setState((current) => ({ ...current, status: 'checking' }));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${getMapsApiOrigin()}/api/ready`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.status !== 'ok') {
        throw new Error(body.detail || 'The data service is still starting');
      }
      setState({ status: 'ready', message: '' });
    } catch (error) {
      setState({
        status: 'waiting',
        message:
          error.name === 'AbortError'
            ? 'The service took too long to respond'
            : error.message || 'The service is unavailable',
      });
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(check, 0);
    return () => clearTimeout(timer);
  }, [check]);

  useEffect(() => {
    if (state.status !== 'waiting') return undefined;
    const timer = setTimeout(check, RETRY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [check, state.status]);

  if (state.status === 'ready') return children;

  const waiting = state.status === 'waiting';
  return (
    <main className="flex min-h-screen items-center justify-center bg-ds-surface-base px-6 text-ds-text-primary">
      <section className="w-full max-w-md rounded-2xl border border-ds-border bg-ds-surface-raised p-8 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-ds-accent-subtle text-ds-accent">
          {waiting ? <ServerOff size={26} /> : <LoaderCircle className="animate-spin" size={26} />}
        </div>
        <h1 className="font-display text-xl font-bold">
          {waiting ? 'Waking the location engine' : 'Connecting to LOCATIUM'}
        </h1>
        <p className="mt-3 text-sm leading-6 text-ds-text-secondary">
          {waiting
            ? `${state.message}. Free showcase services can need about a minute to wake; retrying automatically.`
            : 'Checking the API, PostGIS data, and cache before loading the map.'}
        </p>
        {waiting ? (
          <button
            type="button"
            onClick={check}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-ds-accent px-4 py-2 text-sm font-semibold text-ds-text-inverse"
          >
            <RefreshCw size={16} />
            Retry now
          </button>
        ) : null}
      </section>
    </main>
  );
}
