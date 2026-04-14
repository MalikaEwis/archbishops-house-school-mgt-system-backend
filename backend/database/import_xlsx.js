'use strict';

/**
 * import_xlsx.js
 * ───────────────
 * Excel (xlsx) migration tool for the Archbishop's House School Management System.
 * Reads the original legacy spreadsheets and maps them into the MySQL schema.
 *
 * USAGE
 * ─────
 *   node database/import_xlsx.js --module <module> [--dry-run] [--verbose]
 *
 * MODULES  (run in this order — dependencies matter)
 * ───────────────────────────────────────────────────
 *   schools       Scl Number List sheet  → schools table
 *   private       Tutorial Staff Database → private_school_teachers + satellites
 *   retired       Retired sheet          → private_school_teachers (is_active=0)
 *   international Academic / Non-Academic / Support Staff → international_school_teachers
 *   rectors       Rectors sheet          → rectors + rector_qualifications
 *   fathers       College Fathers sheet  → fathers + father_qualifications
 *   vested        Vested Schools Now - 2024 → schools + vested_schools + principals
 *
 * FLAGS
 * ─────
 *   --dry-run   Validate and process but roll back at end (no DB writes)
 *   --verbose   Print a line for every row processed (OK rows too)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const fs    = require('fs');
const path  = require('path');
const XLSX  = require('xlsx');
const mysql = require('mysql2/promise');

const config = require('../src/config/env');

const BASE = path.resolve(__dirname, 'CSV_files_of_the_current_system');

// ─── File paths ───────────────────────────────────────────────────────────────

const PRIVATE_FILE       = path.join(BASE, 'Private',       'Private Schools Main Database 2025-12-10.xlsx');
const RECTORS_FILE       = path.join(BASE, 'Private',       'Archdiocesan Rectors and College Fathers..xlsx');
const INTL_FILE          = path.join(BASE, 'International', '1 - ACIS DB saved on 03.12.2025.xlsx');
const VESTED_FILE        = path.join(BASE, 'Vested',        'Vested Schools Data Base  - 2025.11.07.xlsx');

// ─── CLI parsing ──────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { module: null, dryRun: false, verbose: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--module' && args[i + 1]) opts.module  = args[++i];
    if (args[i] === '--dry-run')               opts.dryRun  = true;
    if (args[i] === '--verbose')               opts.verbose = true;
  }
  return opts;
}

// ─── Excel helpers ────────────────────────────────────────────────────────────

/**
 * Loads a workbook from disk.
 * cellDates:true returns JS Date objects for date cells instead of Excel serial numbers.
 */
function loadWorkbook(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return XLSX.readFile(filePath, { cellDates: true, cellNF: false, cellText: false });
}

/**
 * Returns a sheet's data as an array of arrays (no header conversion).
 * Empty trailing cells in each row are trimmed to max_column.
 */
