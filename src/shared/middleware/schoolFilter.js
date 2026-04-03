'use strict';

const { ROLE_GROUPS } = require('../constants/roles');
const AppError = require('../utils/AppError');

/**
 * schoolFilter
 * ─────────────
 * Attaches req.schoolFilter to every authenticated request.
 *
 * ┌─────────────────────┬──────────────────────────────────────────┐
 * │ Role                │ req.schoolFilter                         │
 * ├─────────────────────┼──────────────────────────────────────────┤
 * │ admin_*             │ null  → no restriction; see all schools  │
 * │ principal / hr      │ { school_id: <user.school_id> }          │
 * └─────────────────────┴──────────────────────────────────────────┘
 *
 * IMPORTANT:
 *   Services and repositories MUST consume req.schoolFilter.
 *   Frontend cannot override this — the filter is computed solely
 *   from the signed JWT, not from any query parameter.
 *
 * Must be used AFTER the authenticate middleware.
 */
function schoolFilter(req, res, next) {
  if (!req.user) {
    return next(new AppError('Authentication required.', 401));
  }

  const isViewOnly = ROLE_GROUPS.VIEW_ONLY.includes(req.user.role);

  if (isViewOnly) {
    if (!req.user.school_id) {
      // Principal/HR account was created without a school assignment — block.
      return next(
        new AppError(
          'Your account is not linked to a school. Contact an administrator.',
          403,
        ),
      );
    }

    // Lock the filter to the user's own school regardless of query params.
    req.schoolFilter = { school_id: req.user.school_id };
  } else {
    // Admin roles: no school restriction.
    req.schoolFilter = null;
  }

  return next();
}

module.exports = schoolFilter;
