'use strict';

/**
 * import_csv.js
 * ──────────────
 * One-time CSV migration for the Archbishop's House School Management System.
 * Reads legacy CSV exports and maps them to the MySQL schema.
 *
 * USAGE
 * ─────
 *   node database/import_csv.js --module <module> --file <path> [--dry-run] [--verbose]
 *
 * MODULES (run in this order — dependencies matter)
 * ──────────────────────────────────────────────────
 *   schools        → schools
 *   vested         → schools + vested_schools + principals + stats
 *   private        → private_school_teachers + all satellites
 *   international  → international_school_teachers + all satellites
 *   rectors        → rectors + rector_qualifications
 *   fathers        → fathers + father_qualifications
 *
 * FLAGS
 * ─────
 *   --dry-run   Validate + process but roll back at the end (no DB writes)
 *   --verbose   Print a line for every row processed
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const fs    = require('fs');
const path  = require('path');
const mysql = require('mysql2/promise');

const config = require('../src/config/env');

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { module: null, file: null, dryRun: false, verbose: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--module'   && args[i + 1]) opts.module  = args[++i];
    if (args[i] === '--file'     && args[i + 1]) opts.file    = args[++i];
    if (args[i] === '--dry-run')                 opts.dryRun  = true;
    if (args[i] === '--verbose')                 opts.verbose = true;
  }
  return opts;
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────

/**
 * Parses a full CSV string into an array of objects keyed by header row.
 * Handles: BOM, CRLF, quoted fields with embedded commas, escaped quotes ("").
 */
function parseCsv(content) {
  // Strip UTF-8 BOM
  const text  = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  if (!lines.length) return [];
  const headers = parseLine(lines[0]);
  const rows    = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const values = parseLine(line);
    const row    = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = values[idx] !== undefined ? values[idx] : '';
    });
    rows.push(row);
  }
  return rows;
}

function parseLine(line) {
  const fields  = [];
  let current   = '';
  let inQuotes  = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"')                   { inQuotes = false; }
      else                                   { current += ch; }
    } else {
      if      (ch === '"') { inQuotes = true; }
      else if (ch === ',') { fields.push(current); current = ''; }
      else                 { current += ch; }
    }
  }
  fields.push(current);
  return fields;
}

// ─── Data Cleaning ────────────────────────────────────────────────────────────

/** Trim whitespace; return null for empty strings. */
function clean(val) {
  if (val === undefined || val === null) return null;
  const s = String(val).trim().replace(/\s+/g, ' ');
  return s === '' ? null : s;
}

/**
 * Converts date strings in multiple formats to YYYY-MM-DD.
 * Supported: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, YYYY/MM/DD, year-only.
 * Returns null for unparseable values.
 */
function parseDate(val) {
  const s = clean(val);
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s))           return s;

  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;

  m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;

  // Year-only → 1 Jan of that year
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;

  // Native Date as last resort
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];

  return null;
}

/**
 * Parses a TIN string "1/026/013/2524" into its four numeric components.
 * Throws a descriptive error on malformed input.
 */
function parseTin(val) {
  const s = clean(val);
  if (!s) throw new Error('Missing TIN value');

  const parts = s.split('/');
  if (parts.length !== 4) {
    throw new Error(`Invalid TIN format: "${s}" — expected category/schoolNo/inSchool/global`);
  }

  const [category, schoolNo, noInSchool, noGlobal] = parts.map(p => parseInt(p.trim(), 10));

  if ([category, schoolNo, noInSchool, noGlobal].some(isNaN)) {
    throw new Error(`TIN contains non-numeric part: "${s}"`);
  }

  return {
    tin_category:          category,
    tin_school_number:     schoolNo,
    tin_teacher_no_school: noInSchool,
    tin_teacher_no_global: noGlobal,
  };
}

function mapGender(val) {
  if (!val) return null;
  const s = val.trim().toLowerCase();
  if (s === 'm' || s === 'male')   return 'Male';
  if (s === 'f' || s === 'female') return 'Female';
  return 'Other';
}

function mapPrivateCategory(val) {
  if (!val) return null;
  const s = String(val).trim().toLowerCase();
  const m = {
    '1': 1, 'pensionable': 1, 'category 1': 1, 'cat 1': 1,
    '2': 2, 'unregistered permanent': 2, 'category 2': 2, 'cat 2': 2,
    '3': 3, 'unregistered training': 3, 'training': 3, 'category 3': 3, 'cat 3': 3,
    '4': 4, 'fixed term': 4, 'fixed term contract': 4, 'category 4': 4, 'cat 4': 4,
  };
  return m[s] ?? (Number.isInteger(+val) ? parseInt(val, 10) : null);
}

function mapBoolean(val) {
  const s = String(val ?? '').trim().toLowerCase();
  return (s === 'yes' || s === '1' || s === 'true') ? 1 : 0;
}

