/**
 * Fuzzy NLU for Ask LOCATIUM copilot.
 * Handles typos, Hinglish, jumbled word order, synonyms, and multi-intent.
 */

const DISTRICT_ALIASES = [
  ['Gurugram', ['gurugram', 'gurgaon', 'ggm', 'gurgoan', 'gurgao', 'gurgaom']],
  ['Faridabad', ['faridabad', 'fbd', 'faridbad', 'faridabaad']],
  ['Sonipat', ['sonipat', 'sonepat', 'sonipath']],
  ['Panipat', ['panipat', 'pannipat']],
  ['Karnal', ['karnal', 'karnaaal']],
  ['Ambala', ['ambala', 'ambalaa']],
  ['Hisar', ['hisar', 'hissar']],
  ['Rohtak', ['rohtak', 'rohtack']],
  ['Rewari', ['rewari', 'rewary']],
  ['Jhajjar', ['jhajjar', 'jhajar']],
  ['Palwal', ['palwal', 'palwaal']],
  ['Nuh', ['nuh', 'mewat']],
  ['Bhiwani', ['bhiwani']],
  ['Sirsa', ['sirsa']],
  ['Fatehabad', ['fatehabad']],
  ['Jind', ['jind']],
  ['Kaithal', ['kaithal']],
  ['Kurukshetra', ['kurukshetra', 'kktr']],
  ['Yamunanagar', ['yamunanagar', 'yamuna nagar', 'ynr']],
  ['Panchkula', ['panchkula', 'pkl']],
  ['Mahendragarh', ['mahendragarh', 'narnaul', 'm.garh']],
  ['Charkhi Dadri', ['charkhi dadri', 'dadri', 'charkhi']],
];

const INTENT_PATTERNS = {
  help: [
    'help', 'what can', 'how do', 'commands', 'kya kar', 'kaise', 'guide', 'menu',
    'capabilities', 'what do you', 'who are you', 'start',
  ],
  score: [
    'score', 'suitab', 'analys', 'rate this', 'this site', 'this spot', 'this location',
    'this point', 'yaha', 'yahan', 'yahaa', 'idhar', 'ye jagah', 'ye place', 'kaisi hai',
    'kaisa hai', 'good place', 'worth', 'evaluate', 'assess', 'diligence', 'feasib',
    'how good', 'is it good', 'check here', 'pin', 'clicked', 'selected',
  ],
  opportunities: [
    'best', 'top', 'rank', 'opportunit', 'zone', 'where', 'find', 'suggest', 'recommend',
    'industrial', 'warehouse', 'factory', 'plant', 'plot', 'park', 'imt', 'hsiidc',
    'dhundo', 'batao', 'dikhao', 'options', 'candidates', 'shortlist', 'short list',
    'investment', 'invest', 'set up', 'setup', 'establish', 'locate', 'location for',
    'kahan', 'kaha', 'kon sa', 'kaun sa', 'which place', 'where should', 'where to',
  ],
  land: [
    'land', 'price', 'rate', '₹', 'rs', 'cost', 'budget', 'circle', 'collector',
    'kitna', 'keemat', 'daam', 'paisa', 'crore', 'lakh', 'sq yd', 'sqyd', 'per yard',
    'acquisition', 'stamp', 'registration fee', 'all in', 'all-in', 'premium',
  ],
  compare: [
    'compar', 'vs', 'versus', 'side by side', 'side-by-side', 'difference', 'better than',
    'which is better', 'between', 'contrast', 'dono', 'donon',
  ],
  policy: [
    'policy', 'incentive', 'clu', 'eia', 'stamp duty', 'hsiidc', 'hsvp', 'regulation',
    'compliance', 'permission', 'approval', 'licence', 'license', 'rules', 'guideline',
    'forest clear', 'change of land',
  ],
  nearby: [
    'nearby', 'near me', 'around', 'close to', 'facility', 'hospital', 'school', 'metro',
    'airport', 'highway', 'road', 'rail', 'bus', 'distance', 'kitni door', 'paas',
    'nearest', 'proximity', 'access', 'connectivity', 'infra around',
  ],
  how_it_works: [
    'how score', 'how calculation', 'formula', 'methodology', 'explain score',
    'breakdown', 'weight', 'kaise calculate', 'transparent',
  ],
  navigate: [
    'show on map', 'fly', 'zoom', 'go to', 'open map', 'highlight', 'take me',
    'map pe', 'dikha map',
  ],
};

