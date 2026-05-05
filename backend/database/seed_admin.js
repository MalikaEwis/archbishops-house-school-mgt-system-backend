'use strict';

/**
 * Seed script — creates the initial admin users.
 *
 * Usage:
 *   node database/seed_admin.js
 *
 * Set credentials via environment variables or edit the SEEDS array below.
 * Run once after the schema has been applied.
 */

require('dotenv').config();

const bcrypt      = require('bcryptjs');
const mysql       = require('mysql2/promise');
const config      = require('../src/config/env');

const BCRYPT_ROUNDS = 12;

/**
 * Edit this array to define the initial admin accounts.
 * Remove or disable accounts you don't need.
 */
const SEEDS = [
  // ── Catholic Private Schools ──────────────────────────────
  {
    username:    'admin_private_1',
    password:    process.env.SEED_ADMIN_PRIVATE_1_PW || 'ChangeMe123!',
    full_name:   'Private School Admin 1',
    role:        'admin_private',
    school_type: 'Private',
    school_id:   null,
  },
  {
    username:    'admin_private_2',
    password:    process.env.SEED_ADMIN_PRIVATE_2_PW || 'ChangeMe123!',
    full_name:   'Private School Admin 2',
    role:        'admin_private',
    school_type: 'Private',
    school_id:   null,
  },
  {
    username:    'admin_private_3',
    password:    process.env.SEED_ADMIN_PRIVATE_3_PW || 'ChangeMe123!',
    full_name:   'Private School Admin 3',
    role:        'admin_private',
    school_type: 'Private',
    school_id:   null,
  },
  {
    username:    'admin_private_4',
    password:    process.env.SEED_ADMIN_PRIVATE_4_PW || 'ChangeMe123!',
    full_name:   'Private School Admin 4',
    role:        'admin_private',
    school_type: 'Private',
    school_id:   null,
  },

  // ── Catholic International Schools ────────────────────────
  {
    username:    'admin_international_1',
    password:    process.env.SEED_ADMIN_INTL_1_PW || 'ChangeMe123!',
    full_name:   'International School Admin 1',
    role:        'admin_international',
    school_type: 'International',
    school_id:   null,
  },
  {
    username:    'admin_international_2',
    password:    process.env.SEED_ADMIN_INTL_2_PW || 'ChangeMe123!',
    full_name:   'International School Admin 2',
    role:        'admin_international',
    school_type: 'International',
    school_id:   null,
  },

  // ── Catholic Vested Schools ────────────────────────────────
  {
    username:    'admin_vested_1',
    password:    process.env.SEED_ADMIN_VESTED_1_PW || 'ChangeMe123!',
    full_name:   'Vested Schools Admin 1',
    role:        'admin_vested',
    school_type: 'Vested',
    school_id:   null,
  },
  {
    username:    'admin_vested_2',
    password:    process.env.SEED_ADMIN_VESTED_2_PW || 'ChangeMe123!',
    full_name:   'Vested Schools Admin 2',
    role:        'admin_vested',
    school_type: 'Vested',
    school_id:   null,
  },

  // ── Principal / Head-of-HR — all Private schools (indices 001–035) ───
  // Username pattern:  principal_NNN  /  hr_NNN  (NNN = school_index)
  // Password for all: ChangeMe123!
  { username: 'principal_001', password: 'ChangeMe123!', full_name: "Principal – St. Bridget's Convent (Upper)",                   role: 'principal',  school_type: 'Private', school_id: 1  },
  { username: 'hr_001',        password: 'ChangeMe123!', full_name: "Head of HR – St. Bridget's Convent (Upper)",                   role: 'head_of_hr', school_type: 'Private', school_id: 1  },
  { username: 'principal_002', password: 'ChangeMe123!', full_name: "Principal – St. Bridget's Convent (Primary)",                  role: 'principal',  school_type: 'Private', school_id: 2  },
  { username: 'hr_002',        password: 'ChangeMe123!', full_name: "Head of HR – St. Bridget's Convent (Primary)",                  role: 'head_of_hr', school_type: 'Private', school_id: 2  },
  { username: 'principal_003', password: 'ChangeMe123!', full_name: 'Principal – Loyola College, Negombo',                          role: 'principal',  school_type: 'Private', school_id: 3  },
  { username: 'hr_003',        password: 'ChangeMe123!', full_name: 'Head of HR – Loyola College, Negombo',                          role: 'head_of_hr', school_type: 'Private', school_id: 3  },
  { username: 'principal_004', password: 'ChangeMe123!', full_name: 'Principal – Loyola College Bopitiya Branch',                    role: 'principal',  school_type: 'Private', school_id: 4  },
  { username: 'hr_004',        password: 'ChangeMe123!', full_name: 'Head of HR – Loyola College Bopitiya Branch',                    role: 'head_of_hr', school_type: 'Private', school_id: 4  },
  { username: 'principal_005', password: 'ChangeMe123!', full_name: 'Principal – St. Aloysius Seminary, Borella',                   role: 'principal',  school_type: 'Private', school_id: 5  },
  { username: 'hr_005',        password: 'ChangeMe123!', full_name: 'Head of HR – St. Aloysius Seminary, Borella',                   role: 'head_of_hr', school_type: 'Private', school_id: 5  },
  { username: 'principal_006', password: 'ChangeMe123!', full_name: "Principal – St. Lawrence's Convent, Colombo 06",               role: 'principal',  school_type: 'Private', school_id: 6  },
  { username: 'hr_006',        password: 'ChangeMe123!', full_name: "Head of HR – St. Lawrence's Convent, Colombo 06",               role: 'head_of_hr', school_type: 'Private', school_id: 6  },
  { username: 'principal_007', password: 'ChangeMe123!', full_name: 'Principal – Good Shepherd Convent, Panadura',                  role: 'principal',  school_type: 'Private', school_id: 7  },
  { username: 'hr_007',        password: 'ChangeMe123!', full_name: 'Head of HR – Good Shepherd Convent, Panadura',                  role: 'head_of_hr', school_type: 'Private', school_id: 7  },
  { username: 'principal_008', password: 'ChangeMe123!', full_name: "Principal – St. Joseph's College, Nugegoda",                   role: 'principal',  school_type: 'Private', school_id: 8  },
  { username: 'hr_008',        password: 'ChangeMe123!', full_name: "Head of HR – St. Joseph's College, Nugegoda",                   role: 'head_of_hr', school_type: 'Private', school_id: 8  },
  { username: 'principal_009', password: 'ChangeMe123!', full_name: 'Principal – Christ King College, Pannipitiya',                 role: 'principal',  school_type: 'Private', school_id: 9  },
  { username: 'hr_009',        password: 'ChangeMe123!', full_name: 'Head of HR – Christ King College, Pannipitiya',                 role: 'head_of_hr', school_type: 'Private', school_id: 9  },
  { username: 'principal_010', password: 'ChangeMe123!', full_name: 'Principal – Christ King College Weliveriya Branch',            role: 'principal',  school_type: 'Private', school_id: 10 },
  { username: 'hr_010',        password: 'ChangeMe123!', full_name: 'Head of HR – Christ King College Weliveriya Branch',            role: 'head_of_hr', school_type: 'Private', school_id: 10 },
  { username: 'principal_011', password: 'ChangeMe123!', full_name: 'Principal – Ave Maria Convent, Negombo',                       role: 'principal',  school_type: 'Private', school_id: 11 },
  { username: 'hr_011',        password: 'ChangeMe123!', full_name: 'Head of HR – Ave Maria Convent, Negombo',                       role: 'head_of_hr', school_type: 'Private', school_id: 11 },
  { username: 'principal_012', password: 'ChangeMe123!', full_name: 'Principal – Maris Stella College, Negombo',                    role: 'principal',  school_type: 'Private', school_id: 12 },
  { username: 'hr_012',        password: 'ChangeMe123!', full_name: 'Head of HR – Maris Stella College, Negombo',                    role: 'head_of_hr', school_type: 'Private', school_id: 12 },
  { username: 'principal_013', password: 'ChangeMe123!', full_name: 'Principal – Maris Stella College Thimbirigaskatuwa Branch',    role: 'principal',  school_type: 'Private', school_id: 13 },
  { username: 'hr_013',        password: 'ChangeMe123!', full_name: 'Head of HR – Maris Stella College Thimbirigaskatuwa Branch',    role: 'head_of_hr', school_type: 'Private', school_id: 13 },
  { username: 'principal_014', password: 'ChangeMe123!', full_name: 'Principal – Holy Cross College, Gampaha',                      role: 'principal',  school_type: 'Private', school_id: 14 },
  { username: 'hr_014',        password: 'ChangeMe123!', full_name: 'Head of HR – Holy Cross College, Gampaha',                      role: 'head_of_hr', school_type: 'Private', school_id: 14 },
  { username: 'principal_015', password: 'ChangeMe123!', full_name: 'Principal – De Mazenod College, Kandana',                      role: 'principal',  school_type: 'Private', school_id: 15 },
  { username: 'hr_015',        password: 'ChangeMe123!', full_name: 'Head of HR – De Mazenod College, Kandana',                      role: 'head_of_hr', school_type: 'Private', school_id: 15 },
  { username: 'principal_016', password: 'ChangeMe123!', full_name: 'Principal – Good Shepherd Convent, Colombo 13',                role: 'principal',  school_type: 'Private', school_id: 16 },
  { username: 'hr_016',        password: 'ChangeMe123!', full_name: 'Head of HR – Good Shepherd Convent, Colombo 13',                role: 'head_of_hr', school_type: 'Private', school_id: 16 },
  { username: 'principal_017', password: 'ChangeMe123!', full_name: "Principal – St. Benedict's College, Colombo 13",               role: 'principal',  school_type: 'Private', school_id: 17 },
  { username: 'hr_017',        password: 'ChangeMe123!', full_name: "Head of HR – St. Benedict's College, Colombo 13",               role: 'head_of_hr', school_type: 'Private', school_id: 17 },
  { username: 'principal_018', password: 'ChangeMe123!', full_name: "Principal – St. Joseph's College, Colombo 10",                 role: 'principal',  school_type: 'Private', school_id: 18 },
  { username: 'hr_018',        password: 'ChangeMe123!', full_name: "Head of HR – St. Joseph's College, Colombo 10",                 role: 'head_of_hr', school_type: 'Private', school_id: 18 },
  { username: 'principal_019', password: 'ChangeMe123!', full_name: "Principal – St. Joseph's College Wattala Branch",              role: 'principal',  school_type: 'Private', school_id: 19 },
  { username: 'hr_019',        password: 'ChangeMe123!', full_name: "Head of HR – St. Joseph's College Wattala Branch",              role: 'head_of_hr', school_type: 'Private', school_id: 19 },
  { username: 'principal_020', password: 'ChangeMe123!', full_name: "Principal – St. Joseph's College Negombo Branch",              role: 'principal',  school_type: 'Private', school_id: 20 },
  { username: 'hr_020',        password: 'ChangeMe123!', full_name: "Head of HR – St. Joseph's College Negombo Branch",              role: 'head_of_hr', school_type: 'Private', school_id: 20 },
  { username: 'principal_021', password: 'ChangeMe123!', full_name: "Principal – St. Peter's College, Colombo 04",                  role: 'principal',  school_type: 'Private', school_id: 21 },
  { username: 'hr_021',        password: 'ChangeMe123!', full_name: "Head of HR – St. Peter's College, Colombo 04",                  role: 'head_of_hr', school_type: 'Private', school_id: 21 },
  { username: 'principal_022', password: 'ChangeMe123!', full_name: "Principal – St. Peter's College Negombo Branch",               role: 'principal',  school_type: 'Private', school_id: 22 },
  { username: 'hr_022',        password: 'ChangeMe123!', full_name: "Head of HR – St. Peter's College Negombo Branch",               role: 'head_of_hr', school_type: 'Private', school_id: 22 },
  { username: 'principal_023', password: 'ChangeMe123!', full_name: "Principal – St. Peter's College Gampaha Branch",               role: 'principal',  school_type: 'Private', school_id: 23 },
  { username: 'hr_023',        password: 'ChangeMe123!', full_name: "Head of HR – St. Peter's College Gampaha Branch",               role: 'head_of_hr', school_type: 'Private', school_id: 23 },
  { username: 'principal_024', password: 'ChangeMe123!', full_name: 'Principal – Holy Family Convent, Colombo 04',                  role: 'principal',  school_type: 'Private', school_id: 24 },
  { username: 'hr_024',        password: 'ChangeMe123!', full_name: 'Head of HR – Holy Family Convent, Colombo 04',                  role: 'head_of_hr', school_type: 'Private', school_id: 24 },
  { username: 'principal_025', password: 'ChangeMe123!', full_name: 'Principal – Our Lady of Victories Convent, Moratuwa',          role: 'principal',  school_type: 'Private', school_id: 25 },
  { username: 'hr_025',        password: 'ChangeMe123!', full_name: 'Head of HR – Our Lady of Victories Convent, Moratuwa',          role: 'head_of_hr', school_type: 'Private', school_id: 25 },
  { username: 'principal_026', password: 'ChangeMe123!', full_name: "Principal – St. Sebastian's College, Moratuwa",                role: 'principal',  school_type: 'Private', school_id: 26 },
  { username: 'hr_026',        password: 'ChangeMe123!', full_name: "Head of HR – St. Sebastian's College, Moratuwa",                role: 'head_of_hr', school_type: 'Private', school_id: 26 },
  { username: 'principal_027', password: 'ChangeMe123!', full_name: 'Principal – Holy Family Convent, Kalutara',                    role: 'principal',  school_type: 'Private', school_id: 27 },
  { username: 'hr_027',        password: 'ChangeMe123!', full_name: 'Head of HR – Holy Family Convent, Kalutara',                    role: 'head_of_hr', school_type: 'Private', school_id: 27 },
  { username: 'principal_028', password: 'ChangeMe123!', full_name: 'Principal – Holy Cross College, Kalutara',                     role: 'principal',  school_type: 'Private', school_id: 28 },
  { username: 'hr_028',        password: 'ChangeMe123!', full_name: 'Head of HR – Holy Cross College, Kalutara',                     role: 'head_of_hr', school_type: 'Private', school_id: 28 },
  { username: 'principal_029', password: 'ChangeMe123!', full_name: 'Principal – Holy Cross College Payagala Branch',               role: 'principal',  school_type: 'Private', school_id: 29 },
  { username: 'hr_029',        password: 'ChangeMe123!', full_name: 'Head of HR – Holy Cross College Payagala Branch',               role: 'head_of_hr', school_type: 'Private', school_id: 29 },
  { username: 'principal_030', password: 'ChangeMe123!', full_name: "Principal – St. Joseph's Deaf School, Ragama",                 role: 'principal',  school_type: 'Private', school_id: 30 },
  { username: 'hr_030',        password: 'ChangeMe123!', full_name: "Head of HR – St. Joseph's Deaf School, Ragama",                 role: 'head_of_hr', school_type: 'Private', school_id: 30 },
  { username: 'principal_031', password: 'ChangeMe123!', full_name: 'Principal – Bolawalana Ave Maria Convent, Negombo',            role: 'principal',  school_type: 'Private', school_id: 31 },
  { username: 'hr_031',        password: 'ChangeMe123!', full_name: 'Head of HR – Bolawalana Ave Maria Convent, Negombo',            role: 'head_of_hr', school_type: 'Private', school_id: 31 },
  { username: 'principal_032', password: 'ChangeMe123!', full_name: 'Principal – Holy Angels Girls School, Payagala',               role: 'principal',  school_type: 'Private', school_id: 32 },
  { username: 'hr_032',        password: 'ChangeMe123!', full_name: 'Head of HR – Holy Angels Girls School, Payagala',               role: 'head_of_hr', school_type: 'Private', school_id: 32 },
  { username: 'principal_033', password: 'ChangeMe123!', full_name: "Principal – St. Thomas' International College, Seeduwa",       role: 'principal',  school_type: 'Private', school_id: 33 },
  { username: 'hr_033',        password: 'ChangeMe123!', full_name: "Head of HR – St. Thomas' International College, Seeduwa",       role: 'head_of_hr', school_type: 'Private', school_id: 33 },
  { username: 'principal_034', password: 'ChangeMe123!', full_name: "Principal – St. Nicholas' International School, Pelawatta",    role: 'principal',  school_type: 'Private', school_id: 34 },
  { username: 'hr_034',        password: 'ChangeMe123!', full_name: "Head of HR – St. Nicholas' International School, Pelawatta",    role: 'head_of_hr', school_type: 'Private', school_id: 34 },
  { username: 'principal_035', password: 'ChangeMe123!', full_name: "Principal – St. Nicholas' International School, Negombo",      role: 'principal',  school_type: 'Private', school_id: 35 },
  { username: 'hr_035',        password: 'ChangeMe123!', full_name: "Head of HR – St. Nicholas' International School, Negombo",      role: 'head_of_hr', school_type: 'Private', school_id: 35 },
];

async function run() {
  const pool = await mysql.createPool({
    host:     config.db.host,
    port:     config.db.port,
    user:     config.db.user,
    password: config.db.password,
    database: config.db.name,
  });

  console.log(`\nConnected to ${config.db.name}. Seeding ${SEEDS.length} admin(s)…\n`);

  for (const seed of SEEDS) {
    const hash = await bcrypt.hash(seed.password, BCRYPT_ROUNDS);

    try {
      await pool.execute(
        `INSERT INTO users
           (username, password_hash, full_name, role, school_type, school_id, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           password_hash = VALUES(password_hash),
           full_name     = VALUES(full_name),
           role          = VALUES(role),
           school_type   = VALUES(school_type),
           school_id     = VALUES(school_id)`,
        [
          seed.username,
          hash,
          seed.full_name,
          seed.role,
          seed.school_type,
          seed.school_id,
        ],
      );
      console.log(`  ✓  ${seed.username}  (${seed.role})`);
    } catch (err) {
      console.error(`  ✗  ${seed.username}  →  ${err.message}`);
    }
  }

  await pool.end();
  console.log('\nDone. Change all default passwords immediately.\n');
}

run().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
