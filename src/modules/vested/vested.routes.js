'use strict';

const { Router }      = require('express');
const ctrl            = require('./vested.controller');
const authenticate    = require('../../shared/middleware/authenticate');
const authorize       = require('../../shared/middleware/authorize');
const asyncHandler    = require('../../shared/utils/asyncHandler');
const { ROLE_GROUPS } = require('../../shared/constants/roles');

const router = Router();

// All vested routes require authentication
router.use(authenticate);

// ─── Schools ──────────────────────────────────────────────────────────────────

// GET  /api/vested/schools?zone=&district=&region=&province=&principalReligion=
router.get(
  '/schools',
  authorize(...ROLE_GROUPS.ALL),
  asyncHandler(ctrl.getAllSchools),
);

// POST /api/vested/schools/import  — must be declared BEFORE /schools/:id
router.post(
  '/schools/import',
  authorize(...ROLE_GROUPS.VESTED_ADMINS),
  asyncHandler(ctrl.importCsv),
);

// GET  /api/vested/schools/:id
router.get(
  '/schools/:id',
  authorize(...ROLE_GROUPS.ALL),
  asyncHandler(ctrl.getSchool),
);

// POST /api/vested/schools
router.post(
  '/schools',
  authorize(...ROLE_GROUPS.VESTED_ADMINS),
  asyncHandler(ctrl.createSchool),
);

// PATCH /api/vested/schools/:id
router.patch(
  '/schools/:id',
  authorize(...ROLE_GROUPS.VESTED_ADMINS),
  asyncHandler(ctrl.updateSchool),
);

// DELETE /api/vested/schools/:id
router.delete(
  '/schools/:id',
  authorize(...ROLE_GROUPS.VESTED_ADMINS),
  asyncHandler(ctrl.deleteSchool),
);

// ─── Principals ───────────────────────────────────────────────────────────────

// GET  /api/vested/schools/:id/principals
router.get(
  '/schools/:id/principals',
  authorize(...ROLE_GROUPS.ALL),
  asyncHandler(ctrl.getPrincipalHistory),
);

// POST /api/vested/schools/:id/principals
router.post(
  '/schools/:id/principals',
  authorize(...ROLE_GROUPS.VESTED_ADMINS),
  asyncHandler(ctrl.addPrincipal),
);

// PATCH /api/vested/schools/:id/principals/:pid
router.patch(
  '/schools/:id/principals/:pid',
  authorize(...ROLE_GROUPS.VESTED_ADMINS),
  asyncHandler(ctrl.updatePrincipal),
);

// POST /api/vested/schools/:id/principals/:pid/archive
router.post(
  '/schools/:id/principals/:pid/archive',
  authorize(...ROLE_GROUPS.VESTED_ADMINS),
  asyncHandler(ctrl.archivePrincipal),
);

// ─── Student Stats ────────────────────────────────────────────────────────────

// GET  /api/vested/schools/:id/stats
router.get(
  '/schools/:id/stats',
  authorize(...ROLE_GROUPS.ALL),
  asyncHandler(ctrl.getStats),
);

// POST /api/vested/schools/:id/stats  — body: { stat_year, count_catholic, ... }
router.post(
  '/schools/:id/stats',
  authorize(...ROLE_GROUPS.VESTED_ADMINS),
  asyncHandler(ctrl.upsertStats),
);

// PATCH /api/vested/schools/:id/stats/:year
router.patch(
  '/schools/:id/stats/:year',
  authorize(...ROLE_GROUPS.VESTED_ADMINS),
  asyncHandler(ctrl.updateStats),
);

// DELETE /api/vested/schools/:id/stats/:year
router.delete(
  '/schools/:id/stats/:year',
  authorize(...ROLE_GROUPS.VESTED_ADMINS),
  asyncHandler(ctrl.deleteStats),
);

module.exports = router;
