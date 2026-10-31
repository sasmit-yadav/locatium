import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleUser, Mail, ShieldCheck, CalendarClock, Database } from 'lucide-react';
import { getProfile, updateProfile } from '../services/auth';
import { getTransparencyStats, getWorkspaceStats } from '../services/portal';

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-ds-border-subtle bg-ds-surface-sunken p-3">
      <Icon size={16} className="text-ds-accent" />
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ds-text-secondary">{label}</div>
        <div className="truncate text-sm font-bold text-ds-text-primary">{value}</div>
      </div>
    </div>
  );
}

export function UserSettingsPanel() {
  const queryClient = useQueryClient();
  const [draftName, setDraftName] = useState(null);
  const [formError, setFormError] = useState('');

  const profileQuery = useQuery({
    queryKey: ['auth-profile'],
    queryFn: getProfile,
    staleTime: 1000 * 60 * 10,
  });

  const statsQuery = useQuery({
    queryKey: ['portal-stats'],
    queryFn: getWorkspaceStats,
  });

  const transparencyQuery = useQuery({
    queryKey: ['public-transparency'],
    queryFn: getTransparencyStats,
    staleTime: 1000 * 60,
  });

  const displayName = draftName ?? profileQuery.data?.display_name ?? '';

  const saveName = useMutation({
    mutationFn: () => updateProfile({ displayName }),
    onSuccess: () => {
      setFormError('');
      setDraftName(null);
      queryClient.invalidateQueries({ queryKey: ['auth-profile'] });
    },
    onError: (err) => setFormError(err.message),
  });

  const profile = profileQuery.data;
  const coverage = transparencyQuery.data?.coverage;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ds-border-subtle p-4">
        <div className="flex items-center gap-2 text-ds-title text-ds-text-primary">
          <CircleUser size={16} className="text-ds-accent" /> Workspace &amp; profile
        </div>
        <div className="mt-1 text-xs text-ds-text-secondary">Your account details, activity, and public data coverage.</div>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <section className="space-y-2">
          {profileQuery.isLoading && <div className="text-xs text-ds-text-secondary">Loading profile...</div>}
          {profileQuery.isError && (
            <div className="rounded-lg border border-ds-danger bg-ds-danger-subtle p-3 text-xs text-ds-danger">
              {profileQuery.error.message}
            </div>
          )}
          {profile ? (
            <>
              <InfoRow icon={Mail} label="Email" value={profile.email} />
              <InfoRow icon={ShieldCheck} label="Role" value={profile.role} />
              <InfoRow
                icon={CalendarClock}
                label="Member since"
                value={profile.created_at ? new Date(profile.created_at).toLocaleDateString() : 'N/A'}
              />
              <form
                className="rounded-lg border border-ds-border-subtle bg-ds-surface-sunken p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveName.mutate();
                }}
              >
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-ds-text-secondary">
                  Display name
                  <input
                    value={displayName}
                    onChange={(event) => setDraftName(event.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-ds-border-subtle bg-ds-surface-raised px-2 text-sm font-semibold text-ds-text-primary outline-none focus:border-ds-accent"
                    maxLength={80}
                    placeholder="How should LOCATIUM address you?"
                  />
                </label>
                {formError ? <p className="mt-2 text-[11px] text-ds-danger">{formError}</p> : null}
                <button
                  type="submit"
                  disabled={saveName.isPending}
                  className="mt-2 rounded-md bg-ds-accent px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                >
                  {saveName.isPending ? 'Saving…' : 'Save name'}
                </button>
              </form>
            </>
          ) : null}
        </section>

        <section className="rounded-lg border border-ds-border-subtle bg-ds-surface-raised p-3">
          <div className="text-xs font-bold uppercase tracking-[0.17em] text-ds-text-secondary">Activity</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-ds-surface-sunken p-3">
              <div className="text-lg font-bold text-ds-text-primary">{statsQuery.data?.analyses ?? 0}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ds-text-secondary">Zones analyzed</div>
            </div>
            <div className="rounded-lg bg-ds-surface-sunken p-3">
              <div className="text-lg font-bold text-ds-text-primary">{statsQuery.data?.reportsGenerated ?? 0}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ds-text-secondary">Reports generated</div>
            </div>
            <div className="rounded-lg bg-ds-surface-sunken p-3">
              <div className="text-lg font-bold text-ds-text-primary">{statsQuery.data?.favorites ?? 0}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ds-text-secondary">Bookmarked</div>
            </div>
            <div className="rounded-lg bg-ds-surface-sunken p-3">
              <div className="text-lg font-bold text-ds-text-primary">
                {statsQuery.data ? `${statsQuery.data.savedSearches}/${statsQuery.data.savedSearchLimit}` : '0/5'}
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ds-text-secondary">Saved views</div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-ds-border-subtle bg-ds-surface-raised p-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.17em] text-ds-text-secondary">
            <Database size={14} className="text-ds-accent" /> Data transparency
          </div>
          <p className="mt-2 text-[11px] leading-5 text-ds-text-tertiary">
            Scoring {transparencyQuery.data?.scoringVersion || '—'} · ranking {transparencyQuery.data?.opportunityVersion || '—'}
          </p>
          {coverage?.available ? (
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-ds-surface-sunken p-2">Districts {coverage.districts ?? '—'}</div>
              <div className="rounded-lg bg-ds-surface-sunken p-2">Estates {coverage.industrialEstates ?? '—'}</div>
              <div className="rounded-lg bg-ds-surface-sunken p-2">Hospitals {coverage.hospitals ?? '—'}</div>
              <div className="rounded-lg bg-ds-surface-sunken p-2">Schools {coverage.schools ?? '—'}</div>
              <div className="rounded-lg bg-ds-surface-sunken p-2">Circle rates {coverage.collectorRateRows ?? '—'}</div>
              <div className="rounded-lg bg-ds-surface-sunken p-2">Market deals {coverage.marketTransactions ?? '—'}</div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-ds-text-secondary">Coverage stats unavailable until PostGIS is ready.</p>
          )}
          <p className="mt-2 text-[11px] leading-5 text-ds-text-tertiary">
            Land prices are current collector-rate + comps bands. The copilot falls back when the LLM is unavailable
            ({transparencyQuery.data?.assistant?.fallbackRatePct ?? 0}% fallback this session).
          </p>
        </section>
      </div>
    </div>
  );
}