function sheetToMatrix(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet '${sheetName}' not found in workbook`);
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
}

// ─── Stats tracker ────────────────────────────────────────────────────────────

function makeStats() {
  return { inserted: 0, skipped: 0, errors: 0, failures: [] };
}

function rowLabel(idx) {
  // idx is 0-based among all matrix rows; add 1 for 1-based display
  return `row ${idx + 1}`;
}

function logSkip(stats, rowIdx, reason, opts) {
  const msg = `[SKIP] ${rowLabel(rowIdx)} — ${reason}`;
  if (opts.verbose) console.warn(`  ${msg}`);
  stats.failures.push(msg);
  stats.skipped++;
}

function logError(stats, rowIdx, context, err, opts) {
  const msg = `[ERROR] ${rowLabel(rowIdx)} — ${context}: ${err.message}`;
  console.error(`  ${msg}`);
  stats.failures.push(msg);
  stats.errors++;
}

// ─── Data-cleaning helpers ────────────────────────────────────────────────────

/** Trim and normalise whitespace. Returns null for empty/whitespace-only. */
function clean(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim().replace(/\s+/g, ' ');
  return s === '' || s === '-' ? null : s;
}

/**
 * Extract first phone number from a cell that may contain multiple
 * space/comma-separated numbers. Truncates to 25 chars (VARCHAR(25)).
 */
function cleanPhone(val) {
  const s = clean(val);
  if (!s) return null;
  // Split on comma/semicolon or on a gap before a new phone starting with 0
  const first = s.split(/[,;]|\s+(?=0)/)[0].trim();
  return first.slice(0, 25) || null;
}

/**
 * Converts a cell value to YYYY-MM-DD.
 * Accepts: JS Date, ISO string, DD/MM/YYYY, D/M/YYYY, YYYY-MM-DD,
 *          DD-MM-YYYY, YYYY.MM.DD, DD.MM.YYYY, 4-digit year.
 * Returns null for unparseable values (never throws).
 */
function parseDate(val) {
  if (val === null || val === undefined) return null;

  // SheetJS with cellDates:true returns JS Date objects for date cells
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return val.toISOString().split('T')[0];
  }

  const s = String(val).trim().replace(/\s+/g, ' ');
  if (!s || s === '-' || s === 'N/A') return null;

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // YYYY.MM.DD  (Rectors / Fathers dates)
  let m = s.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  // DD.MM.YYYY  (Fathers ordination dates)
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;

  // DD/MM/YYYY
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;

  // DD.MM.YYYY from dot-separated where first part could be 2 digits
  m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;

  // YYYY/MM/DD
  m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // DD-MM-YYYY
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;

  // Year only → 1 January of that year
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;

  // Excel serial number (5+ digit integer, e.g. "27886" for 1976-05-06)
  if (/^\d{5,}$/.test(s)) {
    const serial = parseInt(s, 10);
    // Excel epoch is Dec 30, 1899 (accounts for Lotus 1-2-3 leap-year bug)
    const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    if (isNaN(d.getTime())) return null;
    const yr = d.getUTCFullYear();
    if (yr < 1900 || yr > 2100) return null;
    return d.toISOString().split('T')[0];
  }

  // Last resort: native Date parsing
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const yr = d.getUTCFullYear();
    if (yr < 1900 || yr > 2100) return null;
    return d.toISOString().split('T')[0];
  }

  return null;
}

/** Parse TIN string "1/026/013/2524" → object. Returns null on failure. */
function parseTin(val) {
  const s = clean(val);
  if (!s) return null;

  const parts = s.split('/');
  if (parts.length !== 4) return null;

  const nums = parts.map(p => {
    const n = parseInt(p.trim(), 10);
    return isNaN(n) ? null : n;
  });

  if (nums.some(n => n === null)) return null;

  return {
    tin_category:          nums[0],
    tin_school_number:     nums[1],
    tin_teacher_no_school: nums[2],
    tin_teacher_no_global: nums[3],
  };
}

/** Normalise gender to 'Male' | 'Female' | 'Other' | null. */
function mapGender(val) {
  const s = clean(val)?.toLowerCase();
  if (!s) return null;
  if (s === 'm' || s === 'male')   return 'Male';
  if (s === 'f' || s === 'female') return 'Female';
  return 'Other';
}

/**
 * Maps SSP / DCETT training status values to schema ENUM.
 *
 * Source values seen:
 *   'Yes'        → Yes
 *   'Completed'  → Completed
 *   'Not Complet' | 'Following' → Not_Completed
 *   blank        → Not_Completed
 */
function mapTrainingStatus(val) {
  const s = clean(val)?.toLowerCase();
  if (!s)                          return 'Not_Completed';
  if (s === 'yes')                 return 'Yes';
  if (s === 'completed')           return 'Completed';
  // 'not complet', 'following', anything else
  return 'Not_Completed';
}

/**
 * Maps confirmation letter values.
 *   'Done' → 'Issued'
 *   blank  → 'Pending'
 */
function mapConfirmationStatus(val) {
  const s = clean(val)?.toLowerCase();
  if (!s) return 'Pending';
  if (s === 'done' || s === 'issued') return 'Issued';
  if (s === 'not required' || s === 'not_required' || s === 'n/a') return 'Not_Required';
  return 'Pending';
}

/**
 * Maps private school teacher category number to integer.
 * '1' → 1 (Pensionable), '2' → 2, '3' → 3, '4' → 4 (Fixed Term)
 */
function mapPrivateCategory(val) {
  const n = parseInt(String(val ?? '').trim(), 10);
  if ([1, 2, 3, 4].includes(n)) return n;
  return null;
}

/**
 * Maps international teacher category text to schema ENUM.
 *
 * Decision: 'Probation' → 'Permanent' (SRS: permanent teachers have a 6-month probation)
 */
function mapIntlCategory(val) {
  const s = clean(val)?.toLowerCase() ?? '';
  if (s.includes('contract') || s.includes('temporary') || s.includes('fixed') ||
      s === 'n/a' || s.includes('days/wk') || s.includes('part')) {
    return 'Fixed_Term_Contract';
  }
  // 'confirmed', 'probation', 'confirmed -013', '' (blank treated elsewhere)
  return 'Permanent';
}

/**
 * Maps rector/father registration status.
 */
function mapRegistrationStatus(val) {
  const s = clean(val)?.toLowerCase() ?? '';
  if (s === 'registered')   return 'Registered';
  if (s === 'unregistered') return 'Unregistered';
  return 'Pending';
}

/**
 * Maps vested school medium codes.
 *   'S' → 'Sinhala'  'T' → 'Tamil'  'E' → 'English'  combinations allowed.
 */
function mapMedium(val) {
  const s = clean(val)?.toUpperCase();
  if (!s) return null;
  const map = { S: 'Sinhala', T: 'Tamil', E: 'English' };
  return s.split('/').map(p => map[p.trim()] ?? p.trim()).join('/');
}

/**
 * Maps vested school student admission type.
 */
function mapAdmissionType(val) {
  const s = clean(val)?.toLowerCase() ?? '';
  if (s === 'boys' || s === 'b')              return 'Boys';
  if (s === 'girls' || s === 'g')             return 'Girls';
  if (s === 'mixed' || s === 'co-ed')         return 'Mixed';
  return null;
}

/**
 * Maps vested principal religion / congregation abbreviations.
 */
function mapPrincipalReligion(val) {
  const s = clean(val);
  if (!s) return null;
  const norm = s.toUpperCase().replace(/[\s.]/g, '');
  const table = {
    'RC':            'Roman Catholic',
    'AC':            'Augustinian',
    'HF':            'Holy Family',
    'OMI':           'Oblates of Mary Immaculate',
    'RGS':           'Religious of the Good Shepherd',
    'OP':            'Dominican',
    'DIOCESAN':      'Diocesan',
    'DELASALLE':     'De La Salle Brothers',
    'HOLYCROSS':     'Holy Cross',
    'NONRC':         'Non-Catholic',
    'NONRC':         'Non-Catholic',
  };
  return table[norm] ?? s;   // If not in table, keep as-is
}

/**
 * Splits a phone / multi-value cell on comma, pipe, or semicolon.
 * Returns array of non-empty cleaned strings.
 */
function splitPhones(val) {
  const s = clean(val);
  if (!s) return [];
  return s.split(/[,;|]/).map(v => v.trim()).filter(Boolean);
}

/**
 * Cleans a NIC: strips spaces and uppercases.
 * Returns null only if the value is empty/placeholder.
 * Does NOT reject on format — callers should warn but still insert.
 * Scientific notation values (precision lost) are returned as null.
 */
function cleanNic(val) {
  const raw = String(val ?? '').trim();
  if (!raw || raw === '-' || raw === 'N/A') return null;
  // Scientific notation (e.g. "1.99357E+11") — precision irretrievably lost
  if (/^\d+\.\d+E\+\d+$/i.test(raw)) return null;
  return raw.replace(/\s+/g, '').toUpperCase() || null;
}

/**
 * Returns true if NIC looks valid (old 9+V/X or new 12-digit format).
 * Used only for warnings — does NOT cause a skip.
 */
function isValidNicFormat(nic) {
  if (!nic) return false;
  return /^[0-9]{9}[VX]$/.test(nic) || /^[0-9]{12}$/.test(nic);
}

/**
 * Allocates a new TIN inline during import (mirrors tinService.allocate for new-TIN path).
 * Must be called inside an active transaction on `conn`.
 * Returns { tinCat, tinSchNo, tinInSch, tinGlobal }.
 */
async function allocateTinForImport(conn, tableType, category, schoolNumber) {
  const table = tableType === 'Private'
    ? 'private_school_teachers'
    : 'international_school_teachers';

  // Lock the sequence row for this (tableType, category)
  await conn.execute(
    'SELECT last_global FROM tin_sequences WHERE table_type = ? AND tin_category = ? FOR UPDATE',
    [tableType, category],
  );

  // Next in-school number
  const [[schRow]] = await conn.execute(
    `SELECT COALESCE(MAX(tin_teacher_no_school), 0) + 1 AS next_no
     FROM \`${table}\`
     WHERE tin_category = ? AND tin_school_number = ?`,
    [category, schoolNumber],
  );
  const tinInSch = schRow.next_no;

  // Increment global counter and read new value
  await conn.execute(
    'UPDATE tin_sequences SET last_global = last_global + 1 WHERE table_type = ? AND tin_category = ?',
    [tableType, category],
  );
  const [[seqRow]] = await conn.execute(
    'SELECT last_global FROM tin_sequences WHERE table_type = ? AND tin_category = ?',
    [tableType, category],
  );
  const tinGlobal = seqRow.last_global;

  return { tinCat: category, tinSchNo: schoolNumber, tinInSch, tinGlobal };
}

// ─── School lookup map builders ───────────────────────────────────────────────

/**
 * Fetches all schools from DB and returns lookup maps.
 * byIndex: '001' → id
 * byName:  'St. Bridget\'s Convent...' → id
 */
async function buildSchoolMaps(conn) {
  const [rows] = await conn.execute('SELECT id, school_index, school_name FROM schools');
  const byIndex = {};
  const byName  = {};
  for (const r of rows) {
    if (r.school_index) byIndex[r.school_index] = r.id;
    if (r.school_name)  byName[r.school_name]   = r.id;
  }
  return { byIndex, byName };
}

/**
 * Extracts a 3-digit zero-padded school index from the Private DB school column.
 * Handles all formats seen in the source data:
 *   "001-St. Bridget's Convent..."   → 001
 *   "001"                            → 001
 *   "PS 01 - St. Bridget..."         → 001   (leading non-digit prefix)
 *   "1"                              → 001
 */
function extractSchoolIndex(val) {
  const s = clean(val);
  if (!s) return null;
  // Find the first isolated 1-3 digit number (word-boundary anchored)
  const m = s.match(/\b(\d{1,3})\b/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n <= 0 || n > 999) return null;
  return String(n).padStart(3, '0');
}

// ─── Module 1: Schools (Private school index) ─────────────────────────────────

/**
 * Imports private school master records from 'Scl Number List' sheet.
 *
 * Columns:
 *   Col 0: No. (index, e.g. '001')
 *   Col 1: School Name
 *   Col 2: Principal Name
 *
 * Uses ON DUPLICATE KEY UPDATE so it's safe to re-run.
 */
