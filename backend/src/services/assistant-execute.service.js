/**
 * Confirmed copilot mutations. Catalog validation happens first; this module
 * is the only place Ask LOCATIUM is allowed to persist pipeline/search/report state.
 */

const { AppError } = require('../middleware/error.middleware');
const { CATALOG, validateAction } = require('./assistant-actions.service');
const portal = require('./portal.service');
const investorReports = require('./investor-report.service');

function searchName(params = {}) {
  const bits = [params.district, params.sector, params.risk].filter(Boolean);
  return bits.length ? `Ask LOCATIUM · ${bits.join(' · ')}` : 'Ask LOCATIUM saved search';
}

async function executeAction({ user, type, params = {} }) {
  const verdict = validateAction({ type, params });
  if (!verdict.ok) throw AppError.badRequest(verdict.error);

  const spec = CATALOG[type];
  if (spec.readOnly) {
    return { ok: true, type, executed: false, note: 'Read-only actions run in the map UI, not on the server.' };
  }
  if (!user?.id) throw AppError.unauthorized('Sign in to confirm this action');

  switch (type) {
    case 'addToPipeline': {
      if (!params.zoneId) throw AppError.badRequest('zoneId is required');
      const item = await portal.upsertPipelineItem(user.id, params.zoneId, params.stage || 'shortlisted', 'Added from Ask LOCATIUM');
      return { ok: true, type, executed: true, result: item, message: 'Saved to your pipeline.' };
    }
    case 'addToPortfolio': {
      if (!params.zoneId) throw AppError.badRequest('zoneId is required');
      const portfolios = await portal.listPortfolios(user.id);
      const existing =
        (params.portfolioId && portfolios.find((p) => p.id === params.portfolioId)) ||
        portfolios.find((p) => p.name === 'Ask LOCATIUM');
      if (existing) {
        const zoneIds = Array.from(new Set([...(existing.zoneIds || []), params.zoneId]));
        const updated = await portal.upsertPortfolio(user.id, {
          id: existing.id,
          name: existing.name,
          zoneIds,
          notes: existing.notes,
        });
        return { ok: true, type, executed: true, result: updated, message: `Added to portfolio “${updated.name}”.` };
      }
      const created = await portal.upsertPortfolio(user.id, {
        name: 'Ask LOCATIUM',
        zoneIds: [params.zoneId],
        notes: 'Created from the copilot',
      });
      return { ok: true, type, executed: true, result: created, message: 'Saved to a new Ask LOCATIUM portfolio.' };
    }
    case 'saveSearch': {
      const saved = await portal.saveSearch(user.id, searchName(params), {
        sector: params.sector || 'industrial',
        district: params.district || '',
        budgetInr: params.budgetInr || null,
        risk: params.risk || 'medium',
        source: 'ask_locatium',
      });
      return { ok: true, type, executed: true, result: saved, message: `Saved search “${saved.name}”.` };
    }
    case 'createAlert': {
      const saved = await portal.saveSearch(user.id, searchName(params), {
        sector: params.sector || 'industrial',
        district: params.district || '',
        budgetInr: params.budgetInr || null,
        risk: params.risk || 'medium',
        source: 'ask_locatium_alert',
      });
      const alert = await portal.subscribeSearchAlert(user.id, {
        savedSearchId: saved.id,
        email: user.email,
        minScoreDelta: 5,
      });
      return {
        ok: true,
        type,
        executed: true,
        result: { search: saved, alert },
        message: 'Alert registered on these filters.',
      };
    }
    case 'generateReport': {
      if (!params.zoneId) throw AppError.badRequest('zoneId is required');
      const report = await investorReports.generateReport(params.zoneId, {}, user.id);
      return {
        ok: true,
        type,
        executed: true,
        result: {
          reportId: report.metadata?.id,
          filename: report.filename,
          zoneId: report.analysis?.zone?.id,
          zoneName: report.analysis?.zone?.name,
        },
        message: `PDF ready: ${report.filename}`,
      };
    }
    case 'emailReport': {
      const to = params.email || user.email;
      if (!to) throw AppError.badRequest('email is required');
      if (!params.zoneId) throw AppError.badRequest('zoneId is required');
      const emailed = await investorReports.emailReport({
        to,
        zoneId: params.zoneId,
        userId: user.id,
        query: {},
      });
      return {
        ok: true,
        type,
        executed: true,
        result: emailed,
        message: emailed.deliveryMode === 'outbox' ? `Saved to outbox for ${emailed.to}.` : `Emailed ${emailed.to}.`,
      };
    }
    default:
      throw AppError.badRequest(`Action "${type}" cannot be executed on the server`);
  }
}

module.exports = { executeAction };
