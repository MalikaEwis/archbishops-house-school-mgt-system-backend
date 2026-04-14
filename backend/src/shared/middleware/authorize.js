'use strict';

const AppError = require('../utils/AppError');

/**
 * authorize(...allowedRoles)
 * ───────────────────────────
 * Factory that returns a middleware which enforces that req.user.role
 * is one of the provided allowed roles.
 *
 * Must be used AFTER the authenticate middleware.
 *
 * Usage:
 *   router.delete('/:id',
 *     authenticate,
 *     authorize(ROLE_GROUPS.CAN_WRITE),   // spread an array
 *     asyncHandler(controller.remove)
 *   );
 *
 *   router.get('/',
 *     authenticate,
 *     authorize(...ROLE_GROUPS.ALL),       // spread the group
 *     asyncHandler(controller.getAll)
 *   );
 *
 * @param {...string} allowedRoles
 * @returns {Function} Express middleware
 */
function authorize(...allowedRoles) {
  // Flatten so callers can pass either individual strings or spread arrays
  const roles = allowedRoles.flat();

  return function (req, res, next) {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new AppError(
          `Access denied. Required role(s): ${roles.join(', ')}.`,
          403,
        ),
      );
    }

    return next();
  };
}

module.exports = authorize;