function mapConfirmationStatus(val) {
  const s = clean(val)?.toLowerCase();
  if (!s) return 'Pending';
  if (s === 'issued')                             return 'Issued';
  if (s === 'not required' || s === 'not_required' || s === 'n/a') return 'Not_Required';
  return 'Pending';
}

function mapTrainingStatus(val) {
  const s = clean(val)?.toLowerCase();
  if (!s) return 'Not_Completed';
  if (s === 'yes')                    return 'Yes';
  if (s === 'completed')              return 'Completed';
  return 'Not_Completed';
}

function mapTestResult(val) {
  const s = clean(val)?.toLowerCase();
  if (!s) return null;
  if (s === 'pass' || s === 'p') return 'Pass';
  if (s === 'fail' || s === 'f') return 'Fail';
  return null;
}

/** Split a pipe-, comma-, or semicolon-separated cell into an array. */
function splitMultiValue(val) {
  const s = clean(val);
  if (!s) return [];
  return s.split(/[|,;]/).map(v => v.trim()).filter(Boolean);
}

function mapEducation(val) {
  const s = clean(val)?.toLowerCase();
  if (!s) return null;
  if (s.includes('phd') || s.includes('doctorate'))      return 'PhD';
  if (s.includes('ma') || s.includes('master'))          return 'MA';
  if (s.includes('graduate') || s.includes('degree') ||
      s.includes('b.a') || s.includes('b.sc'))           return 'Graduate';
  if (s.includes('a/l') || s.includes('al') ||
      s.includes('a level'))                             return 'A/L';
  return 'Other';
}

function mapIntlCategory(val) {
  const s = clean(val)?.toLowerCase() ?? '';
  return (s.includes('fixed') || s.includes('contract')) ? 'Fixed_Term_Contract' : 'Permanent';
}

function mapRegistrationStatus(val) {
  const s = clean(val)?.toLowerCase() ?? '';
  if (s === 'registered')   return 'Registered';
  if (s === 'unregistered') return 'Unregistered';
  return 'Pending';
}

function mapAdmissionType(val) {
  const s = clean(val)?.toLowerCase() ?? '';
  if (s === 'boys' || s === 'b')                      return 'Boys';
  if (s === 'girls' || s === 'g')                     return 'Girls';
  if (s === 'mixed' || s === 'co-ed' || s === 'both') return 'Mixed';
  return null;
}

function parsePct(val) {
  const s = clean(val);
  if (!s) return null;
  const n = parseFloat(s.replace('%', ''));
  return isNaN(n) ? null : n;
}

function makeStats() {
  return { inserted: 0, skipped: 0, warned: 0, failures: [] };
}

/** CSV data row index → 1-based line number (header is line 1) */
function rowLabel(idx) {
  return `row ${idx + 2}`;
}

// ─── Module 1: Schools ────────────────────────────────────────────────────────

async function importSchools(rows, conn, opts) {
  const stats = makeStats();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const rawIndex = clean(row['Index'] || row['School Index'] || row['No'] || row['School No']);
      const name     = clean(row['School Name'] || row['Name']);
      const type     = clean(row['School Type'] || row['Type']) || 'Private';

      if (!rawIndex || !name) {
        const msg = `[SKIP] ${rowLabel(i)} — Missing school_index or school_name`;
        console.warn(`  ${msg}`);
        stats.failures.push(msg);
        stats.skipped++;
        continue;
      }

      const idx = String(parseInt(rawIndex, 10)).padStart(2, '0');

      await conn.execute(
        `INSERT INTO schools
           (school_index, school_name, school_type,
            principal_name, principal_phone, school_phone,
            student_admission_type, school_category, email,
            no_of_students, no_of_teachers, no_of_pensionable_teachers)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           school_name                = VALUES(school_name),
           school_type                = VALUES(school_type),
           principal_name             = VALUES(principal_name),
           principal_phone            = VALUES(principal_phone),
           school_phone               = VALUES(school_phone),
           student_admission_type     = VALUES(student_admission_type),
           school_category            = VALUES(school_category),
           email                      = VALUES(email),
           no_of_students             = VALUES(no_of_students),
           no_of_teachers             = VALUES(no_of_teachers),
           no_of_pensionable_teachers = VALUES(no_of_pensionable_teachers)`,
        [
          idx, name, type,
          clean(row['Principal Name']),
          clean(row['Principal Phone']),
          clean(row['School Phone']),
          mapAdmissionType(row['School Gender'] || row['Admission Type'] || row['Student Admission Type']),
          clean(row['Category'] || row['School Category']),
          clean(row['Email']),
          parseInt(row['No of Students']             || '0', 10) || 0,
          parseInt(row['No of Teachers']             || '0', 10) || 0,
          parseInt(row['No of Pensionable Teachers'] || '0', 10) || 0,
        ],
      );

      if (opts.verbose) console.log(`  [OK] ${rowLabel(i)} School: ${name} (${idx})`);
      stats.inserted++;

    } catch (err) {
      const msg = `[ERROR] ${rowLabel(i)} School: ${err.message}`;
      console.error(`  ${msg}`);
      stats.failures.push(msg);
      stats.warned++;
    }
  }

  return stats;
}