const SECTOR_HINTS = {
  industrial: ['industrial', 'industry', 'factory', 'warehouse', 'plant', 'imt', 'manufactur', 'logistics', 'godown', 'udyog'],
  residential: ['residential', 'housing', 'apartment', 'flat', 'colony', 'township', 'ghar'],
  commercial: ['commercial', 'retail', 'office', 'mall', 'shop', 'showroom', 'it park'],
  agricultural: ['agricultur', 'farm', 'crop', 'kheti', 'farmland'],
};

function normalizeText(raw = '') {
  return String(raw)
    .toLowerCase()
    .replace(/[₹]/g, ' rs ')
    .replace(/[^\w\s./-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i += 1) {
    let prev = i;
    for (let j = 0; j < b.length; j += 1) {
      const cur = row[j + 1];
      const cost = a[i] === b[j] ? 0 : 1;
      row[j + 1] = Math.min(row[j + 1] + 1, row[j] + 1, prev + cost);
      prev = cur;
    }
    row[0] = i + 1;
  }
  return row[b.length];
}

function fuzzyIncludes(haystack, needle, maxDist = 1) {
  if (!needle) return false;
  if (haystack.includes(needle)) return true;
  if (needle.length < 4) return false;
  const tokens = haystack.split(/\s+/);
  return tokens.some((t) => {
    if (Math.abs(t.length - needle.length) > maxDist + 1) return false;
    return levenshtein(t, needle) <= maxDist;
  });
}

function scoreIntent(norm, patterns) {
  let score = 0;
  for (const p of patterns) {
    if (norm.includes(p)) score += p.length >= 6 ? 3 : 2;
    else if (p.length >= 5 && fuzzyIncludes(norm, p, 1)) score += 1;
  }
  return score;
}

function detectIntents(query = '', session = {}) {
  const norm = normalizeText(query);
  const scores = {};
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    scores[intent] = scoreIntent(norm, patterns);
  }

  // Session follow-ups: short replies like "same for faridabad" / "and land?"
  if (norm.length < 40 && session.lastIntent) {
    if (/\b(same|also|aur|and|phir|fir|now|uske|uska)\b/.test(norm)) {
      scores[session.lastIntent] = (scores[session.lastIntent] || 0) + 4;
    }
  }

  const ranked = Object.entries(scores)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1]);

  if (!ranked.length) {
    // Default: if map point likely → score; else opportunities explorer
    return session.hasMapPoint ? ['score', 'land'] : ['opportunities', 'help'];
  }

  const primary = ranked[0][0];
  const intents = [primary];

  // Multi-intent: attach useful companions
  if (primary === 'opportunities' && scores.land > 0) intents.push('land');
  if (primary === 'score' && scores.land > 0) intents.push('land');
  if (primary === 'score' && scores.nearby > 0) intents.push('nearby');
  if (primary === 'land' && scores.score > 0) intents.push('score');
  if (primary === 'nearby') intents.push('score');
  if ((primary === 'opportunities' || primary === 'score') && scores.policy > 0) intents.push('policy');
  if (ranked[1] && ranked[1][1] >= 2 && !intents.includes(ranked[1][0])) {
    intents.push(ranked[1][0]);
  }

  // Always treat pure "help" alone
  if (primary === 'help' && ranked[0][1] >= 3) return ['help'];

  return [...new Set(intents)].slice(0, 4);
}

function detectSector(query = '', session = {}) {
  const norm = normalizeText(query);
  let best = null;
  let bestScore = 0;
  for (const [sector, hints] of Object.entries(SECTOR_HINTS)) {
    const s = scoreIntent(norm, hints);
    if (s > bestScore) {
      bestScore = s;
      best = sector;
    }
  }
  return best || session.sector || 'industrial';
}

