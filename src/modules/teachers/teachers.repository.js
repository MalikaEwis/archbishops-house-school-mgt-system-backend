"use strict";

/**
 * teachers.repository.js
 * ──────────────────────
 * All raw SQL for the private_school_teachers module and its
 * satellite tables.  No business logic lives here — only DB I/O.
 *
 * Tables touched:
 *   private_school_teachers
 *   private_teacher_phones
 *   private_teacher_contracts
 *   private_teacher_mediums
 *   private_teacher_class_levels
 *   private_teacher_education
 *   private_teacher_professional_qualifications
 *   private_teacher_subjects
 *   teacher_removal_approvals
 */

const { getPool } = require("../../config/database");

// ─────────────────────────────────────────────────────────────────────────────
// SELECT helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the base SELECT with computed fields (age, service, retirement).
 * Used by both findAll and findById so the shape is always identical.
 */
const BASE_SELECT = `
  SELECT
    t.id,
    t.tin,
    t.tin_category,
    t.tin_school_number,
    t.tin_teacher_no_school,
    t.tin_teacher_no_global,
    t.present_category,
    t.full_name,
    t.nic,
    t.gender,
    t.date_of_birth,
    t.religion,
    t.home_address,
    t.email,
    t.date_of_first_appointment,
    t.service_status,
    t.confirmation_letter_status,
    t.ssp_status,
    t.dcett_status,
    t.selection_test_attempt1,
    t.selection_test_attempt2,
    t.selection_test_attempt3,
    t.profile_picture_path,
    t.school_id,
    t.is_active,
    t.removed_at,
    t.removed_reason,
    t.created_at,
    t.updated_at,
    s.school_name,
    s.school_index,

    -- ── Computed fields (never stored) ───────────────────────
    TIMESTAMPDIFF(YEAR, t.date_of_birth, CURDATE()) AS age,

    DATE_ADD(t.date_of_birth, INTERVAL 60 YEAR)     AS retirement_date,

    TIMESTAMPDIFF(
      YEAR,
      CURDATE(),
      DATE_ADD(t.date_of_birth, INTERVAL 60 YEAR)
    )                                                AS retiring_in_years,

    MOD(TIMESTAMPDIFF(
      MONTH,
      CURDATE(),
      DATE_ADD(t.date_of_birth, INTERVAL 60 YEAR)
    ), 12)                                           AS retiring_in_months,

    DATEDIFF(
      DATE_ADD(t.date_of_birth, INTERVAL 60 YEAR),
      DATE_ADD(
        CURDATE(),
        INTERVAL TIMESTAMPDIFF(
          MONTH, CURDATE(), DATE_ADD(t.date_of_birth, INTERVAL 60 YEAR)
        ) MONTH
      )
    )                                                AS retiring_in_days,

    TIMESTAMPDIFF(YEAR,  t.date_of_first_appointment, CURDATE()) AS service_years,
    MOD(TIMESTAMPDIFF(MONTH, t.date_of_first_appointment, CURDATE()), 12) AS service_months,
    DATEDIFF(
      CURDATE(),
      DATE_ADD(
        t.date_of_first_appointment,
        INTERVAL TIMESTAMPDIFF(MONTH, t.date_of_first_appointment, CURDATE()) MONTH
      )
    )                                                AS service_days,

    TIMESTAMPDIFF(
      YEAR,
      t.date_of_first_appointment,
      DATE_ADD(t.date_of_birth, INTERVAL 60 YEAR)
    )                                                AS service_at_retirement_years

  FROM private_school_teachers t
  JOIN schools s ON s.id = t.school_id
`;

// ─────────────────────────────────────────────────────────────────────────────
// findAll
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shared WHERE builder for list queries.
 * @param {{ schoolId, tin, name, category }} filters
 * @returns {{ clauses: string[], params: any[] }}
 */
