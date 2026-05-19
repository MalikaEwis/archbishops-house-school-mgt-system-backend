'use strict';

/**
 * admin.importer.js
 * ─────────────────
 * Extracted import logic for use in the admin reset/re-import endpoint.
 * All functions require an active DB connection (conn) — they never
 * open or commit transactions themselves.
 *
 * Blank TIN rows (TIN present, no name) are stored as placeholder slots:
 *   full_name = '__VACANT__'
 *   nic       = 'VCNT{cat}{school:03d}{slot:03d}'  (synthetic, unique)
 *   is_active = 0, removed_at = NULL  (distinguishes from soft-deleted real teachers)
 *
 * Stats shape returned by each import function:
 *   {
 *     inserted:           number,
 *     placeholderDetails: [{ sheet, row, tin, school, placeholderNic }],
 *     skippedDetails:     [{ sheet, row, name, school, reason }],
 *     errorDetails:       [{ sheet, row, message }],
 *   }
 */

const XLSX = require('xlsx');

// ─── Excel helpers ────────────────────────────────────────────────────────────

function loadWorkbookFromBuffer(buffer) {
  return XLSX.read(buffer, { cellDates: true, cellNF: false, cellText: false });
}

function sheetToMatrix(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet '${sheetName}' not found in workbook`);
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
}

// ─── Data-cleaning helpers ────────────────────────────────────────────────────

function clean(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim().replace(/\s+/g, ' ');
  return s === '' || s === '-' ? null : s;
}

function parseDate(val) {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return val.toISOString().split('T')[0];
  }
  const s = String(val).trim().replace(/\s+/g, ' ');
  if (!s || s === '-' || s === 'N/A') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let m = s.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  if (/^\d{5,}$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + parseInt(s, 10) * 86400000);
    if (isNaN(d.getTime())) return null;
    const yr = d.getUTCFullYear();
    if (yr < 1900 || yr > 2100) return null;
    return d.toISOString().split('T')[0];
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const yr = d.getUTCFullYear();
    if (yr < 1900 || yr > 2100) return null;
    return d.toISOString().split('T')[0];
  }
  return null;
}

function mapGender(val) {
  const s = clean(val)?.toLowerCase();
  if (!s) return null;
  if (s === 'm' || s === 'male')   return 'Male';
  if (s === 'f' || s === 'female') return 'Female';
  return 'Other';
}

function mapTrainingStatus(val) {
  const s = clean(val)?.toLowerCase();
  if (!s)               return 'Not_Completed';
  if (s === 'yes')      return 'Yes';
  if (s === 'completed') return 'Completed';
  return 'Not_Completed';
}

function mapConfirmationStatus(val) {
  const s = clean(val)?.toLowerCase();
  if (!s) return 'Pending';
  if (s === 'done' || s === 'issued') return 'Issued';
  if (s === 'not required' || s === 'not_required' || s === 'n/a') return 'Not_Required';
  return 'Pending';
}

function mapPrivateCategory(val) {
  const n = parseInt(String(val ?? '').trim(), 10);
  if ([1, 2, 3, 4].includes(n)) return n;
  return null;
}

function mapIntlCategory(val) {
  const s = clean(val)?.toLowerCase() ?? '';
  if (s.includes('contract') || s.includes('temporary') || s.includes('fixed') ||
      s === 'n/a' || s.includes('days/wk') || s.includes('part')) {
    return 'Fixed_Term_Contract';
  }
  return 'Permanent';
}

function cleanNic(val) {
  const raw = String(val ?? '').trim();
  if (!raw || raw === '-' || raw === 'N/A') return null;
  if (/^\d+\.\d+E\+\d+$/i.test(raw)) return null;
  return raw.replace(/\s+/g, '').toUpperCase() || null;
}

function isValidNicFormat(nic) {
  if (!nic) return false;
  return /^[0-9]{9}[VX]$/.test(nic) || /^[0-9]{12}$/.test(nic);
}

function splitPhones(val) {
  const s = clean(val);
  if (!s) return [];
  return s.split(/[,;|]/).map(v => v.trim()).filter(Boolean);
}

function extractSchoolIndex(val) {
  const s = clean(val);
  if (!s) return null;
  const m = s.match(/\b(\d{1,3})\b/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n <= 0 || n > 999) return null;
  return String(n).padStart(3, '0');
}

// ─── TIN formatting ───────────────────────────────────────────────────────────

function formatTin(cat, schNo, inSch, global) {
  return `${cat}/${String(schNo).padStart(3,'0')}/${String(inSch).padStart(3,'0')}/${global}`;
}

// ─── Placeholder NIC for blank TIN rows ──────────────────────────────────────

function makePlaceholderNic(tinCat, tinSchNo, tinInSch) {
  return `VCNT${tinCat}${String(tinSchNo).padStart(3, '0')}${String(tinInSch).padStart(3, '0')}`;
}

// ─── Stats factory ────────────────────────────────────────────────────────────

function makeStats() {
  return {
    inserted:           0,
    placeholderDetails: [],
    skippedDetails:     [],
    errorDetails:       [],
  };
}

// ─── TIN allocation (for rows with bad/missing TIN parts) ────────────────────

async function allocateTin(conn, tableType, category, schoolNumber) {
  const table = tableType === 'Private'
    ? 'private_school_teachers'
    : 'international_school_teachers';

  await conn.execute(
    'SELECT last_global FROM tin_sequences WHERE table_type = ? AND tin_category = ? FOR UPDATE',
    [tableType, category],
  );

  const [[schRow]] = await conn.execute(
    `SELECT COALESCE(MAX(tin_teacher_no_school), 0) + 1 AS next_no
     FROM \`${table}\`
     WHERE tin_category = ? AND tin_school_number = ?`,
    [category, schoolNumber],
  );
  const tinInSch = schRow.next_no;

  await conn.execute(
    'UPDATE tin_sequences SET last_global = last_global + 1 WHERE table_type = ? AND tin_category = ?',
    [tableType, category],
  );
  const [[seqRow]] = await conn.execute(
    'SELECT last_global FROM tin_sequences WHERE table_type = ? AND tin_category = ?',
    [tableType, category],
  );

  return { tinCat: category, tinSchNo: schoolNumber, tinInSch, tinGlobal: seqRow.last_global };
}