async function importSchools(wb, conn, opts) {
  const stats = makeStats();
  const matrix = sheetToMatrix(wb, 'Scl Number List');

  // Row 0 is a blank title row; Row 1 is "No / School Name" header; data from Row 2
  for (let i = 2; i < matrix.length; i++) {
    const row = matrix[i];
    try {
      const rawIdx = clean(row[0]);
      const name   = clean(row[1]);

      if (!rawIdx || !name) {
        logSkip(stats, i, 'Missing school index or name', opts);
        continue;
      }

      const idx = String(parseInt(rawIdx, 10)).padStart(3, '0');

      await conn.execute(
        `INSERT INTO schools
           (school_index, school_name, school_type)
         VALUES (?, ?, 'Private')
         ON DUPLICATE KEY UPDATE
           school_name    = VALUES(school_name),
           school_type    = VALUES(school_type)`,
        [idx, name],
      );

      if (opts.verbose) console.log(`  [OK] ${rowLabel(i)} School: ${name} (${idx})`);
      stats.inserted++;

    } catch (err) {
      logError(stats, i, `School ${clean(row[0]) ?? '?'}`, err, opts);
    }
  }

  // ── International schools (051-054) from Academic sheet header rows 2-5 ──────
  // These are NOT in Scl Number List; extracted directly from the ACIS workbook.
  // Format: "51   -   St. nicholas International Schools, Pelawatta, Colombo"
  console.log('  Loading international schools from ACIS workbook…');
  try {
    const intlWb     = loadWorkbook(INTL_FILE);
    const intlMatrix = sheetToMatrix(intlWb, 'Academic');
    // Rows 2-5 (0-indexed 1-4) contain "NN   -   School Name" in col 8
    for (let r = 1; r <= 5; r++) {
      const cell = clean(intlMatrix[r]?.[8]);
      if (!cell) continue;
      // Parse: "51   -   School Name"
      const m = cell.match(/^(\d{1,3})\s*[-–]\s*(.+)$/);
      if (!m) continue;
      const idx  = String(parseInt(m[1], 10)).padStart(3, '0');
      const name = m[2].trim();
      await conn.execute(
        `INSERT INTO schools
           (school_index, school_name, school_type)
         VALUES (?, ?, 'International')
         ON DUPLICATE KEY UPDATE
           school_name = VALUES(school_name),
           school_type = VALUES(school_type)`,
        [idx, name],
      );
      if (opts.verbose) console.log(`  [OK] International school: ${name} (${idx})`);
      stats.inserted++;
    }
  } catch (intlErr) {
    console.warn(`  [WARN] Could not load international schools: ${intlErr.message}`);
  }

  return stats;
}

// ─── Module 2: Private School Teachers ────────────────────────────────────────

/**
 * Imports active teachers from 'Tutorial Staff Database' sheet.
 *
 * Key column indices (0-based, rows 13-15 are the 3-row merged header):
 *   0   tin_category
 *   1   tin_school_number
 *   2   tin_teacher_no_school
 *   3   tin_teacher_no_global
 *   4   full TIN string  (use parts; full string is redundant)
 *   5   present_category
 *   6   full_name
 *   7   SSP status
 *   8   DCETT status
 *   9   Selection Test — Passed (Pass on 1st attempt)
 *  10   Selection Test — Failed 1st
 *  11   Selection Test — Failed 2nd
 *  12   Selection Test — Failed 3rd
 *  13   Not Participated (all null)
 *  14   home_address
 *  15   NIC Number
 *  16   religion
 *  17   telephone number(s)
 *  18   email
 *  22   date_of_birth (precomputed)
 *  24   gender
 *  28   date_of_first_appointment (precomputed)
 *  30   teacher_in_service  (prior service, boolean)
 *  31   confirmation_letter_status
 *  33   2nd contract start
 *  34   3rd contract start
 *  35   3rd contract expiry on text ('Done', blank)
 *  36   contract expiry date
 *  53   school number / name
 */