function buildWhere(filters) {
  const clauses = [];
  const params  = [];

  // isActive filter:
  //   undefined / true / '1' → active only (default)
  //   false / '0' / 0        → removed only
  //   'all'                  → no restriction
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
    clauses.push('t.tin = ?');
    params.push(filters.tin);
  }
  if (filters.name) {
    clauses.push('t.full_name LIKE ?');
    params.push(`%${filters.name}%`);
  }
  if (filters.category) {
    clauses.push('t.present_category = ?');
    params.push(Number(filters.category));
  }

  return { clauses: clauses.length ? clauses : ['1=1'], params };
}

/**
 * Counts active teachers matching the given filters.
 *
 * @param {{ schoolId, tin, name, category }} filters
 * @returns {Promise<number>}
 */
async function countAll(filters) {
  const pool = getPool();
  const { clauses, params } = buildWhere(filters);

  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM private_school_teachers t
     WHERE ${clauses.join(" AND ")}`,
    params,
  );
  return Number(rows[0].total);
}

/**
 * Returns a paginated list of active teachers, optionally filtered.
 *
 * @param {{ schoolId, tin, name, category }} filters
 * @param {{ limit: number, offset: number }} pagination
 * @returns {Promise<object[]>}
 */
async function findAll(filters, { limit = 20, offset = 0 } = {}) {
  const pool = getPool();
  const { clauses, params } = buildWhere(filters);

  // LIMIT and OFFSET appended last so positional params align
  params.push(limit, offset);

  const sql = `${BASE_SELECT} WHERE ${clauses.join(" AND ")} ORDER BY t.full_name ASC LIMIT ? OFFSET ?`;
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// findById
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a single teacher row (active or removed) by primary key.
 *
 * @param {number} id
 * @returns {Promise<object|undefined>}
 */
async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.execute(`${BASE_SELECT} WHERE t.id = ? LIMIT 1`, [
    id,
  ]);
  return rows[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// TIN generation helpers (FR-5 to FR-11)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Finds the lowest teacher_no_school that was previously vacated
 * (is_active = 0) for the given school + category combination.
 * Returns the row if found, otherwise undefined.
 *
 * FR-8: System shall reuse pre-existing blank TIN rows.
 *
 * @param {number} tinCategory
 * @param {number} schoolNumber
 * @returns {Promise<object|undefined>}
 */
async function findVacantTinRow(tinCategory, schoolNumber) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id, tin_teacher_no_school, tin_teacher_no_global
     FROM private_school_teachers
     WHERE tin_category    = ?
       AND tin_school_number = ?
       AND is_active        = 0
     ORDER BY tin_teacher_no_school ASC
     LIMIT 1`,
    [tinCategory, schoolNumber],
  );
  return rows[0];
}

/**
 * Returns the next available teacher_no_school for a school+category.
 * Scans only active rows within that school.
 *
 * @param {number} tinCategory
 * @param {number} schoolNumber
 * @returns {Promise<number>}
 */
async function nextTeacherNoInSchool(tinCategory, schoolNumber) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT COALESCE(MAX(tin_teacher_no_school), 0) + 1 AS next_no
     FROM private_school_teachers
     WHERE tin_category     = ?
       AND tin_school_number = ?`,
    [tinCategory, schoolNumber],
  );
  return rows[0].next_no;
}

/**
 * Returns the next available teacher_no_global across the entire table
 * for the given category.
 *
 * FR-11: Teacher numbers shall be generated by scanning full database.
 *
 * @param {number} tinCategory
 * @returns {Promise<number>}
 */
async function nextTeacherNoGlobal(tinCategory) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT COALESCE(MAX(tin_teacher_no_global), 0) + 1 AS next_no
     FROM private_school_teachers
     WHERE tin_category = ?`,
    [tinCategory],
  );
  return rows[0].next_no;
}

// ─────────────────────────────────────────────────────────────────────────────
// insert / update / soft-delete (main table)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inserts a new teacher row.
 * Returns the insertId.
 *
 * @param {object} data
 * @param {object} conn  - mysql2 connection (for transaction support)
 * @returns {Promise<number>}
 */
