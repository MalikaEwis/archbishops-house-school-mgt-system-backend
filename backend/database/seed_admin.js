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