async function importPrivateTeachers(wb, conn, byIndex, opts) {
  const stats   = makeStats();
  const matrix  = sheetToMatrix(wb, 'Tutorial Staff Database');
  const seenNic = new Set();

  // Data starts at row index 15 (0-based) = spreadsheet row 16
  for (let i = 15; i < matrix.length; i++) {
    const row = matrix[i];
    try {
      const fullName = clean(row[6]);

      // Only skip rows with no name (separator rows between school groups)
      if (!fullName) continue;

      // Category: default to 3 (Minor Staff) if missing or invalid
      let category = mapPrivateCategory(row[5]);
      if (category === null) {
        if (opts.verbose) console.warn(`  [WARN] ${rowLabel(i)} Missing/invalid category '${row[5]}' for "${fullName}" — defaulting to 3`);
        category = 3;
      }

      // TIN — prefer parts from cols 0-3
      let tinCat    = parseInt(String(row[0] ?? '').trim(), 10);
      let tinSchNo  = parseInt(String(row[1] ?? '').trim(), 10);
      let tinInSch  = parseInt(String(row[2] ?? '').trim(), 10);
      let tinGlobal = parseInt(String(row[3] ?? '').trim(), 10);

      const tinBad = [tinCat, tinSchNo, tinInSch, tinGlobal].some(isNaN);

      // School lookup: primary = col 53 school label; fallback = TIN school number (col 1)
      const schoolIdxFromCol = extractSchoolIndex(row[53]);
      const schoolIdxFromTin = !isNaN(tinSchNo) ? String(tinSchNo).padStart(3, '0') : null;
      const schoolIdx        = schoolIdxFromCol ?? schoolIdxFromTin;
      const schoolId         = schoolIdx ? (byIndex[schoolIdx] ?? null) : null;

      if (!schoolId) {
        logSkip(stats, i, `No school found for index '${schoolIdx}' (col53='${row[53]}', TIN col1='${row[1]}') — teacher: "${fullName}"`, opts);
        continue;
      }

      // If TIN was bad, allocate a fresh TIN instead of skipping
      if (tinBad) {
        if (opts.verbose) console.warn(`  [WARN] ${rowLabel(i)} Bad TIN parts [${row[0]},${row[1]},${row[2]},${row[3]}] for "${fullName}" — allocating new TIN`);
        const schoolNum = parseInt(schoolIdx, 10);
        const allocated = await allocateTinForImport(conn, 'Private', category, schoolNum);
        tinCat    = allocated.tinCat;
        tinSchNo  = allocated.tinSchNo;
        tinInSch  = allocated.tinInSch;
        tinGlobal = allocated.tinGlobal;
      }

      // NIC: warn on invalid format but still insert (do not skip)
      const nic = cleanNic(row[15]);
      if (!nic) {
        if (opts.verbose) console.warn(`  [WARN] ${rowLabel(i)} Empty/unreadable NIC for "${fullName}" — inserting with NULL`);
      } else if (!isValidNicFormat(nic)) {
        if (opts.verbose) console.warn(`  [WARN] ${rowLabel(i)} Non-standard NIC '${nic}' for "${fullName}" — inserting as-is`);
      }

      // Duplicate NIC: first occurrence wins (only for non-null NICs)
      if (nic && seenNic.has(nic)) {
        logSkip(stats, i, `Duplicate NIC ${nic} for "${fullName}" — already imported`, opts);
        continue;
      }
      if (nic) seenNic.add(nic);

      // Selection test reconstruction:
      //   col 9  has 'Pass' → attempt1 = Pass (passed on first try)
      //   col 10 has 'Fail' → attempt1 = Fail
      //   col 11 has 'Fail' → attempt2 = Fail
      //   col 12 has 'Fail' → attempt3 = Fail
      let attempt1 = null;
      let attempt2 = null;
      let attempt3 = null;

      const passed = clean(row[9])?.toLowerCase();
      const fail1  = clean(row[10])?.toLowerCase();
      const fail2  = clean(row[11])?.toLowerCase();
      const fail3  = clean(row[12])?.toLowerCase();

      if (passed === 'pass') {
        attempt1 = 'Pass';
      } else if (fail1 === 'fail') {
        attempt1 = 'Fail';
        if (fail2 === 'fail') {
          attempt2 = 'Fail';
          if (fail3 === 'fail') {
            attempt3 = 'Fail';
          }
        }
      }

      // Insert teacher
      const [result] = await conn.execute(
        `INSERT IGNORE INTO private_school_teachers
           (tin_category, tin_school_number, tin_teacher_no_school, tin_teacher_no_global,
            present_category, full_name, nic, gender, date_of_birth,
            religion, home_address, email,
            date_of_first_appointment, service_status, confirmation_letter_status,
            ssp_status, dcett_status,
            selection_test_attempt1, selection_test_attempt2, selection_test_attempt3,
            school_id, is_active)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
        [
          tinCat, tinSchNo, tinInSch, tinGlobal,
          category, fullName, nic,
          mapGender(row[24]),
          parseDate(row[22]),      // precomputed DOB
          clean(row[16]),
          clean(row[14]),
          clean(row[18]),
          parseDate(row[28]),      // precomputed first appointment date
          clean(row[30]) ? 1 : 0,  // teacher in service (prior service)
          mapConfirmationStatus(row[31]),
          mapTrainingStatus(row[7]),
          mapTrainingStatus(row[8]),
          attempt1, attempt2, attempt3,
          schoolId,
        ],
      );

      if (result.affectedRows === 0) {
        // INSERT IGNORE silenced a duplicate TIN (re-run or data issue)
        logSkip(stats, i, `Duplicate TIN ${tinCat}/${tinSchNo}/${tinInSch}/${tinGlobal} suppressed for "${fullName}"`, opts);
        continue;
      }

      const tid = result.insertId;

      // Phones (comma/pipe-separated in col 17)
      let primarySet = false;
      for (const phone of splitPhones(row[17])) {
        await conn.execute(
          'INSERT IGNORE INTO private_teacher_phones (teacher_id, phone_number, phone_type, is_primary) VALUES (?,?,?,?)',
          [tid, phone, 'Mobile', primarySet ? 0 : 1],
        );
        primarySet = true;
      }

      // Contracts: 2nd and 3rd contract dates from cols 33-36
      const c2s = parseDate(row[33]);
      const c3s = parseDate(row[34]);
      const c3x = parseDate(row[36]);

      if (c2s || c3s || c3x) {
        await conn.execute(
          `INSERT IGNORE INTO private_teacher_contracts
             (teacher_id, contract_6month_start, contract_6month_end,
              contract_2nd_start, contract_2nd_end,
              contract_3rd_start, contract_3rd_end, contract_3rd_expiry)
           VALUES (?, NULL, NULL, ?, NULL, ?, NULL, ?)`,
          [tid, c2s, c3s, c3x],
        );
      }

      if (opts.verbose) console.log(`  [OK] ${rowLabel(i)} Teacher: "${fullName}" (TIN: ${tinCat}/${String(tinSchNo).padStart(3,'0')}/${String(tinInSch).padStart(3,'0')}/${tinGlobal})`);
      stats.inserted++;

    } catch (err) {
      logError(stats, i, `Private teacher "${clean(row[6]) ?? '?'}"`, err, opts);
    }
  }

  return stats;
}

// ─── Module 3: Retired Teachers ───────────────────────────────────────────────

/**
 * Imports retired teachers from 'Retired' sheet.
 * Same column structure as Tutorial Staff Database.
 * Inserts with is_active = 0.
 */
async function importRetiredTeachers(wb, conn, byIndex, opts) {
  const stats   = makeStats();
  const matrix  = sheetToMatrix(wb, 'Retired');
  const seenNic = new Set();

  // Header spans rows 0-2; data from row 3
  for (let i = 3; i < matrix.length; i++) {
    const row = matrix[i];
    try {
      const fullName = clean(row[6]);
      if (!fullName) continue;  // blank separator row

      // Category: default to 3 if missing
      let category = mapPrivateCategory(row[5]);
      if (category === null) {
        if (opts.verbose) console.warn(`  [WARN] ${rowLabel(i)} Missing/invalid category '${row[5]}' for "${fullName}" — defaulting to 3`);
        category = 3;
      }

      let tinCat    = parseInt(String(row[0] ?? '').trim(), 10);
      let tinSchNo  = parseInt(String(row[1] ?? '').trim(), 10);
      let tinInSch  = parseInt(String(row[2] ?? '').trim(), 10);
      let tinGlobal = parseInt(String(row[3] ?? '').trim(), 10);

      const tinBad = [tinCat, tinSchNo, tinInSch, tinGlobal].some(isNaN);

      // School lookup: col 53 first, TIN col 1 fallback
      const schoolIdxFromCol = extractSchoolIndex(row[53]);
      const schoolIdxFromTin = !isNaN(tinSchNo) ? String(tinSchNo).padStart(3, '0') : null;
      const schoolIdx        = schoolIdxFromCol ?? schoolIdxFromTin;
      const schoolId         = schoolIdx ? (byIndex[schoolIdx] ?? null) : null;

      if (!schoolId) {
        logSkip(stats, i, `No school found for index '${schoolIdx}' — retired teacher: "${fullName}"`, opts);
        continue;
      }

      if (tinBad) {
        if (opts.verbose) console.warn(`  [WARN] ${rowLabel(i)} Bad TIN for "${fullName}" — allocating new TIN`);
        const schoolNum = parseInt(schoolIdx, 10);
        const allocated = await allocateTinForImport(conn, 'Private', category, schoolNum);
        tinCat    = allocated.tinCat;
        tinSchNo  = allocated.tinSchNo;
        tinInSch  = allocated.tinInSch;
        tinGlobal = allocated.tinGlobal;
      }

      const nic = cleanNic(row[15]);
      if (!nic) {
        if (opts.verbose) console.warn(`  [WARN] ${rowLabel(i)} Empty/unreadable NIC for "${fullName}" — inserting with NULL`);
      } else if (!isValidNicFormat(nic)) {
        if (opts.verbose) console.warn(`  [WARN] ${rowLabel(i)} Non-standard NIC '${nic}' for "${fullName}" — inserting as-is`);
      }

      if (nic && seenNic.has(nic)) {
        logSkip(stats, i, `Duplicate NIC ${nic} for "${fullName}" (retired)`, opts);
        continue;
      }
      if (nic) seenNic.add(nic);

      const schoolId2 = schoolId;  // alias kept for INSERT below

      let attempt1 = null, attempt2 = null, attempt3 = null;
      const passed = clean(row[9])?.toLowerCase();
      const fail1  = clean(row[10])?.toLowerCase();
      const fail2  = clean(row[11])?.toLowerCase();
      const fail3  = clean(row[12])?.toLowerCase();

      if (passed === 'pass') {
        attempt1 = 'Pass';
      } else if (fail1 === 'fail') {
        attempt1 = 'Fail';
        if (fail2 === 'fail') { attempt2 = 'Fail'; }
        if (fail3 === 'fail') { attempt3 = 'Fail'; }
      }

      const [result] = await conn.execute(
        `INSERT IGNORE INTO private_school_teachers
           (tin_category, tin_school_number, tin_teacher_no_school, tin_teacher_no_global,
            present_category, full_name, nic, gender, date_of_birth,
            religion, home_address, email,
            date_of_first_appointment, service_status, confirmation_letter_status,
            ssp_status, dcett_status,
            selection_test_attempt1, selection_test_attempt2, selection_test_attempt3,
            school_id, is_active)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`,
        [
          tinCat, tinSchNo, tinInSch, tinGlobal,
          category, fullName, nic,
          mapGender(row[24]),
          parseDate(row[22]),
          clean(row[16]),
          clean(row[14]),
          clean(row[18]),
          parseDate(row[28]),
          clean(row[30]) ? 1 : 0,
          mapConfirmationStatus(row[31]),
          mapTrainingStatus(row[7]),
          mapTrainingStatus(row[8]),
          attempt1, attempt2, attempt3,
          schoolId2,
        ],
      );

      if (result.affectedRows === 0) {
        logSkip(stats, i, `Duplicate TIN ${tinCat}/${tinSchNo}/${tinInSch}/${tinGlobal} suppressed for "${fullName}" (retired)`, opts);
        continue;
      }

      if (opts.verbose) console.log(`  [OK] ${rowLabel(i)} Retired teacher: "${fullName}"`);
      stats.inserted++;

    } catch (err) {
      logError(stats, i, `Retired teacher "${clean(row[6]) ?? '?'}"`, err, opts);
    }
  }

  return stats;
}

// ─── Module 4: International School Teachers ──────────────────────────────────

/**
 * Imports teachers from Academic, Non-Academic, and Support Staff sheets.
 *
 * SKIPS: 'Those left' sheet entirely (per decision).
 *
 * Column indices (0-based, data header at row 7 = matrix index 7):
 *   0   tin_category
 *   1   tin_school_number
 *   2   tin_teacher_no_school
 *   3   tin_teacher_no_global
 *   4   full TIN (redundant)
 *   5   category (Confirmed / Contract / Probation etc.)
 *   6   full_name
 *   7   designation (not in schema — discarded)
 *   8   home address
 *   9   NIC
 *  10   religion
 *  11   telephone
 *  12   email
 *  16   date_of_birth (precomputed)
 *  22   date_of_first_appointment (precomputed)
 *  38   probation start (GM Interview date)
 *  39   contract_start (Appointment Effective from)
 *  40   contract_end (Confirmation Effective from)
 */
async function importInternationalTeachers(wb, conn, byIndex, opts) {
  const statsTotal = makeStats();
  const seenNic    = new Set();

  const sheetsToImport = ['Academic', 'Non-Academic', 'Support Staff'];
  // Data start row (matrix index) differs per sheet:
  //   Academic: header rows 7-8, data from matrix[9] (= spreadsheet row 10)
  //   Non-Academic: header rows 1-3, data from matrix[4]
  //   Support Staff: header rows 1-3, data from matrix[4]
  const dataStartBySheet = {
    'Academic':      9,
    'Non-Academic':  4,
    'Support Staff': 4,
  };

  for (const sheetName of sheetsToImport) {
    const matrix = sheetToMatrix(wb, sheetName);
    const dataStart = dataStartBySheet[sheetName];

    for (let i = dataStart; i < matrix.length; i++) {
      const row = matrix[i];
      try {
        const fullName = clean(row[6]);

        // Only skip rows with no name
        if (!fullName) continue;

        // Category: mapIntlCategory already defaults to 'Fixed_Term_Contract' for unknowns
        const category = mapIntlCategory(row[5]);

        // TIN parts
        let tinCat    = parseInt(String(row[0] ?? '').trim(), 10);
        let tinSchNo  = parseInt(String(row[1] ?? '').trim(), 10);
        let tinInSch  = parseInt(String(row[2] ?? '').trim(), 10);
        let tinGlobal = parseInt(String(row[3] ?? '').trim(), 10);

        const tinBad = [tinCat, tinSchNo, tinInSch, tinGlobal].some(isNaN);

        // School lookup from TIN school number (international schools are 051-055)
        // If tinSchNo is NaN, try to recover from any valid TIN part or skip
        const schoolIdx = !isNaN(tinSchNo) ? String(tinSchNo).padStart(3, '0') : null;
        const schoolId  = schoolIdx ? (byIndex[schoolIdx] ?? null) : null;

        if (!schoolId) {
          logSkip(statsTotal, i, `[${sheetName}] No school for index "${schoolIdx}" (TIN col1='${row[1]}') — teacher: "${fullName}"`, opts);
          continue;
        }

        // Allocate new TIN if parts are invalid
        if (tinBad) {
          if (opts.verbose) console.warn(`  [WARN] ${rowLabel(i)} [${sheetName}] Bad TIN parts [${row[0]},${row[1]},${row[2]},${row[3]}] for "${fullName}" — allocating new TIN`);
          const schoolNum = parseInt(schoolIdx, 10);
          const catNum    = [1, 2, 3].includes(tinCat) ? tinCat : 1;
          const allocated = await allocateTinForImport(conn, 'International', catNum, schoolNum);
          tinCat    = allocated.tinCat;
          tinSchNo  = allocated.tinSchNo;
          tinInSch  = allocated.tinInSch;
          tinGlobal = allocated.tinGlobal;
        }

        // NIC: warn on invalid format but do not skip
        const nic = cleanNic(row[9]);
        if (!nic) {
          if (opts.verbose) console.warn(`  [WARN] ${rowLabel(i)} [${sheetName}] Empty/unreadable NIC for "${fullName}" — inserting with NULL`);
        } else if (!isValidNicFormat(nic)) {
          if (opts.verbose) console.warn(`  [WARN] ${rowLabel(i)} [${sheetName}] Non-standard NIC '${nic}' for "${fullName}" — inserting as-is`);
        }

        // Duplicate NIC: first occurrence wins (across all 3 sheets)
        if (nic && seenNic.has(nic)) {
          logSkip(statsTotal, i, `[${sheetName}] Duplicate NIC ${nic} for "${fullName}"`, opts);
          continue;
        }
        if (nic) seenNic.add(nic);

        const [result] = await conn.execute(
          `INSERT IGNORE INTO international_school_teachers
             (tin_category, tin_school_number, tin_teacher_no_school, tin_teacher_no_global,
              category, full_name, designation, nic, religion,
              address, email, date_of_birth, date_of_first_appointment, school_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            tinCat, tinSchNo, tinInSch, tinGlobal,
            category,
            fullName,
            clean(row[7]),          // designation — stored even though not in some views
            nic,
            clean(row[10]),
            clean(row[8]),
            clean(row[12]),
            parseDate(row[16]),     // precomputed DOB
            parseDate(row[22]),     // precomputed first appointment date
            schoolId,
          ],
        );

        if (result.affectedRows === 0) {
          logSkip(statsTotal, i, `[${sheetName}] Duplicate TIN ${tinCat}/${tinSchNo}/${tinInSch}/${tinGlobal} suppressed for "${fullName}"`, opts);
          continue;
        }

        const tid = result.insertId;

        // Phones (col 11 may have comma-separated values)
        let primarySet = false;
        for (const phone of splitPhones(row[11])) {
          await conn.execute(
            'INSERT IGNORE INTO international_teacher_phones (teacher_id, phone_number, phone_type, is_primary) VALUES (?,?,?,?)',
            [tid, phone, 'Mobile', primarySet ? 0 : 1],
          );
          primarySet = true;
        }

        // Contract dates from confirmation columns
        const probStart = parseDate(row[38]);   // GM Interview date
        const contStart = parseDate(row[39]);   // Appointment Effective from
        const contEnd   = parseDate(row[40]);   // Confirmation Effective from

        if (probStart || contStart || contEnd) {
          await conn.execute(
            `INSERT IGNORE INTO international_teacher_contracts
               (teacher_id, probation_start, probation_end,
                contract_start, contract_end, contract_expiry)
             VALUES (?,?,NULL,?,?,NULL)`,
            [tid, probStart, contStart, contEnd],
          );
        }

        if (opts.verbose) console.log(`  [OK] ${rowLabel(i)} [${sheetName}] "${fullName}" (TIN: ${tinCat}/${tinSchNo}/${tinInSch}/${tinGlobal})`);
        statsTotal.inserted++;

      } catch (err) {
        logError(statsTotal, i, `[${sheetName}] "${clean(row[6]) ?? '?'}"`, err, opts);
      }
    }
  }

  return statsTotal;
}

