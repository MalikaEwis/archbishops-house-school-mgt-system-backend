'use strict';

/**
 * vested.service.js
 * ──────────────────
 * Business logic for the Vested Schools module.
 *
 * Design notes:
 *   - No teacher management — vested schools are admin-only data management.
 *   - A "vested school" is always two rows: one in `schools` (type='Vested')
 *     and one in `vested_schools` (the extension).
 *   - Principal history is kept intact: archiving sets is_current=0 and
 *     records the end date; the row is never deleted.
 *   - Student stats are year-keyed upserts (unique constraint on
 *     vested_school_id + stat_year).
 */

const { getPool } = require('../../config/database');
const repo        = require('./vested.repository');
const AppError    = require('../../shared/utils/AppError');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolves a vested school by schools.id and throws 404 if not found.
 *
 * @param {number} id  schools.id
 * @returns {Promise<object>}
 */
async function requireSchool(id) {
  const school = await repo.findById(Number(id));
  if (!school) throw new AppError('Vested school not found.', 404);
  return school;
}

/**
 * Builds a full school detail object: core data + principals + stats.
 *
 * @param {object} school  row from repo.findById
 * @returns {Promise<object>}
 */
async function attachDetail(school) {
  const [principals, stats] = await Promise.all([
    repo.findPrincipals(school.vested_id),
    repo.findStats(school.vested_id),
  ]);
  return { ...school, principals, stats };
}

// ─── Schools ─────────────────────────────────────────────────────────────────

/**
 * Returns a summary list of all vested schools.
 *
 * Supported query filters:
 *   zone, district, region, province, principalReligion
 *
 * @param {object} query  req.query
 * @returns {Promise<object[]>}
 */
async function findAllSchools(query = {}) {
  return repo.findAll({
    zone:              query.zone              || null,
    district:          query.district          || null,
    region:            query.region            || null,
    province:          query.province          || null,
    principalReligion: query.principalReligion || null,
  });
}

/**
 * Returns a single vested school with full detail (principals + stats).
 *
 * @param {number|string} id  schools.id
 * @returns {Promise<object>}
 */
async function findSchoolById(id) {
  const school = await requireSchool(id);
  return attachDetail(school);
}

/**
 * Creates a new vested school (inserts into `schools` + `vested_schools`).
 *
 * @param {object} body
 * @returns {Promise<object>} full school detail
 */
