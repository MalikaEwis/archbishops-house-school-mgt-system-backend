'use strict';

const { Router }     = require('express');
const ctrl           = require('./teachers.controller');
const authenticate   = require('../../shared/middleware/authenticate');
const authorize      = require('../../shared/middleware/authorize');
const schoolFilter   = require('../../shared/middleware/schoolFilter');
const asyncHandler   = require('../../shared/utils/asyncHandler');
const { ROLE_GROUPS } = require('../../shared/constants/roles');

const router = Router();

// ── Global guards: every teacher route requires auth + school filter ──────────
router.use(authenticate);
router.use(schoolFilter);

// ─────────────────────────────────────────────────────────────────────────────
// Removal-request sub-routes  (MUST be declared before /:id to avoid conflicts)
// ─────────────────────────────────────────────────────────────────────────────

// GET  /api/teachers/removal-requests
router.get(
  '/removal-requests',
  authorize(...ROLE_GROUPS.CAN_WRITE),
  asyncHandler(ctrl.getRemovalRequests),
);

// POST /api/teachers/removal-requests/:requestId/approve
router.post(
  '/removal-requests/:requestId/approve',
  authorize(...ROLE_GROUPS.CAN_WRITE),
  asyncHandler(ctrl.approveRemoval),
);

// POST /api/teachers/removal-requests/:requestId/reject
router.post(
  '/removal-requests/:requestId/reject',
  authorize(...ROLE_GROUPS.CAN_WRITE),
  asyncHandler(ctrl.rejectRemoval),
);

// ─────────────────────────────────────────────────────────────────────────────
// Collection routes
// ─────────────────────────────────────────────────────────────────────────────

// GET  /api/teachers  — all roles; filtering enforced by schoolFilter middleware
router.get(
  '/',
  authorize(...ROLE_GROUPS.ALL),
  asyncHandler(ctrl.getAll),
);

// POST /api/teachers  — admin only
router.post(
  '/',
  authorize(...ROLE_GROUPS.CAN_WRITE),
  asyncHandler(ctrl.create),
);

// ─────────────────────────────────────────────────────────────────────────────
// Single-resource routes
// ─────────────────────────────────────────────────────────────────────────────

// GET  /api/teachers/:id  — all roles; school boundary enforced in service
router.get(
  '/:id',
  authorize(...ROLE_GROUPS.ALL),
  asyncHandler(ctrl.getOne),
);

// PATCH /api/teachers/:id  — admin only
router.patch(
  '/:id',
  authorize(...ROLE_GROUPS.CAN_WRITE),
  asyncHandler(ctrl.update),
);

// DELETE /api/teachers/:id
// Intentionally blocked with a descriptive 400 — use the removal-request workflow.
router.delete(
  '/:id',
  authorize(...ROLE_GROUPS.CAN_WRITE),
  asyncHandler(ctrl.remove),
);

// PUT /api/teachers/:id/profile-picture  — admin only
// Note: multer runs inside the controller (not as express middleware here)
// so that AppError handling is consistent with the rest of the error pipeline.
router.put(
  '/:id/profile-picture',
  authorize(...ROLE_GROUPS.CAN_WRITE),
  asyncHandler(ctrl.uploadProfilePicture),
);

// POST /api/teachers/:id/removal-request  — admin A initiates removal (FR-20)
router.post(
  '/:id/removal-request',
  authorize(...ROLE_GROUPS.CAN_WRITE),
  asyncHandler(ctrl.requestRemoval),
);

module.exports = router;
