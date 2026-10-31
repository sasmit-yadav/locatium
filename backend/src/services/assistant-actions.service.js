/**
 * Action catalog for Ask LOCATIUM — what the copilot can actually *do*, not just describe.
 *
 * Safety model (standard human-in-the-loop tool-calling practice):
 *   - `readOnly` actions (pan the map, apply a filter, open a panel, explain a term) are safe to
 *     surface as one-click chips and execute immediately. Nothing is persisted, nothing is sent.
 *   - `mutating` actions (save to pipeline, create an alert, email a report) are *proposed only*.
 *     They render as an explicit confirm chip and never fire from model output alone.
 *
 * Actions are proposed deterministically from resolved intent + grounding, not emitted as free-form
 * JSON by the model. On a 70B open model, schema-valid tool JSON is not reliable enough to sit on
 * the path of "email this report" — and a wrong action is worse than a missing one. The model
 * narrates; this table decides what is offerable.
 */

const CATALOG = {
  // ---------- navigation / view (read-only) ----------
  flyTo: {
    kind: 'map',
    readOnly: true,
    label: 'Show on map',
    params: ['lat', 'lng', 'zoom', 'name', 'zoneId'],
    beginnerHint: 'Moves the map to this place so you can see it.',
  },
  highlightOpportunities: {
    kind: 'map',
    readOnly: true,
    label: 'Pin top matches',
    params: ['highlights'],
    beginnerHint: 'Drops markers on the best-matching sites.',
  },
  toggleLayer: {
    kind: 'map',
    readOnly: true,
    label: 'Toggle map layer',
    params: ['layerId', 'visible'],
    beginnerHint: 'Turns a data layer (roads, industry, flood risk) on or off.',
  },
  openInvestor: {
    kind: 'panel',
    readOnly: true,
    label: 'Open Investor workspace',
    params: [],
    beginnerHint: 'The full shortlisting tool, with every filter.',
  },
  openAnalysis: {
    kind: 'panel',
    readOnly: true,
    label: 'Open Analysis brief',
    params: [],
    beginnerHint: 'The detailed scorecard for the pin you selected.',
  },

  // ---------- querying / refinement (read-only) ----------
  applyFilters: {
    kind: 'query',
    readOnly: true,
    label: 'Apply these filters',
    params: ['sector', 'district', 'budgetInr', 'risk', 'zoneType'],
    beginnerHint: 'Sets the search filters to match what we just discussed.',
  },
  compareZones: {
    kind: 'query',
    readOnly: true,
    label: 'Compare side by side',
    params: ['zoneIds'],
    beginnerHint: 'Puts two to four sites in one comparison table.',
  },
  explainTerm: {
    kind: 'learn',
    readOnly: true,
    label: 'Explain this term',
    params: ['term'],
    beginnerHint: 'Plain-language meaning, no jargon.',
  },
  explainScore: {
    kind: 'learn',
    readOnly: true,
    label: 'How was this scored?',
    params: [],
    beginnerHint: 'Shows the exact formula behind the number.',
  },
  startTour: {
    kind: 'learn',
    readOnly: true,
    label: 'Show me around',
    params: [],
    beginnerHint: 'A short guided walkthrough of the map and panels.',
  },
  downloadCsv: {
    kind: 'export',
    readOnly: true,
    label: 'Download shortlist (CSV)',
    params: ['zoneIds'],
    beginnerHint: 'Saves the list to your computer as a spreadsheet.',
  },
  overlayFacilityGap: {
    kind: 'map',
    readOnly: true,
    label: 'Overlay hospital/school gaps',
    params: ['district'],
    beginnerHint: 'Shows which industrial estates have few hospitals or schools nearby.',
  },
  showLandBand: {
    kind: 'panel',
    readOnly: true,
    label: 'Show land-price band',
    params: ['lat', 'lng', 'sector', 'zoneId'],
    beginnerHint: 'Opens the current collector-rate + comps range for this pin. Not a future-year forecast.',
  },
  openFacilities: {
    kind: 'panel',
    readOnly: true,
    label: 'Find nearby facilities',
    params: [],
    beginnerHint: 'Opens the nearest-hospital / school / amenity finder on the map.',
  },
  copyEmbed: {
    kind: 'export',
    readOnly: true,
    label: 'Copy embed link',
    params: ['zoneId'],
    beginnerHint: 'Copies a public zone card URL you can paste into a memo or website.',
  },
  openReports: {
    kind: 'panel',
    readOnly: true,
    label: 'Open Reports',
    params: [],
    beginnerHint: 'Your saved PDFs and activity.',
  },

  // ---------- mutating — must be confirmed by the user ----------
  addToPipeline: {
    kind: 'crm',
    readOnly: false,
    label: 'Add to my pipeline',
    params: ['zoneId', 'stage'],
    confirm: 'Add this site to your deal pipeline?',
    requiresAuth: true,
    beginnerHint: 'Saves it to your own tracked list of sites.',
  },
  addToPortfolio: {
    kind: 'crm',
    readOnly: false,
    label: 'Save to portfolio',
    params: ['zoneId', 'portfolioId'],
    confirm: 'Save this site to your portfolio?',
    requiresAuth: true,
    beginnerHint: 'Groups sites you want to keep together.',
  },
  saveSearch: {
    kind: 'crm',
    readOnly: false,
    label: 'Save this search',
    params: ['sector', 'district', 'budgetInr', 'risk'],
    confirm: 'Save these filters as a named search?',
    requiresAuth: true,
    beginnerHint: 'Reuse the same filters later without retyping.',
  },
  createAlert: {
    kind: 'crm',
    readOnly: false,
    label: 'Alert me on changes',
    params: ['sector', 'district', 'budgetInr'],
    confirm: 'Email you when matching sites change?',
    requiresAuth: true,
    beginnerHint: 'We check periodically and email you if something shifts.',
  },
  generateReport: {
    kind: 'export',
    readOnly: false,
    label: 'Generate PDF report',
    params: ['zoneId'],
    confirm: 'Generate a PDF report for this site?',
    beginnerHint: 'A shareable document with the scores and land costs.',
  },
  emailReport: {
    kind: 'export',
    readOnly: false,
    label: 'Email me this report',
    params: ['zoneId', 'email'],
    confirm: 'Send this report to your email?',
    requiresAuth: true,
    beginnerHint: 'Sends the PDF to your registered address.',
  },
};

