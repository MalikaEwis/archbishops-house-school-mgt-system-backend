'use strict';

const authService = require('../../modules/auth/auth.service');
const AppError    = require('../utils/AppError');

/**
 * authenticate
 * ─────────────
 * Verifies the Bearer token in the Authorization header and attaches
 * the decoded JWT payload to req.user.
 *
 * req.user shape:
 * {
 *   sub:         number   – users.id
 *   username:    string
 *   role:        string   – see ROLES constants
 *   school_type: string|null
 *   school_id:   number|null
 * }
 *
 * Throws 401 when:
 *   - No Authorization header is present
 *   - Token is malformed, expired, or signed with a different secret
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authentication required. Provide a Bearer token.', 401));
  }

  const token = authHeader.slice(7); // strip 'Bearer '

  try {
    req.user = authService.verifyToken(token);
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = authenticate;
