/**
 * Plain-language place search: the way people actually name land in Haryana.
 *
 *   "manesar"                  → tehsil, villages, town
 *   "sector 46 gurugram"       → HSVP sector 46 in Gurugram
 *   "plot 379 sector 18"       → that HSVP plot
 *   "hadbast 116"              → the revenue village with that hadbast number
 *   "gurgaon"                  → Gurugram (old names are aliased)
 *
 * Every source table is queried on its own name column (not a concatenation of every
 * column), in parallel, and results are ranked exact > starts-with > contains, so the
 * thing the person typed comes first. Khasra / killa numbers are not in the source data,
 * so they cannot be searched; villages and hadbast numbers are the finest revenue unit.
 */
const { getPool } = require('../db/pool');
const { AppError } = require('../middleware/error.middleware');

const ALIASES = {
  gurgaon: 'gurugram',
  mewat: 'nuh',
  'charkhi dadri': 'charkhi dadri',
  dadri: 'charkhi dadri',
  yamuna: 'yamunanagar',
  jagadhri: 'yamunanagar',
  narnaul: 'mahendragarh',
};

const STOP_WORDS = new Set(['sector', 'sec', 'plot', 'village', 'gaon', 'gram', 'in', 'near', 'the', 'of', 'no', 'number', 'hadbast', 'district', 'tehsil', 'town', 'city']);

const KIND_ZOOM = { district: 10, tehsil: 11, town: 12, village: 13, sector: 15, plot: 17, colony: 15, estate: 14 };