async function insertTeacher(data, conn) {
  const db = conn || getPool();
  const [result] = await db.execute(
    `INSERT INTO private_school_teachers (
       tin_category, tin_school_number, tin_teacher_no_school, tin_teacher_no_global,
       present_category, full_name, nic, gender, date_of_birth,
       religion, home_address, email,
       date_of_first_appointment, service_status, confirmation_letter_status,
       ssp_status, dcett_status,
       selection_test_attempt1, selection_test_attempt2, selection_test_attempt3,
       profile_picture_path, school_id
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      data.tin_category,
      data.tin_school_number,
      data.tin_teacher_no_school,
      data.tin_teacher_no_global,
      data.present_category,
      data.full_name,
      data.nic,
      data.gender,
      data.date_of_birth,
      data.religion ?? null,
      data.home_address ?? null,
      data.email ?? null,
      data.date_of_first_appointment ?? null,
      data.service_status ?? 0,
      data.confirmation_letter_status ?? "Pending",
      data.ssp_status ?? "Not_Completed",
      data.dcett_status ?? "Not_Completed",
      data.selection_test_attempt1 ?? null,
      data.selection_test_attempt2 ?? null,
      data.selection_test_attempt3 ?? null,
      data.profile_picture_path ?? null,
      data.school_id,
    ],
  );
  return result.insertId;
}

/**
 * Re-activates a vacant TIN row by filling in the new teacher's data.
 * Only updates non-TIN fields (TIN components stay unchanged — FR-8).
 *
 * @param {number} id  - existing row id of the vacant slot
 * @param {object} data
 * @param {object} conn
 * @returns {Promise<void>}
 */
async function reactivateVacantRow(id, data, conn) {
  const db = conn || getPool();
  await db.execute(
    `UPDATE private_school_teachers SET
       present_category            = ?,
       full_name                   = ?,
       nic                         = ?,
       gender                      = ?,
       date_of_birth               = ?,
       religion                    = ?,
       home_address                = ?,
       email                       = ?,
       date_of_first_appointment   = ?,
       service_status              = ?,
       confirmation_letter_status  = ?,
       ssp_status                  = ?,
       dcett_status                = ?,
       selection_test_attempt1     = ?,
       selection_test_attempt2     = ?,
       selection_test_attempt3     = ?,
       profile_picture_path        = ?,
       school_id                   = ?,
       is_active                   = 1,
       removed_at                  = NULL,
       removed_reason              = NULL
     WHERE id = ?`,
    [
      data.present_category,
      data.full_name,
      data.nic,
      data.gender,
      data.date_of_birth,
      data.religion ?? null,
      data.home_address ?? null,
      data.email ?? null,
      data.date_of_first_appointment ?? null,
      data.service_status ?? 0,
      data.confirmation_letter_status ?? "Pending",
      data.ssp_status ?? "Not_Completed",
      data.dcett_status ?? "Not_Completed",
      data.selection_test_attempt1 ?? null,
      data.selection_test_attempt2 ?? null,
      data.selection_test_attempt3 ?? null,
      data.profile_picture_path ?? null,
      data.school_id,
      id,
    ],
  );
}

/**
 * Updates mutable fields on an active teacher.
 * TIN components are never touched here.
 *
 * @param {number} id
 * @param {object} data  - only the fields present in data are updated
 * @param {object} conn
 * @returns {Promise<boolean>} true if a row was changed
 */
async function updateTeacher(id, data, conn) {
  const db = conn || getPool();

  // Build dynamic SET clause from provided fields
  const allowed = [
    "present_category",
    "full_name",
    "nic",
    "gender",
    "date_of_birth",
    "religion",
    "home_address",
    "email",
    "date_of_first_appointment",
    "service_status",
    "confirmation_letter_status",
    "ssp_status",
    "dcett_status",
    "selection_test_attempt1",
    "selection_test_attempt2",
    "selection_test_attempt3",
    "profile_picture_path",
    "school_id",
  ];

  const sets = [];
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
    `UPDATE private_school_teachers SET ${sets.join(", ")} WHERE id = ? AND is_active = 1`,
    params,
  );
  return result.affectedRows > 0;
}

/**
 * Soft-deletes a teacher: clears all personal data, preserves TIN (FR-19).
 *
 * @param {number} id
 * @param {string} reason
 * @param {object} conn
 * @returns {Promise<void>}
 */
async function softDeleteTeacher(id, reason, conn) {
  const db = conn || getPool();
  await db.execute(
    `UPDATE private_school_teachers SET
       present_category            = NULL,
       full_name                   = NULL,
       nic                         = NULL,
       gender                      = NULL,
       date_of_birth               = NULL,
       religion                    = NULL,
       home_address                = NULL,
       email                       = NULL,
       date_of_first_appointment   = NULL,
       service_status              = 0,
       confirmation_letter_status  = 'Pending',
       ssp_status                  = 'Not_Completed',
       dcett_status                = 'Not_Completed',
       selection_test_attempt1     = NULL,
       selection_test_attempt2     = NULL,
       selection_test_attempt3     = NULL,
       profile_picture_path        = NULL,
       is_active                   = 0,
       removed_at                  = NOW(),
       removed_reason              = ?
     WHERE id = ?`,
    [reason, id],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Satellite tables — phones
// ─────────────────────────────────────────────────────────────────────────────

async function getPhones(teacherId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    "SELECT id, phone_number, phone_type, is_primary FROM private_teacher_phones WHERE teacher_id = ? ORDER BY is_primary DESC",
    [teacherId],
  );
  return rows;
}

/**
 * Replaces all phone numbers for a teacher.
 * phones = [{ phone_number, phone_type?, is_primary? }]
 *
 * @param {number} teacherId
 * @param {Array}  phones
 * @param {object} conn
 */
async function setPhones(teacherId, phones, conn) {
  const db = conn || getPool();
  await db.execute("DELETE FROM private_teacher_phones WHERE teacher_id = ?", [
    teacherId,
  ]);

  for (let i = 0; i < phones.length; i++) {
    const p = phones[i];
    await db.execute(
      "INSERT INTO private_teacher_phones (teacher_id, phone_number, phone_type, is_primary) VALUES (?,?,?,?)",
      [
        teacherId,
        p.phone_number,
        p.phone_type || "Mobile",
        i === 0 ? 1 : p.is_primary || 0,
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Satellite tables — contracts
// ─────────────────────────────────────────────────────────────────────────────

async function getContract(teacherId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT
       contract_6month_start, contract_6month_end,
       contract_2nd_start,    contract_2nd_end,
       contract_3rd_start,    contract_3rd_end, contract_3rd_expiry
     FROM private_teacher_contracts WHERE teacher_id = ? LIMIT 1`,
    [teacherId],
  );
  return rows[0] || null;
}

