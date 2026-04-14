'use strict';

/**
 * vested.repository.js
 * ─────────────────────
 * Raw SQL for vested schools, their principals, and yearly student stats.
 *
 * Tables touched:
 *   schools                      – master school row (school_type = 'Vested')
 *   vested_schools               – extended vested-specific data (1:1 with schools)
 *   vested_school_principals     – current + archived principal records
 *   vested_school_student_stats  – yearly religion/medium/total counts
 */

const { getPool } = require('../../config/database');

// ─── Base SELECT (schools list / detail) ─────────────────────────────────────

const SCHOOL_BASE = `
  SELECT
    s.id,
    s.school_index,
    s.school_name,
    s.school_type,
    s.principal_name,
    s.principal_phone,
    s.school_phone        AS school_phone_base,
    s.student_admission_type AS student_admission_type_base,
    s.school_category     AS school_category_base,
    s.email               AS school_email_base,
    s.no_of_students,
    s.no_of_teachers,
    s.no_of_pensionable_teachers,
    s.created_at,
    s.updated_at,
    vs.id                 AS vested_id,
    vs.province,
    vs.district,
    vs.education_zone,
    vs.divisional_secretariat,
    vs.parish,
    vs.zone,
    vs.region,
    vs.school_address,
    vs.school_phone,
    vs.school_fax,
    vs.school_email,
    vs.school_census_no,
    vs.year_established,
    vs.school_type_detail,
    vs.student_admission_type,
    vs.school_category,
    vs.medium_of_instruction,
    vs.bog_catholic_pct,
    vs.bog_other_christian_pct,
    vs.bog_buddhist_pct,
    vs.bog_hindu_pct,
    vs.bog_islam_pct,
    vs.bog_other_religion_pct,
    vs.overview_general,
    vs.overview_remarks,
    vs.overview_special_notes,
    vs.overview_challenges
  FROM schools s
  JOIN vested_schools vs ON vs.school_id = s.id
  WHERE s.school_type = 'Vested'
`;

// ─── findAll ─────────────────────────────────────────────────────────────────

/**
 * Returns a summary list of all vested schools with their current principal
 * and the latest year's Catholic percentage.
 *
 * Optional filters: zone, district, region, province, principalReligion
 *
 * @param {{
 *   zone?,
 *   district?,
 *   region?,
 *   province?,
 *   principalReligion?
 * }} filters
 * @returns {Promise<object[]>}
 */
async function findAll(filters = {}) {
  const pool   = getPool();
  const where  = ['s.school_type = \'Vested\''];
  const params = [];

  if (filters.zone)     { where.push('vs.zone = ?');     params.push(filters.zone); }
  if (filters.district) { where.push('vs.district = ?'); params.push(filters.district); }
  if (filters.region)   { where.push('vs.region = ?');   params.push(filters.region); }
  if (filters.province) { where.push('vs.province = ?'); params.push(filters.province); }

  // principalReligion filters the current principal's religion
  const principalJoin = filters.principalReligion
    ? `LEFT JOIN vested_school_principals vsp
         ON  vsp.vested_school_id = vs.id
         AND vsp.is_current = 1
         AND vsp.religion   = ?`
    : `LEFT JOIN vested_school_principals vsp
         ON  vsp.vested_school_id = vs.id
         AND vsp.is_current = 1`;

  if (filters.principalReligion) {
    params.push(filters.principalReligion);
    where.push('vsp.id IS NOT NULL');  // effectively an INNER JOIN
  }

  const [rows] = await pool.execute(
    `SELECT
       s.id,
       s.school_index,
       s.school_name,
       vs.id        AS vested_id,
       vs.zone,
       vs.district,
       vs.province,
       vs.region,
       vs.medium_of_instruction,
       vs.student_admission_type,
       vs.school_category,
       vs.school_census_no,
       vs.school_phone,
       vs.school_email,
       -- Current principal snapshot
       vsp.id         AS principal_id,
       vsp.full_name  AS current_principal_name,
       vsp.religion   AS current_principal_religion,
       vsp.phone      AS current_principal_phone,
       -- Latest year stats (non-locking scalar subqueries)
       (SELECT stat_year
        FROM   vested_school_student_stats
        WHERE  vested_school_id = vs.id
        ORDER BY stat_year DESC LIMIT 1)   AS latest_stat_year,
       (SELECT total_students
        FROM   vested_school_student_stats
        WHERE  vested_school_id = vs.id
        ORDER BY stat_year DESC LIMIT 1)   AS latest_total_students,
       (SELECT ROUND(
                (count_catholic / NULLIF(total_students, 0)) * 100, 2
               )
        FROM   vested_school_student_stats
        WHERE  vested_school_id = vs.id
        ORDER BY stat_year DESC LIMIT 1)   AS latest_pct_catholic
     FROM schools s
     JOIN vested_schools vs ON vs.school_id = s.id
     ${principalJoin}
     WHERE ${where.join(' AND ')}
     ORDER BY s.school_index ASC`,
    params,
  );
  return rows;
}

