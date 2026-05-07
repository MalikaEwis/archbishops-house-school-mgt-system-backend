'use strict';

/**
 * international.repository.js
 * ────────────────────────────
 * Raw SQL for the international_school_teachers module and its
 * satellite tables.  No business logic lives here — only DB I/O.
 *
 * Tables touched:
 *   international_school_teachers
 *   international_teacher_phones
 *   international_teacher_contracts
 */

const { getPool } = require('../../config/database');

// ─────────────────────────────────────────────────────────────────────────────
// SELECT helpers
// ─────────────────────────────────────────────────────────────────────────────

const BASE_SELECT = `
  SELECT
    t.id,
    t.tin,
    t.tin_category,
    t.tin_school_number,
    t.tin_teacher_no_school,
    t.tin_teacher_no_global,
    t.category,
    t.full_name,
    t.designation,
    t.nic,
    t.religion,
    t.address,
    t.email,
    t.date_of_birth,
    t.date_of_first_appointment,
    t.school_id,
    t.is_active,
    t.removed_at,
    t.removed_reason,
    t.created_at,
    t.updated_at,
    s.school_name,
    s.school_index,

    -- ── Computed fields ───────────────────────────────────────
    TIMESTAMPDIFF(YEAR, t.date_of_birth, CURDATE())              AS age,
    DATE_ADD(t.date_of_birth, INTERVAL 60 YEAR)                  AS retirement_date,
    TIMESTAMPDIFF(YEAR,  t.date_of_first_appointment, CURDATE()) AS service_years,
    MOD(TIMESTAMPDIFF(MONTH, t.date_of_first_appointment, CURDATE()), 12) AS service_months

  FROM international_school_teachers t
  LEFT JOIN schools s ON s.id = t.school_id
`;

/**
 * Builds WHERE clauses and bound parameters from a filters object.
 * Returns { clauses: string[], params: any[] } — the caller joins clauses
 * and appends any extra params (e.g. LIMIT/OFFSET) before executing.
 *
 * NOTE: all queries that include BASE_SELECT (which contains nested
 * TIMESTAMPDIFF / DATE_ADD expressions) MUST use pool.query() (text
 * protocol) rather than pool.execute() (binary/prepared-statement protocol).
 * The binary protocol raises "Incorrect arguments to mysqld_stmt_execute"
 * for complex computed column expressions — same constraint as the private
 * teachers module.
 *
 * @param {{ schoolId?, tin?, name?, category?, isActive? }} filters
 * @returns {{ clauses: string[], params: any[] }}
 */
function buildWhere(filters) {
  const clauses = [];
  const params  = [];

  // isActive filter (evaluated first to match private module ordering)
  if (filters.isActive === 'all') {
    // include both active and removed — no clause added
  } else if (
    filters.isActive === false ||
    filters.isActive === '0'   ||
    filters.isActive === 0
  ) {
    clauses.push('t.is_active = 0');
  } else {
    clauses.push('t.is_active = 1');
  }

  if (filters.schoolId) {
    clauses.push('t.school_id = ?');
    params.push(filters.schoolId);
  }
  if (filters.tin) {
    clauses.push('t.tin LIKE ?');
    params.push(`%${filters.tin}%`);
  }
  if (filters.name) {
    clauses.push('t.full_name LIKE ?');
    params.push(`%${filters.name}%`);
  }
  if (filters.category) {
    clauses.push('t.category = ?');
    params.push(filters.category);
  }

  return { clauses: clauses.length ? clauses : ['1=1'], params };
}

// ─────────────────────────────────────────────────────────────────────────────
// Collection queries
// ─────────────────────────────────────────────────────────────────────────────

async function findAll(filters, { limit = 20, offset = 0 } = {}) {
  const pool                  = getPool();
  const { clauses, params }   = buildWhere(filters);

  // LIMIT and OFFSET appended last so positional params align
  params.push(limit, offset);

  // pool.query() (text protocol) — see buildWhere comment above
  const [rows] = await pool.query(
    `${BASE_SELECT} WHERE ${clauses.join(' AND ')} ORDER BY t.full_name ASC LIMIT ? OFFSET ?`,
    params,
  );
  return rows;
}

async function countAll(filters) {
  const pool                = getPool();
  const { clauses, params } = buildWhere(filters);

  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM international_school_teachers t
     LEFT JOIN schools s ON s.id = t.school_id
     WHERE ${clauses.join(' AND ')}`,
    params,
  );
  return Number(rows[0].total);
}

// ─────────────────────────────────────────────────────────────────────────────
// Single-resource queries
// ─────────────────────────────────────────────────────────────────────────────

async function findById(id) {
  const pool   = getPool();
  // pool.query() (text protocol) — see buildWhere comment above
  const [rows] = await pool.query(
    `${BASE_SELECT} WHERE t.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Satellite data
// ─────────────────────────────────────────────────────────────────────────────

async function getPhones(teacherId) {
  const pool   = getPool();
  const [rows] = await pool.execute(
    `SELECT id, phone_number, phone_type, is_primary
     FROM international_teacher_phones
     WHERE teacher_id = ?
     ORDER BY is_primary DESC`,
    [teacherId],
  );
  return rows;
}

async function getContract(teacherId) {
  const pool   = getPool();
  const [rows] = await pool.execute(
    `SELECT id, teacher_id,
            probation_start, probation_end,
            contract_start, contract_end, contract_expiry,
            created_at, updated_at
     FROM international_teacher_contracts
     WHERE teacher_id = ?
     LIMIT 1`,
    [teacherId],
  );
  return rows[0] ?? null;
}

module.exports = { findAll, countAll, findById, getPhones, getContract };
