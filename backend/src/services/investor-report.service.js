const fs = require('fs/promises');
const path = require('path');
const PDFDocument = require('pdfkit');
const { AppError } = require('../middleware/error.middleware');
const { getPool } = require('../db/pool');
const investorOpportunities = require('./investor-opportunities.service');
const emailService = require('./email.service');

const REPORTS_DIR = path.join(__dirname, '..', '..', 'reports');
let investorReportsTableReady = false;

function safeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatNumber(value, fractionDigits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'N/A';
  return Number(value).toLocaleString('en-IN', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  });
}

function formatAcres(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'N/A';
  const acres = Number(value);
  return `${acres.toFixed(acres >= 10 ? 1 : 2)} ac`;
}

function formatDistanceKm(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'N/A';
  return `${Number(value).toFixed(2)} km`;
}

function slugifyFilename(value) {
  return safeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'zone';
}

function narrativeText(analysis) {
  const n = analysis.analysis?.narrative || {};
  return (
    n.memo ||
    n.summary ||
    n.executiveSummary ||
    analysis.analysis?.insights?.summary ||
    null
  );
}

async function persistReport(buffer, filename) {
  const storageMode =
    process.env.REPORT_STORAGE ||
    (process.env.NODE_ENV === 'production' ? 'database' : 'filesystem');
  if (storageMode === 'database') {
    return { storageName: filename, storagePath: 'database' };
  }

  await fs.mkdir(REPORTS_DIR, { recursive: true });
  const storageName = `${Date.now()}-${filename}`;
  const storagePath = path.join(REPORTS_DIR, storageName);
  await fs.writeFile(storagePath, buffer);
  return { storageName, storagePath };
}

function ensurePool() {
  return getPool();
}