function detectDistrict(query = '', session = {}) {
  const norm = normalizeText(query);
  // Longer aliases first so multi-word names win
  const ranked = [...DISTRICT_ALIASES].sort(
    (a, b) => Math.max(...b[1].map((x) => x.length)) - Math.max(...a[1].map((x) => x.length))
  );
  for (const [canonical, aliases] of ranked) {
    for (const a of aliases) {
      if (norm.includes(a)) return canonical;
    }
  }
  // Fuzzy only for longer spellings; same first letter blocks find→jind
  for (const [canonical, aliases] of ranked) {
    for (const a of aliases) {
      if (a.length < 6) continue;
      const tokens = norm.split(/\s+/);
      const hit = tokens.some(
        (t) =>
          t.length >= 5 &&
          t[0] === a[0] &&
          levenshtein(t, a) <= Math.min(2, Math.floor(a.length / 4))
      );
      if (hit) return canonical;
    }
  }
  if (/\b(same|wahi|usi|there|us district)\b/.test(norm) && session.district) {
    return session.district;
  }
  return session.district || '';
}

function parseBudgetInr(query = '', session = {}) {
  const q = normalizeText(query).replace(/,/g, '');
  const crore = q.match(/(\d+(?:\.\d+)?)\s*(?:cr|crore|karod|cror)/);
  if (crore) return Math.round(Number(crore[1]) * 1e7);
  const lakh = q.match(/(\d+(?:\.\d+)?)\s*(?:lakh|lac|lacs|lakhs)/);
  if (lakh) return Math.round(Number(lakh[1]) * 1e5);
  const under = q.match(/(?:under|below|max|upto|up to|within|se kam|tak)\s*(?:rs\s*)?(\d+(?:\.\d+)?)/);
  if (under) {
    const n = Number(under[1]);
    if (n <= 100) return Math.round(n * 1e7); // assume crore when small
    if (n <= 9999) return Math.round(n * 1e5); // assume lakh
    return Math.round(n);
  }
  const plain = q.match(/\b(?:rs|inr)?\s*(\d{6,})\b/);
  if (plain) return Number(plain[1]);
  if (/\b(same budget|usi budget|wahi budget)\b/.test(q) && session.budgetInr) {
    return session.budgetInr;
  }
  return session.budgetInr || null;
}

function parseRisk(query = '') {
  const q = normalizeText(query);
  if (/\b(low risk|safe|conservative)\b/.test(q)) return 'low';
  if (/\b(high risk|aggressive)\b/.test(q)) return 'high';
  if (/\b(medium risk)\b/.test(q)) return 'medium';
  return null;
}

function needsClarification({ intents, district, budgetInr, hasPoint, query }) {
  const primary = intents[0];
  const q = normalizeText(query);
  if (primary === 'opportunities' && !district && !hasPoint && !budgetInr) {
    // Vague shortlist with no anchor — ask once instead of dumping statewide noise
    if (q.split(/\s+/).length <= 5) {
      return {
        needed: true,
        question:
          'Happy to shortlist zones — which Haryana district (e.g. Gurugram, Faridabad, Sonipat), and roughly what land budget in ₹ crore?',
        suggestions: [
          'Best industrial in Gurugram under 5 crore',
          'Top zones near me for warehouse',
          'Faridabad industrial options under 3 cr',
        ],
      };
    }
  }
  if ((primary === 'score' || primary === 'land' || primary === 'nearby') && !hasPoint && !district) {
    return {
      needed: true,
      question:
        'Click a point on the map (or tell me a district / zone name) and I’ll score land ₹, connectivity, and fit.',
      suggestions: [
        'Score this site for industry',
        'Land rate in Gurugram industrial',
        'Best zones in Sonipat',
      ],
    };
  }
  return { needed: false };
}

function extractEntities(query, session = {}, mapState = {}) {
  const hasPoint = Number.isFinite(Number(mapState.lat)) && Number.isFinite(Number(mapState.lng));
  const intents = detectIntents(query, { ...session, hasMapPoint: hasPoint });
  const sector = detectSector(query, session);
  const district = detectDistrict(query, session);
  const budgetInr = parseBudgetInr(query, session);
  const risk = parseRisk(query);
  const clarification = needsClarification({
    intents,
    district,
    budgetInr,
    hasPoint,
    query,
  });

  return {
    raw: String(query || '').trim(),
    normalized: normalizeText(query),
    intents,
    primaryIntent: intents[0] || 'help',
    sector,
    district: district || null,
    budgetInr,
    risk,
    hasPoint,
    clarification,
  };
}

module.exports = {
  extractEntities,
  detectIntents,
  detectSector,
  detectDistrict,
  parseBudgetInr,
  normalizeText,
  DISTRICT_ALIASES,
};