// ─── Module 5: Rectors ────────────────────────────────────────────────────────

/**
 * Imports rectors from 'Rectors' sheet.
 *
 * Header: Row 2 (group) and Row 3 (detail); data from Row 4.
 * Matrix indices: header at 1-2; data from index 3.
 *
 * Columns:
 *   0   No. (rector_no)
 *   1   Name (full_name)
 *   2   Present School (school name → FK)
 *   3   Registration (Registered / Unregistered)
 *   4   Date of Birth (YYYY.MM.DD)
 *   5   Date of First Appointment (YYYY.MM.DD)
 *   6   Appointment to Present School (YYYY.MM.DD)
 *   7   Retirement Date (Excel date)
 *   8   BTh        ← qualification checkbox (√ or blank)
 *   9   BPh
 *  10   LTh
 *  11   Degree
 *  12   Masters
 *  13   M. Phill
 *  14   PHd
 *  15   COE
 *  16   BEd
 *  17   PGDE
 *  18   MEd
 *  19   Other Dip.
 */
const RECTOR_QUAL_NAMES = ['BTh', 'BPh', 'LTh', 'Degree', 'Masters', 'M.Phil', 'PhD', 'COE', 'BEd', 'PGDE', 'MEd', 'Other Dip.'];

async function importRectors(wb, conn, byName, opts) {
  const stats  = makeStats();
  const matrix = sheetToMatrix(wb, 'Rectors');

  // Data starts at matrix index 3 (spreadsheet row 4)
  for (let i = 3; i < matrix.length; i++) {
    const row = matrix[i];
    try {
      const rectorNo = parseInt(String(row[0] ?? '').trim(), 10);
      const fullName = clean(row[1]);

      if (!rectorNo && !fullName) continue;  // blank row

      if (isNaN(rectorNo) || rectorNo <= 0) {
        logSkip(stats, i, `Invalid rector_no '${row[0]}'`, opts);
        continue;
      }
      if (!fullName) {
        logSkip(stats, i, `Missing full_name for rector #${rectorNo}`, opts);
        continue;
      }

      // School lookup by name
      const schoolName = clean(row[2]);
      const schoolId   = schoolName ? (byName[schoolName] ?? null) : null;
      if (schoolName && !schoolId) {
        // Log a warning but do NOT skip — school name might not match exactly
        if (opts.verbose) {
          console.warn(`  [WARN] ${rowLabel(i)} Rector "${fullName}": school "${schoolName}" not found — setting NULL`);
        }
      }

      // Qualifications: columns 8-19 hold √ or blank for each qual name
      const qualifications = [];
      for (let q = 0; q < RECTOR_QUAL_NAMES.length; q++) {
        const cell = row[8 + q];
        if (cell !== null && cell !== undefined && String(cell).trim() !== '') {
          qualifications.push(RECTOR_QUAL_NAMES[q]);
        }
      }

      const [result] = await conn.execute(
        `INSERT INTO rectors
           (rector_no, full_name, present_school_id, registration_status,
            date_of_birth, first_appointment_date,
            appointment_to_present_school, retirement_date)
         VALUES (?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           full_name                     = VALUES(full_name),
           present_school_id             = VALUES(present_school_id),
           registration_status           = VALUES(registration_status),
           date_of_birth                 = VALUES(date_of_birth),
           first_appointment_date        = VALUES(first_appointment_date),
           appointment_to_present_school = VALUES(appointment_to_present_school),
           retirement_date               = VALUES(retirement_date)`,
        [
          rectorNo, fullName, schoolId ?? null,
          mapRegistrationStatus(row[3]),
          parseDate(row[4]),
          parseDate(row[5]),
          parseDate(row[6]),
          parseDate(row[7]),
        ],
      );

      // For ON DUPLICATE KEY, insertId = 0; re-fetch the real id
      let rectorId = result.insertId;
      if (!rectorId) {
        const [rows] = await conn.execute('SELECT id FROM rectors WHERE rector_no = ?', [rectorNo]);
        rectorId = rows[0]?.id;
      }

      if (qualifications.length > 0) {
        await conn.execute('DELETE FROM rector_qualifications WHERE rector_id = ?', [rectorId]);
        for (const q of qualifications) {
          await conn.execute(
            'INSERT IGNORE INTO rector_qualifications (rector_id, qualification) VALUES (?,?)',
            [rectorId, q],
          );
        }
      }

      if (opts.verbose) console.log(`  [OK] ${rowLabel(i)} Rector #${rectorNo}: "${fullName}" [quals: ${qualifications.join(', ') || 'none'}]`);
      stats.inserted++;

    } catch (err) {
      logError(stats, i, `Rector #${clean(row[0]) ?? '?'}`, err, opts);
    }
  }

  return stats;
}

