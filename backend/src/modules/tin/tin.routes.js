'use strict';

const { Router }     = require('express');
const tinController  = require('./tin.controller');
const authenticate   = require('../../shared/middleware/authenticate');
const authorize      = require('../../shared/middleware/authorize');
const asyncHandler   = require('../../shared/utils/asyncHandler');
const { ROLE_GROUPS } = require('../../shared/constants/roles');

const router = Router();

// All TIN routes require a valid JWT
router.use(authenticate);

// GET /api/tin/preview?tableType=Private&category=1&schoolNumber=26
// All roles may preview (useful for the add-teacher form in the UI)
router.get(
  '/preview',
  authorize(...ROLE_GROUPS.ALL),
  asyncHandler(tinController.preview),
);

// GET /api/tin/:tin  — lookup by TIN string
// The TIN contains slashes (e.g. 1/026/013/2524), so the client must
// URL-encode them: GET /api/tin/1%2F026%2F013%2F2524
// Express decodes the %2F automatically into req.params.tin.
router.get(
  '/:tin',
  authorize(...ROLE_GROUPS.ALL),
  asyncHandler(tinController.getByTin),
);

module.exports = router;