/** Validate a client-requested action against the catalog before anything executes. */
function validateAction(action = {}) {
  const spec = CATALOG[action.type];
  if (!spec) {
    return { ok: false, error: `Unknown action "${action.type}"` };
  }
  const unknown = Object.keys(action.params || {}).filter((k) => !spec.params.includes(k));
  if (unknown.length) {
    return { ok: false, error: `Unexpected parameters: ${unknown.join(', ')}` };
  }
  return {
    ok: true,
    spec,
    // A mutating action is never auto-runnable, regardless of how it reached us.
    needsConfirmation: !spec.readOnly,
  };
}

function describe(type) {
  const spec = CATALOG[type];
  if (!spec) return null;
  return {
    type,
    label: spec.label,
    kind: spec.kind,
    readOnly: spec.readOnly,
    confirm: spec.confirm || null,
    requiresAuth: Boolean(spec.requiresAuth),
    hint: spec.beginnerHint,
  };
}

/**
 * Propose the actions that make sense for this turn.
 *
 * @param {object} context   grounding context
 * @param {object} opts
 * @param {boolean} opts.authenticated  gate actions that need a signed-in user
 * @param {boolean} opts.beginner       include learning/orientation actions
 * @returns {{actions: Array, proposals: Array}} `actions` run on click; `proposals` need confirming
 */
