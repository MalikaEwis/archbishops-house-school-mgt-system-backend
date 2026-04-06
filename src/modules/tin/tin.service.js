'use strict';

/**
 * tin.service.js
 * ───────────────
 * Authoritative TIN allocation for the Archbishop's House system.
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  TIN FORMAT  (SRS FR-5)                                      ║
 * ║  Category / SchoolNo / TeacherNoInSchool / TeacherNoGlobal   ║
 * ║  e.g.  1 / 026 / 013 / 2524                                  ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Category values (FR-6):
 *   1 = Teacher  |  2 = Clerical Staff  |  3 = Minor Staff
 *
 * School number ranges (FR-7):
 *   Private:       01 – 32
 *   International: 51 – 55
 *
 * ─────────────────────────────────────────────────────────────
 * CONCURRENCY SAFETY
 * ─────────────────────────────────────────────────────────────
 * Problem: Two simultaneous teacher-creation requests for the
 * same (tableType, category) would both read MAX(global) = N,
 * both compute N+1, and both try to INSERT — causing a duplicate
 * TIN or a wasted retry.
 *
 * Solution: tin_sequences table + SELECT … FOR UPDATE
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ Transaction A                  Transaction B             │
 *   │ (same category, any school)    (same category, any)      │
 *   ├──────────────────────────────────────────────────────────┤
 *   │ BEGIN                          BEGIN                     │
 *   │ SELECT … FOR UPDATE  ◄── locks row                       │
 *   │                               SELECT … FOR UPDATE        │
 *   │                               ↑ BLOCKS here              │
 *   │ check vacant, compute nums                               │
 *   │ UPDATE tin_sequences                                     │
 *   │ INSERT teacher row                                       │
 *   │ COMMIT  ──releases lock──►    ↓ unblocks                │
 *   │                               reads updated last_global  │
 *   │                               computes next number       │
 *   │                               COMMIT                     │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Because allocate() is called INSIDE the teacher-creation
 * transaction, the lock is held from "check vacant" through
 * "insert row" — no window exists between computing and writing.
 *
 * Different categories (e.g. category-1 vs category-2) lock
 * different rows and therefore run fully in parallel.
 *
 * ─────────────────────────────────────────────────────────────
 * REUSE LOGIC  (FR-8, FR-9)
 * ─────────────────────────────────────────────────────────────
 * A vacant row is one that was soft-deleted (is_active = 0).
 * Causes: Resignation, Retirement, Transfer, Qualification_Failure.
 *
 * On reuse:
 *   - The row's existing TIN components are never changed.
 *   - The global counter is NOT incremented (the old number is recycled).
 *   - The vacant row is locked FOR UPDATE so two concurrent requests
 *     cannot both claim the same slot.
 */

const tinRepo  = require('./tin.repository');
const AppError = require('../../shared/utils/AppError');

// ─── Validation constants ─────────────────────────────────────────────────────

const VALID_CATEGORIES = new Set([1, 2, 3]);

