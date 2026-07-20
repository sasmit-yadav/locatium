import { getMapsApiOrigin } from '../config/api';
import { authFetch } from './auth';

async function parseJsonResponse(res, fallbackMessage) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || json.message || `${fallbackMessage} (${res.status})`);
  }
  return json;
}

export async function getInvestorOpportunities({ sector = 'industrial', budget = '', risk = 'medium', zoneType = '', district = '', limit = 6 } = {}) {
  const params = new URLSearchParams();
  params.set('sector', sector);
  params.set('risk', risk);
  params.set('limit', String(limit));
  if (budget) params.set('budget', budget);
  if (zoneType) params.set('zoneType', zoneType);
  if (district) params.set('district', district);

  const res = await fetch(`${getMapsApiOrigin()}/api/investor/opportunities?${params.toString()}`);
  return parseJsonResponse(res, 'Investor opportunities failed');
}

export async function getInvestorZoneAnalysis({ zoneId, sector = 'industrial', includeGeometry = false }) {
  const params = new URLSearchParams();
  params.set('sector', sector);
  params.set('includeGeometry', includeGeometry ? 'true' : 'false');

  const res = await fetch(`${getMapsApiOrigin()}/api/investor/zone-analysis/${encodeURIComponent(zoneId)}?${params.toString()}`);
  return parseJsonResponse(res, 'Investor zone analysis failed');
}

export async function compareInvestorZones({ zones, sector = 'industrial' }) {
  const params = new URLSearchParams();
  params.set('zones', zones.join(','));
  params.set('sector', sector);

  const res = await fetch(`${getMapsApiOrigin()}/api/investor/compare-zones?${params.toString()}`);
  return parseJsonResponse(res, 'Investor zone comparison failed');
}

export async function downloadInvestorReport({ zoneId, sector = 'industrial', includeGeometry = false }) {
  const params = new URLSearchParams();
  params.set('zoneId', zoneId);
  params.set('sector', sector);
  params.set('includeGeometry', includeGeometry ? 'true' : 'false');

  const res = await fetch(`${getMapsApiOrigin()}/api/investor/generate-report?${params.toString()}`, {
    method: 'POST',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Investor report failed (${res.status})`);
  }

  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return {
    blob,
    filename: match?.[1] || `locatium-report-${zoneId}.pdf`,
  };
}

export async function listInvestorReports({ limit = 20 } = {}) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));

  const res = await fetch(`${getMapsApiOrigin()}/api/investor/reports?${params.toString()}`);
  const data = await parseJsonResponse(res, 'Failed to list investor reports');
  return data.reports || [];
}

export async function downloadInvestorReportById(reportId) {
  const res = await fetch(`${getMapsApiOrigin()}/api/investor/reports/${encodeURIComponent(reportId)}/download`);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Report download failed (${res.status})`);
  }

  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return {
    blob,
    filename: match?.[1] || `locatium-report-${reportId}.pdf`,
  };
}

export async function emailInvestorReport({ to, zoneId, reportId, sector = 'industrial', message }) {
  const res = await authFetch(`${getMapsApiOrigin()}/api/investor/email-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, zoneId, reportId, sector, message }),
  });
  return parseJsonResponse(res, 'Failed to email report');
}
