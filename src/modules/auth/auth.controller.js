'use strict';

const authService = require('./auth.service');
const { sendSuccess } = require('../../shared/utils/response');

/**
 * POST /api/auth/login
 * Body: { username, password }
 */
async function login(req, res) {
  const { username, password } = req.body;
  const { token, user } = await authService.login(username, password);

  return sendSuccess(res, { token, user }, 'Login successful');
}

/**
 * POST /api/auth/logout
 * JWT is stateless — the client simply discards the token.
 * This endpoint exists so the frontend can call a consistent logout URL
 * and for future token-blocklist support.
 */
async function logout(req, res) {
  return sendSuccess(res, null, 'Logged out successfully');
}

/**
 * GET /api/auth/me
 * Returns the profile of the currently authenticated user.
 * Requires the authenticate middleware upstream.
 */
async function getMe(req, res) {
  const user = await authService.getMe(req.user.sub);
  return sendSuccess(res, user);
}

module.exports = { login, logout, getMe };
