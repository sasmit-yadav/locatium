import { getMapsApiOrigin } from '../config/api';
import { authFetch } from './auth';

async function parseJsonResponse(res, fallbackMessage) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || json.message || `${fallbackMessage} (${res.status})`);
  }
  return json;
}

export async function getAdminLayerStatus() {
  const res = await authFetch(`${getMapsApiOrigin()}/api/admin/layer-status`);
  return parseJsonResponse(res, 'Failed to load layer status');
}

export async function getAdminUserStatistics() {
  const res = await authFetch(`${getMapsApiOrigin()}/api/admin/user-statistics`);
  return parseJsonResponse(res, 'Failed to load user statistics');
}

export async function getAdminDataAnalytics() {
  const res = await authFetch(`${getMapsApiOrigin()}/api/admin/data-analytics`);
  return parseJsonResponse(res, 'Failed to load data analytics');
}

export async function getAdminAuditLogs({ limit = 50 } = {}) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  const res = await authFetch(`${getMapsApiOrigin()}/api/admin/audit-logs?${params.toString()}`);
  return parseJsonResponse(res, 'Failed to load audit logs');
}