// ─── Module 2: Private School Teachers ───────────────────────────────────────

async function importPrivateTeachers(rows, conn, byIndex, opts) {
  const stats = makeStats();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    let tinStr;
    try {
      tinStr = clean(row['TIN'] || row['T.I.N'] || row['Tin']);

      if (!tinStr) {
        const msg = `[SKIP] ${rowLabel(i)} — Missing TIN for: ${clean(row['Full Name'] || row['Name']) ?? 'unknown'}`;
        console.warn(`  ${msg}`);
        stats.failures.push(msg);
        stats.skipped++;
        continue;
      }

      const tin      = parseTin(tinStr);
      const schoolNo = String(tin.tin_school_number).padStart(2, '0');
      const schoolId = byIndex[schoolNo];

      if (!schoolId) {
        const msg = `[SKIP] ${rowLabel(i)} — No school for index "${schoolNo}" (TIN: ${tinStr})`;
        console.warn(`  ${msg}`);
        stats.failures.push(msg);
        stats.skipped++;
        continue;
      }

      const nic = clean(row['NIC'] || row['Nic'] || row['N.I.C']);
      if (!nic) {
        const msg = `[SKIP] ${rowLabel(i)} — Missing NIC (TIN: ${tinStr})`;
        console.warn(`  ${msg}`);
        stats.failures.push(msg);
        stats.skipped++;
        continue;
      }

      const [result] = await conn.execute(
        `INSERT IGNORE INTO private_school_teachers
           (tin_category, tin_school_number, tin_teacher_no_school, tin_teacher_no_global,
            present_category, full_name, nic, gender, date_of_birth,
            religion, home_address, email,
            date_of_first_appointment, service_status, confirmation_letter_status,
            ssp_status, dcett_status,
            selection_test_attempt1, selection_test_attempt2, selection_test_attempt3,
            school_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          tin.tin_category, tin.tin_school_number,
          tin.tin_teacher_no_school, tin.tin_teacher_no_global,
          mapPrivateCategory(row['Present Category'] || row['Category']),
          clean(row['Full Name'] || row['Name']),
          nic,
          mapGender(row['Gender'] || row['Sex']),
          parseDate(row['Date of Birth'] || row['DOB']),
          clean(row['Religion']),
          clean(row['Home Address'] || row['Address']),
          clean(row['Email']),
          parseDate(row['Date of First Appointment'] || row['First Appointment']),
          mapBoolean(row['Service Status'] || row['Prior Service']),
          mapConfirmationStatus(row['Confirmation Letter Status'] || row['Confirmation Letter']),
          mapTrainingStatus(row['SSP Status'] || row['SSP']),
          mapTrainingStatus(row['DCETT Status'] || row['DCETT']),
          mapTestResult(row['Selection Test Attempt 1'] || row['Attempt 1'] || row['Test 1']),
          mapTestResult(row['Selection Test Attempt 2'] || row['Attempt 2'] || row['Test 2']),
          mapTestResult(row['Selection Test Attempt 3'] || row['Attempt 3'] || row['Test 3']),
          schoolId,
        ],
      );

      if (result.affectedRows === 0) {
        const msg = `[SKIP] ${rowLabel(i)} — Duplicate NIC ${nic} (TIN: ${tinStr})`;
        if (opts.verbose) console.log(`  ${msg}`);
        stats.failures.push(msg);
        stats.skipped++;
        continue;
      }

      const tid = result.insertId;

      // Phones — first is primary
      let primarySet = false;
      for (const col of ['Phone 1','Phone 2','Phone 3','Phone','Tel']) {
        const phone = clean(row[col]);
        if (!phone) continue;
        await conn.execute(
          'INSERT IGNORE INTO private_teacher_phones (teacher_id,phone_number,phone_type,is_primary) VALUES (?,?,?,?)',
          [tid, phone, 'Mobile', primarySet ? 0 : 1],
        );
        primarySet = true;
      }

      // Contract (one row per teacher, inserted only when at least one date exists)
      const c = {
        s6: parseDate(row['6 Month Contract Start'] || row['Contract 6Month Start']),
        e6: parseDate(row['6 Month Contract End']   || row['Contract 6Month End']),
        s2: parseDate(row['2nd Contract Start']     || row['Contract 2nd Start']),
        e2: parseDate(row['2nd Contract End']       || row['Contract 2nd End']),
        s3: parseDate(row['3rd Contract Start']     || row['Contract 3rd Start']),
        e3: parseDate(row['3rd Contract End']       || row['Contract 3rd End']),
        x3: parseDate(row['3rd Contract Expiry']    || row['Contract 3rd Expiry']),
      };
      if (Object.values(c).some(v => v !== null)) {
        await conn.execute(
          `INSERT IGNORE INTO private_teacher_contracts
             (teacher_id, contract_6month_start, contract_6month_end,
              contract_2nd_start, contract_2nd_end,
              contract_3rd_start, contract_3rd_end, contract_3rd_expiry)
           VALUES (?,?,?,?,?,?,?,?)`,
          [tid, c.s6, c.e6, c.s2, c.e2, c.s3, c.e3, c.x3],
        );
      }

      // Mediums (pipe/comma separated, e.g. "English|Tamil")
      for (const m of splitMultiValue(row['Medium'] || row['Teaching Medium'])) {
        const v = m.charAt(0).toUpperCase() + m.slice(1).toLowerCase();
        if (['English','Tamil','Sinhala'].includes(v)) {
          await conn.execute(
            'INSERT IGNORE INTO private_teacher_mediums (teacher_id,medium) VALUES (?,?)',
            [tid, v],
          );
        }
      }

      // Class levels
      for (const lv of splitMultiValue(row['Class Level'] || row['Class Levels'])) {
        if (['1-5','6-11','12-13'].includes(lv.trim())) {
          await conn.execute(
            'INSERT IGNORE INTO private_teacher_class_levels (teacher_id,class_level) VALUES (?,?)',
            [tid, lv.trim()],
          );
        }
      }

      // Education qualifications (mapped to ENUM)
      for (const edu of splitMultiValue(row['Education'] || row['Qualification'] || row['Education Qualification'])) {
        const mapped = mapEducation(edu);
        if (mapped) {
          await conn.execute(
            'INSERT IGNORE INTO private_teacher_education (teacher_id,qualification) VALUES (?,?)',
            [tid, mapped],
          );
        }
      }

      // Professional qualifications (free-text, one row each)
      for (const pq of splitMultiValue(row['Professional Qualification'] || row['Professional Qualifications'])) {
        if (pq) {
          await conn.execute(
            'INSERT INTO private_teacher_professional_qualifications (teacher_id,qualification) VALUES (?,?)',
            [tid, pq],
          );
        }
      }

      // Subjects
      for (const sub of splitMultiValue(row['Subjects'] || row['Subject'])) {
        if (sub) {
          await conn.execute(
            'INSERT IGNORE INTO private_teacher_subjects (teacher_id,subject) VALUES (?,?)',
            [tid, sub],
          );
        }
      }

      if (opts.verbose) console.log(`  [OK] ${rowLabel(i)} Teacher: ${clean(row['Full Name'])} (TIN: ${tinStr})`);
      stats.inserted++;

    } catch (err) {
      const msg = `[ERROR] ${rowLabel(i)} Private teacher TIN=${tinStr ?? '?'}: ${err.message}`;
      console.error(`  ${msg}`);
      stats.failures.push(msg);
      stats.warned++;
    }
  }

  return stats;
}

// ─── Module 3: International School Teachers ──────────────────────────────────

async function importInternationalTeachers(rows, conn, byIndex, opts) {
  const stats = makeStats();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    let tinStr;
    try {
      tinStr = clean(row['TIN'] || row['T.I.N']);

      if (!tinStr) {
        const msg = `[SKIP] ${rowLabel(i)} — Missing TIN for: ${clean(row['Full Name'] || row['Name']) ?? 'unknown'}`;
        console.warn(`  ${msg}`);
        stats.failures.push(msg);
        stats.skipped++;
        continue;
      }

      const tin      = parseTin(tinStr);
      const schoolNo = String(tin.tin_school_number).padStart(2, '0');
      const schoolId = byIndex[schoolNo];

      if (!schoolId) {
        const msg = `[SKIP] ${rowLabel(i)} — No school for index "${schoolNo}" (TIN: ${tinStr})`;
        console.warn(`  ${msg}`);
        stats.failures.push(msg);
        stats.skipped++;
        continue;
      }

      const nic = clean(row['NIC'] || row['Nic']);
      if (!nic) {
        const msg = `[SKIP] ${rowLabel(i)} — Missing NIC (TIN: ${tinStr})`;
        console.warn(`  ${msg}`);
        stats.failures.push(msg);
        stats.skipped++;
        continue;
      }

      const [result] = await conn.execute(
        `INSERT IGNORE INTO international_school_teachers
           (tin_category, tin_school_number, tin_teacher_no_school, tin_teacher_no_global,
            category, full_name, designation, nic, religion,
            address, email, date_of_birth, date_of_first_appointment, school_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          tin.tin_category, tin.tin_school_number,
          tin.tin_teacher_no_school, tin.tin_teacher_no_global,
          mapIntlCategory(row['Category']),
          clean(row['Full Name'] || row['Name']),
          clean(row['Designation']),
          nic,
          clean(row['Religion']),
          clean(row['Address'] || row['Home Address']),
          clean(row['Email']),
          parseDate(row['Date of Birth'] || row['DOB']),
          parseDate(row['Date of First Appointment'] || row['First Appointment']),
          schoolId,
        ],
      );

      if (result.affectedRows === 0) {
        const msg = `[SKIP] ${rowLabel(i)} — Duplicate NIC ${nic} (TIN: ${tinStr})`;
        if (opts.verbose) console.log(`  ${msg}`);
        stats.failures.push(msg);
        stats.skipped++;
        continue;
      }

      const tid = result.insertId;

      // Phones
      let primarySet = false;
      for (const col of ['Phone 1','Phone 2','Phone 3','Phone','Tel']) {
        const phone = clean(row[col]);
        if (!phone) continue;
        await conn.execute(
          'INSERT IGNORE INTO international_teacher_phones (teacher_id,phone_number,phone_type,is_primary) VALUES (?,?,?,?)',
          [tid, phone, 'Mobile', primarySet ? 0 : 1],
        );
        primarySet = true;
      }

      // Contract
      const probStart = parseDate(row['Probation Start'] || row['Contract Start']);
      const probEnd   = parseDate(row['Probation End']   || row['Contract End']);
      const expiry    = parseDate(row['Contract Expiry'] || row['Expiry']);
      if (probStart || probEnd || expiry) {
        await conn.execute(
          `INSERT IGNORE INTO international_teacher_contracts
             (teacher_id, probation_start, probation_end,
              contract_start, contract_end, contract_expiry)
           VALUES (?,?,?,?,?,?)`,
          [tid, probStart, probEnd, probStart, probEnd, expiry],
        );
      }

      if (opts.verbose) console.log(`  [OK] ${rowLabel(i)} Intl teacher: ${clean(row['Full Name'])} (TIN: ${tinStr})`);
      stats.inserted++;

    } catch (err) {
      const msg = `[ERROR] ${rowLabel(i)} Intl teacher TIN=${tinStr ?? '?'}: ${err.message}`;
      console.error(`  ${msg}`);
      stats.failures.push(msg);
      stats.warned++;
    }
  }

  return stats;
}

