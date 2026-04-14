'use strict';

const { Router }      = require('express');
const ctrl            = require('./fathers.controller');
const authenticate    = require('../../shared/middleware/authenticate');
const authorize       = require('../../shared/middleware/authorize');
const asyncHandler    = require('../../shared/utils/asyncHandler');
const { ROLE_GROUPS } = require('../../shared/constants/roles');

const router = Router();

router.use(authenticate);

// GET  /api/fathers
router.get(
  '/',
  authorize(...ROLE_GROUPS.ALL),
  asyncHandler(ctrl.getAll),
);

// GET  /api/fathers/:id
router.get(
  '/:id',
  authorize(...ROLE_GROUPS.ALL),
  asyncHandler(ctrl.getOne),
);

// POST /api/fathers
router.post(
  '/',
  authorize(...ROLE_GROUPS.VESTED_ADMINS),
  asyncHandler(ctrl.create),
);

// PATCH /api/fathers/:id
router.patch(
  '/:id',
  authorize(...ROLE_GROUPS.VESTED_ADMINS),
  asyncHandler(ctrl.update),
);

// DELETE /api/fathers/:id
router.delete(
  '/:id',
  authorize(...ROLE_GROUPS.VESTED_ADMINS),
  asyncHandler(ctrl.remove),
);

module.exports = router;