// ─── findById ────────────────────────────────────────────────────────────────

/**
 * Returns core school data for a single vested school (by schools.id).
 * Principals and stats are fetched separately and attached by the service.
 *
 * @param {number} id  schools.id
 * @returns {Promise<object|undefined>}
 */
async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `${SCHOOL_BASE} AND s.id = ? LIMIT 1`,
    [id],
  );
  return rows[0];
}

// ─── findByVestedId ───────────────────────────────────────────────────────────

/**
 * Same as findById but keyed on vested_schools.id.
 *
 * @param {number} vestedId  vested_schools.id
 * @returns {Promise<object|undefined>}
 */
async function findByVestedId(vestedId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `${SCHOOL_BASE} AND vs.id = ? LIMIT 1`,
    [vestedId],
  );
  return rows[0];
}

// ─── insertSchool ─────────────────────────────────────────────────────────────

/**
 * Inserts a new vested school — both the `schools` master row and the
 * `vested_schools` extension row — within the provided transaction.
 *
 * @param {object} s   schools-table fields
 * @param {object} vs  vested_schools-table fields
 * @param {object} conn
 * @returns {Promise<{ schoolId: number, vestedId: number }>}
 */
async function insertSchool(s, vs, conn) {
  const [sResult] = await conn.execute(
    `INSERT INTO schools
       (school_index, school_name, school_type,
        principal_name, principal_phone, school_phone,
        student_admission_type, school_category, email,
        no_of_students, no_of_teachers, no_of_pensionable_teachers)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      s.school_index,
      s.school_name,
      'Vested',
      s.principal_name            ?? null,
      s.principal_phone           ?? null,
      s.school_phone              ?? null,
      s.student_admission_type    ?? null,
      s.school_category           ?? null,
      s.email                     ?? null,
      s.no_of_students            ?? 0,
      s.no_of_teachers            ?? 0,
      s.no_of_pensionable_teachers ?? 0,
    ],
  );
  const schoolId = sResult.insertId;

  const [vsResult] = await conn.execute(
    `INSERT INTO vested_schools
       (school_id, province, district, education_zone, divisional_secretariat,
        parish, zone, region, school_address, school_phone, school_fax,
        school_email, school_census_no, year_established, school_type_detail,
        student_admission_type, school_category, medium_of_instruction,
        bog_catholic_pct, bog_other_christian_pct, bog_buddhist_pct,
        bog_hindu_pct, bog_islam_pct, bog_other_religion_pct,
        overview_general, overview_remarks, overview_special_notes, overview_challenges)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      schoolId,
      vs.province                  ?? null,
      vs.district                  ?? null,
      vs.education_zone            ?? null,
      vs.divisional_secretariat    ?? null,
      vs.parish                    ?? null,
      vs.zone                      ?? null,
      vs.region                    ?? null,
      vs.school_address            ?? null,
      vs.school_phone              ?? null,
      vs.school_fax                ?? null,
      vs.school_email              ?? null,
      vs.school_census_no          ?? null,
      vs.year_established          ?? null,
      vs.school_type_detail        ?? null,
      vs.student_admission_type    ?? null,
      vs.school_category           ?? null,
      vs.medium_of_instruction     ?? null,
      vs.bog_catholic_pct          ?? null,
      vs.bog_other_christian_pct   ?? null,
      vs.bog_buddhist_pct          ?? null,
      vs.bog_hindu_pct             ?? null,
      vs.bog_islam_pct             ?? null,
      vs.bog_other_religion_pct    ?? null,
      vs.overview_general          ?? null,
      vs.overview_remarks          ?? null,
      vs.overview_special_notes    ?? null,
      vs.overview_challenges       ?? null,
    ],
  );

  return { schoolId, vestedId: vsResult.insertId };
}

