'use strict';

/**
 * international.repository.js
 * ────────────────────────────
 * All raw SQL for international_school_teachers and its satellite tables.
 * No business logic — only DB I/O.
 *
 * Tables:
 *   international_school_teachers
 *   international_teacher_phones
 *   international_teacher_contracts
 *   international_teacher_mediums
 *   international_teacher_class_levels
 *   international_teacher_education
 *   international_teacher_professional_qualifications
 *   international_teacher_subjects
 *
 * ⚠  Queries that include BASE_SELECT (which contains nested TIMESTAMPDIFF /
 *    DATE_ADD expressions) MUST use pool.query() (text protocol) — NOT
 *    pool.execute() (binary / prepared-statement protocol).  The binary
 *    protocol raises "Incorrect arguments to mysqld_stmt_execute" for those
 *    expressions.  Simple satellite-table queries can still use execute().
 */

const { getPool } = require('../../config/database');

// ─────────────────────────────────────────────────────────────────────────────
// SELECT helper
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

    -- ── Computed fields ─────────────────────────────────────────────────
    TIMESTAMPDIFF(YEAR, t.date_of_birth, CURDATE())              AS age,
    DATE_ADD(t.date_of_birth, INTERVAL 60 YEAR)                  AS retirement_date,
    TIMESTAMPDIFF(YEAR,  t.date_of_first_appointment, CURDATE()) AS service_years,
    MOD(TIMESTAMPDIFF(MONTH, t.date_of_first_appointment, CURDATE()), 12) AS service_months

  FROM international_school_teachers t
  LEFT JOIN schools s ON s.id = t.school_id
`;

// ─────────────────────────────────────────────────────────────────────────────
// WHERE builder
// ─────────────────────────────────────────────────────────────────────────────

function buildWhere(filters) {
  const clauses = [];
  const params  = [];

  if (filters.isActive === 'all') {
    // no restriction
  } else if (filters.isActive === false || filters.isActive === '0' || filters.isActive === 0) {
    clauses.push('t.is_active = 0');
  } else {
    clauses.push('t.is_active = 1');
  }

  if (filters.schoolId) { clauses.push('t.school_id = ?');      params.push(filters.schoolId); }
  if (filters.tin)      { clauses.push('t.tin LIKE ?');          params.push(`%${filters.tin}%`); }
  if (filters.name)     { clauses.push('t.full_name LIKE ?');    params.push(`%${filters.name}%`); }
  if (filters.category) { clauses.push('t.category = ?');        params.push(filters.category); }

  return { clauses: clauses.length ? clauses : ['1=1'], params };
}

// ─────────────────────────────────────────────────────────────────────────────
// Collection queries
// ─────────────────────────────────────────────────────────────────────────────

async function findAll(filters, { limit = 20, offset = 0 } = {}) {
  const pool                = getPool();
  const { clauses, params } = buildWhere(filters);
  params.push(limit, offset);
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
  const [rows] = await pool.query(
    `${BASE_SELECT} WHERE t.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Insert / Reactivate / Update (main table)
// ─────────────────────────────────────────────────────────────────────────────

