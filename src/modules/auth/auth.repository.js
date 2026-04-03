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
       id,
       username,
       password_hash,
       full_name,
       role,
       school_type,
       school_id,
       is_active
     FROM users
     WHERE username = ?
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
       id,
       username,
       full_name,
       role,
       school_type,
       school_id,
       is_active,
       last_login_at,
       created_at
     FROM users
     WHERE id = ?
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