// ─── School map builder ───────────────────────────────────────────────────────

async function buildSchoolMaps(conn) {
  const [rows] = await conn.execute('SELECT id, school_index, school_name FROM schools');
  const byIndex     = {};
  const byIndexName = {};
  for (const r of rows) {
    if (r.school_index) {
      byIndex[r.school_index]     = r.id;
      byIndexName[r.school_index] = r.school_name;
    }
  }
  return { byIndex, byIndexName };
}

// ─── Private teachers importer ────────────────────────────────────────────────

async function importPrivateTeachers(wb, conn, { byIndex, byIndexName }) {
  const stats   = makeStats();
  const sheet   = 'Tutorial Staff Database';
  const matrix  = sheetToMatrix(wb, sheet);
  const seenNic = new Set();

  for (let i = 15; i < matrix.length; i++) {
    const row      = matrix[i];
    const rowLabel = i + 1;
    try {
      const fullName = clean(row[6]);

      let tinCat    = parseInt(String(row[0] ?? '').trim(), 10);
      let tinSchNo  = parseInt(String(row[1] ?? '').trim(), 10);
      let tinInSch  = parseInt(String(row[2] ?? '').trim(), 10);
      let tinGlobal = parseInt(String(row[3] ?? '').trim(), 10);
      const tinValid = ![tinCat, tinSchNo, tinInSch, tinGlobal].some(isNaN);

      if (!fullName) {
        if (tinValid) {
          const schoolIdx  = String(tinSchNo).padStart(3, '0');
          const schoolId   = byIndex[schoolIdx] ?? null;
          const schoolName = byIndexName[schoolIdx] ?? schoolIdx;
          if (schoolId) {
            const placeholderNic = makePlaceholderNic(tinCat, tinSchNo, tinInSch);
            await conn.execute(
              `INSERT IGNORE INTO private_school_teachers
                 (tin_category, tin_school_number, tin_teacher_no_school, tin_teacher_no_global,
                  full_name, nic, school_id, is_active)
               VALUES (?,?,?,?,?,?,?,0)`,
              [tinCat, tinSchNo, tinInSch, tinGlobal, '__VACANT__', placeholderNic, schoolId],
            );
            stats.placeholderDetails.push({
              sheet, row: rowLabel,
              tin: formatTin(tinCat, tinSchNo, tinInSch, tinGlobal),
              school: schoolName,
              placeholderNic,
            });
          }
        }
        continue;
      }

      let category = mapPrivateCategory(row[5]);
      if (category === null) category = 3;

      const schoolIdxFromCol = extractSchoolIndex(row[53]);
      const schoolIdxFromTin = !isNaN(tinSchNo) ? String(tinSchNo).padStart(3, '0') : null;
      const schoolIdx        = schoolIdxFromCol ?? schoolIdxFromTin;
      const schoolId         = schoolIdx ? (byIndex[schoolIdx] ?? null) : null;
      const schoolName       = schoolIdx ? (byIndexName[schoolIdx] ?? clean(row[53]) ?? schoolIdx) : clean(row[53]) ?? '—';

      if (!schoolId) {
        stats.skippedDetails.push({
          sheet, row: rowLabel,
          name: fullName,
          school: clean(row[53]) ?? schoolIdx ?? '—',
          reason: `No school match for index "${schoolIdx ?? '?'}"`,
        });
        continue;
      }

      if (!tinValid) {
        const schoolNum = parseInt(schoolIdx, 10);
        const allocated = await allocateTin(conn, 'Private', category, schoolNum);
        tinCat    = allocated.tinCat;
        tinSchNo  = allocated.tinSchNo;
        tinInSch  = allocated.tinInSch;
        tinGlobal = allocated.tinGlobal;
      }

      const nic = cleanNic(row[15]);
      if (nic && seenNic.has(nic)) {
        stats.skippedDetails.push({
          sheet, row: rowLabel,
          name: fullName,
          school: schoolName,
          reason: `Duplicate NIC ${nic}`,
        });
        continue;
      }
      if (nic) seenNic.add(nic);

      let attempt1 = null, attempt2 = null, attempt3 = null;
      const passed = clean(row[9])?.toLowerCase();
      const fail1  = clean(row[10])?.toLowerCase();
      const fail2  = clean(row[11])?.toLowerCase();
      const fail3  = clean(row[12])?.toLowerCase();
      if (passed === 'pass') { attempt1 = 'Pass'; }
      else if (fail1 === 'fail') {
        attempt1 = 'Fail';
        if (fail2 === 'fail') { attempt2 = 'Fail'; if (fail3 === 'fail') attempt3 = 'Fail'; }
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
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
        [
          tinCat, tinSchNo, tinInSch, tinGlobal,
          category, fullName, nic,
          mapGender(row[24]), parseDate(row[22]),
          clean(row[16]), clean(row[14]), clean(row[18]),
          parseDate(row[28]), clean(row[30]) ? 1 : 0,
          mapConfirmationStatus(row[31]),
          mapTrainingStatus(row[7]), mapTrainingStatus(row[8]),
          attempt1, attempt2, attempt3,
          schoolId,
        ],
      );

      if (result.affectedRows === 0) {
        stats.skippedDetails.push({
          sheet, row: rowLabel,
          name: fullName,
          school: schoolName,
          reason: `Duplicate TIN ${formatTin(tinCat, tinSchNo, tinInSch, tinGlobal)}`,
        });
        continue;
      }

      const tid = result.insertId;
      let primarySet = false;
      for (const phone of splitPhones(row[17])) {
        await conn.execute(
          'INSERT IGNORE INTO private_teacher_phones (teacher_id, phone_number, phone_type, is_primary) VALUES (?,?,?,?)',
          [tid, phone, 'Mobile', primarySet ? 0 : 1],
        );
        primarySet = true;
      }

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

      stats.inserted++;
    } catch (err) {
      stats.errorDetails.push({ sheet, row: rowLabel, message: err.message });
    }
  }

  return stats;
}