async function insertTeacher(data, conn) {
  const db     = conn || getPool();
  const [result] = await db.execute(
    `INSERT INTO international_school_teachers (
       tin_category, tin_school_number, tin_teacher_no_school, tin_teacher_no_global,
       category, full_name, designation, nic,
       religion, address, email,
       date_of_birth, date_of_first_appointment,
       school_id
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      data.tin_category,
      data.tin_school_number,
      data.tin_teacher_no_school,
      data.tin_teacher_no_global,
      data.category,
      data.full_name,
      data.designation         ?? null,
      data.nic                 ?? null,
      data.religion            ?? null,
      data.address             ?? null,
      data.email               ?? null,
      data.date_of_birth,
      data.date_of_first_appointment ?? null,
      data.school_id,
    ],
  );
  return result.insertId;
}

/**
 * Re-activates a vacated TIN row (FR-8 reuse).
 * TIN components stay unchanged — only personal / employment fields are updated.
 */
async function reactivateVacantRow(id, data, conn) {
  const db = conn || getPool();
  await db.execute(
    `UPDATE international_school_teachers SET
       category                    = ?,
       full_name                   = ?,
       designation                 = ?,
       nic                         = ?,
       religion                    = ?,
       address                     = ?,
       email                       = ?,
       date_of_birth               = ?,
       date_of_first_appointment   = ?,
       school_id                   = ?,
       is_active                   = 1,
       removed_at                  = NULL,
       removed_reason              = NULL
     WHERE id = ?`,
    [
      data.category,
      data.full_name,
      data.designation         ?? null,
      data.nic                 ?? null,
      data.religion            ?? null,
      data.address             ?? null,
      data.email               ?? null,
      data.date_of_birth,
      data.date_of_first_appointment ?? null,
      data.school_id,
      id,
    ],
  );
}

/**
 * Dynamic UPDATE — only columns present in `data` are written.
 * TIN components and school_id are never touched.
 */
async function updateTeacher(id, data, conn) {
  const db = conn || getPool();

  const allowed = [
    'category',
    'full_name',
    'designation',
    'nic',
    'date_of_birth',
    'religion',
    'address',
    'email',
    'date_of_first_appointment',
  ];

  const sets   = [];
  const params = [];
  for (const col of allowed) {
    if (Object.prototype.hasOwnProperty.call(data, col)) {
      sets.push(`${col} = ?`);
      params.push(data[col]);
    }
  }
  if (sets.length === 0) return false;

  params.push(id);
  const [result] = await db.execute(
    `UPDATE international_school_teachers SET ${sets.join(', ')} WHERE id = ? AND is_active = 1`,
    params,
  );
  return result.affectedRows > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phones
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

async function setPhones(teacherId, phones, conn) {
  const db = conn || getPool();
  await db.execute('DELETE FROM international_teacher_phones WHERE teacher_id = ?', [teacherId]);
  for (let i = 0; i < phones.length; i++) {
    const p = phones[i];
    await db.execute(
      'INSERT INTO international_teacher_phones (teacher_id, phone_number, phone_type, is_primary) VALUES (?,?,?,?)',
      [teacherId, p.phone_number, p.phone_type || 'Mobile', i === 0 ? 1 : p.is_primary || 0],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Contract
// ─────────────────────────────────────────────────────────────────────────────

async function getContract(teacherId) {
  const pool   = getPool();
  const [rows] = await pool.execute(
    `SELECT id, teacher_id,
            probation_start, probation_end,
            contract_start, contract_end, contract_expiry,
            created_at, updated_at
     FROM international_teacher_contracts
     WHERE teacher_id = ? LIMIT 1`,
    [teacherId],
  );
  return rows[0] ?? null;
}

async function upsertContract(teacherId, contract, conn) {
  const db = conn || getPool();
  await db.execute(
    `INSERT INTO international_teacher_contracts
       (teacher_id, probation_start, probation_end, contract_start, contract_end, contract_expiry)
     VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       probation_start = VALUES(probation_start),
       probation_end   = VALUES(probation_end),
       contract_start  = VALUES(contract_start),
       contract_end    = VALUES(contract_end),
       contract_expiry = VALUES(contract_expiry)`,
    [
      teacherId,
      contract.probation_start ?? null,
      contract.probation_end   ?? null,
      contract.contract_start  ?? null,
      contract.contract_end    ?? null,
      contract.contract_expiry ?? null,
    ],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mediums
// ─────────────────────────────────────────────────────────────────────────────

async function getMediums(teacherId) {
  const pool   = getPool();
  const [rows] = await pool.execute(
    'SELECT medium FROM international_teacher_mediums WHERE teacher_id = ?',
    [teacherId],
  );
  return rows.map((r) => r.medium);
}

async function setMediums(teacherId, mediums, conn) {
  const db = conn || getPool();
  await db.execute('DELETE FROM international_teacher_mediums WHERE teacher_id = ?', [teacherId]);
  for (const medium of mediums) {
    await db.execute(
      'INSERT IGNORE INTO international_teacher_mediums (teacher_id, medium) VALUES (?,?)',
      [teacherId, medium],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Class levels
// ─────────────────────────────────────────────────────────────────────────────

async function getClassLevels(teacherId) {
  const pool   = getPool();
  const [rows] = await pool.execute(
    'SELECT class_level FROM international_teacher_class_levels WHERE teacher_id = ?',
    [teacherId],
  );
  return rows.map((r) => r.class_level);
}

async function setClassLevels(teacherId, levels, conn) {
  const db = conn || getPool();
  await db.execute('DELETE FROM international_teacher_class_levels WHERE teacher_id = ?', [teacherId]);
  for (const level of levels) {
    await db.execute(
      'INSERT IGNORE INTO international_teacher_class_levels (teacher_id, class_level) VALUES (?,?)',
      [teacherId, level],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Education
// ─────────────────────────────────────────────────────────────────────────────

async function getEducation(teacherId) {
  const pool   = getPool();
  const [rows] = await pool.execute(
    'SELECT qualification, other_detail FROM international_teacher_education WHERE teacher_id = ?',
    [teacherId],
  );
  return rows;
}

async function setEducation(teacherId, items, conn) {
  const db = conn || getPool();
  await db.execute('DELETE FROM international_teacher_education WHERE teacher_id = ?', [teacherId]);
  for (const item of items) {
    await db.execute(
      'INSERT IGNORE INTO international_teacher_education (teacher_id, qualification, other_detail) VALUES (?,?,?)',
      [teacherId, item.qualification, item.other_detail ?? null],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Professional qualifications
// ─────────────────────────────────────────────────────────────────────────────

async function getProfessionalQualifications(teacherId) {
  const pool   = getPool();
  const [rows] = await pool.execute(
    'SELECT id, qualification FROM international_teacher_professional_qualifications WHERE teacher_id = ?',
    [teacherId],
  );
  return rows;
}

async function setProfessionalQualifications(teacherId, items, conn) {
  const db = conn || getPool();
  await db.execute(
    'DELETE FROM international_teacher_professional_qualifications WHERE teacher_id = ?',
    [teacherId],
  );
  for (const item of items) {
    await db.execute(
      'INSERT INTO international_teacher_professional_qualifications (teacher_id, qualification) VALUES (?,?)',
      [teacherId, item],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Subjects
// ─────────────────────────────────────────────────────────────────────────────

async function getSubjects(teacherId) {
  const pool   = getPool();
  const [rows] = await pool.execute(
    'SELECT subject FROM international_teacher_subjects WHERE teacher_id = ?',
    [teacherId],
  );
  return rows.map((r) => r.subject);
}

async function setSubjects(teacherId, subjects, conn) {
  const db = conn || getPool();
  await db.execute('DELETE FROM international_teacher_subjects WHERE teacher_id = ?', [teacherId]);
  for (const subject of subjects) {
    await db.execute(
      'INSERT IGNORE INTO international_teacher_subjects (teacher_id, subject) VALUES (?,?)',
      [teacherId, subject],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  // Read
  findAll,
  countAll,
  findById,
  getPhones,
  getContract,
  getMediums,
  getClassLevels,
  getEducation,
  getProfessionalQualifications,
  getSubjects,
  // Write (main table)
  insertTeacher,
  reactivateVacantRow,
  updateTeacher,
  // Write (satellite)
  setPhones,
  upsertContract,
  setMediums,
  setClassLevels,
  setEducation,
  setProfessionalQualifications,
  setSubjects,
};
