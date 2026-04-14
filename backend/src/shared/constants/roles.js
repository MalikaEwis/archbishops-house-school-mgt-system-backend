'use strict';

/**
 * Every role value stored in the users.role column.
 */
const ROLES = Object.freeze({
  ADMIN_PRIVATE:       'admin_private',
  ADMIN_INTERNATIONAL: 'admin_international',
  ADMIN_VESTED:        'admin_vested',
  PRINCIPAL:           'principal',
  HEAD_OF_HR:          'head_of_hr',
});

/**
 * Pre-built role groups used by authorize() middleware and route guards.
 *
 * Rules (from SRS):
 *   - All admin_* roles   → full CRUD, no school filter
 *   - principal / head_of_hr → view-only, filtered to own school
 */
const ROLE_GROUPS = Object.freeze({
  // Every possible role
  ALL: Object.values(ROLES),

  // Any admin regardless of module
  ALL_ADMINS: [
    ROLES.ADMIN_PRIVATE,
    ROLES.ADMIN_INTERNATIONAL,
    ROLES.ADMIN_VESTED,
  ],

  // Admins for private schools module only
  PRIVATE_ADMINS: [ROLES.ADMIN_PRIVATE],

  // Admins for international schools module only
  INTERNATIONAL_ADMINS: [ROLES.ADMIN_INTERNATIONAL],

  // Admins for vested schools module only
  VESTED_ADMINS: [ROLES.ADMIN_VESTED],

  // Roles that can perform write operations (admin only — principals/HR view only)
  CAN_WRITE: [
    ROLES.ADMIN_PRIVATE,
    ROLES.ADMIN_INTERNATIONAL,
    ROLES.ADMIN_VESTED,
  ],

  // Roles limited to viewing their own school's data
  VIEW_ONLY: [ROLES.PRINCIPAL, ROLES.HEAD_OF_HR],

  // Roles that access the private + international teacher modules
  PRIVATE_MODULE_ACCESS: [
    ROLES.ADMIN_PRIVATE,
    ROLES.PRINCIPAL,
    ROLES.HEAD_OF_HR,
  ],

  INTERNATIONAL_MODULE_ACCESS: [
    ROLES.ADMIN_INTERNATIONAL,
    ROLES.PRINCIPAL,
    ROLES.HEAD_OF_HR,
  ],
});

module.exports = { ROLES, ROLE_GROUPS };
