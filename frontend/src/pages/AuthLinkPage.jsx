import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { resetPassword, verifyEmail } from '../services/auth';

/** Landing page for the links we email: /verify-email?token=… and /reset-password?token=… */
export function AuthLinkPage({ kind }) {
  const t = useT();
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [state, setState] = useState(kind === 'verify' ? 'working' : 'form');
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const started = useRef(false);

  useEffect(() => {
    // Remove the one-time token from the address bar (and browser history).
    window.history.replaceState(null, '', window.location.pathname);
    if (kind !== 'verify' || started.current) return;
    started.current = true;
    verifyEmail({ token })
      .then(() => {
        setState('done');
        setMessage(t('account.verifiedOk'));
      })
      .catch((err) => {
        setState('error');
        setMessage(err.message);
      });
  }, [kind, token, t]);

  async function handleReset(event) {
    event.preventDefault();
    if (password !== confirm) {
      setMessage(t('account.passwordsDiffer'));
      return;
    }
    setState('working');
    setMessage('');
    try {
      const res = await resetPassword({ token, password });
      setState('done');
      setMessage(res.message || t('account.resetOk'));
    } catch (err) {
      setState('form');
      setMessage(err.message);
    }
  }

  const inputClass =
    'mt-1 h-10 w-full rounded-lg border border-ds-border-subtle bg-ds-surface-sunken px-3 text-sm text-ds-text-primary outline-none focus:border-ds-accent';

  return (
    <div className="grid min-h-screen place-items-center bg-ds-surface-base p-5">
      <div className="w-full max-w-sm rounded-2xl border border-ds-border bg-ds-surface-raised p-6 shadow-ds-md">
        <h1 className="text-lg font-black text-ds-text-primary">
          {kind === 'verify' ? t('account.verifyTitle') : t('account.resetTitle')}
        </h1>

        {kind === 'reset' && state === 'form' ? (
          <form onSubmit={handleReset} className="mt-4 space-y-3">
            <label className="block text-xs font-semibold text-ds-text-secondary">
              {t('account.newPassword')}
              <input className={inputClass} type="password" required minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
              <span className="mt-1 block text-[11px] font-normal text-ds-text-tertiary">{t('account.passwordHint')}</span>
            </label>
            <label className="block text-xs font-semibold text-ds-text-secondary">
              {t('account.confirmPassword')}
              <input className={inputClass} type="password" required minLength={12} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </label>
            <button type="submit" className="h-10 w-full rounded-lg bg-ds-accent text-sm font-bold text-ds-text-primary hover:bg-ds-accent-hover">
              {t('account.resetButton')}
            </button>
          </form>
        ) : null}

        {state === 'working' ? <p className="mt-4 text-sm text-ds-text-secondary">{t('account.wait')}</p> : null}
        {message ? (
          <p className={`mt-4 text-sm ${state === 'error' || state === 'form' ? 'text-red-300' : 'text-ds-success'}`}>{message}</p>
        ) : null}

        {state === 'done' || state === 'error' ? (
          <a href="/" className="mt-5 block h-10 w-full rounded-lg bg-ds-accent text-center text-sm font-bold leading-10 text-ds-text-primary hover:bg-ds-accent-hover">
            {t('account.backToApp')}
          </a>
        ) : null}
      </div>
    </div>
  );
}