async function createSchool(body) {
  if (!body.school_index) throw new AppError('"school_index" is required.', 400);
  if (!body.school_name)  throw new AppError('"school_name" is required.', 400);

  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // Split fields between the two tables
    const { schoolId } = await repo.insertSchool(
      {
        school_index:              body.school_index,
        school_name:               body.school_name,
        principal_name:            body.principal_name,
        principal_phone:           body.principal_phone,
        school_phone:              body.school_phone,
        student_admission_type:    body.student_admission_type,
        school_category:           body.school_category,
        email:                     body.email,
        no_of_students:            body.no_of_students,
        no_of_teachers:            body.no_of_teachers,
        no_of_pensionable_teachers: body.no_of_pensionable_teachers,
      },
      {
        province:                  body.province,
        district:                  body.district,
        education_zone:            body.education_zone,
        divisional_secretariat:    body.divisional_secretariat,
        parish:                    body.parish,
        zone:                      body.zone,
        region:                    body.region,
        school_address:            body.school_address,
        school_phone:              body.vested_school_phone ?? body.school_phone,
        school_fax:                body.school_fax,
        school_email:              body.school_email ?? body.email,
        school_census_no:          body.school_census_no,
        year_established:          body.year_established,
        school_type_detail:        body.school_type_detail,
        student_admission_type:    body.student_admission_type,
        school_category:           body.school_category,
        medium_of_instruction:     body.medium_of_instruction,
        bog_catholic_pct:          body.bog_catholic_pct,
        bog_other_christian_pct:   body.bog_other_christian_pct,
        bog_buddhist_pct:          body.bog_buddhist_pct,
        bog_hindu_pct:             body.bog_hindu_pct,
        bog_islam_pct:             body.bog_islam_pct,
        bog_other_religion_pct:    body.bog_other_religion_pct,
        overview_general:          body.overview_general,
        overview_remarks:          body.overview_remarks,
        overview_special_notes:    body.overview_special_notes,
        overview_challenges:       body.overview_challenges,
      },
      conn,
    );

    await conn.commit();
    return findSchoolById(schoolId);

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Updates mutable fields on a vested school.
 * Fields are dispatched to `schools` or `vested_schools` as appropriate.
 *
 * @param {number|string} id  schools.id
 * @param {object}        body
 * @returns {Promise<object>} updated full school detail
 */
async function updateSchool(id, body) {
  const school = await requireSchool(id);

  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    await repo.updateSchoolBase(school.id, body, conn);
    await repo.updateVestedData(school.vested_id, body, conn);

    await conn.commit();
    return findSchoolById(school.id);

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Permanently deletes a vested school and all child records.
 * This will fail (FK error surfaced as 400) if any teacher rows
 * reference the base schools row.
 *
 * @param {number|string} id  schools.id
 * @returns {Promise<void>}
 */
async function deleteSchool(id) {
  const school = await requireSchool(id);

  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();
    await repo.deleteSchool(school.id, school.vested_id, conn);
    await conn.commit();

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ─── Principals ──────────────────────────────────────────────────────────────

/**
 * Returns the full principal history (current first, then archived).
 *
 * @param {number|string} schoolId  schools.id
 * @returns {Promise<object[]>}
 */
async function getPrincipalHistory(schoolId) {
  const school = await requireSchool(schoolId);
  return repo.findPrincipals(school.vested_id);
}

/**
 * Adds a new principal to a vested school.
 * If is_current = true (the default), any existing current principal
 * is automatically archived first.
 *
 * @param {number|string} schoolId  schools.id
 * @param {object}        body
 * @returns {Promise<object>} the newly created principal row
 */
async function addPrincipal(schoolId, body) {
  if (!body.full_name) throw new AppError('"full_name" is required.', 400);

  const school = await requireSchool(schoolId);
  const isCurrent = body.is_current !== false && body.is_current !== '0';

  // When adding a new current principal, auto-archive the previous one
  if (isCurrent) {
    const pool = getPool();
    const [existing] = await pool.execute(
      'SELECT id FROM vested_school_principals WHERE vested_school_id = ? AND is_current = 1 LIMIT 1',
      [school.vested_id],
    );
    if (existing[0]) {
      await repo.archivePrincipal(existing[0].id, {
        end_date:         body.previous_end_date ?? null,
        departure_reason: body.previous_departure_reason ?? null,
      });
    }
  }

  const principalId = await repo.insertPrincipal(school.vested_id, {
    ...body,
    is_current: isCurrent ? 1 : 0,
  });

  return repo.findPrincipalById(principalId);
}

/**
 * Updates editable fields on a principal record.
 *
 * @param {number|string} schoolId    schools.id (used to verify ownership)
 * @param {number|string} principalId
 * @param {object}        body
 * @returns {Promise<object>} updated principal row
 */
async function updatePrincipal(schoolId, principalId, body) {
  const school    = await requireSchool(schoolId);
  const principal = await repo.findPrincipalById(Number(principalId));

  if (!principal) throw new AppError('Principal not found.', 404);
  if (principal.vested_school_id !== school.vested_id) {
    throw new AppError('Principal does not belong to this school.', 403);
  }

  await repo.updatePrincipal(Number(principalId), body);
  return repo.findPrincipalById(Number(principalId));
}

/**
 * Archives a principal — marks as past (FR-50).
 * The record is preserved for history; it is never deleted.
 *
 * @param {number|string} schoolId    schools.id
 * @param {number|string} principalId
 * @param {{ end_date?, departure_reason? }} body
 * @returns {Promise<object>} archived principal row
 */
async function archivePrincipal(schoolId, principalId, body) {
  const school    = await requireSchool(schoolId);
  const principal = await repo.findPrincipalById(Number(principalId));

  if (!principal) throw new AppError('Principal not found.', 404);
  if (principal.vested_school_id !== school.vested_id) {
    throw new AppError('Principal does not belong to this school.', 403);
  }
  if (!principal.is_current) {
    throw new AppError('Principal is already archived.', 409);
  }

  await repo.archivePrincipal(Number(principalId), {
    end_date:         body.end_date         ?? null,
    departure_reason: body.departure_reason ?? null,
  });

  return repo.findPrincipalById(Number(principalId));
}

// ─── Student Stats ───────────────────────────────────────────────────────────

/**
 * Returns all yearly student stats for a school.
 * Each row includes computed religion and medium percentages.
 *
 * @param {number|string} schoolId  schools.id
 * @returns {Promise<object[]>}
 */
async function getStats(schoolId) {
  const school = await requireSchool(schoolId);
  return repo.findStats(school.vested_id);
}

/**
 * Adds or replaces stats for a specific year (upsert).
 *
 * total_students is auto-computed from religion counts when omitted.
 *
 * @param {number|string} schoolId  schools.id
 * @param {number}        year
 * @param {object}        body
 * @returns {Promise<object[]>} all stats (updated list)
 */
async function upsertStats(schoolId, year, body) {
  const school = await requireSchool(schoolId);

  const statYear = Number(year);
  if (!statYear || statYear < 1900 || statYear > 2100) {
    throw new AppError('Invalid year. Must be between 1900 and 2100.', 400);
  }

  await repo.upsertStats(school.vested_id, statYear, body);
  return repo.findStats(school.vested_id);
}

/**
 * Deletes a specific year's stats row.
 *
 * @param {number|string} schoolId
 * @param {number}        year
 * @returns {Promise<void>}
 */
async function deleteStats(schoolId, year) {
  const school = await requireSchool(schoolId);
  const deleted = await repo.deleteStats(school.vested_id, Number(year));
  if (!deleted) throw new AppError(`No stats found for year ${year}.`, 404);
}

// ─── CSV import (stubbed — not in current scope) ──────────────────────────────

async function importCsv() {
  throw new AppError('CSV import not yet implemented.', 501);
}

module.exports = {
  // Schools
  findAllSchools,
  findSchoolById,
  createSchool,
  updateSchool,
  deleteSchool,
  importCsv,

  // Principals
  getPrincipalHistory,
  addPrincipal,
  updatePrincipal,
  archivePrincipal,

  // Stats
  getStats,
  upsertStats,
  deleteStats,
};