// ─── Module 4: Rectors ────────────────────────────────────────────────────────

async function importRectors(rows, conn, byName, opts) {
  const stats = makeStats();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const rectorNo = parseInt(row['No'] || row['Rector No'] || row['#'], 10);
      const fullName = clean(row['Name'] || row['Full Name']);

      if (!rectorNo || !fullName) {
        const msg = `[SKIP] ${rowLabel(i)} — Missing rector_no or name`;
        console.warn(`  ${msg}`);
        stats.failures.push(msg);
        stats.skipped++;
        continue;
      }

      const schoolName = clean(row['Present School'] || row['School']);
      const schoolId   = schoolName ? (byName[schoolName] ?? null) : null;

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
          rectorNo, fullName, schoolId,
          mapRegistrationStatus(row['Registration Status'] || row['Registration']),
          parseDate(row['DOB'] || row['Date of Birth']),
          parseDate(row['First Appointment Date'] || row['First Appointment']),
          parseDate(row['Appointment to Present School'] || row['Present School Appointment']),
          parseDate(row['Retirement Date'] || row['Retirement']),
        ],
      );

      // For ON DUPLICATE KEY the insertId is 0; re-query if needed
      const rectorId = result.insertId || await fetchId(conn, 'rectors', 'rector_no', rectorNo);

      for (const q of splitMultiValue(row['Qualifications'] || row['Education'] || row['Qualification'])) {
        if (q) {
          await conn.execute(
            'INSERT IGNORE INTO rector_qualifications (rector_id,qualification) VALUES (?,?)',
            [rectorId, q],
          );
        }
      }

      if (opts.verbose) console.log(`  [OK] ${rowLabel(i)} Rector #${rectorNo}: ${fullName}`);
      stats.inserted++;

    } catch (err) {
      const msg = `[ERROR] ${rowLabel(i)} Rector: ${err.message}`;
      console.error(`  ${msg}`);
      stats.failures.push(msg);
      stats.warned++;
    }
  }

  return stats;
}

