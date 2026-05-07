'use strict';

/**
 * backfill_school_ids.js
 * ──────────────────────
 * Fixes NULL school FK values in `fathers` (school_id) and
 * `rectors` (present_school_id) by re-reading the source Excel and
 * applying the same normalizeName + SCHOOL_NAME_ALIASES strategy used
 * in the main import.
 *
 * USAGE
 * ─────
 *   node database/backfill_school_ids.js            # apply changes
 *   node database/backfill_school_ids.js --dry-run  # preview only
 *
 * SAFETY
 * ──────
 *   - Only updates rows WHERE the FK IS NULL — never overwrites a correct value.
 *   - Idempotent: safe to run multiple times.
 *   - --dry-run rolls back; no DB writes occur.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const path  = require('path');
const XLSX  = require('xlsx');
const mysql = require('mysql2/promise');

const config = require('../src/config/env');

const RECTORS_FILE = path.resolve(
  __dirname,
  'CSV_files_of_the_current_system',
  'Private',
  'Archdiocesan Rectors and College Fathers..xlsx',
);

// ─── Name helpers (mirror import_xlsx.js exactly) ─────────────────────────────

function normalizeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')   // strip punctuation
    .replace(/\s+/g, ' ')          // collapse whitespace
    .trim();
}

/**
 * Normalised alias map.
 * Keys   → normalised form of the name as it appears in the spreadsheet.
 * Values → normalised form of the name as it exists in the schools table.
 *
 * Populate this after running --dry-run and reviewing [UNMATCHED] lines.
 */
const SCHOOL_NAME_ALIASES = {
  // "Croos" is a typo in the source spreadsheet; DB has the correct "Cross".
  'holy croos college kalutara payagala branch':       'holy cross college kalutara payagala branch',

  // Source spells "Palawatta"; DB has "Pelawatta, Battaramulla".
  'st nicholas international school palawatta':         'st nicholas international school pelawatta battaramulla',

  // Source includes "Catholic"; DB name omits it.
  'st thomas catholic international college seeduwa':  'st thomas international college seeduwa',
};