// ─── Retired teachers importer ────────────────────────────────────────────────

async function importRetiredTeachers(wb, conn, { byIndex, byIndexName }) {
  const stats   = makeStats();
  const sheet   = 'Retired';
  const matrix  = sheetToMatrix(wb, sheet);
  const seenNic = new Set();

  for (let i = 3; i < matrix.length; i++) {
    const row      = matrix[i];
    const rowLabel = i + 1;
    try {
      const fullName = clean(row[6]);

      let tinCat    = parseInt(String(row[0] ?? '').trim(), 10);
      let tinSchNo  = parseInt(String(row[1] ?? '').trim(), 10);
      let tinInSch  = parseInt(String(row[2] ?? '').trim(), 10);
      let tinGlobal = parseInt(String(row[3] ?? '').trim(), 10);
      const tinValid = ![tinCat, tinSchNo, tinInSch, tinGlobal].some(isNaN);

      if (!fullName) {
        if (tinValid) {
          const schoolIdx  = String(tinSchNo).padStart(3, '0');
          const schoolId   = byIndex[schoolIdx] ?? null;
          const schoolName = byIndexName[schoolIdx] ?? schoolIdx;
          if (schoolId) {
            const placeholderNic = makePlaceholderNic(tinCat, tinSchNo, tinInSch);
            await conn.execute(
              `INSERT IGNORE INTO private_school_teachers
                 (tin_category, tin_school_number, tin_teacher_no_school, tin_teacher_no_global,
                  full_name, nic, school_id, is_active)
               VALUES (?,?,?,?,?,?,?,0)`,
              [tinCat, tinSchNo, tinInSch, tinGlobal, '__VACANT__', placeholderNic, schoolId],
            );
            stats.placeholderDetails.push({
              sheet, row: rowLabel,
              tin: formatTin(tinCat, tinSchNo, tinInSch, tinGlobal),
              school: schoolName,
              placeholderNic,
            });
          }
        }
        continue;
      }

      let category = mapPrivateCategory(row[5]);
      if (category === null) category = 3;

      const schoolIdxFromCol = extractSchoolIndex(row[53]);
      const schoolIdxFromTin = !isNaN(tinSchNo) ? String(tinSchNo).padStart(3, '0') : null;
      const schoolIdx        = schoolIdxFromCol ?? schoolIdxFromTin;
      const schoolId         = schoolIdx ? (byIndex[schoolIdx] ?? null) : null;
      const schoolName       = schoolIdx ? (byIndexName[schoolIdx] ?? clean(row[53]) ?? schoolIdx) : clean(row[53]) ?? '—';

      if (!schoolId) {
        stats.skippedDetails.push({
          sheet, row: rowLabel,
          name: fullName,
          school: clean(row[53]) ?? schoolIdx ?? '—',
          reason: `No school match for index "${schoolIdx ?? '?'}"`,
        });
        continue;
      }

      if (!tinValid) {
        const schoolNum = parseInt(schoolIdx, 10);
        const allocated = await allocateTin(conn, 'Private', category, schoolNum);
        tinCat    = allocated.tinCat;
        tinSchNo  = allocated.tinSchNo;
        tinInSch  = allocated.tinInSch;
        tinGlobal = allocated.tinGlobal;
      }

      const nic = cleanNic(row[15]);
      if (nic && seenNic.has(nic)) {
        stats.skippedDetails.push({
          sheet, row: rowLabel,
          name: fullName,
          school: schoolName,
          reason: `Duplicate NIC ${nic}`,
        });
        continue;
      }
      if (nic) seenNic.add(nic);

      let attempt1 = null, attempt2 = null, attempt3 = null;
      const passed = clean(row[9])?.toLowerCase();
      const fail1  = clean(row[10])?.toLowerCase();
      const fail2  = clean(row[11])?.toLowerCase();
      const fail3  = clean(row[12])?.toLowerCase();
      if (passed === 'pass') { attempt1 = 'Pass'; }
      else if (fail1 === 'fail') {
        attempt1 = 'Fail';
        if (fail2 === 'fail') { attempt2 = 'Fail'; if (fail3 === 'fail') attempt3 = 'Fail'; }
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
          mapGender(row[24]), parseDate(row[22]),
          clean(row[16]), clean(row[14]), clean(row[18]),
          parseDate(row[28]), clean(row[30]) ? 1 : 0,
          mapConfirmationStatus(row[31]),
          mapTrainingStatus(row[7]), mapTrainingStatus(row[8]),
          attempt1, attempt2, attempt3,
          schoolId,
        ],
      );

      if (result.affectedRows === 0) {
        stats.skippedDetails.push({
          sheet, row: rowLabel,
          name: fullName,
          school: schoolName,
          reason: `Duplicate TIN ${formatTin(tinCat, tinSchNo, tinInSch, tinGlobal)}`,
        });
        continue;
      }

      stats.inserted++;
    } catch (err) {
      stats.errorDetails.push({ sheet, row: rowLabel, message: err.message });
    }
  }

  return stats;
}

