import { useState } from 'react';
import { KeyRound, LogOut, MailCheck, MailWarning, Trash2, UserPlus } from 'lucide-react';
import {
  changePassword,
  deleteAccount,
  logout,
  openAccountDialog,
  resendVerification,
} from '../../services/auth';

const inputClass =
  'mt-1 h-9 w-full rounded-md border border-ds-border-subtle bg-ds-surface-raised px-2 text-sm text-ds-text-primary outline-none focus:border-ds-accent';
const smallButton =
  'rounded-md px-3 py-1.5 text-[11px] font-bold disabled:cursor-not-allowed disabled:opacity-60';

/** Account actions in Settings: sign up/in (guests), verify email, change password, sign out, delete. */
export function AccountSecurity({ profile }) {
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [pw, setPw] = useState({ current: '', next: '' });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');

  if (!profile) return null;

  async function run(key, fn) {
    setBusy(key);
    setMsg('');
    setErr('');
    try {
      await fn();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  }

  if (profile.is_demo) {
    return (
      <section className="rounded-lg border border-ds-accent/40 bg-ds-accent-subtle p-3">
        <div className="flex items-center gap-2 text-sm font-bold text-ds-text-primary">
          <UserPlus size={15} className="text-ds-accent" /> You are using LOCATIUM as a guest
        </div>
        <p className="mt-1 text-xs leading-relaxed text-ds-text-secondary">
          Guest data is deleted after a few days. Create a free account to keep your saved plots, reports and alerts and
          to get reports by email — everything you saved so far is kept.
        </p>
        <div className="mt-3 flex gap-2">
          <button type="button" className={`${smallButton} bg-ds-accent text-white`} onClick={() => openAccountDialog('signup')}>
            Create free account
          </button>
          <button
            type="button"
            className={`${smallButton} border border-ds-border text-ds-text-primary`}
            onClick={() => openAccountDialog('signin')}
          >
            Sign in
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-ds-border-subtle bg-ds-surface-raised p-3">
      <div className="text-xs font-bold uppercase tracking-[0.17em] text-ds-text-secondary">Account &amp; security</div>

      {profile.email_verified ? (
        <div className="flex items-center gap-2 text-xs text-ds-success">
          <MailCheck size={14} /> Email confirmed
        </div>
      ) : (
        <div className="rounded-md border border-ds-warning/40 bg-ds-surface-sunken p-2 text-xs text-ds-text-secondary">
          <div className="flex items-center gap-2 font-semibold text-ds-warning">
            <MailWarning size={14} /> Please confirm your email
          </div>
          <p className="mt-1">We sent a link to {profile.email}. Emailed reports and alerts start working once it is confirmed.</p>
          <button
            type="button"
            disabled={busy === 'resend'}
            className={`${smallButton} mt-2 border border-ds-border text-ds-text-primary`}
            onClick={() =>
              run('resend', async () => {
                const r = await resendVerification();
                setMsg(r.alreadyVerified ? 'Already confirmed.' : r.throttled ? 'A link was just sent — check your inbox (and spam).' : 'New link sent. Check your inbox (and spam).');
              })
            }
          >
            Send the link again
          </button>
        </div>
      )}

      <form
        className="rounded-md bg-ds-surface-sunken p-2"
        onSubmit={(e) => {
          e.preventDefault();
          run('pw', async () => {
            await changePassword({ currentPassword: pw.current, newPassword: pw.next });
            setPw({ current: '', next: '' });
            setMsg('Password changed. Other devices have been signed out.');
          });
        }}
      >
        <div className="flex items-center gap-2 text-[11px] font-semibold text-ds-text-primary">
          <KeyRound size={13} className="text-ds-accent" /> Change password
        </div>
        <label className="mt-2 block text-[10px] font-semibold uppercase tracking-wider text-ds-text-secondary">
          Current password
          <input className={inputClass} type="password" required value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} autoComplete="current-password" />
        </label>
        <label className="mt-2 block text-[10px] font-semibold uppercase tracking-wider text-ds-text-secondary">
          New password (12+ characters)
          <input className={inputClass} type="password" required minLength={12} value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} autoComplete="new-password" />
        </label>
        <button type="submit" disabled={busy === 'pw'} className={`${smallButton} mt-2 bg-ds-accent text-white`}>
          {busy === 'pw' ? 'Saving…' : 'Change password'}
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`${smallButton} flex items-center gap-1 border border-ds-border text-ds-text-primary`}
          onClick={() =>
            run('logout', async () => {
              await logout();
              window.location.reload();
            })
          }
        >
          <LogOut size={12} /> Sign out
        </button>
        {profile.role !== 'admin' ? (
          <button
            type="button"
            className={`${smallButton} flex items-center gap-1 border border-ds-danger text-ds-danger`}
            onClick={() => setDeleteOpen((v) => !v)}
          >
            <Trash2 size={12} /> Delete account
          </button>
        ) : null}
      </div>

      {deleteOpen ? (
        <form
          className="rounded-md border border-ds-danger bg-ds-danger-subtle p-2 text-xs text-ds-text-primary"
          onSubmit={(e) => {
            e.preventDefault();
            run('delete', async () => {
              await deleteAccount({ password: deletePassword });
              window.location.assign('/');
            });
          }}
        >
          <p className="font-semibold">This permanently deletes your account and everything you saved. It cannot be undone.</p>
          <label className="mt-2 block text-[10px] font-semibold uppercase tracking-wider">
            Type your password to confirm
            <input className={inputClass} type="password" required value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} autoComplete="current-password" />
          </label>
          <button type="submit" disabled={busy === 'delete'} className={`${smallButton} mt-2 bg-ds-danger text-white`}>
            {busy === 'delete' ? 'Deleting…' : 'Delete my account forever'}
          </button>
        </form>
      ) : null}

      {msg ? <p className="text-xs text-ds-success">{msg}</p> : null}
      {err ? <p className="text-xs text-ds-danger">{err}</p> : null}
      <p className="text-[11px] text-ds-text-tertiary">
        <a href="/terms" target="_blank" rel="noreferrer" className="hover:underline">Terms of Use</a> ·{' '}
        <a href="/privacy" target="_blank" rel="noreferrer" className="hover:underline">Privacy Policy</a>
      </p>
    </section>
  );
}