async function ensureInvestorReportsTable() {
  if (investorReportsTableReady) return;

  const pool = ensurePool();
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS investor_reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users (id) ON DELETE CASCADE,
      zone_id TEXT NOT NULL,
      zone_name TEXT NOT NULL,
      sector TEXT NOT NULL DEFAULT 'industrial',
      recommendation TEXT NOT NULL,
      opportunity_score INTEGER NOT NULL,
      filename TEXT NOT NULL,
      storage_name TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      content BYTEA,
      file_size_bytes INTEGER NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_investor_reports_zone ON investor_reports (zone_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_investor_reports_generated ON investor_reports (generated_at DESC)');
  await pool.query('ALTER TABLE investor_reports ADD COLUMN IF NOT EXISTS content BYTEA');
  await pool.query(
    'ALTER TABLE investor_reports ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users (id) ON DELETE CASCADE'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_investor_reports_user ON investor_reports (user_id, generated_at DESC)'
  );

  investorReportsTableReady = true;
}

async function saveReportMetadata(record) {
  const pool = ensurePool();
  if (!pool) return null;

  try {
    await ensureInvestorReportsTable();
  } catch (error) {
    if (error?.code !== '42P01') {
      throw error;
    }
  }

  const insertRecord = async () => {
    const { rows } = await pool.query(
      `
        INSERT INTO investor_reports (
          user_id,
          zone_id,
          zone_name,
          sector,
          recommendation,
          opportunity_score,
          filename,
          storage_name,
          storage_path,
          file_size_bytes,
          content
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, generated_at
      `,
      [
        record.userId,
        record.zoneId,
        record.zoneName,
        record.sector,
        record.recommendation,
        record.opportunityScore,
        record.filename,
        record.storageName,
        record.storagePath,
        record.fileSizeBytes,
        record.content,
      ]
    );
    return rows[0] || null;
  };

  try {
    return await insertRecord();
  } catch (error) {
    if (error?.code === '42P01') {
      investorReportsTableReady = false;
      await ensureInvestorReportsTable();
      return insertRecord();
    }
    throw error;
  }
}

function collectPdfBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

function drawHeader(doc, reportTitle, subtitle) {
  const top = doc.page.margins.top;
  doc.save();
  doc.fillColor('#0B1020').rect(0, 0, doc.page.width, 74).fill();
  doc.fillColor('#00D4FF').fontSize(10).font('Helvetica-Bold').text('LOCATIUM INVESTOR REPORT', doc.page.margins.left, top - 18);
  doc.fillColor('#F8FAFC').fontSize(19).font('Helvetica-Bold').text(reportTitle, doc.page.margins.left, top + 2, {
    width: doc.page.width - doc.page.margins.left * 2,
  });
  doc.fillColor('#94A3B8').fontSize(9).font('Helvetica').text(subtitle, doc.page.margins.left, top + 26, {
    width: doc.page.width - doc.page.margins.left * 2,
  });
  doc.restore();
}

function drawFooter(doc, pageNumber) {
  const y = doc.page.height - doc.page.margins.bottom + 8;
  doc.save();
  doc.strokeColor('rgba(148,163,184,0.2)').lineWidth(0.5).moveTo(doc.page.margins.left, y - 6).lineTo(doc.page.width - doc.page.margins.right, y - 6).stroke();
  doc.fillColor('#64748B').fontSize(8).font('Helvetica').text(`Generated by LOCATIUM · Page ${pageNumber}`, doc.page.margins.left, y, {
    width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    align: 'right',
  });
  doc.restore();
}

function sectionTitle(doc, title, y = doc.y) {
  doc.fillColor('#00D4FF').font('Helvetica-Bold').fontSize(12).text(title, doc.page.margins.left, y, {
    width: doc.page.width - doc.page.margins.left * 2,
  });
  doc.moveDown(0.25);
}

function paragraph(doc, text, options = {}) {
  doc.fillColor('#E2E8F0').font('Helvetica').fontSize(10).text(safeText(text), {
    width: options.width || doc.page.width - doc.page.margins.left * 2,
    align: options.align || 'left',
    lineGap: 3,
  });
}

function bulletList(doc, items) {
  for (const item of items.filter(Boolean)) {
    const text = safeText(item);
    if (!text) continue;
    const before = doc.y;
    doc.circle(doc.page.margins.left + 4, before + 5, 1.5).fill('#00D4FF');
    doc.fillColor('#E2E8F0').font('Helvetica').fontSize(10).text(text, doc.page.margins.left + 12, before, {
      width: doc.page.width - doc.page.margins.left * 2 - 12,
      lineGap: 3,
    });
    doc.moveDown(0.25);
  }
}

function card(doc, x, y, width, height, label, value, accent = '#00D4FF') {
  doc.save();
  doc.roundedRect(x, y, width, height, 10).fillAndStroke('#111827', 'rgba(255,255,255,0.08)');
  doc.fillColor('#94A3B8').font('Helvetica-Bold').fontSize(8).text(label.toUpperCase(), x + 10, y + 10, {
    width: width - 20,
  });
  doc.fillColor(accent).font('Helvetica-Bold').fontSize(15).text(value, x + 10, y + 28, {
    width: width - 20,
  });
  doc.restore();
}

function drawScoreBars(doc, scores) {
  const items = [
    ['Infrastructure', scores.infrastructure, '#00D4FF'],
    ['Accessibility', scores.accessibility, '#FF6D00'],
    ['Environmental', scores.environmentalRisk, '#00E676'],
    ['Zone fit', scores.zoneCompatibility, '#FFD700'],
  ];
  const startX = doc.page.margins.left;
  let y = doc.y;
  for (const [label, value, color] of items) {
    const pct = Math.max(0, Math.min(100, Number(value) || 0));
    doc.fillColor('#94A3B8').font('Helvetica').fontSize(9).text(label, startX, y, { width: 100 });
    doc.save();
    doc.roundedRect(startX + 110, y + 2, 270, 10, 5).fill('#1F2937');
    doc.roundedRect(startX + 110, y + 2, Math.max(8, 270 * (pct / 100)), 10, 5).fill(color);
    doc.restore();
    doc.fillColor('#E2E8F0').font('Helvetica-Bold').fontSize(9).text(`${Math.round(pct)}/100`, startX + 388, y - 1, {
      width: 40,
      align: 'right',
    });
    y += 18;
  }
  doc.y = y + 4;
}

function renderSummaryBlock(doc, analysis) {
  const recommendation = analysis.recommendation;
  const positives = recommendation.positives.slice(0, 3);
  const cautions = recommendation.cautions.slice(0, 3);

  sectionTitle(doc, 'Executive Summary');
  paragraph(
    doc,
    `This report evaluates ${analysis.zone.name} in ${analysis.zone.district} for the ${analysis.sector} sector using verified location scoring and local infrastructure context. The current recommendation is ${recommendation.verdict.toUpperCase()}, driven by an opportunity score of ${analysis.opportunity.opportunityScore} and the underlying location scores shown below.`
  );
  doc.moveDown(0.4);

  const width = (doc.page.width - doc.page.margins.left * 2 - 16) / 3;
  const x = doc.page.margins.left;
  const y = doc.y;
  card(doc, x, y, width, 62, 'Opportunity', `${analysis.opportunity.opportunityScore}/100`, '#FFD700');
  card(doc, x + width + 8, y, width, 62, 'Area', formatAcres(analysis.zone.areaAcres), '#00D4FF');
  card(doc, x + (width + 8) * 2, y, width, 62, 'Verdict', recommendation.verdict.toUpperCase(), '#00E676');
  doc.moveDown(4.8);

  sectionTitle(doc, 'Top positives');
  bulletList(doc, positives);
  doc.moveDown(0.25);
  sectionTitle(doc, 'Top cautions');
  bulletList(doc, cautions.length ? cautions : ['No immediate caution flags were raised by the current scoring model.']);
}

function renderOverviewPage(doc, analysis) {
  doc.addPage();
  drawHeader(doc, analysis.zone.name, `${analysis.zone.district} · ${analysis.zone.type} · ${analysis.zone.zoneType}`);
  drawFooter(doc, 2);

  doc.y = 92;
  sectionTitle(doc, 'Location Overview');
  bulletList(doc, [
    `District: ${analysis.zone.district}`,
    `Zone type: ${safeText(analysis.zone.zoneType) || 'N/A'}`,
    `Sector: ${analysis.sector}`,
    `Mapped area: ${formatAcres(analysis.zone.areaAcres)}`,
    `Coordinates: ${analysis.zone.center.lat.toFixed(5)}, ${analysis.zone.center.lng.toFixed(5)}`,
    `Feature ID: ${analysis.zone.featureId}`,
  ]);

  doc.moveDown(0.5);
  sectionTitle(doc, 'Scoring Analysis');
  drawScoreBars(doc, analysis.analysis.scores);
  paragraph(doc, `Composite opportunity score: ${analysis.opportunity.opportunityScore}. Growth potential favors utility access, accessibility, and sector fit, while environmental risk is already incorporated in the location score.`);

  doc.moveDown(0.5);
  sectionTitle(doc, 'Benchmark View');
  bulletList(
    doc,
    (analysis.benchmarks || []).map(
      (benchmark) => `${benchmark.name} · ${benchmark.district} · score ${benchmark.opportunityScore} · similarity ${benchmark.similarityScore}`
    )
  );
}

function renderInfrastructurePage(doc, analysis) {
  doc.addPage();
  drawHeader(doc, analysis.zone.name, 'Infrastructure, transport and utility context');
  drawFooter(doc, 3);

  doc.y = 92;
  sectionTitle(doc, 'Infrastructure Assessment');
  const infra = analysis.context.facilities;
  const transport = analysis.context.transport;
  const utilities = analysis.context.utilities;

  const cards = [
    ['Hospitals within 5 km', formatNumber(infra.hospitals.within5Km), '#00D4FF'],
    ['Schools within 5 km', formatNumber(infra.schools.within5Km), '#FF6D00'],
    ['Govt offices within 5 km', formatNumber(infra.governmentOffices.within5Km), '#00E676'],
    ['Water lines within 2 km', formatNumber(utilities.waterLinesWithin2Km), '#FFD700'],
    ['Electric assets within 2 km', formatNumber(utilities.electricAssetsWithin2Km), '#00D4FF'],
    ['Roads within 3 km', formatNumber(transport.roadsWithin3Km), '#FF6D00'],
  ];

  const cardWidth = (doc.page.width - doc.page.margins.left * 2 - 16) / 2;
  const cardHeight = 56;
  let x = doc.page.margins.left;
  let y = doc.y;
  cards.forEach(([label, value, accent], index) => {
    card(doc, x, y, cardWidth, cardHeight, label, value, accent);
    if (index % 2 === 1) {
      y += cardHeight + 10;
      x = doc.page.margins.left;
    } else {
      x += cardWidth + 8;
    }
  });
  doc.y = y + cardHeight + 6;

  sectionTitle(doc, 'Distance Matrix');
  bulletList(doc, [
    `Nearest road: ${formatDistanceKm(transport.nearestRoadKm)}`,
    `Nearest rail: ${formatDistanceKm(transport.nearestRailKm)}`,
    `Nearest airport: ${formatDistanceKm(transport.nearestAirportKm)}`,
    `Nearest bus stop: ${formatDistanceKm(transport.nearestBusStopKm)}`,
  ]);
}

function renderEnvironmentalPage(doc, analysis) {
  doc.addPage();
  drawHeader(doc, analysis.zone.name, 'Environmental constraints and decision support');
  drawFooter(doc, 4);

  doc.y = 92;
  sectionTitle(doc, 'Environmental Assessment');
  const environmental = analysis.context.environmental;
  bulletList(doc, [
    `Nearest forest area: ${formatDistanceKm(environmental.nearestForestKm)}`,
    `Nearest low-lying area: ${formatDistanceKm(environmental.nearestLowLyingAreaKm)}`,
    `Nearest water body: ${formatDistanceKm(environmental.nearestWaterBodyKm)}`,
    `Environmental score: ${analysis.analysis.scores.environmentalRisk}/100`,
  ]);

  doc.moveDown(0.4);
  sectionTitle(doc, 'Recommendation Notes');
  bulletList(doc, analysis.recommendation.nextActions);

  doc.moveDown(0.4);
  sectionTitle(doc, 'Methodology');
  paragraph(
    doc,
    'This report is generated from the live analysis API. Scores are derived from verified local map layers and the current recommendation logic. It should be used for screening and comparison, not as a legal or regulatory substitute.'
  );
}

function renderClosingPage(doc, analysis, generatedAtIso) {
  doc.addPage();
  drawHeader(doc, analysis.zone.name, 'Report closing notes');
  drawFooter(doc, 5);

  doc.y = 92;
  sectionTitle(doc, 'Report Metadata');
  bulletList(doc, [
    `Generated at: ${new Date(generatedAtIso).toLocaleString('en-IN')}`,
    `Source sector: ${analysis.sector}`,
    `Zone id: ${analysis.zone.id}`,
    `Confidence note: this report is based on deterministic scoring and spatial joins, not probabilistic ML predictions.`,
  ]);

  doc.moveDown(0.4);
  sectionTitle(doc, 'Decision Readout');
  paragraph(doc, `Plain-language recommendation: ${
    analysis.recommendation.verdict === 'shortlist'
      ? 'Worth a site visit'
      : analysis.recommendation.verdict === 'review'
        ? 'Compare further with nearby options'
        : 'Weak fit for now — dig deeper before committing'
  }. Use this as a shortlist aid, then verify on the ground.`);

  doc.moveDown(0.4);
  sectionTitle(doc, 'Disclaimer');
  paragraph(doc, 'LOCATIUM is a screening tool for the public and investors. It summarizes currently available spatial data and official collector rates. It is not investment advice and does not replace legal due diligence, site visits, title verification, environmental clearance, or sector-specific approvals.');
}

function renderExtendedSections(doc, analysis) {
  if (analysis.regulatoryChecklist?.length) {
    doc.addPage();
    drawHeader(doc, analysis.zone.name, 'Regulatory checklist');
    drawFooter(doc, doc.bufferedPageRange()?.count || 6);
    doc.y = 92;
    sectionTitle(doc, 'Regulatory & compliance checklist');
    bulletList(
      doc,
      analysis.regulatoryChecklist.map((item) => `${item.label}: ${item.status} — ${item.note}`)
    );
  }

  if (analysis.financialPreview) {
    doc.addPage();
    drawHeader(doc, analysis.zone.name, 'Financial preview');
    drawFooter(doc, doc.bufferedPageRange()?.count || 7);
    doc.y = 92;
    sectionTitle(doc, 'Illustrative investment model');
    const fp = analysis.financialPreview;
    bulletList(doc, [
      `Land cost (consideration): ₹${formatNumber(fp.landCostInr)}`,
      fp.acquisition
        ? `Acquisition (stamp ${((fp.acquisition.stampDutyPct || 0) * 100).toFixed(0)}% + reg ${((fp.acquisition.registrationPct || 0) * 100).toFixed(0)}%): ₹${formatNumber(fp.acquisition.allInLandCostInr)}`
        : null,
      `Build cost (illustrative): ₹${formatNumber(fp.buildCostInr)}`,
      `Total capex: ₹${formatNumber(fp.totalCapexInr)}`,
      `Simple ROI (base, illustrative rent/build): ${fp.scenarios?.[1]?.roiPct ?? 'N/A'}%`,
      `Payback (years): ${fp.paybackYears ?? 'N/A'}`,
      fp.disclaimer,
    ].filter(Boolean));
  }

  const lv = analysis.landValue || analysis.analysis?.landValue;
  if (lv && (lv.estimatedPerSqYardInr || lv.circleRatePerSqYardInr || lv.method === 'insufficient_data')) {
    doc.addPage();
    drawHeader(doc, analysis.zone.name, 'Land pricing');
    drawFooter(doc, doc.bufferedPageRange()?.count || 8);
    doc.y = 92;
    sectionTitle(doc, 'Government floor + market comps');
    const fmt = (n) => (n != null ? `₹${formatNumber(n)}/sq yd` : 'N/A');
    bulletList(
      doc,
      [
        `Estimate: ${fmt(lv.estimatedPerSqYardInr)}`,
        lv.estimatedLowPerSqYardInr != null && lv.estimatedHighPerSqYardInr != null
          ? `Band: ${fmt(lv.estimatedLowPerSqYardInr)} – ${fmt(lv.estimatedHighPerSqYardInr)}`
          : null,
        `Gov collector floor: ${fmt(lv.circleRatePerSqYardInr)}${lv.circleRateSampleCount ? ` (n=${lv.circleRateSampleCount})` : ''}`,
        lv.circleRateTehsil ? `Tehsil focus: ${lv.circleRateTehsil}` : null,
        lv.circleRateEffectiveFrom ? `Vintage: ${lv.circleRateEffectiveFrom}` : null,
        lv.marketAvailable
          ? `Market comps: ${fmt(lv.comparableWeightedPerSqYardInr ?? lv.comparableMedianPerSqYardInr)} (n=${lv.comparableSampleCount ?? lv.comparableCount ?? 0})`
          : 'Market comps: unavailable in radius',
        (lv.marketPremiumVsFloor ?? lv.roiProxy) != null && lv.marketAvailable
          ? `Market premium vs floor: ${(((lv.marketPremiumVsFloor ?? lv.roiProxy) * 100)).toFixed(1)}%`
          : null,
        `Method: ${(lv.method || 'n/a').replace(/_/g, ' ')}`,
        lv.confidence ? `Confidence: ${lv.confidence}` : null,
        lv.note || null,
      ].filter(Boolean)
    );
  }

  if (analysis.plotInventory?.plots?.length) {
    doc.addPage();
    drawHeader(doc, analysis.zone.name, 'Plot inventory');
    drawFooter(doc, doc.bufferedPageRange()?.count || 8);
    doc.y = 92;
    sectionTitle(doc, `Plot inventory (${analysis.plotInventory.count} parcels)`);
    bulletList(
      doc,
      analysis.plotInventory.plots.slice(0, 20).map(
        (p) => `${p.name} · ${p.statusLabel || p.status} · ${p.areaAcres ? formatAcres(p.areaAcres) : 'area N/A'}`
      )
    );
    if (analysis.plotInventory.policyLinks?.length) {
      doc.moveDown(0.3);
      sectionTitle(doc, 'Policy references');
      bulletList(doc, analysis.plotInventory.policyLinks.map((p) => `${p.title} — ${p.citation || ''}`));
    }
  }

  const narrative = narrativeText(analysis);
  doc.addPage();
  drawHeader(doc, analysis.zone.name, 'AI narrative brief');
  drawFooter(doc, doc.bufferedPageRange()?.count || 9);
  doc.y = 92;
  sectionTitle(doc, 'Location intelligence narrative');
  paragraph(
    doc,
    narrative ||
      'Narrative summary unavailable. The pages above still contain deterministic scores, land pricing, and regulatory checks from live LOCATIUM data.'
  );
  if (analysis.analysis?.narrative?.method) {
    doc.moveDown(0.3);
    paragraph(doc, `Method: ${String(analysis.analysis.narrative.method).replace(/_/g, ' ')}.`);
  }
}

async function generatePortfolioReport({ zoneIds, sector = 'industrial', portfolioName = 'Portfolio' }) {
  if (!Array.isArray(zoneIds) || zoneIds.length < 1) {
    throw AppError.badRequest('zoneIds must be a non-empty array');
  }

  const analyses = [];
  for (const zoneId of zoneIds.slice(0, 12)) {
    analyses.push(await investorOpportunities.getZoneAnalysis(zoneId, { sector, includeGeometry: 'false' }));
  }

  const doc = new PDFDocument({ size: 'A4', margin: 42, autoFirstPage: false });
  const bufferPromise = collectPdfBuffer(doc);

  doc.addPage();
  drawHeader(doc, portfolioName, `Portfolio comparison · ${analyses.length} zones`);
  drawFooter(doc, 1);
  doc.y = 104;
  sectionTitle(doc, 'Zone ranking summary');
  bulletList(
    doc,
    analyses
      .sort((a, b) => (b.opportunity?.opportunityScore || 0) - (a.opportunity?.opportunityScore || 0))
      .map(
        (a, i) =>
          `#${i + 1} ${a.zone.name} (${a.zone.district}) — score ${a.opportunity?.opportunityScore} · ${a.recommendation?.verdict}`
      )
  );

  for (const analysis of analyses) {
    doc.addPage();
    drawHeader(doc, analysis.zone.name, `${analysis.zone.district} · portfolio member`);
    drawFooter(doc, doc.bufferedPageRange()?.count || 2);
    doc.y = 92;
    renderSummaryBlock(doc, analysis);
    drawScoreBars(doc, analysis.analysis.scores);
  }

  doc.end();
  const buffer = await bufferPromise;
  const filename = `${slugifyFilename(portfolioName)}-portfolio-report.pdf`;
  return { buffer, filename, zoneCount: analyses.length };
}

async function generateReport(zoneId, query = {}, userId) {
  if (!zoneId || typeof zoneId !== 'string' || !zoneId.trim()) {
    throw AppError.badRequest('zoneId is required');
  }

  const generatedAt = new Date().toISOString();
  const analysis = await investorOpportunities.getZoneAnalysis(zoneId.trim(), query);

  const doc = new PDFDocument({
    size: 'A4',
    margin: 42,
    autoFirstPage: false,
    info: {
      Title: `LOCATIUM Report - ${analysis.zone.name}`,
      Author: 'LOCATIUM',
      Subject: 'Investor zone analysis report',
      Keywords: 'LOCATIUM, investor report, zone analysis, Haryana',
    },
  });

  const bufferPromise = collectPdfBuffer(doc);

  doc.addPage();
  drawHeader(doc, analysis.zone.name, `${analysis.zone.district} · ${analysis.zone.type} · ${analysis.zone.zoneType}`);
  drawFooter(doc, 1);

  doc.y = 104;
  renderSummaryBlock(doc, analysis);
  renderOverviewPage(doc, analysis);
  renderInfrastructurePage(doc, analysis);
  renderEnvironmentalPage(doc, analysis);
  renderExtendedSections(doc, analysis);
  renderClosingPage(doc, analysis, generatedAt);

  doc.end();

  const buffer = await bufferPromise;
  const filename = `${slugifyFilename(analysis.zone.name)}-locatium-report.pdf`;
  const storage = await persistReport(buffer, filename);
  const metadata = await saveReportMetadata({
    userId,
    zoneId: analysis.zone.id,
    zoneName: analysis.zone.name,
    sector: analysis.sector,
    recommendation: analysis.recommendation.verdict,
    opportunityScore: analysis.opportunity.opportunityScore,
    filename,
    storageName: storage.storageName,
    storagePath: storage.storagePath,
    fileSizeBytes: buffer.length,
    content:
      process.env.REPORT_STORAGE === 'filesystem' ||
      (process.env.NODE_ENV !== 'production' && !process.env.REPORT_STORAGE)
        ? null
        : buffer,
  });

  return { buffer, filename, storage, metadata, analysis };
}

async function listReports({ limit = 20, userId } = {}) {
  const pool = ensurePool();
  if (!pool) return [];
  await ensureInvestorReportsTable();
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const { rows } = await pool.query(
    `
      SELECT id, zone_id, zone_name, sector, recommendation, opportunity_score, filename, file_size_bytes, generated_at
      FROM investor_reports
      WHERE user_id = $1
      ORDER BY generated_at DESC
      LIMIT $2
    `,
    [userId, safeLimit]
  );
  return rows;
}

async function getReportById(reportId, userId) {
  const pool = ensurePool();
  if (!pool) throw AppError.serviceUnavailable('Database not configured');

  await ensureInvestorReportsTable();

  const { rows } = await pool.query(
    `
      SELECT id, zone_id, zone_name, sector, recommendation, opportunity_score, filename, storage_name, storage_path, content, file_size_bytes, generated_at
      FROM investor_reports
      WHERE id = $1 AND user_id = $2
      LIMIT 1
    `,
    [reportId, userId]
  );

  if (!rows[0]) {
    throw AppError.notFound('Report not found');
  }

  const report = rows[0];
  const buffer = report.content
    ? Buffer.from(report.content)
    : await fs.readFile(report.storage_path);
  delete report.content;
  return { report, buffer };
}

async function emailReport({ to, zoneId, reportId, message, query = {}, userId }) {
  let buffer;
  let filename;
  let metadata;
  let analysis;
  let resolvedReportId = reportId || null;

  if (reportId) {
    const existing = await getReportById(reportId, userId);
    buffer = existing.buffer;
    filename = existing.report.filename;
    metadata = existing.report;
    analysis = await investorOpportunities.getZoneAnalysis(existing.report.zone_id, query).catch(() => null);
  } else {
    if (!zoneId || typeof zoneId !== 'string' || !zoneId.trim()) {
      throw AppError.badRequest('zoneId or reportId is required');
    }
    const generated = await generateReport(zoneId.trim(), query, userId);
    buffer = generated.buffer;
    filename = generated.filename;
    metadata = generated.metadata;
    analysis = generated.analysis;
    resolvedReportId = generated.metadata?.id || null;
  }

  const zoneName = analysis?.zone?.name || metadata?.zone_name || 'Investment zone';
  const district = analysis?.zone?.district || 'Haryana';
  const score = analysis?.opportunity?.opportunityScore ?? metadata?.opportunity_score ?? 'N/A';
  const subject = `LOCATIUM investment brief: ${zoneName}`;
  const text = [
    message?.trim() || '',
    message?.trim() ? '' : null,
    `Zone: ${zoneName}`,
    `District: ${district}`,
    `Opportunity score: ${score}`,
    '',
    'The PDF investment brief is attached.',
    'Generated with LOCATIUM location intelligence.',
  ]
    .filter((line) => line !== null)
    .join('\n');

  const delivery = await emailService.sendReportEmail({
    to,
    subject,
    text,
    filename,
    pdfBuffer: buffer,
  });

  return {
    success: true,
    reportId: resolvedReportId,
    zoneId: analysis?.zone?.id || metadata?.zone_id || zoneId || null,
    zoneName,
    to: delivery.to,
    deliveryMode: delivery.deliveryMode,
    messageId: delivery.messageId,
    outboxPath: delivery.outboxPath || null,
  };
}

module.exports = {
  generateReport,
  generatePortfolioReport,
  listReports,
  getReportById,
  emailReport,
  narrativeText,
};