/** Splits a query into a sector number, plot number, hadbast number and free words. */
function parseQuery(raw) {
  const text = String(raw || '')
    .toLowerCase()
    .replace(/[,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const sector = text.match(/\b(?:sector|sec\.?|sect)\s*-?\s*(\d{1,3}[a-z]?)\b/);
  const plot = text.match(/\bplot\s*(?:no\.?\s*)?([a-z]?\d{1,5}[a-z]?)\b/);
  const hadbast = text.match(/\bhadbast\s*(?:no\.?\s*)?(\d{1,5})\b/);
  let words = text
    .replace(/\b(?:sector|sec\.?|sect)\s*-?\s*\d{1,3}[a-z]?\b/, ' ')
    .replace(/\bplot\s*(?:no\.?\s*)?[a-z]?\d{1,5}[a-z]?\b/, ' ')
    .replace(/\bhadbast\s*(?:no\.?\s*)?\d{1,5}\b/, ' ')
    .split(' ')
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
  const originalPhrase = words.join(' ');
  words = words.map((w) => ALIASES[w] || w);
  return {
    text,
    phrase: words.join(' '),
    originalPhrase,
    words,
    sector: sector ? sector[1] : null,
    plot: plot ? plot[1] : null,
    hadbast: hadbast ? hadbast[1] : null,
  };
}

function rank(name, phrase) {
  const n = String(name || '').toLowerCase().trim();
  if (!phrase) return 2;
  if (n === phrase) return 0;
  if (n.startsWith(phrase)) return 1;
  return 2;
}

function titleCase(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

async function safeRows(pool, sql, params) {
  try {
    const { rows } = await pool.query(sql, params);
    return rows;
  } catch (err) {
    console.error('[place-search]', err.message);
    return [];
  }
}

async function searchPlaces(rawQuery, { limit = 12 } = {}) {
  const pool = getPool();
  if (!pool) throw AppError.serviceUnavailable('Database not configured');
  const q = parseQuery(rawQuery);
  if (!q.phrase && !q.sector && !q.plot && !q.hadbast) {
    throw AppError.badRequest('Type a village, town, sector or plot to search');
  }
  // Match both the current and the old name ("gurugram" and "gurgaon"): source tables mix them.
  const likes = [...new Set([`%${q.phrase}%`, `%${q.originalPhrase}%`])];
  const cap = Math.min(25, Math.max(1, Number(limit) || 12));
  const center = 'ST_X(ST_PointOnSurface(geom)) AS lng, ST_Y(ST_PointOnSurface(geom)) AS lat';
  const tasks = [];

  if (q.phrase && !q.sector && !q.plot) {
    tasks.push(
      safeRows(
        pool,
        `SELECT 'district' AS kind, n_d_name AS name, NULL AS sub, n_d_name AS district, NULL AS tehsil, ${center}
         FROM district_boundary WHERE n_d_name ILIKE ANY($1) LIMIT 5`,
        [likes]
      ),
      safeRows(
        pool,
        `SELECT 'tehsil' AS kind, n_t_name AS name, n_d_name AS sub, n_d_name AS district, n_t_name AS tehsil, ${center}
         FROM tehsil_boundary WHERE n_t_name ILIKE ANY($1) LIMIT 8`,
        [likes]
      ),
      safeRows(
        pool,
        `SELECT 'town' AS kind, mc_name AS name, mc_type AS sub, NULL AS district, NULL AS tehsil, ${center}
         FROM municipal_boundary WHERE mc_name ILIKE ANY($1) LIMIT 6`,
        [likes]
      ),
      safeRows(
        pool,
        `SELECT 'village' AS kind, n_v_name AS name,
                concat_ws(' · ', n_t_name, n_d_name, CASE WHEN hadbast_no IS NOT NULL THEN 'Hadbast ' || hadbast_no END) AS sub,
                n_d_name AS district, n_t_name AS tehsil, ${center}
         FROM village_boundary WHERE n_v_name ILIKE ANY($1)
         ORDER BY (lower(n_v_name) = $2) DESC, (lower(n_v_name) LIKE $2 || '%') DESC, length(n_v_name)
         LIMIT 12`,
        [likes, q.phrase]
      ),
      safeRows(
        pool,
        `SELECT 'colony' AS kind,
                concat_ws(', ', NULLIF(trim(developer), ''), CASE WHEN trim(sector_no) <> '' THEN 'Sector ' || trim(sector_no) END) AS name,
                concat_ws(' · ', trim(purpose), trim(town), trim(dist_name)) AS sub, trim(dist_name) AS district, NULL AS tehsil, ${center}
         FROM licensed_colony WHERE developer ILIKE ANY($1) OR town ILIKE ANY($1) LIMIT 6`,
        [likes]
      )
    );
  }

  if (q.hadbast) {
    tasks.push(
      safeRows(
        pool,
        `SELECT 'village' AS kind, n_v_name AS name,
                concat_ws(' · ', n_t_name, n_d_name, 'Hadbast ' || hadbast_no) AS sub, n_d_name AS district, n_t_name AS tehsil, ${center}
         FROM village_boundary
         WHERE trim(hadbast_no) = $1 AND ($2 = '' OR n_t_name ILIKE ANY($3) OR n_d_name ILIKE ANY($3))
         LIMIT 10`,
        [q.hadbast, q.phrase, likes]
      )
    );
  }

  if (q.sector || q.plot) {
    // HSVP sector values are free text ("46", "Sector 9", "Sector-10 (A)"): match the number
    // as a whole token so "sector 4" does not also return 46.
    const sectorRe = q.sector ? `(^|[^0-9])${q.sector}([^0-9]|$)` : null;
    const placeSql = (n) => (q.phrase ? `AND (district ILIKE ANY($${n}) OR estate ILIKE ANY($${n}))` : '');
    // Sector values sometimes repeat the word ("Sector-18"); show just "Sector 18".
    const sectorLabel = "regexp_replace(trim(sector), '^sector[\\s-]*', '', 'i')";
    if (q.plot) {
      tasks.push(
        safeRows(
          pool,
          `SELECT 'plot' AS kind,
                  concat('Plot ', trim(plot_no), CASE WHEN sector IS NOT NULL THEN ', Sector ' || ${sectorLabel} END) AS name,
                  concat_ws(' · ', estate, district, CASE WHEN area_yard IS NOT NULL THEN area_yard || ' sq yd' END) AS sub,
                  district, NULL AS tehsil, ${center}
           FROM hsvp_plots
           WHERE lower(trim(plot_no)) = $1 AND ($2::text IS NULL OR sector ~* $2) ${placeSql(3)}
           LIMIT 10`,
          q.phrase ? [q.plot.toLowerCase(), sectorRe, likes] : [q.plot.toLowerCase(), sectorRe]
        )
      );
    } else {
      tasks.push(
        safeRows(
          pool,
          `SELECT 'sector' AS kind, concat('Sector ', ${sectorLabel}) AS name,
                  concat_ws(' · ', estate, district, count(*) || ' plots') AS sub,
                  district, NULL AS tehsil,
                  ST_X(ST_Centroid(ST_Extent(geom)::geometry)) AS lng,
                  ST_Y(ST_Centroid(ST_Extent(geom)::geometry)) AS lat
           FROM hsvp_plots
           WHERE sector ~* $1 ${placeSql(2)}
           GROUP BY sector, estate, district
           ORDER BY count(*) DESC
           LIMIT 10`,
          q.phrase ? [sectorRe, likes] : [sectorRe]
        )
      );
    }
  }

  const rows = (await Promise.all(tasks)).flat();
  const seen = new Set();
  const results = [];
  for (const r of rows) {
    if (!Number.isFinite(Number(r.lng)) || !Number.isFinite(Number(r.lat)) || !r.name) continue;
    const key = `${r.kind}|${String(r.name).toLowerCase()}|${String(r.sub || '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      kind: r.kind,
      name: r.kind === 'district' || r.kind === 'tehsil' || r.kind === 'village' ? titleCase(r.name) : String(r.name).trim(),
      subtitle: r.sub ? String(r.sub).replace(/\s+/g, ' ').trim() : '',
      district: r.district ? titleCase(String(r.district).toLowerCase() === 'gurgaon' ? 'gurugram' : r.district) : null,
      tehsil: r.tehsil ? titleCase(r.tehsil) : null,
      lng: Number(r.lng),
      lat: Number(r.lat),
      zoom: KIND_ZOOM[r.kind] || 13,
      score: Math.min(rank(r.name, q.phrase), rank(r.name, q.originalPhrase)),
    });
  }

  const kindOrder = { plot: 0, sector: 1, district: 2, tehsil: 3, town: 4, village: 5, colony: 6 };
  results.sort((a, b) => a.score - b.score || (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9) || a.name.length - b.name.length);
  return { query: String(rawQuery || ''), parsed: q, count: Math.min(cap, results.length), places: results.slice(0, cap) };
}

module.exports = { searchPlaces, parseQuery };