/**
 * Upserts the contract record for a teacher (one row per teacher).
 *
 * @param {number} teacherId
 * @param {object} contract
 * @param {object} conn
 */
async function upsertContract(teacherId, contract, conn) {
  const db = conn || getPool();
  await db.execute(
    `INSERT INTO private_teacher_contracts
       (teacher_id,
        contract_6month_start, contract_6month_end,
        contract_2nd_start, contract_2nd_end,
        contract_3rd_start, contract_3rd_end, contract_3rd_expiry)
     VALUES (?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       contract_6month_start = VALUES(contract_6month_start),
       contract_6month_end   = VALUES(contract_6month_end),
       contract_2nd_start    = VALUES(contract_2nd_start),
       contract_2nd_end      = VALUES(contract_2nd_end),
       contract_3rd_start    = VALUES(contract_3rd_start),
       contract_3rd_end      = VALUES(contract_3rd_end),
       contract_3rd_expiry   = VALUES(contract_3rd_expiry)`,
    [
      teacherId,
      contract.contract_6month_start ?? null,
      contract.contract_6month_end ?? null,
      contract.contract_2nd_start ?? null,
      contract.contract_2nd_end ?? null,
      contract.contract_3rd_start ?? null,
      contract.contract_3rd_end ?? null,
      contract.contract_3rd_expiry ?? null,
    ],
  );
}

