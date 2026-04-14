'use strict';

/**
 * teachers.service.js
 * ────────────────────
 * Business logic for the Private Schools teacher module.
 * All SRS rules (FR-5 → FR-26, FR-19, FR-20) are enforced here.
 * The repository handles raw SQL; this layer decides WHAT to do.
 */

const { getPool }  = require('../../config/database');
const repo         = require('./teachers.repository');
const tinService   = require('../tin/tin.service');
const AppError     = require('../../shared/utils/AppError');

// ─── Category upgrade rules (SRS FR-15) ──────────────────────────────────────
// Category 2 → 1 after 6 months + interview (recorded externally; admin triggers)
// Category 3 → 2 when ACPS 31 filed (admin triggers)
// Category 4 → stays permanently (FR-23)
const VALID_CATEGORIES = [1, 2, 3, 4];

// ─── Selection-test validation (FR-26: max 3 attempts) ───────────────────────
const VALID_TEST_RESULT = ['Pass', 'Fail', null];

// ─── School number ranges (FR-7) ─────────────────────────────────────────────
const PRIVATE_SCHOOL_RANGE = { min: 1, max: 32 };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attaches satellite data (phones, contract, qualifications) to a teacher row.
 *
 * @param {object} teacher
 * @returns {Promise<object>}
 */
async function attachSatelliteData(teacher) {
  if (!teacher) return teacher;

  const [phones, contract, mediums, classLevels, education, profQuals, subjects] =
    await Promise.all([
      repo.getPhones(teacher.id),
      repo.getContract(teacher.id),
      repo.getMediums(teacher.id),
      repo.getClassLevels(teacher.id),
      repo.getEducation(teacher.id),
      repo.getProfessionalQualifications(teacher.id),
      repo.getSubjects(teacher.id),
    ]);

  return {
    ...teacher,
    phones,
    contract:                   contract,
    mediums,
    class_levels:               classLevels,
    education,
    professional_qualifications: profQuals,
    subjects,
  };
}

/**
 * Validates selection test attempts against FR-26 rules:
 *   - Max 3 attempts
 *   - Attempt N+1 cannot exist without attempt N
 *   - Values must be Pass / Fail / null
 *
 * @param {string|null} a1
 * @param {string|null} a2
 * @param {string|null} a3
 */
function validateSelectionTest(a1, a2, a3) {
  for (const v of [a1, a2, a3]) {
    if (!VALID_TEST_RESULT.includes(v)) {
      throw new AppError(`Invalid selection test value: "${v}". Must be Pass, Fail, or null.`, 400);
    }
  }
  // Cannot skip: attempt 2 requires attempt 1; attempt 3 requires attempt 2
  if (!a1 && (a2 || a3)) {
    throw new AppError('Attempt 2 or 3 cannot be set without Attempt 1.', 400);
  }
  if (!a2 && a3) {
    throw new AppError('Attempt 3 cannot be set without Attempt 2.', 400);
  }
}

/**
 * Validates category-specific rules from SRS FR-14 / FR-15.
 *
 * @param {number} category
 */
function validateCategory(category) {
  if (!VALID_CATEGORIES.includes(Number(category))) {
    throw new AppError(`Invalid category "${category}". Must be 1–4.`, 400);
  }
}

/**
 * Enforces SRS training-flag rules:
 *   - SSP status may only be set (non-default) for category-2 teachers.
 *   - DCETT status may only be set (non-default) for category-3 teachers.
 *
 * "Non-default" means any value other than 'Not_Completed'.
 *
 * @param {number}      category   resolved present_category for this operation
 * @param {string|null} sspStatus
 * @param {string|null} dcettStatus
 */
function validateTrainingFlags(category, sspStatus, dcettStatus) {
  const cat = Number(category);
  if (sspStatus && sspStatus !== 'Not_Completed' && cat !== 2) {
    throw new AppError(
      'SSP status can only be recorded for Category 2 (Unregistered Permanent) teachers.',
      400,
    );
  }
  if (dcettStatus && dcettStatus !== 'Not_Completed' && cat !== 3) {
    throw new AppError(
      'DCETT status can only be recorded for Category 3 (Unregistered Training) teachers.',
      400,
    );
  }
}

/**
 * Validates that the school number is within the Private school range (FR-7).
 *
 * @param {number} schoolNumber
 */