function proposeActions(context = {}, { authenticated = false, beginner = false } = {}) {
  const actions = [];
  const proposals = [];

  const add = (type, params = {}, extra = {}) => {
    const spec = CATALOG[type];
    if (!spec) return;
    if (spec.requiresAuth && !authenticated) return;
    const entry = { type, ...describe(type), params, ...extra };
    if (spec.readOnly) actions.push(entry);
    else proposals.push(entry);
  };

  const primary = context.primaryIntent;
  const top = context.opportunities?.[0];
  const pin = context.mapPoint;

  // The action they just asked for ("email me", "add it") must be the first confirm chip.
  if (context.pendingAct?.type) {
    add(context.pendingAct.type, context.pendingAct.params || {});
  }

  if (top?.center?.lat != null) {
    add('flyTo', {
      lat: top.center.lat,
      lng: top.center.lng,
      zoom: 12,
      name: top.name,
      zoneId: top.id,
    }, { label: `Show ${top.name} on map` });
  } else if (context.scoredLocation && pin) {
    add('flyTo', { lat: pin.lat, lng: pin.lng, zoom: 13, name: 'Selected site' },
      { label: 'Center on this site' });
  }

  if (primary === 'nearby' || context.facilityGap) {
    add('overlayFacilityGap', { district: context.district || undefined });
    add('openFacilities');
    add('toggleLayer', { layerId: 'hospitals', visible: true }, { label: 'Show hospitals layer' });
  }

  if (primary === 'forecast' || primary === 'land' || context.forecast) {
    add('showLandBand', {
      lat: pin?.lat,
      lng: pin?.lng,
      sector: context.sector,
      zoneId: top?.id,
    });
  }

  if (primary === 'diligence') {
    add('openAnalysis');
    add('openReports');
    if (top?.id) {
      add('generateReport', { zoneId: top.id });
      add('addToPipeline', { zoneId: top.id, stage: 'shortlisted' });
    }
  }

  if (context.opportunities?.length) {
    add('highlightOpportunities', { highlights: context.mapHighlights || [] });
    add('openInvestor');
    if (context.opportunities.length >= 2) {
      add('compareZones', { zoneIds: context.opportunities.slice(0, 3).map((z) => z.id) });
    }
    add('downloadCsv', { zoneIds: context.opportunities.slice(0, 6).map((z) => z.id) });
    if (top?.id) {
      add('generateReport', { zoneId: top.id });
      add('addToPipeline', { zoneId: top.id, stage: 'shortlisted' });
      add('addToPortfolio', { zoneId: top.id });
      add('emailReport', { zoneId: top.id });
      add('copyEmbed', { zoneId: top.id }, { label: `Copy embed link for ${top.name}` });
    }
  }

  if (context.scoredLocation) {
    add('openAnalysis');
    add('explainScore');
  }

  if (context.sector || context.district || context.budgetInr) {
    add('applyFilters', {
      sector: context.sector,
      district: context.district || undefined,
      budgetInr: context.budgetInr || undefined,
      risk: context.risk || undefined,
    });
  }

  if (context.sector || context.district) {
    add('saveSearch', {
      sector: context.sector,
      district: context.district || undefined,
      budgetInr: context.budgetInr || undefined,
      risk: context.risk || undefined,
    });
    add('createAlert', {
      sector: context.sector,
      district: context.district || undefined,
      budgetInr: context.budgetInr || undefined,
    });
  }

  if (beginner) {
    add('startTour');
  }

  // Deduplicate by type so intent-specific adds don't double the same chip.
  const uniq = (list) => {
    const seen = new Set();
    return list.filter((item) => {
      if (seen.has(item.type)) return false;
      seen.add(item.type);
      return true;
    });
  };

  return { actions: uniq(actions).slice(0, 8), proposals: uniq(proposals).slice(0, 4) };
}

module.exports = { CATALOG, proposeActions, validateAction, describe };