async function deleteContract(teacherId, conn) {
  const db = conn || getPool();
  await db.execute(
    "DELETE FROM private_teacher_contracts WHERE teacher_id = ?",
    [teacherId],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Satellite tables — qualifications (mediums, class levels, education, professional, subjects)
// ─────────────────────────────────────────────────────────────────────────────

async function getMediums(teacherId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    "SELECT medium FROM private_teacher_mediums WHERE teacher_id = ?",
    [teacherId],
  );
  return rows.map((r) => r.medium);
}

async function setMediums(teacherId, mediums, conn) {
  const db = conn || getPool();
  await db.execute("DELETE FROM private_teacher_mediums WHERE teacher_id = ?", [
    teacherId,
  ]);
  for (const medium of mediums) {
    await db.execute(
      "INSERT IGNORE INTO private_teacher_mediums (teacher_id, medium) VALUES (?,?)",
      [teacherId, medium],
    );
  }
}

async function getClassLevels(teacherId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    "SELECT class_level FROM private_teacher_class_levels WHERE teacher_id = ?",
    [teacherId],
  );
  return rows.map((r) => r.class_level);
}

async function setClassLevels(teacherId, levels, conn) {
  const db = conn || getPool();
  await db.execute(
    "DELETE FROM private_teacher_class_levels WHERE teacher_id = ?",
    [teacherId],
  );
  for (const level of levels) {
    await db.execute(
      "INSERT IGNORE INTO private_teacher_class_levels (teacher_id, class_level) VALUES (?,?)",
      [teacherId, level],
    );
  }
}

async function getEducation(teacherId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    "SELECT qualification, other_detail FROM private_teacher_education WHERE teacher_id = ?",
    [teacherId],
  );
  return rows;
}

async function setEducation(teacherId, items, conn) {
  const db = conn || getPool();
  await db.execute(
    "DELETE FROM private_teacher_education WHERE teacher_id = ?",
    [teacherId],
  );
  for (const item of items) {
    await db.execute(
      "INSERT IGNORE INTO private_teacher_education (teacher_id, qualification, other_detail) VALUES (?,?,?)",
      [teacherId, item.qualification, item.other_detail ?? null],
    );
  }
}

async function getProfessionalQualifications(teacherId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    "SELECT id, qualification FROM private_teacher_professional_qualifications WHERE teacher_id = ?",
    [teacherId],
  );
  return rows;
}

async function setProfessionalQualifications(teacherId, items, conn) {
  const db = conn || getPool();
  await db.execute(
    "DELETE FROM private_teacher_professional_qualifications WHERE teacher_id = ?",
    [teacherId],
  );
  for (const item of items) {
    await db.execute(
      "INSERT INTO private_teacher_professional_qualifications (teacher_id, qualification) VALUES (?,?)",
      [teacherId, item],
    );
  }
}

async function getSubjects(teacherId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    "SELECT subject FROM private_teacher_subjects WHERE teacher_id = ?",
    [teacherId],
  );
  return rows.map((r) => r.subject);
}

