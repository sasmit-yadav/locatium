const { getPool } = require('../db/pool');

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
}

async function retrievePolicyContext({ sector, keywords = [], limit = 3 }) {
  const pool = getPool();
  if (!pool) return [];

  const sectorNorm = (sector || 'industrial').trim().toLowerCase();
  const searchTerms = [...new Set([...keywords, sectorNorm, 'clu', 'eia', 'hsiidc', 'hvpnl'])];

  try {
    const { rows } = await pool.query(
      `SELECT doc_key, title, authority, excerpt, citation, sector_tags, keywords
       FROM policy_documents
       ORDER BY id`
    );

    const scored = rows
      .map((row) => {
        const hay = `${row.title} ${row.excerpt} ${(row.keywords || []).join(' ')}`.toLowerCase();
        let score = 0;
        for (const term of searchTerms) {
          if (hay.includes(term)) score += 2;
        }
        if ((row.sector_tags || []).map((s) => s.toLowerCase()).includes(sectorNorm)) score += 3;
        return { ...row, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored.map((r) => ({
      docKey: r.doc_key,
      title: r.title,
      authority: r.authority,
      excerpt: r.excerpt,
      citation: r.citation,
    }));
  } catch {
    return [];
  }
}

module.exports = { retrievePolicyContext, tokenize };