// ─── Module 5: Fathers ────────────────────────────────────────────────────────

async function importFathers(rows, conn, byName, opts) {
  const stats = makeStats();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const fatherNo = parseInt(row['No'] || row['Father No'] || row['#'], 10);
      const fullName = clean(row['Name'] || row['Full Name']);

      if (!fatherNo || !fullName) {
        const msg = `[SKIP] ${rowLabel(i)} — Missing father_no or name`;
        console.warn(`  ${msg}`);
        stats.failures.push(msg);
        stats.skipped++;
        continue;
      }

      const schoolName = clean(row['School Name'] || row['School']);
      const schoolId   = schoolName ? (byName[schoolName] ?? null) : null;

      // Ordination may arrive as a year-only string (e.g. "1998")
      const ordinationRaw = clean(row['Ordination'] || row['Ordination Date']);
      const ordination = ordinationRaw && /^\d{4}$/.test(ordinationRaw)
        ? `${ordinationRaw}-01-01`
        : parseDate(ordinationRaw);

      const [result] = await conn.execute(
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
          fatherNo, fullName, schoolId,
          clean(row['Registration']),
          ordination,
          parseDate(row['First Appointment'] || row['First Appointment Date']),
          parseDate(row['Present School Appointment'] || row['Present School Appointment Date']),
          parseDate(row['5 Year Completion'] || row['Five Year Completion']),
          clean(row['Evaluation']),
        ],
      );

      const fatherId = result.insertId || await fetchId(conn, 'fathers', 'father_no', fatherNo);

      for (const q of splitMultiValue(row['Qualifications'] || row['Qualification'])) {
        if (q) {
          await conn.execute(
            'INSERT IGNORE INTO father_qualifications (father_id,qualification) VALUES (?,?)',
            [fatherId, q],
          );
        }
      }

      if (opts.verbose) console.log(`  [OK] ${rowLabel(i)} Father #${fatherNo}: ${fullName}`);
      stats.inserted++;

    } catch (err) {
      const msg = `[ERROR] ${rowLabel(i)} Father: ${err.message}`;
      console.error(`  ${msg}`);
      stats.failures.push(msg);
      stats.warned++;
    }
  }

  return stats;
}

