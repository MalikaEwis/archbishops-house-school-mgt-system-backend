'use strict';

const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const config  = require('../../config/env');
const AppError = require('../../shared/utils/AppError');
const authRepository = require('./auth.repository');

// ─── Token helpers ───────────────────────────────────────────────────────────

/**
 * Signs a JWT access token with the minimal payload needed for middleware.
 * We intentionally keep the payload small — no sensitive data.
 *
 * @param {object} user  - DB user row (without password_hash)
 * @returns {string}     - signed JWT string
 */
function signToken(user) {
  return jwt.sign(
    {
      sub:         user.id,
      username:    user.username,
      role:        user.role,
      school_type: user.school_type,
      school_id:   user.school_id,
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn },
  );
}

/**
 * Verifies a JWT and returns its decoded payload.
 * Throws AppError 401 on any failure.
 *
 * @param {string} token
 * @returns {object} decoded payload
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new AppError('Session expired. Please log in again.', 401);
    }
    throw new AppError('Invalid token.', 401);
  }
}

// ─── Service methods ─────────────────────────────────────────────────────────

/**
 * Validates credentials and returns a signed JWT + safe user object.
 *
 * @param {string} username
 * @param {string} password  - plain-text password from request body
 * @returns {Promise<{ token: string, user: object }>}
 */
async function login(username, password) {
  // 1. Basic input guard
  if (!username || !password) {
    throw new AppError('Username and password are required.', 400);
  }

  // 2. Lookup user — always compare hash even when user not found to prevent
  //    timing attacks that could enumerate valid usernames.
  const user = await authRepository.findByUsername(username);

  const DUMMY_HASH = '$2a$12$invalidhashusedtopreventimaginarytimingattack00000000000';
  const hashToCompare = user ? user.password_hash : DUMMY_HASH;

  const passwordMatch = await bcrypt.compare(password, hashToCompare);

  if (!user || !passwordMatch) {
    throw new AppError('Invalid username or password.', 401);
  }

  // 3. Active account check
  if (!user.is_active) {
    throw new AppError('Account is disabled. Please contact an administrator.', 403);
  }

  // 4. Record login timestamp (fire-and-forget — don't block response)
  authRepository.touchLastLogin(user.id).catch(() => {});

  // 5. Build token
  const token = signToken(user);

  // 6. Return safe user object (never return password_hash)
  const { password_hash: _omit, ...safeUser } = user;

  return { token, user: safeUser };
}

/**
 * Returns the full profile of the currently authenticated user.
 *
 * @param {number} userId
 * @returns {Promise<object>}
 */
async function getMe(userId) {
  const user = await authRepository.findById(userId);
  if (!user) {
    throw new AppError('User not found.', 404);
  }
  return user;
}

module.exports = { login, getMe, verifyToken };
