import { useQuery } from '@tanstack/react-query';
import { Activity, BrainCircuit, Database, Layers3, RefreshCw, ShieldAlert, Users } from 'lucide-react';
import {
  getAdminAuditLogs,
  getAdminDataAnalytics,
  getAdminLayerStatus,
  getAdminModelHealth,
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

/**
 * Health verdicts carry three levels, not two, so a stale-but-working system reads
 * differently from an outage. StatusPill's ok/not-ok is too blunt for that.
 */
const LEVEL_STYLES = {
  ok: 'bg-ds-success-subtle text-ds-success',
  warn: 'bg-ds-warning-subtle text-ds-warning',
  critical: 'bg-ds-danger-subtle text-ds-danger',
};

function LevelPill({ level, label }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
        LEVEL_STYLES[level] || LEVEL_STYLES.warn
      }`}
    >
      {label || level}
    </span>
  );
}

function HealthRow({ label, value, level }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ds-text-secondary">{label}</span>
      {level ? <LevelPill level={level} label={value} /> : (
        <span className="font-semibold text-ds-text-primary">{value}</span>
      )}
    </div>
  );
}

/** `null` reads as "not measured yet", which is a different thing from zero. */
function fmt(value, suffix = '') {
  if (value == null) return '—';
  return `${value}${suffix}`;
}

function fallbackLevel(pct) {
  if (pct == null) return 'ok';
  if (pct >= 50) return 'critical';
  return pct >= 10 ? 'warn' : 'ok';
}

const SOURCE_LEVEL = { ok: 'ok', stale: 'warn', empty: 'warn', error: 'critical' };

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

  // Polls, unlike the other panels: this is what an operator watches during an incident,
  // and a minute-old fallback rate is not much use then.
  const modelQuery = useQuery({
    queryKey: ['admin-model-health'],
    queryFn: getAdminModelHealth,
    staleTime: 1000 * 10,
    refetchInterval: 1000 * 30,
  });

  function refreshAll() {
    layerQuery.refetch();
    usersQuery.refetch();
    analyticsQuery.refetch();
    auditQuery.refetch();
    modelQuery.refetch();
  }

  const layerStatus = layerQuery.data;
  const users = usersQuery.data;
  const analytics = analyticsQuery.data;
  const audits = auditQuery.data?.logs || [];
  const health = modelQuery.data;
  const isRefreshing =
    layerQuery.isFetching ||
    usersQuery.isFetching ||
    analyticsQuery.isFetching ||
    auditQuery.isFetching ||
    modelQuery.isFetching;

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
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-ds-text-secondary">
              <BrainCircuit size={14} className="text-ds-accent" /> Model health
            </div>
            {health ? <LevelPill level={health.overall.level} /> : null}
          </div>

          {modelQuery.isLoading ? (
            <div className="text-xs text-ds-text-secondary">Probing models...</div>
          ) : null}
          {modelQuery.error ? (
            <div className="text-xs text-ds-danger">{modelQuery.error.message}</div>
          ) : null}

          {health ? (
            <div className="space-y-3 text-xs">
              {health.overall.issues.length ? (
                <ul className="space-y-1">
                  {health.overall.issues.map((issue) => (
                    <li
                      key={issue.message}
                      className={`rounded-md px-2 py-1 ${
                        issue.level === 'critical'
                          ? 'bg-ds-danger-subtle text-ds-danger'
                          : 'bg-ds-warning-subtle text-ds-warning'
                      }`}
                    >
                      {issue.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-md bg-ds-success-subtle px-2 py-1 text-ds-success">
                  Models, data and copilot all reporting healthy.
                </div>
              )}

              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-ds-text-tertiary">
                  ML service
                </div>
                <HealthRow
                  label="Status"
                  value={health.ml.status}
                  level={health.ml.reachable ? 'ok' : 'critical'}
                />
                <HealthRow label="Probe latency" value={fmt(health.ml.latencyMs, ' ms')} />
                <HealthRow label="Model" value={fmt(health.ml.model)} />
                <HealthRow label="Training data" value={fmt(health.ml.database)} />
              </div>

              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-ds-text-tertiary">
                  Scoring ({health.scoringVersion})
                </div>
                <HealthRow label="Scores this run" value={health.scoring.total} />
                <HealthRow label="Used the ML model" value={fmt(health.scoring.byMethod?.ml ?? 0)} />
                <HealthRow
                  label="Fell back to heuristic"
                  value={`${health.scoring.fallbacks} (${health.scoring.fallbackRatePct}%)`}
                  level={fallbackLevel(health.scoring.fallbackRatePct)}
                />
                <HealthRow
                  label={`Recent success (last ${health.scoring.recentWindow})`}
                  value={fmt(health.scoring.recentSuccessRatePct, '%')}
                />
                <HealthRow
                  label="Latency p50 / p90"
                  value={`${fmt(health.scoring.latencyMs.p50)} / ${fmt(health.scoring.latencyMs.p90)} ms`}
                />
                {Object.keys(health.scoring.fallbackReasons || {}).length ? (
                  <div className="text-[11px] text-ds-text-tertiary">
                    Fallback reasons:{' '}
                    {Object.entries(health.scoring.fallbackReasons)
                      .map(([reason, count]) => `${reason} x${count}`)
                      .join(', ')}
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-ds-text-tertiary">
                  Copilot LLM
                </div>
                <HealthRow
                  label="Configured"
                  value={health.llm.enabled ? health.llm.model || 'on' : 'off'}
                  level={health.llm.enabled ? 'ok' : 'warn'}
                />
                <HealthRow label="Answers" value={`${health.llm.ok} ok / ${health.llm.failed} failed`} />
                <HealthRow
                  label="Rule-based fallback"
                  value={fmt(health.llm.fallbackRatePct, '%')}
                  level={fallbackLevel(health.llm.fallbackRatePct)}
                />
                <HealthRow label="Model fallbacks" value={health.llm.modelFallbacks} />
                <HealthRow label="Tokens used" value={fmt(health.llm.tokens?.total)} />
                {health.llm.lastError ? (
                  <div className="truncate text-[11px] text-ds-danger" title={String(health.llm.lastError)}>
                    Last error: {String(health.llm.lastError)}
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-ds-text-tertiary">
                  Data freshness
                </div>
                {health.data.sources.map((source) => (
                  <HealthRow
                    key={source.key}
                    label={source.label}
                    value={
                      source.ageDays != null
                        ? `${source.count} rows · ${source.ageDays}d old`
                        : `${source.count} rows`
                    }
                    level={SOURCE_LEVEL[source.status] || 'warn'}
                  />
                ))}
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
