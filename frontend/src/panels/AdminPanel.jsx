import { useQuery } from '@tanstack/react-query';
import { Activity, Database, Layers3, RefreshCw, ShieldAlert, Users } from 'lucide-react';
import {
  getAdminAuditLogs,
  getAdminDataAnalytics,
  getAdminLayerStatus,
  getAdminUserStatistics,
} from '../services/admin';

function StatusPill({ ok, label }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
        ok ? 'bg-ds-success-subtle text-ds-success' : 'bg-ds-warning-subtle text-ds-warning'
      }`}
    >
      {label}
    </span>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="rounded-ds-md border border-ds-border-subtle bg-ds-surface-sunken p-ds-3">
      <div className="text-ds-caption uppercase tracking-wide text-ds-text-tertiary">{label}</div>
      <div className="mt-ds-1 text-ds-stat text-ds-text-primary">{value}</div>
    </div>
  );
}

export function AdminPanel() {
  const layerQuery = useQuery({
    queryKey: ['admin-layer-status'],
    queryFn: getAdminLayerStatus,
    staleTime: 1000 * 30,
  });

  const usersQuery = useQuery({
    queryKey: ['admin-user-stats'],
    queryFn: getAdminUserStatistics,
    staleTime: 1000 * 30,
  });

  const analyticsQuery = useQuery({
    queryKey: ['admin-data-analytics'],
    queryFn: getAdminDataAnalytics,
    staleTime: 1000 * 30,
  });

  const auditQuery = useQuery({
    queryKey: ['admin-audit-logs'],
    queryFn: () => getAdminAuditLogs({ limit: 30 }),
    staleTime: 1000 * 15,
  });

  function refreshAll() {
    layerQuery.refetch();
    usersQuery.refetch();
    analyticsQuery.refetch();
    auditQuery.refetch();
  }

  const layerStatus = layerQuery.data;
  const users = usersQuery.data;
  const analytics = analyticsQuery.data;
  const audits = auditQuery.data?.logs || [];
  const isRefreshing =
    layerQuery.isFetching || usersQuery.isFetching || analyticsQuery.isFetching || auditQuery.isFetching;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ds-border-subtle p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-ds-title text-ds-text-primary">
            <ShieldAlert size={16} className="text-ds-accent" /> Admin console
          </div>
          <button
            type="button"
            onClick={refreshAll}
            className="rounded-lg border border-ds-border-subtle p-1.5 text-ds-text-secondary transition hover:border-ds-accent hover:text-ds-text-primary"
            title="Refresh"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="mt-1 text-xs text-ds-text-secondary">System health, usage analytics, and audit trail.</div>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <section className="rounded-lg border border-ds-border-subtle bg-ds-surface-raised p-3">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-ds-text-secondary">
            <Activity size={14} className="text-ds-accent" /> System health
          </div>
          {layerQuery.isLoading ? <div className="text-xs text-ds-text-secondary">Loading status...</div> : null}
          {layerStatus ? (
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-ds-text-secondary">Database</span>
                <StatusPill ok={layerStatus.database?.ok} label={layerStatus.database?.ok ? 'OK' : 'Down'} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-ds-text-secondary">Redis cache</span>
                <StatusPill
                  ok={!layerStatus.redis?.configured || layerStatus.redis?.ok}
                  label={
                    !layerStatus.redis?.configured ? 'Off' : layerStatus.redis?.ok ? 'OK' : 'Error'
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-ds-text-secondary">HARSAC MapServer</span>
                <StatusPill
                  ok={layerStatus.mapServer?.configured}
                  label={layerStatus.mapServer?.configured ? layerStatus.mapServer.authMode : 'Not configured'}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-ds-text-secondary">Operational layers</span>
                <span className="font-semibold text-ds-text-primary">{layerStatus.layerCount}</span>
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border border-ds-border-subtle bg-ds-surface-raised p-3">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-ds-text-secondary">
            <Users size={14} className="text-ds-accent" /> Users
          </div>
          {usersQuery.isLoading ? <div className="text-xs text-ds-text-secondary">Loading users...</div> : null}
          {users ? (
            <>
              <div className="mb-3 grid grid-cols-2 gap-2">
                <MetricCard label="Total users" value={users.totalUsers} />
                <MetricCard
                  label="Roles"
                  value={users.byRole?.map((row) => `${row.role}: ${row.count}`).join(' · ') || '—'}
                />
              </div>
              <div className="space-y-2">
                {(users.recentUsers || []).map((user) => (
                  <div key={user.id} className="rounded-lg border border-ds-border-subtle bg-ds-surface-sunken px-3 py-2 text-xs">
                    <div className="font-semibold text-ds-text-primary">{user.email}</div>
                    <div className="mt-0.5 text-ds-text-secondary">
                      {user.role} · joined {new Date(user.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </section>

        <section className="rounded-lg border border-ds-border-subtle bg-ds-surface-raised p-3">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-ds-text-secondary">
            <Database size={14} className="text-ds-accent" /> Data analytics
          </div>
          {analyticsQuery.isLoading ? <div className="text-xs text-ds-text-secondary">Loading analytics...</div> : null}
          {analytics ? (
            <div className="grid grid-cols-2 gap-2">
              <MetricCard label="Features" value={analytics.featureCount} />
              <MetricCard label="Reports" value={analytics.reportCount} />
              <MetricCard label="Analyses" value={analytics.analysisCount} />
              <MetricCard label="Shared views" value={analytics.snapshotCount} />
              <MetricCard label="Audit logs (7d)" value={analytics.auditLogsLast7Days} />
              <MetricCard label="Audit logs (all)" value={analytics.auditLogCount} />
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border border-ds-border-subtle bg-ds-surface-raised p-3">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-ds-text-secondary">
            <Layers3 size={14} className="text-ds-accent" /> Recent audit trail
          </div>
          {auditQuery.isLoading ? <div className="text-xs text-ds-text-secondary">Loading audit logs...</div> : null}
          {audits.length === 0 && !auditQuery.isLoading ? (
            <div className="text-xs text-ds-text-secondary">No audit events recorded yet.</div>
          ) : null}
          <div className="space-y-2">
            {audits.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-ds-border-subtle bg-ds-surface-sunken px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-ds-accent">{entry.action}</span>
                  <span className="text-[10px] text-ds-text-secondary">{new Date(entry.created_at).toLocaleString()}</span>
                </div>
                <div className="mt-1 text-ds-text-secondary">
                  {entry.user_email || 'anonymous'}
                  {entry.resource_id ? ` · ${entry.resource_type || 'resource'}: ${entry.resource_id}` : ''}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
