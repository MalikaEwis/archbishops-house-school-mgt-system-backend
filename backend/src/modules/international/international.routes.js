'use strict';

const { Router }      = require('express');
const ctrl            = require('./international.controller');
const authenticate    = require('../../shared/middleware/authenticate');
const authorize       = require('../../shared/middleware/authorize');
const schoolFilter    = require('../../shared/middleware/schoolFilter');
const asyncHandler    = require('../../shared/utils/asyncHandler');
const { ROLE_GROUPS } = require('../../shared/constants/roles');

const router = Router();

// ── Global guards: every route requires auth + school filter ─────────────────
router.use(authenticate);
router.use(schoolFilter);

// GET  /api/international-teachers
router.get(
  '/',
  authorize(...ROLE_GROUPS.INTERNATIONAL_MODULE_ACCESS),
  asyncHandler(ctrl.getAll),
);

// GET  /api/international-teachers/:id
router.get(
  '/:id',
  authorize(...ROLE_GROUPS.INTERNATIONAL_MODULE_ACCESS),
  asyncHandler(ctrl.getOne),
);

module.exports = router;