async function setSubjects(teacherId, subjects, conn) {
  const db = conn || getPool();
  await db.execute(
    "DELETE FROM private_teacher_subjects WHERE teacher_id = ?",
    [teacherId],
  );
  for (const subject of subjects) {
    await db.execute(
      "INSERT IGNORE INTO private_teacher_subjects (teacher_id, subject) VALUES (?,?)",
      [teacherId, subject],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Clear all satellite data (used during soft-delete)
// ─────────────────────────────────────────────────────────────────────────────

async function clearSatelliteData(teacherId, conn) {
  const db = conn || getPool();
  // softDeleteTeacher does UPDATE not DELETE, so ON DELETE CASCADE never fires.
  // Every satellite table must be explicitly cleared.
  await Promise.all([
    db.execute('DELETE FROM private_teacher_phones                      WHERE teacher_id = ?', [teacherId]),
    db.execute('DELETE FROM private_teacher_contracts                   WHERE teacher_id = ?', [teacherId]),
    db.execute('DELETE FROM private_teacher_mediums                     WHERE teacher_id = ?', [teacherId]),
    db.execute('DELETE FROM private_teacher_class_levels                WHERE teacher_id = ?', [teacherId]),
    db.execute('DELETE FROM private_teacher_education                   WHERE teacher_id = ?', [teacherId]),
    db.execute('DELETE FROM private_teacher_professional_qualifications WHERE teacher_id = ?', [teacherId]),
    db.execute('DELETE FROM private_teacher_subjects                    WHERE teacher_id = ?', [teacherId]),
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Dual-admin removal workflow (FR-20)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a pending removal request.  First admin initiates.
 *
 * @param {number} teacherId
 * @param {string} teacherType  'Private' | 'International'
 * @param {string} reason
 * @param {number} requestedBy  users.id
 * @returns {Promise<number>} insertId
 */
async function createRemovalRequest(
  teacherId,
  teacherType,
  reason,
  requestedBy,
) {
  const pool = getPool();
  const [result] = await pool.execute(
    `INSERT INTO teacher_removal_approvals
       (teacher_type, teacher_id, reason, requested_by, status)
     VALUES (?, ?, ?, ?, 'Pending')`,
    [teacherType, teacherId, reason, requestedBy],
  );
  return result.insertId;
}

/**
 * Finds an open (Pending) removal request for a teacher.
 *
 * @param {number} teacherId
 * @param {string} teacherType
 * @returns {Promise<object|undefined>}
 */
async function findPendingRemovalRequest(teacherId, teacherType) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT * FROM teacher_removal_approvals
     WHERE teacher_id = ? AND teacher_type = ? AND status = 'Pending'
     LIMIT 1`,
    [teacherId, teacherType],
  );
  return rows[0];
}

/**
 * Marks a removal request as Approved and records the second admin.
 *
 * @param {number} requestId
 * @param {number} approvedBy  users.id of the second admin
 * @returns {Promise<void>}
 */
async function approveRemovalRequest(requestId, approvedBy) {
  const pool = getPool();
  await pool.execute(
    `UPDATE teacher_removal_approvals
     SET status = 'Approved', approved_by = ?, approved_at = NOW()
     WHERE id = ?`,
    [approvedBy, requestId],
  );
}

/**
 * Marks a removal request as Rejected.
 *
 * @param {number} requestId
 * @param {string} rejectionNote
 * @returns {Promise<void>}
 */
async function rejectRemovalRequest(requestId, rejectionNote) {
  const pool = getPool();
  await pool.execute(
    `UPDATE teacher_removal_approvals
     SET status = 'Rejected', rejection_note = ?
     WHERE id = ?`,
    [rejectionNote ?? null, requestId],
  );
}

/**
 * Fetches all removal requests (optionally filtered by teacher/type).
 *
 * @param {{ teacherId?, teacherType?, status? }} filters
 * @returns {Promise<object[]>}
 */
async function findRemovalRequests(filters = {}) {
  const pool = getPool();
  const where = [];
  const params = [];

  if (filters.teacherId) {
    where.push("teacher_id = ?");
    params.push(filters.teacherId);
  }
  if (filters.teacherType) {
    where.push("teacher_type = ?");
    params.push(filters.teacherType);
  }
  if (filters.status) {
    where.push("status = ?");
    params.push(filters.status);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [rows] = await pool.execute(
    `SELECT * FROM teacher_removal_approvals ${whereClause} ORDER BY requested_at DESC`,
    params,
  );
  return rows;
}

module.exports = {
  // Reads
  findAll,
  countAll,
  findById,

  // TIN helpers
  findVacantTinRow,
  nextTeacherNoInSchool,
  nextTeacherNoGlobal,

  // Teacher CUD
  insertTeacher,
  reactivateVacantRow,
  updateTeacher,
  softDeleteTeacher,

  // Phones
  getPhones,
  setPhones,

  // Contracts
  getContract,
  upsertContract,
  deleteContract,

  // Qualifications
  getMediums,
  setMediums,
  getClassLevels,
  setClassLevels,
  getEducation,
  setEducation,
  getProfessionalQualifications,
  setProfessionalQualifications,
  getSubjects,
  setSubjects,

  // Cleanup
  clearSatelliteData,

  // Removal workflow
  createRemovalRequest,
  findPendingRemovalRequest,
  approveRemovalRequest,
  rejectRemovalRequest,
  findRemovalRequests,
};