function validateSchoolNumber(schoolNumber) {
  const n = Number(schoolNumber);
  if (n < PRIVATE_SCHOOL_RANGE.min || n > PRIVATE_SCHOOL_RANGE.max) {
    throw new AppError(
      `School number ${n} is out of range for Private schools (01–32).`,
      400,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// findAll
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a paginated list of active teachers matching the filters.
 * schoolFilter from middleware is already baked into filters.schoolId
 * for principal/HR roles — this function does not re-check roles.
 *
 * @param {{ schoolId, tin, name, category }} filters
 * @param {{ page?: number, limit?: number }}  pagination
 * @returns {Promise<{ items: object[], total: number, page: number, limit: number }>}
 */
async function findAll(filters, pagination = {}) {
  const page  = Math.max(1, Number(pagination.page)  || 1);
  const limit = Math.min(100, Math.max(1, Number(pagination.limit) || 20));
  const offset = (page - 1) * limit;

  // Pass isActive through to the repository unchanged so buildWhere can handle
  // undefined (→ active only), 'all', '0', false, etc.
  const repoFilters = {
    schoolId: filters.schoolId,
    tin:      filters.tin,
    name:     filters.name,
    category: filters.category,
    isActive: filters.isActive,
  };

  const [items, total] = await Promise.all([
    repo.findAll(repoFilters, { limit, offset }),
    repo.countAll(repoFilters),
  ]);

  return { items, total, page, limit };
}

// ─────────────────────────────────────────────────────────────────────────────
// findById
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a single teacher with all satellite data.
 * If schoolFilter is provided (Principal/HR), verifies school ownership.
 *
 * @param {number|string} id
 * @param {{ school_id: number }|null} schoolFilter
 * @returns {Promise<object>}
 */
async function findById(id, schoolFilter) {
  const teacher = await repo.findById(Number(id));

  if (!teacher) {
    throw new AppError('Teacher not found.', 404);
  }

  // Enforce school boundary for Principal/HR (FR-29)
  if (schoolFilter && teacher.school_id !== schoolFilter.school_id) {
    throw new AppError('Access denied. Teacher does not belong to your school.', 403);
  }

  return attachSatelliteData(teacher);
}

// ─────────────────────────────────────────────────────────────────────────────
// create  (FR-18: verify qualifications → assign category → TIN → store)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a new teacher record with full TIN generation logic.
 *
 * TIN generation (FR-5 → FR-11):
 *   1. Check for a vacated (is_active=0) row with the same tin_category + school
 *   2. If found  → reactivate that row (reuse TIN slot — FR-8)
 *   3. If not    → generate new sequential numbers and INSERT
 *
 * @param {object} body  - validated request body
 * @returns {Promise<object>}  full teacher record
 */
async function create(body) {
  // ── Input validation ──────────────────────────────────────────────────────
  const required = ['tin_category', 'tin_school_number', 'present_category',
                    'full_name', 'nic', 'gender', 'date_of_birth', 'school_id'];
  for (const field of required) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      throw new AppError(`Field "${field}" is required.`, 400);
    }
  }

  validateCategory(body.present_category);
  validateSchoolNumber(body.tin_school_number);
  validateSelectionTest(
    body.selection_test_attempt1 ?? null,
    body.selection_test_attempt2 ?? null,
    body.selection_test_attempt3 ?? null,
  );

  // Category 2 and 3 are the only initial assignments (FR-18: "assign category 2 or 3 initially")
  const cat = Number(body.present_category);

  validateTrainingFlags(cat, body.ssp_status ?? null, body.dcett_status ?? null);
  if (cat === 1) {
    throw new AppError('Category 1 (Pensionable) cannot be assigned at onboarding. Start at 2 or 3.', 400);
  }

  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    let teacherId;

    // ── TIN allocation (FR-8 reuse / FR-10 / FR-11 new) ──────────────────
    // tinService.allocate() acquires a SELECT … FOR UPDATE lock on the
    // tin_sequences row INSIDE this open transaction, making TIN numbering
    // race-free for concurrent requests.
    const allocation = await tinService.allocate({
      tableType:    'Private',
      category:     Number(body.tin_category),
      schoolNumber: Number(body.tin_school_number),
      conn,
    });

    if (allocation.isReuse) {
      // Reuse the existing row — TIN components stay unchanged (FR-8)
      await repo.reactivateVacantRow(allocation.rowId, body, conn);
      teacherId = allocation.rowId;
    } else {
      // Insert a brand-new row with the allocated numbers
      teacherId = await repo.insertTeacher(
        {
          ...body,
          tin_category:          Number(body.tin_category),
          tin_school_number:     Number(body.tin_school_number),
          tin_teacher_no_school: allocation.tin_teacher_no_school,
          tin_teacher_no_global: allocation.tin_teacher_no_global,
        },
        conn,
      );
    }

    // ── Satellite data ────────────────────────────────────────────────────
    if (Array.isArray(body.phones) && body.phones.length) {
      await repo.setPhones(teacherId, body.phones, conn);
    }
    if (body.contract) {
      await repo.upsertContract(teacherId, body.contract, conn);
    }
    if (Array.isArray(body.mediums) && body.mediums.length) {
      await repo.setMediums(teacherId, body.mediums, conn);
    }
    if (Array.isArray(body.class_levels) && body.class_levels.length) {
      await repo.setClassLevels(teacherId, body.class_levels, conn);
    }
    if (Array.isArray(body.education) && body.education.length) {
      await repo.setEducation(teacherId, body.education, conn);
    }
    if (Array.isArray(body.professional_qualifications) && body.professional_qualifications.length) {
      await repo.setProfessionalQualifications(teacherId, body.professional_qualifications, conn);
    }
    if (Array.isArray(body.subjects) && body.subjects.length) {
      await repo.setSubjects(teacherId, body.subjects, conn);
    }

    await conn.commit();
    return findById(teacherId, null);

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// update
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Updates mutable fields on an active teacher.
 * TIN components are immutable — any tin_* fields in body are ignored.
 *
 * Enforces:
 *   - Category upgrade path (FR-15)
 *   - Selection test rules (FR-26)
 *
 * @param {number|string} id
 * @param {object} body
 * @returns {Promise<object>}
 */
async function update(id, body) {
  const existing = await repo.findById(Number(id));
  if (!existing) throw new AppError('Teacher not found.', 404);
  if (!existing.is_active) throw new AppError('Cannot update a removed teacher.', 409);

  // ── Validate fields when present ──────────────────────────────────────────
  if (body.present_category !== undefined) {
    validateCategory(body.present_category);

    // FR-15: Enforce legal upgrade paths only
    const from = existing.present_category;
    const to   = Number(body.present_category);
    const legalUpgrades = { 2: [1, 2], 3: [2, 3], 4: [4] }; // from → allowed targets
    const allowed = legalUpgrades[from] ?? [from];
    if (!allowed.includes(to)) {
      throw new AppError(
        `Category upgrade from ${from} to ${to} is not permitted by SRS FR-15.`,
        400,
      );
    }
  }

  if (
    body.selection_test_attempt1 !== undefined ||
    body.selection_test_attempt2 !== undefined ||
    body.selection_test_attempt3 !== undefined
  ) {
    validateSelectionTest(
      body.selection_test_attempt1 ?? existing.selection_test_attempt1,
      body.selection_test_attempt2 ?? existing.selection_test_attempt2,
      body.selection_test_attempt3 ?? existing.selection_test_attempt3,
    );
  }

  // Use the resolved category (after any upgrade) for training-flag validation
  const resolvedCategory = body.present_category !== undefined
    ? Number(body.present_category)
    : existing.present_category;

  if (body.ssp_status !== undefined || body.dcett_status !== undefined) {
    validateTrainingFlags(
      resolvedCategory,
      body.ssp_status   ?? existing.ssp_status,
      body.dcett_status ?? existing.dcett_status,
    );
  }

  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    await repo.updateTeacher(Number(id), body, conn);

    if (body.phones !== undefined) {
      await repo.setPhones(Number(id), body.phones ?? [], conn);
    }
    if (body.contract !== undefined) {
      if (body.contract) {
        await repo.upsertContract(Number(id), body.contract, conn);
      } else {
        await repo.deleteContract(Number(id), conn);
      }
    }
    if (body.mediums !== undefined) {
      await repo.setMediums(Number(id), body.mediums ?? [], conn);
    }
    if (body.class_levels !== undefined) {
      await repo.setClassLevels(Number(id), body.class_levels ?? [], conn);
    }
    if (body.education !== undefined) {
      await repo.setEducation(Number(id), body.education ?? [], conn);
    }
    if (body.professional_qualifications !== undefined) {
      await repo.setProfessionalQualifications(Number(id), body.professional_qualifications ?? [], conn);
    }
    if (body.subjects !== undefined) {
      await repo.setSubjects(Number(id), body.subjects ?? [], conn);
    }

    await conn.commit();
    return findById(Number(id), null);

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// updateProfilePicture
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Updates the profile_picture_path on an active teacher.
 *
 * @param {number} id
 * @param {string} filePath
 * @returns {Promise<object>}
 */
async function updateProfilePicture(id, filePath) {
  const existing = await repo.findById(Number(id));
  if (!existing) throw new AppError('Teacher not found.', 404);
  if (!existing.is_active) throw new AppError('Cannot update a removed teacher.', 409);

  await repo.updateTeacher(Number(id), { profile_picture_path: filePath });
  return findById(Number(id), null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Dual-admin removal workflow  (FR-19, FR-20)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Step 1 — Admin A initiates a removal request.
 * Creates a Pending record; the teacher is NOT yet removed.
 *
 * @param {number} teacherId
 * @param {string} reason   - enum value
 * @param {number} adminId  - users.id of the requesting admin
 * @returns {Promise<object>}
 */
async function requestRemoval(teacherId, reason, adminId) {
  const teacher = await repo.findById(Number(teacherId));
  if (!teacher)            throw new AppError('Teacher not found.', 404);
  if (!teacher.is_active)  throw new AppError('Teacher is already removed.', 409);

  const existing = await repo.findPendingRemovalRequest(Number(teacherId), 'Private');
  if (existing) {
    throw new AppError(
      'A removal request for this teacher is already pending. A second admin must approve it.',
      409,
    );
  }

  const requestId = await repo.createRemovalRequest(
    Number(teacherId), 'Private', reason, adminId,
  );

  return { request_id: requestId, status: 'Pending', message: 'Removal request created. Awaiting second admin approval.' };
}

/**
 * Step 2 — Admin B approves the removal request.
 * Executes the soft-delete (FR-19: TIN preserved, all other fields cleared).
 * Admin B must be a DIFFERENT user from Admin A.
 *
 * @param {number} requestId
 * @param {number} adminId   - users.id of the approving admin (must differ from requester)
 * @returns {Promise<object>}
 */
async function approveRemoval(requestId, adminId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM teacher_removal_approvals WHERE id = ? LIMIT 1',
    [requestId],
  );
  const request = rows[0];

  if (!request) throw new AppError('Removal request not found.', 404);
  if (request.status !== 'Pending') {
    throw new AppError(`Request is already ${request.status}.`, 409);
  }

  // FR-20: Dual approval — second admin must be different from first
  if (request.requested_by === adminId) {
    throw new AppError(
      'The approving admin must be different from the admin who created the request (FR-20).',
      403,
    );
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await repo.approveRemovalRequest(requestId, adminId);
    await repo.softDeleteTeacher(request.teacher_id, request.reason, conn);
    await repo.clearSatelliteData(request.teacher_id, conn);

    await conn.commit();
    return { message: 'Teacher removed successfully. TIN preserved.' };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Admin rejects an open removal request (cancels the process).
 *
 * @param {number} requestId
 * @param {string} rejectionNote
 * @returns {Promise<object>}
 */
async function rejectRemoval(requestId, rejectionNote) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM teacher_removal_approvals WHERE id = ? LIMIT 1',
    [requestId],
  );
  const request = rows[0];

  if (!request) throw new AppError('Removal request not found.', 404);
  if (request.status !== 'Pending') {
    throw new AppError(`Request is already ${request.status}.`, 409);
  }

  await repo.rejectRemovalRequest(requestId, rejectionNote);
  return { message: 'Removal request rejected.' };
}

/**
 * Returns all removal requests — admin use only.
 *
 * @param {{ teacherId?, teacherType?, status? }} filters
 * @returns {Promise<object[]>}
 */
async function getRemovalRequests(filters) {
  return repo.findRemovalRequests(filters);
}

// ─────────────────────────────────────────────────────────────────────────────
// upgradeCategory  (FR-15: automatic upgrade triggered by admin)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upgrades a teacher's present_category along the legal path (FR-15):
 *   3 → 2  when ACPS 31 has been filed  (admin confirms)
 *   2 → 1  after 6-month probation + interview  (admin confirms)
 *
 * Category 4 (Fixed Term) never upgrades.
 *
 * @param {number|string} id
 * @returns {Promise<object>} updated teacher record
 */
async function upgradeCategory(id) {
  const teacher = await repo.findById(Number(id));
  if (!teacher)           throw new AppError('Teacher not found.', 404);
  if (!teacher.is_active) throw new AppError('Cannot upgrade a removed teacher.', 409);

  const from = teacher.present_category;
  const legalNext = { 3: 2, 2: 1 };
  const to = legalNext[from];

  if (!to) {
    throw new AppError(
      `Category ${from} cannot be automatically upgraded. ` +
      `Category 1 is the top grade; Category 4 (Fixed Term) never upgrades.`,
      400,
    );
  }

  await repo.updateTeacher(Number(id), { present_category: to });
  return findById(Number(id), null);
}

// ─────────────────────────────────────────────────────────────────────────────
// remove  (legacy direct-delete path — kept as thin wrapper for router compat)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called by DELETE /api/teachers/:id.
 * In the SRS, removal always requires dual approval (FR-20).
 * This endpoint initiates step 1 of that workflow.
 */
async function remove(id, adminId) {
  throw new AppError(
    'Direct removal is not permitted. Use POST /api/teachers/:id/removal-request to initiate the dual-approval workflow (FR-20).',
    400,
  );
}

module.exports = {
  findAll,
  findById,
  create,
  update,
  updateProfilePicture,
  upgradeCategory,
  remove,
  requestRemoval,
  approveRemoval,
  rejectRemoval,
  getRemovalRequests,
};