// ─── updateSchool ─────────────────────────────────────────────────────────────

/**
 * Dynamic UPDATE for the schools master row (only provided fields changed).
 *
 * @param {number} schoolId
 * @param {object} data
 * @param {object} conn
 */
async function updateSchoolBase(schoolId, data, conn) {
  const db = conn || getPool();
  const allowed = [
    'school_index', 'school_name', 'principal_name', 'principal_phone',
    'school_phone', 'student_admission_type', 'school_category', 'email',
    'no_of_students', 'no_of_teachers', 'no_of_pensionable_teachers',
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
  params.push(schoolId);
  await db.execute(`UPDATE schools SET ${sets.join(', ')} WHERE id = ?`, params);
}

/**
 * Dynamic UPDATE for the vested_schools extension row.
 *
 * @param {number} vestedId
 * @param {object} data
 * @param {object} conn
 */
async function updateVestedData(vestedId, data, conn) {
  const db = conn || getPool();
  const allowed = [
    'province', 'district', 'education_zone', 'divisional_secretariat',
    'parish', 'zone', 'region', 'school_address', 'school_phone', 'school_fax',
    'school_email', 'school_census_no', 'year_established', 'school_type_detail',
    'student_admission_type', 'school_category', 'medium_of_instruction',
    'bog_catholic_pct', 'bog_other_christian_pct', 'bog_buddhist_pct',
    'bog_hindu_pct', 'bog_islam_pct', 'bog_other_religion_pct',
    'overview_general', 'overview_remarks', 'overview_special_notes', 'overview_challenges',
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
  params.push(vestedId);
  await db.execute(`UPDATE vested_schools SET ${sets.join(', ')} WHERE id = ?`, params);
}

// ─── deleteSchool ─────────────────────────────────────────────────────────────

/**
 * Deletes a vested school and all its child rows (stats + principals).
 * Runs inside the caller's transaction.
 *
 * @param {number} schoolId   schools.id
 * @param {number} vestedId   vested_schools.id
 * @param {object} conn
 */
async function deleteSchool(schoolId, vestedId, conn) {
  await conn.execute('DELETE FROM vested_school_student_stats WHERE vested_school_id = ?', [vestedId]);
  await conn.execute('DELETE FROM vested_school_principals    WHERE vested_school_id = ?', [vestedId]);
  await conn.execute('DELETE FROM vested_schools              WHERE id = ?', [vestedId]);
  await conn.execute('DELETE FROM schools                     WHERE id = ?', [schoolId]);
}

// ─── Principals ──────────────────────────────────────────────────────────────

const PRINCIPAL_SELECT = `
  SELECT
    p.id,
    p.vested_school_id,
    p.full_name,
    p.nic,
    p.gender,
    p.religion,
    p.date_of_birth,
    p.first_appointment_date,
    p.appointment_to_present_school,
    -- retirement_date: explicit value takes precedence; fallback to DOB + 60 yr
    COALESCE(
      p.retirement_date,
      IF(p.date_of_birth IS NOT NULL,
         DATE_ADD(p.date_of_birth, INTERVAL 60 YEAR),
         NULL)
    )                          AS retirement_date,
    -- Years remaining until retirement (negative = already retired)
    IF(p.date_of_birth IS NOT NULL,
      TIMESTAMPDIFF(
        YEAR,
        CURDATE(),
        COALESCE(p.retirement_date, DATE_ADD(p.date_of_birth, INTERVAL 60 YEAR))
      ),
      NULL
    )                          AS retiring_in_years,
    p.phone,
    p.email,
    p.is_current,
    p.end_date,
    p.departure_reason,
    p.created_at,
    p.updated_at
  FROM vested_school_principals p
`;

/**
 * Returns all principals for a vested school (current first, then archived).
 *
 * @param {number} vestedSchoolId
 * @returns {Promise<object[]>}
 */
async function findPrincipals(vestedSchoolId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `${PRINCIPAL_SELECT}
     WHERE p.vested_school_id = ?
     ORDER BY p.is_current DESC, p.appointment_to_present_school DESC`,
    [vestedSchoolId],
  );
  return rows;
}

/**
 * Returns a single principal by primary key.
 *
 * @param {number} principalId
 * @returns {Promise<object|undefined>}
 */
async function findPrincipalById(principalId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `${PRINCIPAL_SELECT} WHERE p.id = ? LIMIT 1`,
    [principalId],
  );
  return rows[0];
}

