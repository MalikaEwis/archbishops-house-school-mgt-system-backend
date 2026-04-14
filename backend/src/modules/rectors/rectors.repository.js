'use strict';

/**
 * rectors.repository.js
 * ──────────────────────
 * Raw SQL for rectors and their qualifications.
 *
 * Tables:
 *   rectors                 – main rector record
 *   rector_qualifications   – multi-value qualifications (child, CASCADE on delete)
 */

const { getPool } = require('../../config/database');

// ─── Base SELECT ──────────────────────────────────────────────────────────────

const RECTOR_BASE = `
  SELECT
    r.id,
    r.rector_no,
    r.full_name,
    r.present_school_id,
    s.school_name           AS present_school_name,
    r.registration_status,
    r.date_of_birth,
    r.first_appointment_date,
    r.appointment_to_present_school,
    -- retirement_date stored directly (no computed fallback for rectors)
    r.retirement_date,
    r.created_at,
    r.updated_at
  FROM rectors r
  LEFT JOIN schools s ON s.id = r.present_school_id
`;

// ─── findAll ──────────────────────────────────────────────────────────────────

/**
 * Returns all rectors, optionally filtered.
 *
 * @param {{ schoolId?, name?, registrationStatus? }} filters
 * @returns {Promise<object[]>}
 */
async function findAll(filters = {}) {
  const pool   = getPool();
  const where  = [];
  const params = [];

  if (filters.schoolId)           { where.push('r.present_school_id = ?');   params.push(filters.schoolId); }
  if (filters.name)               { where.push('r.full_name LIKE ?');         params.push(`%${filters.name}%`); }
  if (filters.registrationStatus) { where.push('r.registration_status = ?'); params.push(filters.registrationStatus); }

  const sql = where.length
    ? `${RECTOR_BASE} WHERE ${where.join(' AND ')} ORDER BY r.rector_no ASC`
    : `${RECTOR_BASE} ORDER BY r.rector_no ASC`;

  const [rows] = await pool.execute(sql, params);
  return rows;
}

// ─── findById ─────────────────────────────────────────────────────────────────

/**
 * Returns a single rector by PK, including their qualifications array.
 *
 * @param {number} id
 * @returns {Promise<object|undefined>}
 */
async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `${RECTOR_BASE} WHERE r.id = ? LIMIT 1`,
    [id],
  );
  if (!rows[0]) return undefined;

  const rector = rows[0];
  rector.qualifications = await findQualifications(id);
  return rector;
}

// ─── findQualifications ───────────────────────────────────────────────────────

async function findQualifications(rectorId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT id, qualification FROM rector_qualifications WHERE rector_id = ? ORDER BY id ASC',
    [rectorId],
  );
  return rows.map(r => r.qualification);
}

// ─── insert ───────────────────────────────────────────────────────────────────

/**
 * Inserts a new rector.
 *
 * @param {object} data
 * @returns {Promise<number>} insertId
 */
async function insert(data) {
  const pool = getPool();
  const [result] = await pool.execute(
    `INSERT INTO rectors
       (rector_no, full_name, present_school_id, registration_status,
        date_of_birth, first_appointment_date,
        appointment_to_present_school, retirement_date)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      data.rector_no,
      data.full_name,
      data.present_school_id             ?? null,
      data.registration_status           ?? 'Pending',
      data.date_of_birth                 ?? null,
      data.first_appointment_date        ?? null,
      data.appointment_to_present_school ?? null,
      data.retirement_date               ?? null,
    ],
  );
  return result.insertId;
}

// ─── update ───────────────────────────────────────────────────────────────────

/**
 * Dynamic UPDATE — only touched columns are written.
 *
 * @param {number} id
 * @param {object} data
 */
async function update(id, data) {
  const pool    = getPool();
  const allowed = [
    'rector_no', 'full_name', 'present_school_id', 'registration_status',
    'date_of_birth', 'first_appointment_date',
    'appointment_to_present_school', 'retirement_date',
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
  await pool.execute(`UPDATE rectors SET ${sets.join(', ')} WHERE id = ?`, params);
}

// ─── remove ───────────────────────────────────────────────────────────────────

/**
 * Hard-deletes a rector (qualifications are CASCADE-deleted by the DB).
 *
 * @param {number} id
 * @returns {Promise<boolean>}
 */
async function remove(id) {
  const pool = getPool();
  const [result] = await pool.execute('DELETE FROM rectors WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

// ─── Qualifications ───────────────────────────────────────────────────────────

/**
 * Replaces all qualifications for a rector with the provided list.
 * Runs inside a transaction if conn is passed; otherwise uses pool directly.
 *
 * @param {number}   rectorId
 * @param {string[]} qualifications
 * @param {object}   [conn]
 */
async function replaceQualifications(rectorId, qualifications, conn) {
  const db = conn || getPool();
  await db.execute('DELETE FROM rector_qualifications WHERE rector_id = ?', [rectorId]);

  for (const q of qualifications) {
    await db.execute(
      'INSERT IGNORE INTO rector_qualifications (rector_id, qualification) VALUES (?, ?)',
      [rectorId, String(q).trim()],
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
