'use strict';

const { Router }      = require('express');
const ctrl            = require('./rectors.controller');
const authenticate    = require('../../shared/middleware/authenticate');
const authorize       = require('../../shared/middleware/authorize');
const asyncHandler    = require('../../shared/utils/asyncHandler');
const { ROLE_GROUPS } = require('../../shared/constants/roles');

const router = Router();

router.use(authenticate);

// GET  /api/rectors
router.get(
  '/',
  authorize(...ROLE_GROUPS.ALL),
  asyncHandler(ctrl.getAll),
);

// GET  /api/rectors/:id
router.get(
  '/:id',
  authorize(...ROLE_GROUPS.ALL),
  asyncHandler(ctrl.getOne),
);

// POST /api/rectors
router.post(
  '/',
  authorize(...ROLE_GROUPS.VESTED_ADMINS),
  asyncHandler(ctrl.create),
);

// PATCH /api/rectors/:id
router.patch(
  '/:id',
  authorize(...ROLE_GROUPS.VESTED_ADMINS),
  asyncHandler(ctrl.update),
);

// DELETE /api/rectors/:id
router.delete(
  '/:id',
  authorize(...ROLE_GROUPS.VESTED_ADMINS),
  asyncHandler(ctrl.remove),
);

module.exports = router;