function clean(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

// ─── Excel helper ─────────────────────────────────────────────────────────────

/**
 * Reads a sheet and builds a map of { [no]: schoolNameString }.
 * Skips rows where `no` is absent or invalid.
 */
function buildNoToSchoolName(wb, sheetName, noCol, nameCol, dataStartRow) {
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet '${sheetName}' not found in workbook`);

  const matrix = XLSX.utils.sheet_to_json(ws, {
    header:  1,
    defval:  null,
    raw:     false,
  });

  const map = {};
  for (let i = dataStartRow; i < matrix.length; i++) {
    const row  = matrix[i];
    const no   = parseInt(String(row[noCol] ?? '').trim(), 10);
    const name = clean(row[nameCol]);
    if (!isNaN(no) && no > 0 && name) {
      map[no] = name;
    }
  }
  return map;
}

// ─── Core backfill ────────────────────────────────────────────────────────────

/**
 * Resolves school IDs for one table and issues UPDATE statements.
 *
 * @param {object} opts
 * @param {object} opts.conn           - mysql2 connection
 * @param {boolean} opts.dryRun
 * @param {string} opts.table          - 'fathers' | 'rectors'
 * @param {string} opts.pkCol          - 'father_no' | 'rector_no'
 * @param {string} opts.fkCol          - 'school_id' | 'present_school_id'
 * @param {Object<number,string>} opts.noToSchoolName  - from buildNoToSchoolName
 * @param {Object<string,number>} opts.byNormName      - from schools table
 * @param {string} opts.label          - display label for logging
 */
async function backfill(opts) {
  const { conn, dryRun, table, pkCol, fkCol, noToSchoolName, byNormName, label } = opts;

  // Only fetch rows that need fixing
  const [rows] = await conn.execute(
    `SELECT id, ${pkCol} FROM ${table} WHERE ${fkCol} IS NULL ORDER BY ${pkCol} ASC`,
  );

  console.log(`\n── ${label}s: ${rows.length} row(s) with NULL ${fkCol}`);

  if (rows.length === 0) {
    console.log('   Nothing to do.');
    return { updated: 0, unmatched: 0 };
  }

  let updated   = 0;
  let unmatched = 0;

  for (const row of rows) {
    const no         = row[pkCol];
    const schoolName = noToSchoolName[no];

    // ── No school name in the spreadsheet for this number ─────────────────────
    if (!schoolName) {
      console.warn(`  [SKIP]      ${label} #${no}: no school name in spreadsheet`);
      unmatched++;
      continue;
    }

    // ── Normalise and apply alias ──────────────────────────────────────────────
    const normRaw      = normalizeName(schoolName);
    const normResolved = SCHOOL_NAME_ALIASES[normRaw] ?? normRaw;
    const schoolId     = byNormName[normResolved] ?? null;

    if (!schoolId) {
      console.warn(
        `  [UNMATCHED] ${label} #${no}: "${schoolName}"` +
        `  (norm: "${normResolved}") — add an alias to SCHOOL_NAME_ALIASES`,
      );
      unmatched++;
      continue;
    }

    // ── Found a match ──────────────────────────────────────────────────────────
    if (dryRun) {
      console.log(`  [DRY-RUN]   ${label} #${no}: "${schoolName}" → school_id ${schoolId}`);
    } else {
      await conn.execute(
        // Double-guard: re-check IS NULL so a concurrent fix can't race us
        `UPDATE ${table} SET ${fkCol} = ? WHERE id = ? AND ${fkCol} IS NULL`,
        [schoolId, row.id],
      );
      console.log(`  [UPDATED]   ${label} #${no}: "${schoolName}" → school_id ${schoolId}`);
    }
    updated++;
  }

  return { updated, unmatched };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(dryRun
    ? '=== BACKFILL school IDs [DRY-RUN — no writes] ==='
    : '=== BACKFILL school IDs ===',
  );

  // 1. Load the Excel workbook
  if (!require('fs').existsSync(RECTORS_FILE)) {
    console.error(`File not found: ${RECTORS_FILE}`);
    process.exit(1);
  }
  const wb = XLSX.readFile(RECTORS_FILE, { cellDates: true, cellNF: false, cellText: false });

  // 2. Build no → school name maps from the spreadsheet
  //    Rectors sheet:       col 0 = rector_no,  col 2 = school name, data from row index 3
  //    College Fathers sheet: col 0 = father_no, col 2 = school name, data from row index 3
  const rectorSchoolNames = buildNoToSchoolName(wb, 'Rectors',         0, 2, 3);
  const fatherSchoolNames = buildNoToSchoolName(wb, 'College Fathers', 0, 2, 3);

  console.log(
    `\nSpreadsheet: ${Object.keys(rectorSchoolNames).length} rector rows,` +
    ` ${Object.keys(fatherSchoolNames).length} father rows with school names`,
  );

  // 3. Connect to DB
  const pool = mysql.createPool({
    host:               config.db.host,
    port:               config.db.port,
    user:               config.db.user,
    password:           config.db.password,
    database:           config.db.name,
    waitForConnections: true,
    connectionLimit:    1,
  });

  const conn = await pool.getConnection();

  try {
    // 4. Build normalised name → id map from schools table
    const [schoolRows] = await conn.execute('SELECT id, school_name FROM schools');
    const byNormName   = {};
    for (const r of schoolRows) {
      if (r.school_name) byNormName[normalizeName(r.school_name)] = r.id;
    }
    console.log(`Schools table: ${Object.keys(byNormName).length} entries loaded`);

    // 5. Count NULLs before
    const [[{ r_null }]] = await conn.execute(
      'SELECT COUNT(*) AS r_null FROM rectors WHERE present_school_id IS NULL',
    );
    const [[{ f_null }]] = await conn.execute(
      'SELECT COUNT(*) AS f_null FROM fathers WHERE school_id IS NULL',
    );
    console.log(`\nBefore: ${r_null} rector(s) with NULL present_school_id, ${f_null} father(s) with NULL school_id`);

    // 6. Run backfill for each table
    const rStats = await backfill({
      conn, dryRun,
      table:          'rectors',
      pkCol:          'rector_no',
      fkCol:          'present_school_id',
      noToSchoolName: rectorSchoolNames,
      byNormName,
      label:          'Rector',
    });

    const fStats = await backfill({
      conn, dryRun,
      table:          'fathers',
      pkCol:          'father_no',
      fkCol:          'school_id',
      noToSchoolName: fatherSchoolNames,
      byNormName,
      label:          'Father',
    });

    // 7. Count NULLs after (only meaningful without --dry-run)
    if (!dryRun) {
      const [[{ r_null_after }]] = await conn.execute(
        'SELECT COUNT(*) AS r_null_after FROM rectors WHERE present_school_id IS NULL',
      );
      const [[{ f_null_after }]] = await conn.execute(
        'SELECT COUNT(*) AS f_null_after FROM fathers WHERE school_id IS NULL',
      );
      console.log(`\nAfter:  ${r_null_after} rector(s) with NULL present_school_id, ${f_null_after} father(s) with NULL school_id`);
    }

    // 8. Summary
    console.log('\n─── Summary ───────────────────────────────────────────────');
    console.log(`Rectors  — updated: ${rStats.updated}, unmatched: ${rStats.unmatched}`);
    console.log(`Fathers  — updated: ${fStats.updated}, unmatched: ${fStats.unmatched}`);
    if (dryRun) console.log('\n[DRY-RUN] No rows were changed.');
    if (rStats.unmatched + fStats.unmatched > 0) {
      console.log('\nFor each [UNMATCHED] line above, add an entry to SCHOOL_NAME_ALIASES in this script,');
      console.log('then re-run. Keys and values must both be in normalised form (see normalizeName).');
    }

  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
