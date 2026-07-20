import { useQuery } from '@tanstack/react-query';
import { CircleUser, Mail, ShieldCheck, CalendarClock } from 'lucide-react';
import { getProfile } from '../services/auth';
import { getWorkspaceStats } from '../services/portal';

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
  const profileQuery = useQuery({
    queryKey: ['auth-profile'],
    queryFn: getProfile,
    staleTime: 1000 * 60 * 10,
  });

  const statsQuery = useQuery({
    queryKey: ['portal-stats'],
    queryFn: getWorkspaceStats,
  });

  const profile = profileQuery.data;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ds-border-subtle p-4">
        <div className="flex items-center gap-2 text-ds-title text-ds-text-primary">
          <CircleUser size={16} className="text-ds-accent" /> Workspace &amp; profile
        </div>
        <div className="mt-1 text-xs text-ds-text-secondary">Your account details and activity summary.</div>
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
      </div>
    </div>
  );
}