// ─── Module 6: Vested Schools ─────────────────────────────────────────────────

async function importVestedSchools(rows, conn, opts) {
  const stats = makeStats();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const schoolName = clean(row['School Name'] || row['Name']);
      if (!schoolName) {
        const msg = `[SKIP] ${rowLabel(i)} — Missing school name`;
        console.warn(`  ${msg}`);
        stats.failures.push(msg);
        stats.skipped++;
        continue;
      }

      const rawIdx = clean(row['Index'] || row['School Index'] || row['No']);
      const idx    = rawIdx ? String(parseInt(rawIdx, 10)).padStart(2, '0') : null;

      // ── schools (base row) ──────────────────────────────────────────────────
      await conn.execute(
        `INSERT INTO schools
           (school_index, school_name, school_type,
            principal_name, principal_phone, school_phone,
            student_admission_type, school_category, email,
            no_of_students, no_of_teachers, no_of_pensionable_teachers)
         VALUES (?,?,'Vested',?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           school_name                = VALUES(school_name),
           principal_name             = VALUES(principal_name),
           principal_phone            = VALUES(principal_phone),
           school_phone               = VALUES(school_phone),
           student_admission_type     = VALUES(student_admission_type),
           school_category            = VALUES(school_category),
           email                      = VALUES(email),
           no_of_students             = VALUES(no_of_students),
           no_of_teachers             = VALUES(no_of_teachers),
           no_of_pensionable_teachers = VALUES(no_of_pensionable_teachers)`,
        [
          idx, schoolName,
          clean(row['Principal Name']),
          clean(row['Principal Phone']),
          clean(row['School Phone']),
          mapAdmissionType(row['Admission Type'] || row['School Gender']),
          clean(row['School Category'] || row['Category']),
          clean(row['Email'] || row['School Email']),
          parseInt(row['No of Students']             || '0', 10) || 0,
          parseInt(row['No of Teachers']             || '0', 10) || 0,
          parseInt(row['No of Pensionable Teachers'] || '0', 10) || 0,
        ],
      );

      const schoolId = await fetchIdByName(conn, schoolName);

      // ── vested_schools (extension row) ──────────────────────────────────────
      await conn.execute(
        `INSERT INTO vested_schools
           (school_id, province, district, education_zone, divisional_secretariat,
            parish, zone, region, school_address, school_phone, school_fax,
            school_email, school_census_no, year_established, school_type_detail,
            student_admission_type, school_category, medium_of_instruction,
            bog_catholic_pct, bog_other_christian_pct, bog_buddhist_pct,
            bog_hindu_pct, bog_islam_pct, bog_other_religion_pct,
            overview_general, overview_remarks, overview_special_notes, overview_challenges)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           province                = VALUES(province),
           district                = VALUES(district),
           education_zone          = VALUES(education_zone),
           divisional_secretariat  = VALUES(divisional_secretariat),
           parish                  = VALUES(parish),
           zone                    = VALUES(zone),
           region                  = VALUES(region),
           school_address          = VALUES(school_address),
           school_phone            = VALUES(school_phone),
           school_fax              = VALUES(school_fax),
           school_email            = VALUES(school_email),
           school_census_no        = VALUES(school_census_no),
           year_established        = VALUES(year_established),
           school_type_detail      = VALUES(school_type_detail),
           student_admission_type  = VALUES(student_admission_type),
           school_category         = VALUES(school_category),
           medium_of_instruction   = VALUES(medium_of_instruction),
           bog_catholic_pct        = VALUES(bog_catholic_pct),
           bog_other_christian_pct = VALUES(bog_other_christian_pct),
           bog_buddhist_pct        = VALUES(bog_buddhist_pct),
           bog_hindu_pct           = VALUES(bog_hindu_pct),
           bog_islam_pct           = VALUES(bog_islam_pct),
           bog_other_religion_pct  = VALUES(bog_other_religion_pct),
           overview_general        = VALUES(overview_general),
           overview_remarks        = VALUES(overview_remarks),
           overview_special_notes  = VALUES(overview_special_notes),
           overview_challenges     = VALUES(overview_challenges)`,
        [
          schoolId,
          clean(row['Province']),
          clean(row['District']),
          clean(row['Education Zone']),
          clean(row['Divisional Secretariat']),
          clean(row['Parish']),
          clean(row['Zone']),
          clean(row['Region']),
          clean(row['Address'] || row['School Address']),
          clean(row['School Phone'] || row['Phone']),
          clean(row['Fax'] || row['School Fax']),
          clean(row['School Email'] || row['Email']),
          clean(row['Census No'] || row['School Census No']),
          parseInt(row['Year Established'] || '0', 10) || null,
          clean(row['School Type Detail'] || row['Type Detail']),
          mapAdmissionType(row['Admission Type'] || row['School Gender']),
          clean(row['School Category'] || row['Category']),
          clean(row['Medium of Instruction'] || row['Medium']),
          parsePct(row['BOG Catholic %']       || row['BOG Catholic']),
          parsePct(row['BOG Other Christian %'] || row['BOG Other Christian']),
          parsePct(row['BOG Buddhist %']        || row['BOG Buddhist']),
          parsePct(row['BOG Hindu %']           || row['BOG Hindu']),
          parsePct(row['BOG Islam %']           || row['BOG Islam']),
          parsePct(row['BOG Other Religion %']  || row['BOG Other Religion']),
          clean(row['Overview'] || row['Overview General']),
          clean(row['Remarks']  || row['Overview Remarks']),
          clean(row['Special Notes'] || row['Overview Special Notes']),
          clean(row['Challenges']    || row['Overview Challenges']),
        ],
      );

      const [vsRows] = await conn.execute(
        'SELECT id FROM vested_schools WHERE school_id = ? LIMIT 1',
        [schoolId],
      );
      const vestedId = vsRows[0].id;

      // ── Current principal (from same CSV row) ─────────────────────────────
      const principalName = clean(row['Current Principal'] || row['Principal Name']);
      if (principalName) {
        // Archive any existing current principal before inserting the new one
        await conn.execute(
          'UPDATE vested_school_principals SET is_current = 0 WHERE vested_school_id = ? AND is_current = 1',
          [vestedId],
        );
        await conn.execute(
          `INSERT INTO vested_school_principals
             (vested_school_id, full_name, nic, gender, religion,
              date_of_birth, first_appointment_date, appointment_to_present_school,
              retirement_date, phone, email, is_current)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,1)`,
          [
            vestedId, principalName,
            clean(row['Principal NIC']),
            mapGender(row['Principal Gender']),
            clean(row['Principal Religion']),
            parseDate(row['Principal DOB'] || row['Principal Date of Birth']),
            parseDate(row['Principal First Appointment']),
            parseDate(row['Principal Appointment to School']),
            parseDate(row['Principal Retirement Date']),
            clean(row['Principal Phone'] || row['Current Principal Phone']),
            clean(row['Principal Email']),
          ],
        );
      }

      // ── Student stats row (optional — only when Stat Year is present) ─────
      const statYear = parseInt(row['Stat Year'] || row['Year'] || '0', 10);
      if (statYear) {
        const counts = {
          catholic:       parseInt(row['Count Catholic']       || row['Catholic']       || '0', 10) || 0,
          otherChristian: parseInt(row['Count Other Christian'] || row['Other Christian'] || '0', 10) || 0,
          buddhist:       parseInt(row['Count Buddhist']       || row['Buddhist']       || '0', 10) || 0,
          hindu:          parseInt(row['Count Hindu']          || row['Hindu']          || '0', 10) || 0,
          islam:          parseInt(row['Count Islam']          || row['Islam']          || '0', 10) || 0,
          other:          parseInt(row['Count Other Religion'] || row['Other Religion'] || '0', 10) || 0,
        };
        const totalStudents =
          parseInt(row['Total Students'] || '0', 10) ||
          Object.values(counts).reduce((a, b) => a + b, 0);

        await conn.execute(
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
            vestedId, statYear,
            counts.catholic, counts.otherChristian, counts.buddhist,
            counts.hindu, counts.islam, counts.other,
            parseInt(row['Count Sinhala Medium'] || row['Sinhala Medium'] || '0', 10) || 0,
            parseInt(row['Count Tamil Medium']   || row['Tamil Medium']   || '0', 10) || 0,
            parseInt(row['Count English Medium'] || row['English Medium'] || '0', 10) || 0,
            totalStudents,
            parseInt(row['Total Teachers'] || '0', 10) || 0,
            parseInt(row['Total Classes']  || '0', 10) || 0,
          ],
        );
      }

      if (opts.verbose) console.log(`  [OK] ${rowLabel(i)} Vested school: ${schoolName}`);
      stats.inserted++;

    } catch (err) {
      const msg = `[ERROR] ${rowLabel(i)} Vested school: ${err.message}`;
      console.error(`  ${msg}`);
      stats.failures.push(msg);
      stats.warned++;
    }
  }

  return stats;
}

