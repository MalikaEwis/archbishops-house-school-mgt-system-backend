'use strict';

/**
 * fathers.repository.js
 * ──────────────────────
 * Raw SQL for fathers and their qualifications.
 *
 * Tables:
 *   fathers                 – main father record
 *   father_qualifications   – multi-value qualifications (CASCADE on delete)
 */

const { getPool } = require('../../config/database');

// ─── Base SELECT ──────────────────────────────────────────────────────────────

const FATHER_BASE = `
  SELECT
    f.id,
    f.father_no,
    f.full_name,
    f.school_id,
    s.school_name,
    f.registration,
    f.ordination_date,
    f.first_appointment_date,
    f.present_school_appointment_date,
    f.five_year_completion,
    -- Computed: years of service from first_appointment_date to today
    IF(f.first_appointment_date IS NOT NULL,
       TIMESTAMPDIFF(YEAR, f.first_appointment_date, CURDATE()),
       NULL)                         AS total_service_years,
    f.evaluation,
    f.created_at,
    f.updated_at
  FROM fathers f
  LEFT JOIN schools s ON s.id = f.school_id
`;

// ─── findAll ──────────────────────────────────────────────────────────────────

/**
 * Returns all fathers, optionally filtered.
 *
 * @param {{ schoolId?, name? }} filters
 * @returns {Promise<object[]>}
 */
async function findAll(filters = {}) {
  const pool   = getPool();
  const where  = [];
  const params = [];

  if (filters.schoolId) { where.push('f.school_id = ?');   params.push(filters.schoolId); }
  if (filters.name)     { where.push('f.full_name LIKE ?'); params.push(`%${filters.name}%`); }

  const sql = where.length
    ? `${FATHER_BASE} WHERE ${where.join(' AND ')} ORDER BY f.father_no ASC`
    : `${FATHER_BASE} ORDER BY f.father_no ASC`;

  const [rows] = await pool.execute(sql, params);
  return rows;
}

// ─── findById ─────────────────────────────────────────────────────────────────

/**
 * Returns a single father by PK including qualifications.
 *
 * @param {number} id
 * @returns {Promise<object|undefined>}
 */
async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `${FATHER_BASE} WHERE f.id = ? LIMIT 1`,
    [id],
  );
  if (!rows[0]) return undefined;

  const father = rows[0];
  father.qualifications = await findQualifications(id);
  return father;
}

// ─── findQualifications ───────────────────────────────────────────────────────

async function findQualifications(fatherId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT id, qualification FROM father_qualifications WHERE father_id = ? ORDER BY id ASC',
    [fatherId],
  );
  return rows.map(r => r.qualification);
}

// ─── insert ───────────────────────────────────────────────────────────────────

/**
 * Inserts a new father.
 *
 * @param {object} data
 * @returns {Promise<number>} insertId
 */
async function insert(data) {
  const pool = getPool();
  const [result] = await pool.execute(
    `INSERT INTO fathers
       (father_no, full_name, school_id, registration,
        ordination_date, first_appointment_date,
        present_school_appointment_date, five_year_completion, evaluation)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      data.father_no,
      data.full_name,
      data.school_id                       ?? null,
      data.registration                    ?? null,
      data.ordination_date                 ?? null,
      data.first_appointment_date          ?? null,
      data.present_school_appointment_date ?? null,
      data.five_year_completion            ?? null,
      data.evaluation                      ?? null,
    ],
  );
  return result.insertId;
}

// ─── update ───────────────────────────────────────────────────────────────────

/**
 * Dynamic UPDATE — only provided columns are written.
 *
 * @param {number} id
 * @param {object} data
 */
async function update(id, data) {
  const pool    = getPool();
  const allowed = [
    'father_no', 'full_name', 'school_id', 'registration',
    'ordination_date', 'first_appointment_date',
    'present_school_appointment_date', 'five_year_completion', 'evaluation',
  ];

  const sets   = [];
  const params = [];

  for (const col of allowed) {
    if (Object.prototype.hasOwnProperty.call(data, col)) {
      sets.push(`${col} = ?`);
      params.push(data[col]);
    }
  }

  if (!sets.length) return;
  params.push(id);
  await pool.execute(`UPDATE fathers SET ${sets.join(', ')} WHERE id = ?`, params);
}

// ─── remove ───────────────────────────────────────────────────────────────────

/**
 * Hard-deletes a father (qualifications are CASCADE-deleted by the DB).
 *
 * @param {number} id
 * @returns {Promise<boolean>}
 */
async function remove(id) {
  const pool = getPool();
  const [result] = await pool.execute('DELETE FROM fathers WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

// ─── Qualifications ───────────────────────────────────────────────────────────

/**
 * Replaces all qualifications for a father with the provided list.
 *
 * @param {number}   fatherId
 * @param {string[]} qualifications
 * @param {object}   [conn]
 */
async function replaceQualifications(fatherId, qualifications, conn) {
  const db = conn || getPool();
  await db.execute('DELETE FROM father_qualifications WHERE father_id = ?', [fatherId]);

  for (const q of qualifications) {
    await db.execute(
      'INSERT IGNORE INTO father_qualifications (father_id, qualification) VALUES (?, ?)',
      [fatherId, String(q).trim()],
    );
  }
}

module.exports = {
  findAll,
  findById,
  insert,
  update,
  remove,
  replaceQualifications,
};