const SCHOOL_RANGES = {
  Private:       { min: 1,  max: 32 },
  International: { min: 51, max: 55 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formats a TIN string from its four numeric parts.
 * This mirrors the GENERATED ALWAYS AS expression in MySQL so the
 * application can predict the value before the row is committed.
 *
 * @param {number} category
 * @param {number} schoolNumber
 * @param {number} noInSchool
 * @param {number} noGlobal
 * @returns {string}  e.g. '1/026/013/2524'
 */
function formatTin(category, schoolNumber, noInSchool, noGlobal) {
  return [
    category,
    String(schoolNumber).padStart(3, '0'),
    String(noInSchool).padStart(3, '0'),
    noGlobal,
  ].join('/');
}

/**
 * Validates category and school number against SRS rules.
 * Throws AppError 400 on any violation.
 *
 * @param {number} category
 * @param {number} schoolNumber
 * @param {string} tableType  'Private' | 'International'
 */
function validateParams(category, schoolNumber, tableType) {
  const cat = Number(category);
  const sno = Number(schoolNumber);

  if (!VALID_CATEGORIES.has(cat)) {
    throw new AppError(
      `Invalid TIN category "${category}". Must be 1 (Teacher), 2 (Clerical), or 3 (Minor).`,
      400,
    );
  }

  const range = SCHOOL_RANGES[tableType];
  if (!range) {
    throw new AppError(`Unknown tableType "${tableType}". Must be "Private" or "International".`, 400);
  }
  if (sno < range.min || sno > range.max) {
    throw new AppError(
      `School number ${sno} is out of range for ${tableType} schools (${range.min}–${range.max}).`,
      400,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// allocate  — the only public write function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Allocates the next available TIN for a teacher within an existing
 * database transaction.
 *
 * The caller (teachers.service or international_teachers.service) must:
 *   1. Open a connection from the pool.
 *   2. Call conn.beginTransaction().
 *   3. Pass `conn` to this function.
 *   4. Use the returned numbers to INSERT or UPDATE the teacher row.
 *   5. Call conn.commit() / conn.rollback() as appropriate.
 *
 * This function MUST NOT commit or rollback — that responsibility
 * belongs to the caller.
 *
 * @param {{
 *   tableType:    string,   'Private' | 'International'
 *   category:     number,   1 | 2 | 3
 *   schoolNumber: number,   e.g. 26
 *   conn:         object    open mysql2 connection with active transaction
 * }} options
 *
 * @returns {Promise<{
 *   isReuse:              boolean,
 *   rowId:                number|null,   set when isReuse = true
 *   tin_teacher_no_school: number,
 *   tin_teacher_no_global: number,
 *   previewTin:           string          formatted TIN preview
 * }>}
 */
async function allocate({ tableType, category, schoolNumber, conn }) {
  const cat = Number(category);
  const sno = Number(schoolNumber);

  validateParams(cat, sno, tableType);

  // ── Step 1: Lock the sequence row ────────────────────────────────────────
  // This SELECT … FOR UPDATE blocks any other allocate() call for the
  // same (tableType, category) until this transaction commits/rolls back.
  await tinRepo.lockSequenceRow(tableType, cat, conn);

  // ── Step 2: Check for a vacant (reusable) slot ───────────────────────────
  // Also locked FOR UPDATE so two concurrent transactions cannot both
  // claim the same slot (FR-8).
  const vacant = await tinRepo.findAndLockVacantRow(tableType, cat, sno, conn);

  if (vacant) {
    // ── REUSE PATH (FR-8) ──────────────────────────────────────────────────
    // The existing TIN numbers are preserved exactly.
    // The sequence counter is NOT incremented.
    return {
      isReuse:               true,
      rowId:                 vacant.id,
      tin_teacher_no_school: vacant.tin_teacher_no_school,
      tin_teacher_no_global: vacant.tin_teacher_no_global,
      previewTin: formatTin(cat, sno, vacant.tin_teacher_no_school, vacant.tin_teacher_no_global),
    };
  }

  // ── NEW TIN PATH (FR-10, FR-11) ───────────────────────────────────────────
  // Compute both counters while holding the sequence lock so they are
  // consistent even when different schools within the same category
  // allocate concurrently.

  // FR-10: teacher_no_school = highest existing number for this school + 1
  const noInSchool = await tinRepo.nextInSchool(tableType, cat, sno, conn);

  // FR-11: teacher_no_global = highest across the entire table for this
  //        category + 1  (maintained in tin_sequences.last_global)
  const noGlobal = await tinRepo.incrementGlobal(tableType, cat, conn);

  return {
    isReuse:               false,
    rowId:                 null,
    tin_teacher_no_school: noInSchool,
    tin_teacher_no_global: noGlobal,
    previewTin: formatTin(cat, sno, noInSchool, noGlobal),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// findByTin — read-only lookup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Searches both teacher tables for the given TIN string.
 *
 * @param {string} tin  e.g. '1/026/013/2524'
 * @returns {Promise<object>}
 */
async function findByTin(tin) {
  if (!tin || typeof tin !== 'string') {
    throw new AppError('TIN must be a non-empty string.', 400);
  }

  // Basic format check before hitting the DB
  const TIN_REGEX = /^\d\/\d{3}\/\d{3}\/\d+$/;
  if (!TIN_REGEX.test(tin.trim())) {
    throw new AppError(
      'Invalid TIN format. Expected: Category/SchoolNo/TeacherNoInSchool/GlobalNo  e.g. 1/026/013/2524',
      400,
    );
  }

  const result = await tinRepo.findByTin(tin.trim());
  if (!result) {
    throw new AppError(`No teacher found with TIN "${tin}".`, 404);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// previewNext — non-destructive preview of the next TIN that would be issued
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a preview of the TIN that WOULD be generated for the given
 * parameters without actually allocating it.  Useful for the UI to show
 * the upcoming TIN before the admin submits the form.
 *
 * WARNING: The preview is not reserved.  Concurrent allocations may
 * consume the number before the form is submitted.
 *
 * @param {{ tableType, category, schoolNumber }} params
 * @returns {Promise<{ previewTin: string, isReuse: boolean }>}
 */
async function previewNext({ tableType, category, schoolNumber }) {
  const cat = Number(category);
  const sno = Number(schoolNumber);

  validateParams(cat, sno, tableType);

  const pool = require('../../config/database').getPool();

  // Check for a vacant row (non-locking read — this is just a preview)
  const table = tableType === 'Private'
    ? 'private_school_teachers'
    : 'international_school_teachers';

  const [vacantRows] = await pool.execute(
    `SELECT tin_teacher_no_school, tin_teacher_no_global
     FROM   \`${table}\`
     WHERE  tin_category     = ?
       AND  tin_school_number = ?
       AND  is_active         = 0
     ORDER BY tin_teacher_no_school ASC
     LIMIT 1`,
    [cat, sno],
  );

  if (vacantRows.length) {
    const v = vacantRows[0];
    return {
      isReuse:    true,
      previewTin: formatTin(cat, sno, v.tin_teacher_no_school, v.tin_teacher_no_global),
    };
  }

  // Compute next numbers from current MAX values (read-only)
  const [[schoolRow], seqInfo] = await Promise.all([
    pool.execute(
      `SELECT COALESCE(MAX(tin_teacher_no_school), 0) + 1 AS next_no
       FROM   \`${table}\`
       WHERE  tin_category     = ?
         AND  tin_school_number = ?`,
      [cat, sno],
    ),
    tinRepo.getSequenceInfo(tableType, cat),
  ]);

  const noInSchool = schoolRow[0].next_no;
  const noGlobal   = (seqInfo?.last_global ?? 0) + 1;

  return {
    isReuse:    false,
    previewTin: formatTin(cat, sno, noInSchool, noGlobal),
  };
}

module.exports = { allocate, findByTin, previewNext, formatTin, validateParams };
