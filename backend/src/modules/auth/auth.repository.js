'use strict';

const { getPool } = require('../../config/database');

/**
 * Returns the full user row for the given username.
 * Returns undefined when no match is found.
 *
 * @param {string} username
 * @returns {Promise<object|undefined>}
 */
async function findByUsername(username) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT
       u.id,
       u.username,
       u.password_hash,
       u.full_name,
       u.role,
       u.school_type,
       u.school_id,
       u.is_active,
       s.school_name
     FROM users u
     LEFT JOIN schools s ON s.id = u.school_id
     WHERE u.username = ?
     LIMIT 1`,
    [username],
  );
  return rows[0];
}

/**
 * Returns a safe (no password_hash) user row by primary key.
 * Used by GET /api/auth/me.
 *
 * @param {number} id
 * @returns {Promise<object|undefined>}
 */
async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT
       u.id,
       u.username,
       u.full_name,
       u.role,
       u.school_type,
       u.school_id,
       u.is_active,
       u.last_login_at,
       u.created_at,
       s.school_name
     FROM users u
     LEFT JOIN schools s ON s.id = u.school_id
     WHERE u.id = ?
     LIMIT 1`,
    [id],
  );
  return rows[0];
}

/**
 * Updates the last_login_at timestamp for a user.
 *
 * @param {number} id
 * @returns {Promise<void>}
 */
async function touchLastLogin(id) {
  const pool = getPool();
  await pool.execute(
    'UPDATE users SET last_login_at = NOW() WHERE id = ?',
    [id],
  );
}

module.exports = { findByUsername, findById, touchLastLogin };