// ─── Module 6: College Fathers ────────────────────────────────────────────────

/**
 * Imports fathers from 'College Fathers' sheet.
 *
 * Header: Row 2 (group) and Row 3 (detail); data from Row 4.
 * Matrix indices: data from index 3.
 *
 * Columns:
 *   0   No. (father_no)
 *   1   Name (full_name)
 *   2   School Name (FK by name)
 *   3   Registration
 *   4   Ordination date (DD.MM.YYYY)
 *   5   Date of First Appointment (YYYY.MM.DD)
 *   6   Appointment to Present School (YYYY.MM.DD)
 *   7   Total Service (text "02 Years" — SKIP)
 *   8   Service in Present School (text — SKIP)
 *   9   5 Year Completion date
 *  10   Evaluation ('Yes' or blank)
 *  11   BTh   ← qualifications start
 *  12   BPh
 *  13   Degree
 *  14   Masters
 *  15   M. Phill
 *  16   PHd
 *  17   COE
 *  18   BEd
 *  19   PGDE
 *  20   MEd
 *  21   Other Dip.
 */
const FATHER_QUAL_NAMES = ['BTh', 'BPh', 'Degree', 'Masters', 'M.Phil', 'PhD', 'COE', 'BEd', 'PGDE', 'MEd', 'Other Dip.'];