// ─── TIN sequence sync ────────────────────────────────────────────────────────

/**
 * After bulk-inserting teachers we must update tin_sequences.last_global so
 * that the application's tinService.allocate() produces the correct next number.
 *
 * Uses MAX(tin_teacher_no_global) per category from the actual teacher rows,
 * so the sequences always reflect the true maximum in the DB.
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

// ─── School lookup maps ───────────────────────────────────────────────────────

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

// ─── Utility DB helpers ───────────────────────────────────────────────────────

async function fetchId(conn, table, col, val) {
  const [rows] = await conn.execute(
    `SELECT id FROM \`${table}\` WHERE \`${col}\` = ? LIMIT 1`,
    [val],
  );
  return rows[0]?.id ?? null;
}

async function fetchIdByName(conn, schoolName) {
  const [rows] = await conn.execute(
    "SELECT id FROM schools WHERE school_name = ? AND school_type = 'Vested' LIMIT 1",
    [schoolName],
  );
  if (!rows[0]) throw new Error(`School not found after insert: "${schoolName}"`);
  return rows[0].id;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const VALID_MODULES = ['schools','private','international','rectors','fathers','vested'];

async function run() {
  const opts = parseArgs();

  if (!opts.module || !VALID_MODULES.includes(opts.module)) {
    console.error(`
Usage: node database/import_csv.js --module <module> --file <csv-path> [--dry-run] [--verbose]

Modules (run in dependency order):
  schools        Import schools master list first
  vested         Import vested school extended data (requires schools)
  private        Import private school teachers   (requires schools)
  international  Import international teachers    (requires schools)
  rectors        Import rectors                   (requires schools)
  fathers        Import fathers                   (requires schools)
`);
    process.exit(1);
  }

  if (!opts.file || !fs.existsSync(opts.file)) {
    console.error(`\nFile not found: "${opts.file}"\n`);
    process.exit(1);
  }

  const content = fs.readFileSync(path.resolve(opts.file), 'utf8');
  const rows    = parseCsv(content);

  console.log(`
═══════════════════════════════════════════════════
  Archbishop's House — CSV Import Tool
  Module : ${opts.module}
  File   : ${opts.file}
  Rows   : ${rows.length}
  Mode   : ${opts.dryRun ? 'DRY-RUN (no changes committed)' : 'LIVE'}
═══════════════════════════════════════════════════
`);

  const pool = mysql.createPool({
    host:     config.db.host,
    port:     config.db.port,
    user:     config.db.user,
    password: config.db.password,
    database: config.db.name,
  });

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const { byIndex, byName } = await buildSchoolMaps(conn);
    const combined = { ...byIndex, ...byName };

    let stats;
    switch (opts.module) {
      case 'schools':
        stats = await importSchools(rows, conn, opts);
        break;
      case 'private':
        stats = await importPrivateTeachers(rows, conn, byIndex, opts);
        await syncTinSequences(conn);
        break;
      case 'international':
        stats = await importInternationalTeachers(rows, conn, byIndex, opts);
        await syncTinSequences(conn);
        break;
      case 'rectors':
        stats = await importRectors(rows, conn, combined, opts);
        break;
      case 'fathers':
        stats = await importFathers(rows, conn, combined, opts);
        break;
      case 'vested':
        stats = await importVestedSchools(rows, conn, opts);
        break;
    }

    if (opts.dryRun) {
      await conn.rollback();
      console.log('\n  [DRY-RUN] Transaction rolled back — nothing written to the database.');
    } else {
      await conn.commit();
      console.log('\n  Transaction committed successfully.');
    }

    console.log(`
  ─── Results ────────────────────────────────────
  Rows processed : ${rows.length}
  Inserted       : ${stats.inserted}
  Skipped        : ${stats.skipped}
  Errors         : ${stats.warned}
  ────────────────────────────────────────────────
`);

    if (stats.failures.length > 0) {
      const ts       = new Date().toISOString().replace(/[:.]/g, '-');
      const logPath  = path.resolve(__dirname, `import-failures-${opts.module}-${ts}.log`);
      const logLines = [
        `Import failures — module: ${opts.module}, file: ${opts.file}, time: ${new Date().toISOString()}`,
        `Total failures: ${stats.failures.length}`,
        '',
        ...stats.failures,
      ];
      fs.writeFileSync(logPath, logLines.join('\n') + '\n', 'utf8');
      console.log(`  Failures written to: ${logPath}`);
      console.log('  Re-run with --verbose for per-row detail.\n');
    }

  } catch (err) {
    await conn.rollback();
    console.error(`\n  FATAL: ${err.message}`);
    console.error('  Transaction rolled back — no data written.\n');
    process.exit(1);
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
