import { getMapsApiOrigin } from '../config/api';
import { authFetch } from './auth';

async function parseJsonResponse(res, fallbackMessage) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || json.message || `${fallbackMessage} (${res.status})`);
  }
  return json;
}

export async function getInvestorDistricts() {
  const res = await fetch(`${getMapsApiOrigin()}/api/investor/districts`);
  const data = await parseJsonResponse(res, 'Investor districts failed');
  return data.districts || [];
}

export async function getInvestorOpportunities({
  sector = 'industrial',
  budget = '',
  risk = 'medium',
  zoneType = '',
  district = '',
  landData = '',
  sourceLayer = '',
  utilityMin = '',
  availability = '',
  minScore = '',
  maxRatePerSqYard = '',
  maxLandCr = '',
  limit = 6,
  nearLat = null,
  nearLng = null,
  nearRadiusKm = 25,
  nearMe = false,
} = {}) {
  const params = new URLSearchParams();
  params.set('sector', sector);
  params.set('risk', risk);
  params.set('limit', String(limit));
  if (budget) params.set('budget', budget);
  if (zoneType) params.set('zoneType', zoneType);
  if (district) params.set('district', district);
  if (landData) params.set('landData', landData);
  if (sourceLayer) params.set('sourceLayer', sourceLayer);
  if (utilityMin) params.set('utilityMin', utilityMin);
  if (availability) params.set('availability', availability);
  if (minScore) params.set('minScore', String(minScore));
  if (maxRatePerSqYard) params.set('maxRatePerSqYard', String(maxRatePerSqYard));
  if (maxLandCr) params.set('maxLandCr', String(maxLandCr));
  if (nearMe && nearLat != null && nearLng != null) {
    params.set('nearLat', String(nearLat));
    params.set('nearLng', String(nearLng));
    params.set('nearRadiusKm', String(nearRadiusKm || 25));
  }

  const res = await authFetch(`${getMapsApiOrigin()}/api/investor/opportunities?${params.toString()}`);
  return parseJsonResponse(res, 'Investor opportunities failed');
}

export async function getInvestorZoneAnalysis({ zoneId, sector = 'industrial', includeGeometry = false }) {
  const params = new URLSearchParams();
  params.set('sector', sector);
  params.set('includeGeometry', includeGeometry ? 'true' : 'false');

  const res = await authFetch(`${getMapsApiOrigin()}/api/investor/zone-analysis/${encodeURIComponent(zoneId)}?${params.toString()}`);
  return parseJsonResponse(res, 'Investor zone analysis failed');
}

export async function compareInvestorZones({ zones, sector = 'industrial' }) {
  const params = new URLSearchParams();
  params.set('zones', zones.join(','));
  params.set('sector', sector);

  const res = await authFetch(`${getMapsApiOrigin()}/api/investor/compare-zones?${params.toString()}`);
  return parseJsonResponse(res, 'Investor zone comparison failed');
}

export async function downloadInvestorReport({ zoneId, sector = 'industrial', includeGeometry = false }) {
  const params = new URLSearchParams();
  params.set('zoneId', zoneId);
  params.set('sector', sector);
  params.set('includeGeometry', includeGeometry ? 'true' : 'false');

  const res = await authFetch(`${getMapsApiOrigin()}/api/investor/generate-report?${params.toString()}`, {
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

  const res = await authFetch(`${getMapsApiOrigin()}/api/investor/reports?${params.toString()}`);
  const data = await parseJsonResponse(res, 'Failed to list investor reports');
  return data.reports || [];
}

export async function downloadInvestorReportById(reportId) {
  const res = await authFetch(`${getMapsApiOrigin()}/api/investor/reports/${encodeURIComponent(reportId)}/download`);

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

export async function getPlotInventory(zoneId, sector = 'industrial') {
  const params = new URLSearchParams({ sector });
  const res = await authFetch(`${getMapsApiOrigin()}/api/investor/plots/${encodeURIComponent(zoneId)}?${params}`);
  return parseJsonResponse(res, 'Failed to load plot inventory');
}

export async function downloadPortfolioReport({ zoneIds, sector = 'industrial', portfolioName = 'Portfolio' }) {
  const res = await authFetch(`${getMapsApiOrigin()}/api/investor/portfolio-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zoneIds, sector, portfolioName }),
  });
  if (!res.ok) throw new Error(`Portfolio PDF failed (${res.status})`);
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return { blob, filename: match?.[1] || 'portfolio-report.pdf' };
}
