'use strict';

const { getPool } = require('../../config/database');
const {
  loadWorkbookFromBuffer,
  buildSchoolMaps,
  importPrivateTeachers,
  importRetiredTeachers,
  importInternationalTeachers,
} = require('./admin.importer');

function toSummary(stats) {
  return {
    inserted:           stats.inserted,
    placeholders:       stats.placeholderDetails.length,
    skipped:            stats.skippedDetails.length,
    errors:             stats.errorDetails.length,
    placeholderDetails: stats.placeholderDetails,
    skippedDetails:     stats.skippedDetails,
    errorDetails:       stats.errorDetails,
  };
}

async function resetImportPrivate(fileBuffer) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const satelliteTables = [
      'private_teacher_phones',
      'private_teacher_contracts',
      'private_teacher_mediums',
      'private_teacher_class_levels',
      'private_teacher_education',
      'private_teacher_professional_qualifications',
      'private_teacher_subjects',
    ];
    for (const t of satelliteTables) {
      await conn.execute(`DELETE FROM \`${t}\``);
    }

    await conn.execute(`DELETE FROM teacher_removal_approvals WHERE teacher_type = 'Private'`);
    await conn.execute('DELETE FROM private_school_teachers');
    await conn.execute(`UPDATE tin_sequences SET last_global = 0 WHERE table_type = 'Private'`);

    const wb         = loadWorkbookFromBuffer(fileBuffer);
    const schoolMaps = await buildSchoolMaps(conn);

    const activeStats  = await importPrivateTeachers(wb, conn, schoolMaps);
    const retiredStats = await importRetiredTeachers(wb, conn, schoolMaps);

    await conn.commit();

    return {
      active:  toSummary(activeStats),
      retired: toSummary(retiredStats),
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function resetImportInternational(fileBuffer) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const satelliteTables = [
      'international_teacher_phones',
      'international_teacher_contracts',
    ];
    for (const t of satelliteTables) {
      await conn.execute(`DELETE FROM \`${t}\``);
    }

    await conn.execute(`DELETE FROM teacher_removal_approvals WHERE teacher_type = 'International'`);
    await conn.execute('DELETE FROM international_school_teachers');
    await conn.execute(`UPDATE tin_sequences SET last_global = 0 WHERE table_type = 'International'`);

    const wb         = loadWorkbookFromBuffer(fileBuffer);
    const schoolMaps = await buildSchoolMaps(conn);

    const stats = await importInternationalTeachers(wb, conn, schoolMaps);

    await conn.commit();

    return {
      international: toSummary(stats),
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { resetImportPrivate, resetImportInternational };