async function importFathers(wb, conn, byName, opts) {
  const stats  = makeStats();
  const matrix = sheetToMatrix(wb, 'College Fathers');

  for (let i = 3; i < matrix.length; i++) {
    const row = matrix[i];
    try {
      const fatherNo = parseInt(String(row[0] ?? '').trim(), 10);
      const fullName = clean(row[1]);

      if (!fatherNo && !fullName) continue;

      if (isNaN(fatherNo) || fatherNo <= 0) {
        logSkip(stats, i, `Invalid father_no '${row[0]}'`, opts);
        continue;
      }
      if (!fullName) {
        logSkip(stats, i, `Missing full_name for father #${fatherNo}`, opts);
        continue;
      }

      const schoolName = clean(row[2]);
      const schoolId   = schoolName ? (byName[schoolName] ?? null) : null;
      if (schoolName && !schoolId && opts.verbose) {
        console.warn(`  [WARN] ${rowLabel(i)} Father "${fullName}": school "${schoolName}" not found — setting NULL`);
      }

      // Ordination date is DD.MM.YYYY in source
      const ordinationRaw = clean(row[4]);
      const ordination    = parseDate(ordinationRaw);

      // Qualifications: columns 11-21
      const qualifications = [];
      for (let q = 0; q < FATHER_QUAL_NAMES.length; q++) {
        const cell = row[11 + q];
        if (cell !== null && cell !== undefined && String(cell).trim() !== '') {
          qualifications.push(FATHER_QUAL_NAMES[q]);
        }
      }

      // Evaluation: 'Yes' or blank → store as-is or null
      const evaluation = clean(row[10]);

      await conn.execute(
        `INSERT INTO fathers
           (father_no, full_name, school_id, registration,
            ordination_date, first_appointment_date,
            present_school_appointment_date, five_year_completion, evaluation)
         VALUES (?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           full_name                       = VALUES(full_name),
           school_id                       = VALUES(school_id),
           registration                    = VALUES(registration),
           ordination_date                 = VALUES(ordination_date),
           first_appointment_date          = VALUES(first_appointment_date),
           present_school_appointment_date = VALUES(present_school_appointment_date),
           five_year_completion            = VALUES(five_year_completion),
           evaluation                      = VALUES(evaluation)`,
        [
          fatherNo, fullName, schoolId ?? null,
          mapRegistrationStatus(row[3]),
          ordination,
          parseDate(row[5]),
          parseDate(row[6]),
          parseDate(row[9]),
          evaluation,
        ],
      );

      let fatherId;
      const [rows] = await conn.execute('SELECT id FROM fathers WHERE father_no = ?', [fatherNo]);
      fatherId = rows[0]?.id;

      if (fatherId && qualifications.length > 0) {
        await conn.execute('DELETE FROM father_qualifications WHERE father_id = ?', [fatherId]);
        for (const q of qualifications) {
          await conn.execute(
            'INSERT IGNORE INTO father_qualifications (father_id, qualification) VALUES (?,?)',
            [fatherId, q],
          );
        }
      }

      if (opts.verbose) console.log(`  [OK] ${rowLabel(i)} Father #${fatherNo}: "${fullName}" [quals: ${qualifications.join(', ') || 'none'}]`);
      stats.inserted++;

    } catch (err) {
      logError(stats, i, `Father #${clean(row[0]) ?? '?'}`, err, opts);
    }
  }

  return stats;
}

// ─── Module 7: Vested Schools ─────────────────────────────────────────────────

/**
 * Imports vested schools from 'Vested Schools Now - 2024' sheet.
 *
 * Header spans rows 7-9; data starts at row 10.
 * Matrix indices: header at 6-8; data from index 9.
 *
 * School columns:
 *   0   No.
 *   1   Present School Name (used as school_name)
 *   3   School Address
 *   6   Region
 *   7   Deanery (→ education_zone)
 *   8   Parish
 *   9   District
 *  10   Zone
 *  11   Division (→ divisional_secretariat)
 *  12   Telephone No.
 *  14   E-mail Address
 *  15   Census No.
 *  17   Grade of the School (→ school_category)
 *  18   Medium (→ medium_of_instruction)
 *  19   Boys/Girls/Mixed
 *
 * Principal columns:
 *  21   Designation ('Principal' etc.)
 *  23   Name
 *  24   Phone Number
 *  27   Religion or Congregation
 *  28   DATE OF BIRTH (precomputed cell)
 *  32   RETIREMENT DATE (precomputed cell)
 *
 * Stats columns (most recent year on roll):
 *  50   Year
 *  52   No. of Students (total)
 *  53   Buddhist
 *  54   Hindu
 *  55   Islam
 *  56   Catholic count
 *  57   Catholic %  (computed — skip)
 *  58   Christian
 *  59   Others
 *  60   Sinhala medium count
 *  61   Tamil medium count
 *  62   English medium count
 */
async function importVestedSchools(wb, conn, opts) {
  const stats  = makeStats();
  const matrix = sheetToMatrix(wb, 'Vested Schools Now - 2024');

  for (let i = 9; i < matrix.length; i++) {
    const row = matrix[i];
    try {
      const schoolName = clean(row[1]);
      if (!schoolName) continue;  // blank row

      // Synthetic school_index for vested schools: 'V' + 3-digit count
      // col 5 = sequential Count (1, 2, 3, …) from the spreadsheet
      const countVal  = parseInt(String(row[5] ?? '0').trim(), 10);
      const schoolIdx = isNaN(countVal) || countVal <= 0
        ? null
        : `V${String(countVal).padStart(3, '0')}`;

      if (!schoolIdx) {
        logSkip(stats, i, `Cannot generate school_index (Count col is '${row[5]}') for "${schoolName}"`, opts);
        continue;
      }

      // ── Insert / update schools base row ────────────────────────────────────
      const [sResult] = await conn.execute(
        `INSERT INTO schools
           (school_index, school_name, school_type, school_phone, email)
         VALUES (?, ?, 'Vested', ?, ?)
         ON DUPLICATE KEY UPDATE
           school_name  = VALUES(school_name),
           school_phone = VALUES(school_phone),
           email        = VALUES(email)`,
        [
          schoolIdx,
          schoolName,
          clean(row[12]),
          clean(row[14]),
        ],
      );

      let schoolId = sResult.insertId;
      if (!schoolId) {
        const [sr] = await conn.execute(
          "SELECT id FROM schools WHERE school_name = ? AND school_type = 'Vested' LIMIT 1",
          [schoolName],
        );
        schoolId = sr[0]?.id;
      }
      if (!schoolId) {
        logSkip(stats, i, `Could not get school_id for "${schoolName}"`, opts);
        continue;
      }

      // ── Insert / update vested_schools extension row ─────────────────────────
      await conn.execute(
        `INSERT INTO vested_schools
           (school_id, region, education_zone, parish, district, zone,
            divisional_secretariat, school_address, school_phone, school_email,
            school_census_no, school_category, medium_of_instruction, student_admission_type)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           region                  = VALUES(region),
           education_zone          = VALUES(education_zone),
           parish                  = VALUES(parish),
           district                = VALUES(district),
           zone                    = VALUES(zone),
           divisional_secretariat  = VALUES(divisional_secretariat),
           school_address          = VALUES(school_address),
           school_phone            = VALUES(school_phone),
           school_email            = VALUES(school_email),
           school_census_no        = VALUES(school_census_no),
           school_category         = VALUES(school_category),
           medium_of_instruction   = VALUES(medium_of_instruction),
           student_admission_type  = VALUES(student_admission_type)`,
        [
          schoolId,
          clean(row[6]),
          clean(row[7]),           // Deanery → education_zone
          clean(row[8]),
          clean(row[9]),
          clean(row[10]),
          clean(row[11]),          // Division → divisional_secretariat
          clean(row[3]),           // School Address
          clean(row[12]),
          clean(row[14]),
          clean(row[15]),          // Census No.
          clean(row[17]),          // Grade → school_category
          mapMedium(row[18]),
          mapAdmissionType(row[19]),
        ],
      );

      // Get vested_schools.id for child records
      const [vsRows] = await conn.execute('SELECT id FROM vested_schools WHERE school_id = ? LIMIT 1', [schoolId]);
      const vestedId = vsRows[0]?.id;
      if (!vestedId) {
        logSkip(stats, i, `No vested_schools row created for "${schoolName}"`, opts);
        continue;
      }

      // ── Insert principal (is_current = 1) ────────────────────────────────────
      const principalName = clean(row[23]);
      if (principalName) {
        // Archive any existing current principal for this school first
        await conn.execute(
          'UPDATE vested_school_principals SET is_current = 0 WHERE vested_school_id = ? AND is_current = 1',
          [vestedId],
        );

        await conn.execute(
          `INSERT INTO vested_school_principals
             (vested_school_id, full_name, religion, date_of_birth,
              retirement_date, phone, is_current)
           VALUES (?,?,?,?,?,?,1)`,
          [
            vestedId,
            principalName,
            mapPrincipalReligion(row[27]),
            parseDate(row[28]),      // precomputed DOB cell
            parseDate(row[32]),      // precomputed retirement date cell
            cleanPhone(row[24]),
          ],
        );
      }

      // ── Insert yearly stats ───────────────────────────────────────────────────
      const statYear = parseInt(String(row[50] ?? '').trim(), 10);
      if (!isNaN(statYear) && statYear > 1990) {
        const totalStudents = parseInt(String(row[52] ?? '0'), 10) || 0;
        const cBuddhist     = parseInt(String(row[53] ?? '0'), 10) || 0;
        const cHindu        = parseInt(String(row[54] ?? '0'), 10) || 0;
        const cIslam        = parseInt(String(row[55] ?? '0'), 10) || 0;
        const cCatholic     = parseInt(String(row[56] ?? '0'), 10) || 0;
        const cChristian    = parseInt(String(row[58] ?? '0'), 10) || 0;
        const cOther        = parseInt(String(row[59] ?? '0'), 10) || 0;
        const cSinhala      = parseInt(String(row[60] ?? '0'), 10) || 0;
        const cTamil        = parseInt(String(row[61] ?? '0'), 10) || 0;
        const cEnglish      = parseInt(String(row[62] ?? '0'), 10) || 0;

        await conn.execute(
          `INSERT INTO vested_school_student_stats
             (vested_school_id, stat_year,
              count_catholic, count_other_christian, count_buddhist,
              count_hindu, count_islam, count_other_religion,
              count_sinhala_medium, count_tamil_medium, count_english_medium,
              total_students)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
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
             total_students        = VALUES(total_students)`,
          [
            vestedId, statYear,
            cCatholic, cChristian, cBuddhist,
            cHindu, cIslam, cOther,
            cSinhala, cTamil, cEnglish,
            totalStudents,
          ],
        );
      }

      if (opts.verbose) console.log(`  [OK] ${rowLabel(i)} Vested school: "${schoolName}"`);
      stats.inserted++;

    } catch (err) {
      logError(stats, i, `Vested school "${clean(row[1]) ?? '?'}"`, err, opts);
    }
  }

  return stats;
}

