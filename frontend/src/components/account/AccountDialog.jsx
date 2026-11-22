import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { useT } from '../../i18n';
import { forgotPassword, getAuthConfig, login, register } from '../../services/auth';

const inputClass =
  'mt-1 h-10 w-full rounded-lg border border-ds-border-subtle bg-ds-surface-sunken px-3 text-sm text-ds-text-primary outline-none focus:border-ds-accent';
const primaryButton =
  'h-10 w-full rounded-lg bg-ds-accent text-sm font-bold text-ds-text-primary transition hover:bg-ds-accent-hover disabled:cursor-not-allowed disabled:opacity-60';
const linkButton = 'text-xs font-semibold text-ds-accent-text underline-offset-2 hover:underline';

/**
 * Sign in / create account / forgot password. Opened with openAccountDialog(mode) from
 * anywhere (it listens for the `locatium:open-account` window event).
 */
export function AccountDialog() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [registrationOpen, setRegistrationOpen] = useState(true);

  useEffect(() => {
    function onOpen(event) {
      setMode(event.detail?.mode || 'signin');
      setError('');
      setNotice('');
      setPassword('');
      setOpen(true);
    }
    window.addEventListener('locatium:open-account', onOpen);
    return () => window.removeEventListener('locatium:open-account', onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    getAuthConfig()
      .then((cfg) => setRegistrationOpen(cfg.registrationOpen !== false))
      .catch(() => {});
  }, [open]);

  function switchMode(next) {
    setMode(next);
    setError('');
    setNotice('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      if (mode === 'signin') {
        await login({ email, password });
        // Reload so every panel refetches with the signed-in account's data.
        window.location.reload();
        return;
      }
      if (mode === 'signup') {
        if (!acceptTerms) {
          setError(t('account.mustAccept'));
          return;
        }
        await register({ email, password, displayName: displayName.trim() || undefined, acceptTerms: true });
        window.location.reload();
        return;
      }
      const res = await forgotPassword({ email });
      setNotice(res.message || t('account.resetSent'));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const title =
    mode === 'signup' ? t('account.signupTitle') : mode === 'forgot' ? t('account.forgotTitle') : t('account.signinTitle');

  return (
    <Modal title={title} onClose={() => setOpen(false)} size="sm">
      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === 'signup' ? (
          <p className="text-xs leading-relaxed text-ds-text-secondary">{t('account.signupBlurb')}</p>
        ) : null}
        {mode === 'forgot' ? (
          <p className="text-xs leading-relaxed text-ds-text-secondary">{t('account.forgotBlurb')}</p>
        ) : null}

        {mode === 'signup' ? (
          <label className="block text-xs font-semibold text-ds-text-secondary">
            {t('account.name')}
            <input
              className={inputClass}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
              maxLength={80}
            />
          </label>
        ) : null}

        <label className="block text-xs font-semibold text-ds-text-secondary">
          {t('account.email')}
          <input
            className={inputClass}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>

        {mode !== 'forgot' ? (
          <label className="block text-xs font-semibold text-ds-text-secondary">
            {t('account.password')}
            <input
              className={inputClass}
              type="password"
              required
              minLength={mode === 'signup' ? 12 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
            {mode === 'signup' ? (
              <span className="mt-1 block text-[11px] font-normal text-ds-text-tertiary">{t('account.passwordHint')}</span>
            ) : null}
          </label>
        ) : null}

        {mode === 'signup' ? (
          <label className="flex items-start gap-2 text-xs leading-relaxed text-ds-text-secondary">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
            />
            <span>
              {t('account.acceptPrefix')}{' '}
              <a href="/terms" target="_blank" rel="noreferrer" className={linkButton}>
                {t('legal.terms')}
              </a>{' '}
              {t('account.and')}{' '}
              <a href="/privacy" target="_blank" rel="noreferrer" className={linkButton}>
                {t('legal.privacy')}
              </a>
            </span>
          </label>
        ) : null}

        {error ? <div className="rounded-lg border border-red-400/40 bg-red-500/10 p-2 text-xs text-red-300">{error}</div> : null}
        {notice ? <div className="rounded-lg border border-ds-border-subtle bg-ds-surface-sunken p-2 text-xs text-ds-success">{notice}</div> : null}

        <button type="submit" className={primaryButton} disabled={busy || (mode === 'signup' && !registrationOpen)}>
          {busy
            ? t('account.wait')
            : mode === 'signup'
              ? t('account.signupButton')
              : mode === 'forgot'
                ? t('account.forgotButton')
                : t('account.signinButton')}
        </button>

        {mode === 'signup' && !registrationOpen ? (
          <p className="text-xs text-ds-warning">{t('account.signupClosed')}</p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {mode === 'signin' ? (
            <>
              <button type="button" className={linkButton} onClick={() => switchMode('forgot')}>
                {t('account.forgotLink')}
              </button>
              <button type="button" className={linkButton} onClick={() => switchMode('signup')}>
                {t('account.toSignup')}
              </button>
            </>
          ) : (
            <button type="button" className={linkButton} onClick={() => switchMode('signin')}>
              {t('account.toSignin')}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
