import { useQuery } from '@tanstack/react-query';
import { Download, FileText, Mail, RefreshCw } from 'lucide-react';
import { downloadInvestorReportById, emailInvestorReport, listInvestorReports } from '../services/investor';

function formatBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function recommendationTone(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('go') && !text.includes('no')) return 'text-ds-success';
  if (text.includes('no-go') || text.includes('caution')) return 'text-ds-warning';
  return 'text-ds-text-primary';
}

export function ReportsPanel() {
  const reportsQuery = useQuery({
    queryKey: ['investor-reports'],
    queryFn: () => listInvestorReports({ limit: 50 }),
    staleTime: 1000 * 30,
  });

  async function handleEmail(report) {
    const to = window.prompt('Send report to email address:');
    if (!to?.trim()) return;

    try {
      const result = await emailInvestorReport({ to: to.trim(), reportId: report.id });
      const modeNote =
        result.deliveryMode === 'outbox'
          ? "Email isn't set up on this server, so nothing was sent. The report is saved: download it from Reports."
          : 'Email sent successfully.';
      alert(`${modeNote}\nDelivered to ${result.to}`);
    } catch (err) {
      alert(`Could not email report: ${err.message}`);
    }
  }

  async function handleDownload(report) {
    try {
      const { blob, filename } = await downloadInvestorReportById(report.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename || report.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[ReportsPanel] Download failed:', err.message);
      alert(`Could not download report: ${err.message}`);
    }
  }

  const reports = reportsQuery.data || [];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ds-border-subtle p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-ds-title text-ds-text-primary">
            <FileText size={16} className="text-ds-accent" /> Generated reports
          </div>
          <button
            type="button"
            title="Refresh list"
            onClick={() => reportsQuery.refetch()}
            className="rounded-lg border border-ds-border-subtle p-1.5 text-ds-text-secondary transition hover:border-ds-accent hover:text-ds-text-primary"
          >
            <RefreshCw size={14} className={reportsQuery.isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="mt-1 text-xs text-ds-text-secondary">
          PDF investment briefs generated from zone analysis. Generate new reports from the Intelligence panel.
        </div>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-3">
        {reportsQuery.isLoading && <div className="text-xs text-ds-text-secondary">Loading reports...</div>}
        {reportsQuery.isError && (
          <div className="rounded-lg border border-ds-danger bg-ds-danger-subtle p-3 text-xs text-ds-danger">
            {reportsQuery.error.message}
          </div>
        )}

        {!reportsQuery.isLoading && reports.length === 0 && (
          <div className="rounded-xl border border-dashed border-ds-border-subtle bg-ds-surface-sunken p-6 text-center text-xs text-ds-text-secondary">
            No reports yet. Select a zone in the Intelligence panel and click &quot;Generate PDF Report&quot;.
          </div>
        )}

        <div className="space-y-2">
          {reports.map((report) => (
            <article
              key={report.id}
              className="rounded-lg border border-ds-border-subtle bg-ds-surface-sunken p-3 transition hover:border-ds-accent"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-ds-text-primary">{report.zone_name}</div>
                  <div className="mt-0.5 truncate text-[11px] text-ds-text-secondary">{report.zone_id}</div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    title="Email PDF"
                    onClick={() => handleEmail(report)}
                    className="rounded-lg border border-ds-border-subtle bg-ds-surface-sunken p-2 text-ds-text-secondary transition hover:border-ds-accent hover:text-ds-accent"
                  >
                    <Mail size={14} />
                  </button>
                  <button
                    type="button"
                    title="Download PDF"
                    onClick={() => handleDownload(report)}
                    className="rounded-lg border border-ds-accent bg-ds-accent/10 p-2 text-ds-accent transition hover:bg-ds-accent/20"
                  >
                    <Download size={14} />
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <div className="font-semibold uppercase tracking-wider text-ds-text-secondary">Score</div>
                  <div className="mt-0.5 font-bold text-ds-text-primary">{report.opportunity_score ?? '—'}</div>
                </div>
                <div>
                  <div className="font-semibold uppercase tracking-wider text-ds-text-secondary">Sector</div>
                  <div className="mt-0.5 font-bold capitalize text-ds-text-primary">{report.sector || '—'}</div>
                </div>
                <div className="col-span-2">
                  <div className="font-semibold uppercase tracking-wider text-ds-text-secondary">Recommendation</div>
                  <div className={`mt-0.5 text-xs font-semibold ${recommendationTone(report.recommendation)}`}>
                    {report.recommendation || '—'}
                  </div>
                </div>
                <div>
                  <div className="font-semibold uppercase tracking-wider text-ds-text-secondary">Generated</div>
                  <div className="mt-0.5 text-ds-text-primary">{formatDate(report.generated_at)}</div>
                </div>
                <div>
                  <div className="font-semibold uppercase tracking-wider text-ds-text-secondary">Size</div>
                  <div className="mt-0.5 text-ds-text-primary">{formatBytes(report.file_size_bytes)}</div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