// ─── TIN sequence sync ────────────────────────────────────────────────────────

/**
 * After importing teachers, sync tin_sequences.last_global to the MAX value
 * actually present in the teacher tables, so tinService.allocate() picks up
 * where the imported data left off.
 */
async function syncTinSequences(conn) {
  console.log('\n  Synchronising tin_sequences…');

  await conn.execute(`
    UPDATE tin_sequences ts
    JOIN (
      SELECT tin_category, MAX(tin_teacher_no_global) AS mx
      FROM   private_school_teachers
      GROUP  BY tin_category
    ) src ON src.tin_category = ts.tin_category
    SET    ts.last_global = src.mx
    WHERE  ts.table_type  = 'Private'
      AND  src.mx         > ts.last_global
  `);

  await conn.execute(`
    UPDATE tin_sequences ts
    JOIN (
      SELECT tin_category, MAX(tin_teacher_no_global) AS mx
      FROM   international_school_teachers
      GROUP  BY tin_category
    ) src ON src.tin_category = ts.tin_category
    SET    ts.last_global = src.mx
    WHERE  ts.table_type  = 'International'
      AND  src.mx         > ts.last_global
  `);

  console.log('  tin_sequences synchronised.');
}

// ─── Failure log writer ───────────────────────────────────────────────────────

function writeFailureLog(moduleName, stats) {
  if (!stats.failures.length) return;
  const ts      = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = path.resolve(__dirname, `import-failures-${moduleName}-${ts}.log`);
  const lines   = [
    `Import failures — module: ${moduleName}, time: ${new Date().toISOString()}`,
    `Total failures: ${stats.failures.length}`,
    '',
    ...stats.failures,
  ];
  fs.writeFileSync(logPath, lines.join('\n') + '\n', 'utf8');
  console.log(`\n  Failures written to: ${logPath}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const VALID_MODULES = ['schools', 'private', 'retired', 'international', 'rectors', 'fathers', 'vested'];

async function run() {
  const opts = parseArgs();

  if (!opts.module || !VALID_MODULES.includes(opts.module)) {
    console.error(`
Usage: node database/import_xlsx.js --module <module> [--dry-run] [--verbose]

Modules (run in dependency order):
  schools        Private school list (run first)
  private        Private school teachers (requires: schools)
  retired        Retired private teachers (requires: schools)
  international  International school teachers (requires: schools with intl indices)
  rectors        Rectors (requires: schools)
  fathers        College Fathers (requires: schools)
  vested         Vested schools + principals + stats
`);
    process.exit(1);
  }

  console.log(`
═══════════════════════════════════════════════════════
  Archbishop's House — XLSX Import Tool
  Module : ${opts.module}
  Mode   : ${opts.dryRun ? 'DRY-RUN (no changes committed)' : 'LIVE'}
═══════════════════════════════════════════════════════
`);

  const pool = mysql.createPool({
    host:              config.db.host,
    port:              config.db.port,
    user:              config.db.user,
    password:          config.db.password,
    database:          config.db.name,
    waitForConnections: true,
    connectionLimit:   1,
  });

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const { byIndex, byName } = await buildSchoolMaps(conn);

    let stats;

    switch (opts.module) {

      case 'schools': {
        console.log('  Loading Private school list…');
        const wb = loadWorkbook(PRIVATE_FILE);
        stats = await importSchools(wb, conn, opts);
        break;
      }

      case 'private': {
        console.log('  Loading Private school teachers…');
        const wb = loadWorkbook(PRIVATE_FILE);
        stats = await importPrivateTeachers(wb, conn, byIndex, opts);
        await syncTinSequences(conn);
        break;
      }

      case 'retired': {
        console.log('  Loading Retired private teachers…');
        const wb = loadWorkbook(PRIVATE_FILE);
        stats = await importRetiredTeachers(wb, conn, byIndex, opts);
        await syncTinSequences(conn);
        break;
      }

      case 'international': {
        console.log('  Loading International school teachers…');
        const wb = loadWorkbook(INTL_FILE);
        stats = await importInternationalTeachers(wb, conn, byIndex, opts);
        await syncTinSequences(conn);
        break;
      }

      case 'rectors': {
        console.log('  Loading Rectors…');
        const wb = loadWorkbook(RECTORS_FILE);
        stats = await importRectors(wb, conn, byName, opts);
        break;
      }

      case 'fathers': {
        console.log('  Loading College Fathers…');
        const wb = loadWorkbook(RECTORS_FILE);
        stats = await importFathers(wb, conn, byName, opts);
        break;
      }

      case 'vested': {
        console.log('  Loading Vested schools…');
        const wb = loadWorkbook(VESTED_FILE);
        stats = await importVestedSchools(wb, conn, opts);
        break;
      }
    }

    if (opts.dryRun) {
      await conn.rollback();
      console.log('\n  [DRY-RUN] Transaction rolled back — nothing written to database.');
    } else {
      await conn.commit();
      console.log('\n  Transaction committed successfully.');
    }

    console.log(`
  ─── Results ────────────────────────────────────────
  Inserted       : ${stats.inserted}
  Skipped        : ${stats.skipped}
  Errors         : ${stats.errors}
  Total failures : ${stats.failures.length}
  ────────────────────────────────────────────────────
`);

    writeFailureLog(opts.module, stats);

  } catch (err) {
    await conn.rollback();
    console.error(`\n  FATAL: ${err.message}`);
    if (opts.verbose) console.error(err.stack);
    console.error('  Transaction rolled back — no data written.\n');
    process.exit(1);
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