/**
 * Inserts a new principal record.
 * If the new principal is current (is_current = 1), the caller should
 * archive the previous current principal first (see archivePrincipal).
 *
 * @param {number} vestedSchoolId
 * @param {object} data
 * @returns {Promise<number>} insertId
 */
async function insertPrincipal(vestedSchoolId, data) {
  const pool = getPool();
  const [result] = await pool.execute(
    `INSERT INTO vested_school_principals
       (vested_school_id, full_name, nic, gender, religion,
        date_of_birth, first_appointment_date, appointment_to_present_school,
        retirement_date, phone, email, is_current)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      vestedSchoolId,
      data.full_name,
      data.nic                           ?? null,
      data.gender                        ?? null,
      data.religion                      ?? null,
      data.date_of_birth                 ?? null,
      data.first_appointment_date        ?? null,
      data.appointment_to_present_school ?? null,
      data.retirement_date               ?? null,
      data.phone                         ?? null,
      data.email                         ?? null,
      data.is_current !== undefined ? (data.is_current ? 1 : 0) : 1,
    ],
  );
  return result.insertId;
}

/**
 * Dynamic UPDATE for a principal record.
 *
 * @param {number} principalId
 * @param {object} data
 */
async function updatePrincipal(principalId, data) {
  const pool    = getPool();
  const allowed = [
    'full_name', 'nic', 'gender', 'religion', 'date_of_birth',
    'first_appointment_date', 'appointment_to_present_school',
    'retirement_date', 'phone', 'email',
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
  params.push(principalId);
  await pool.execute(
    `UPDATE vested_school_principals SET ${sets.join(', ')} WHERE id = ?`,
    params,
  );
}

/**
 * Archives a principal: marks as past (is_current = 0) and records end date.
 *
 * @param {number} principalId
 * @param {{ end_date?, departure_reason? }} data
 */
async function archivePrincipal(principalId, data) {
  const pool = getPool();
  await pool.execute(
    `UPDATE vested_school_principals
     SET is_current        = 0,
         end_date          = ?,
         departure_reason  = ?
     WHERE id = ?`,
    [data.end_date ?? null, data.departure_reason ?? null, principalId],
  );
}

// ─── Student Stats ───────────────────────────────────────────────────────────

const STATS_SELECT = `
  SELECT
    st.id,
    st.vested_school_id,
    st.stat_year,
    st.count_catholic,
    st.count_other_christian,
    st.count_buddhist,
    st.count_hindu,
    st.count_islam,
    st.count_other_religion,
    st.count_sinhala_medium,
    st.count_tamil_medium,
    st.count_english_medium,
    st.total_students,
    st.total_teachers,
    st.total_classes,
    -- Computed religion percentages
    ROUND((st.count_catholic        / NULLIF(st.total_students, 0)) * 100, 2) AS pct_catholic,
    ROUND((st.count_other_christian / NULLIF(st.total_students, 0)) * 100, 2) AS pct_other_christian,
    ROUND((st.count_buddhist        / NULLIF(st.total_students, 0)) * 100, 2) AS pct_buddhist,
    ROUND((st.count_hindu           / NULLIF(st.total_students, 0)) * 100, 2) AS pct_hindu,
    ROUND((st.count_islam           / NULLIF(st.total_students, 0)) * 100, 2) AS pct_islam,
    ROUND((st.count_other_religion  / NULLIF(st.total_students, 0)) * 100, 2) AS pct_other_religion,
    -- Computed medium percentages
    ROUND((st.count_sinhala_medium  / NULLIF(st.total_students, 0)) * 100, 2) AS pct_sinhala_medium,
    ROUND((st.count_tamil_medium    / NULLIF(st.total_students, 0)) * 100, 2) AS pct_tamil_medium,
    ROUND((st.count_english_medium  / NULLIF(st.total_students, 0)) * 100, 2) AS pct_english_medium,
    st.created_at,
    st.updated_at
  FROM vested_school_student_stats st
`;

/**
 * Returns all yearly stats for a vested school (newest year first).
 *
 * @param {number} vestedSchoolId
 * @returns {Promise<object[]>}
 */
async function findStats(vestedSchoolId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `${STATS_SELECT} WHERE st.vested_school_id = ? ORDER BY st.stat_year DESC`,
    [vestedSchoolId],
  );
  return rows;
}

/**
 * Inserts or updates stats for a specific year (upsert on unique key).
 *
 * @param {number} vestedSchoolId
 * @param {number} year
 * @param {object} data
 */
async function upsertStats(vestedSchoolId, year, data) {
  const pool = getPool();

  // Recompute total_students from counts if not explicitly provided
  const totalStudents = data.total_students !== undefined
    ? Number(data.total_students)
    : (
        Number(data.count_catholic       ?? 0) +
        Number(data.count_other_christian ?? 0) +
        Number(data.count_buddhist        ?? 0) +
        Number(data.count_hindu           ?? 0) +
        Number(data.count_islam           ?? 0) +
        Number(data.count_other_religion  ?? 0)
      );

  await pool.execute(
    `INSERT INTO vested_school_student_stats
       (vested_school_id, stat_year,
        count_catholic, count_other_christian, count_buddhist,
        count_hindu, count_islam, count_other_religion,
        count_sinhala_medium, count_tamil_medium, count_english_medium,
        total_students, total_teachers, total_classes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       count_catholic        = VALUES(count_catholic),
       count_other_christian = VALUES(count_other_christian),
       count_buddhist        = VALUES(count_buddhist),
       count_hindu           = VALUES(count_hindu),
       count_islam           = VALUES(count_islam),
       count_other_religion  = VALUES(count_other_religion),
       count_sinhala_medium  = VALUES(count_sinhala_medium),
       count_tamil_medium    = VALUES(count_tamil_medium),
       count_english_medium  = VALUES(count_english_medium),
       total_students        = VALUES(total_students),
       total_teachers        = VALUES(total_teachers),
       total_classes         = VALUES(total_classes)`,
    [
      vestedSchoolId,
      year,
      data.count_catholic        ?? 0,
      data.count_other_christian ?? 0,
      data.count_buddhist        ?? 0,
      data.count_hindu           ?? 0,
      data.count_islam           ?? 0,
      data.count_other_religion  ?? 0,
      data.count_sinhala_medium  ?? 0,
      data.count_tamil_medium    ?? 0,
      data.count_english_medium  ?? 0,
      totalStudents,
      data.total_teachers        ?? 0,
      data.total_classes         ?? 0,
    ],
  );
}

/**
 * Deletes a single year's stats row.
 *
 * @param {number} vestedSchoolId
 * @param {number} year
 * @returns {Promise<boolean>} true if a row was deleted
 */
async function deleteStats(vestedSchoolId, year) {
  const pool = getPool();
  const [result] = await pool.execute(
    'DELETE FROM vested_school_student_stats WHERE vested_school_id = ? AND stat_year = ?',
    [vestedSchoolId, year],
  );
  return result.affectedRows > 0;
}

module.exports = {
  // Schools
  findAll,
  findById,
  findByVestedId,
  insertSchool,
  updateSchoolBase,
  updateVestedData,
  deleteSchool,

  // Principals
  findPrincipals,
  findPrincipalById,
  insertPrincipal,
  updatePrincipal,
  archivePrincipal,

  // Stats
  findStats,
  upsertStats,
  deleteStats,
};