// ─── International teachers importer ─────────────────────────────────────────

async function importInternationalTeachers(wb, conn, { byIndex, byIndexName }) {
  const stats   = makeStats();
  const seenNic = new Set();

  const dataStartBySheet = { 'Academic': 9, 'Non-Academic': 4, 'Support Staff': 4 };

  for (const sheet of ['Academic', 'Non-Academic', 'Support Staff']) {
    const matrix    = sheetToMatrix(wb, sheet);
    const dataStart = dataStartBySheet[sheet];

    for (let i = dataStart; i < matrix.length; i++) {
      const row      = matrix[i];
      const rowLabel = i + 1;
      try {
        const fullName = clean(row[6]);

        let tinCat    = parseInt(String(row[0] ?? '').trim(), 10);
        let tinSchNo  = parseInt(String(row[1] ?? '').trim(), 10);
        let tinInSch  = parseInt(String(row[2] ?? '').trim(), 10);
        let tinGlobal = parseInt(String(row[3] ?? '').trim(), 10);
        const tinValid = ![tinCat, tinSchNo, tinInSch, tinGlobal].some(isNaN);

        if (!fullName) {
          if (tinValid) {
            const schoolIdx  = String(tinSchNo).padStart(3, '0');
            const schoolId   = byIndex[schoolIdx] ?? null;
            const schoolName = byIndexName[schoolIdx] ?? schoolIdx;
            if (schoolId) {
              const placeholderNic = makePlaceholderNic(tinCat, tinSchNo, tinInSch);
              await conn.execute(
                `INSERT IGNORE INTO international_school_teachers
                   (tin_category, tin_school_number, tin_teacher_no_school, tin_teacher_no_global,
                    full_name, nic, school_id, is_active)
                 VALUES (?,?,?,?,?,?,?,0)`,
                [tinCat, tinSchNo, tinInSch, tinGlobal, '__VACANT__', placeholderNic, schoolId],
              );
              stats.placeholderDetails.push({
                sheet, row: rowLabel,
                tin: formatTin(tinCat, tinSchNo, tinInSch, tinGlobal),
                school: schoolName,
                placeholderNic,
              });
            }
          }
          continue;
        }

        const category = mapIntlCategory(row[5]);
        const schoolIdx = !isNaN(tinSchNo) ? String(tinSchNo).padStart(3, '0') : null;
        const schoolId  = schoolIdx ? (byIndex[schoolIdx] ?? null) : null;
        const schoolName = schoolIdx ? (byIndexName[schoolIdx] ?? schoolIdx) : '—';

        if (!schoolId) {
          stats.skippedDetails.push({
            sheet, row: rowLabel,
            name: fullName,
            school: schoolIdx ?? '—',
            reason: `No school match for index "${schoolIdx ?? '?'}"`,
          });
          continue;
        }

        if (!tinValid) {
          const schoolNum = parseInt(schoolIdx, 10);
          const catNum    = [1, 2, 3].includes(tinCat) ? tinCat : 1;
          const allocated = await allocateTin(conn, 'International', catNum, schoolNum);
          tinCat    = allocated.tinCat;
          tinSchNo  = allocated.tinSchNo;
          tinInSch  = allocated.tinInSch;
          tinGlobal = allocated.tinGlobal;
        }

        const nic = cleanNic(row[9]);
        if (nic && seenNic.has(nic)) {
          stats.skippedDetails.push({
            sheet, row: rowLabel,
            name: fullName,
            school: schoolName,
            reason: `Duplicate NIC ${nic}`,
          });
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
            category, fullName, clean(row[7]),
            nic, clean(row[10]),
            clean(row[8]), clean(row[12]),
            parseDate(row[16]), parseDate(row[22]),
            schoolId,
          ],
        );

        if (result.affectedRows === 0) {
          stats.skippedDetails.push({
            sheet, row: rowLabel,
            name: fullName,
            school: schoolName,
            reason: `Duplicate TIN ${formatTin(tinCat, tinSchNo, tinInSch, tinGlobal)}`,
          });
          continue;
        }

        const tid = result.insertId;
        let primarySet = false;
        for (const phone of splitPhones(row[11])) {
          await conn.execute(
            'INSERT IGNORE INTO international_teacher_phones (teacher_id, phone_number, phone_type, is_primary) VALUES (?,?,?,?)',
            [tid, phone, 'Mobile', primarySet ? 0 : 1],
          );
          primarySet = true;
        }

        const probStart = parseDate(row[38]);
        const contStart = parseDate(row[39]);
        const contEnd   = parseDate(row[40]);
        if (probStart || contStart || contEnd) {
          await conn.execute(
            `INSERT IGNORE INTO international_teacher_contracts
               (teacher_id, probation_start, probation_end,
                contract_start, contract_end, contract_expiry)
             VALUES (?,?,NULL,?,?,NULL)`,
            [tid, probStart, contStart, contEnd],
          );
        }

        stats.inserted++;
      } catch (err) {
        stats.errorDetails.push({ sheet, row: rowLabel, message: err.message });
      }
    }
  }

  return stats;
}

module.exports = {
  loadWorkbookFromBuffer,
  buildSchoolMaps,
  importPrivateTeachers,
  importRetiredTeachers,
  importInternationalTeachers,
};
