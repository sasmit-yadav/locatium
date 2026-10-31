/**
 * Durable Ask LOCATIUM session memory. Complements the client-held session object.
 */

const { getPool } = require('../db/pool');

async function load(userId) {
  const pool = getPool();
  if (!pool || !userId) return null;
  try {
    const { rows } = await pool.query(
      `SELECT session, updated_at FROM assistant_memories WHERE user_id = $1`,
      [userId]
    );
    return rows[0]?.session || null;
  } catch (err) {
    if (err.code === '42P01') return null;
    throw err;
  }
}

async function save(userId, session) {
  const pool = getPool();
  if (!pool || !userId || !session || typeof session !== 'object') return;
  try {
    await pool.query(
      `
        INSERT INTO assistant_memories (user_id, session, updated_at)
        VALUES ($1, $2::jsonb, now())
        ON CONFLICT (user_id)
        DO UPDATE SET session = EXCLUDED.session, updated_at = now()
      `,
      [userId, JSON.stringify(session)]
    );
  } catch (err) {
    if (err.code === '42P01') return;
    throw err;
  }
}

async function clear(userId) {
  const pool = getPool();
  if (!pool || !userId) return { ok: true };
  try {
    await pool.query(`DELETE FROM assistant_memories WHERE user_id = $1`, [userId]);
    return { ok: true };
  } catch (err) {
    if (err.code === '42P01') return { ok: true };
    throw err;
  }
}

module.exports = { load, save, clear };
