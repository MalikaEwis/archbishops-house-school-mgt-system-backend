'use strict';

/**
 * tin.repository.js
 * ──────────────────
 * Raw SQL operations for TIN allocation.
 *
 * All write-path functions receive an open mysql2 connection (`conn`)
 * from the caller's transaction so that every read + write in one
 * allocation round-trip is atomic.
 *
 * Tables used:
 *   tin_sequences              – global counter per (table_type, category)
 *   private_school_teachers    – source / target for Private allocations
 *   international_school_teachers – source / target for International allocations
 */

const { getPool } = require('../../config/database');

// ─── Table name map ───────────────────────────────────────────────────────────
const TABLE = {
  Private:       'private_school_teachers',
  International: 'international_school_teachers',
};

function teacherTable(tableType) {
  const t = TABLE[tableType];
  if (!t) throw new Error(`Unknown tableType: "${tableType}"`);
  return t;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sequence row locking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lock the tin_sequences row for (tableType, category) using
 * SELECT … FOR UPDATE.
 *
 * This call BLOCKS until the lock is granted (or the InnoDB
 * innodb_lock_wait_timeout expires, default 50 s).  All concurrent
 * allocations for the same table_type + category will queue behind it.
 *
 * Must be called INSIDE an open transaction.
 *
 * @param {string}  tableType  'Private' | 'International'
 * @param {number}  category   1 | 2 | 3
 * @param {object}  conn       mysql2 connection with open transaction
 * @returns {Promise<{ last_global: number }>}
 */
async function lockSequenceRow(tableType, category, conn) {
  const [rows] = await conn.execute(
    `SELECT last_global
     FROM   tin_sequences
     WHERE  table_type   = ?
       AND  tin_category = ?
     FOR UPDATE`,
    [tableType, category],
  );

  if (!rows.length) {
    // Should never happen after migration 002 seeds the rows,
    // but handle it gracefully rather than crashing.
    await conn.execute(
      `INSERT INTO tin_sequences (table_type, tin_category, last_global)
       VALUES (?, ?, 0)
       ON DUPLICATE KEY UPDATE last_global = last_global`,
      [tableType, category],
    );
    return { last_global: 0 };
  }

  return rows[0];
}

/**
 * Increments last_global by 1 and returns the new value.
 * Must be called INSIDE the same transaction as lockSequenceRow.
 *
 * @param {string}  tableType
 * @param {number}  category
 * @param {object}  conn
 * @returns {Promise<number>}  the newly assigned global number
 */
async function incrementGlobal(tableType, category, conn) {
  await conn.execute(
    `UPDATE tin_sequences
     SET    last_global = last_global + 1
     WHERE  table_type  = ?
       AND  tin_category = ?`,
    [tableType, category],
  );

  const [rows] = await conn.execute(
    `SELECT last_global
     FROM   tin_sequences
     WHERE  table_type   = ?
       AND  tin_category = ?`,
    [tableType, category],
  );

  return rows[0].last_global;
}

// ─────────────────────────────────────────────────────────────────────────────
// Vacant row lookup  (FR-8: reuse before creating new)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Finds the lowest-numbered vacant (is_active = 0) row for the given
 * (tableType, category, schoolNumber) and locks it with FOR UPDATE
 * so no other concurrent transaction can claim the same slot.
 *
 * Returns undefined when no vacant slot exists.
 *
 * Must be called INSIDE an open transaction.
 *
 * @param {string}  tableType
 * @param {number}  category
 * @param {number}  schoolNumber
 * @param {object}  conn
 * @returns {Promise<{ id, tin_teacher_no_school, tin_teacher_no_global }|undefined>}
 */
async function findAndLockVacantRow(tableType, category, schoolNumber, conn) {
  const table = teacherTable(tableType);

  const [rows] = await conn.execute(
    `SELECT id,
            tin_teacher_no_school,
            tin_teacher_no_global
     FROM   \`${table}\`
     WHERE  tin_category     = ?
       AND  tin_school_number = ?
       AND  is_active         = 0
     ORDER BY tin_teacher_no_school ASC
     LIMIT 1
     FOR UPDATE`,
    [category, schoolNumber],
  );

  return rows[0]; // undefined when table is empty or all rows active
}

// ─────────────────────────────────────────────────────────────────────────────
// School-level counter  (FR-10)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns MAX(tin_teacher_no_school) + 1 for the given school.
 *
 * Safe to call while holding the tin_sequences lock because no other
 * allocation for the same category can run concurrently.
 *
 * @param {string}  tableType
 * @param {number}  category
 * @param {number}  schoolNumber
 * @param {object}  conn
 * @returns {Promise<number>}
 */
async function nextInSchool(tableType, category, schoolNumber, conn) {
  const table = teacherTable(tableType);

  const [rows] = await conn.execute(
    `SELECT COALESCE(MAX(tin_teacher_no_school), 0) + 1 AS next_no
     FROM   \`${table}\`
     WHERE  tin_category     = ?
       AND  tin_school_number = ?`,
    [category, schoolNumber],
  );

  return rows[0].next_no;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lookup  (read-only — no connection required)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Searches both teacher tables for a given TIN string.
 * Returns the matching row (with a `source` discriminator) or undefined.
 *
 * @param {string} tin  e.g. '1/026/013/2524'
 * @returns {Promise<object|undefined>}
 */
async function findByTin(tin) {
  const pool = getPool();

  const [rows] = await pool.execute(
    `SELECT id, tin, present_category, full_name, school_id,
            is_active, 'Private' AS source
     FROM   private_school_teachers
     WHERE  tin = ?
     UNION ALL
     SELECT id, tin, category AS present_category, full_name, school_id,
            is_active, 'International' AS source
     FROM   international_school_teachers
     WHERE  tin = ?
     LIMIT 1`,
    [tin, tin],
  );

  return rows[0];
}

/**
 * Returns the current state of a tin_sequences row (useful for previewing
 * the next global number without allocating it).
 *
 * @param {string}  tableType
 * @param {number}  category
 * @returns {Promise<{ table_type, tin_category, last_global }|undefined>}
 */
async function getSequenceInfo(tableType, category) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT table_type, tin_category, last_global
     FROM   tin_sequences
     WHERE  table_type   = ?
       AND  tin_category = ?`,
    [tableType, category],
  );
  return rows[0];
}

module.exports = {
  lockSequenceRow,
  incrementGlobal,
  findAndLockVacantRow,
  nextInSchool,
  findByTin,
  getSequenceInfo,
};
