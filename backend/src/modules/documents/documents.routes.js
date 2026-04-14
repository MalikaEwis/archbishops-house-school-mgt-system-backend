'use strict';

const { Router }       = require('express');
const ctrl             = require('./documents.controller');
const authenticate     = require('../../shared/middleware/authenticate');
const authorize        = require('../../shared/middleware/authorize');
const asyncHandler     = require('../../shared/utils/asyncHandler');
const { ROLE_GROUPS }  = require('../../shared/constants/roles');

const router = Router();

// All document routes require a valid JWT
router.use(authenticate);

// GET /api/documents  — all roles; admin_only rows filtered out for non-admins
router.get(
  '/',
  authorize(...ROLE_GROUPS.ALL),
  asyncHandler(ctrl.getAll),
);

// GET /api/documents/:id/download  — all roles; admin_only enforced in service
router.get(
  '/:id/download',
  authorize(...ROLE_GROUPS.ALL),
  asyncHandler(ctrl.download),
);

// POST /api/documents  — admin only (FR-33)
router.post(
  '/',
  authorize(...ROLE_GROUPS.CAN_WRITE),
  asyncHandler(ctrl.upload),
);

// PATCH /api/documents/:id  — admin only; replaces the physical file
router.patch(
  '/:id',
  authorize(...ROLE_GROUPS.CAN_WRITE),
  asyncHandler(ctrl.replace),
);

// DELETE /api/documents/:id  — admin only (FR-33)
router.delete(
  '/:id',
  authorize(...ROLE_GROUPS.CAN_WRITE),
  asyncHandler(ctrl.remove),
);

module.exports = router;
