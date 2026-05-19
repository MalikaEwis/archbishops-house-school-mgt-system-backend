'use strict';

const { Router }      = require('express');
const { uploadXlsx }  = require('./admin.upload');
const ctrl            = require('./admin.controller');
const authenticate    = require('../../shared/middleware/authenticate');
const authorize       = require('../../shared/middleware/authorize');
const asyncHandler    = require('../../shared/utils/asyncHandler');
const { ROLE_GROUPS } = require('../../shared/constants/roles');

const router = Router();

router.use(authenticate);

// POST /api/admin/reset-import/private  — admin_private only
router.post(
  '/reset-import/private',
  authorize(...ROLE_GROUPS.PRIVATE_ADMINS),
  uploadXlsx,
  asyncHandler(ctrl.resetImportPrivateCtrl),
);

// POST /api/admin/reset-import/international  — admin_international only
router.post(
  '/reset-import/international',
  authorize(...ROLE_GROUPS.INTERNATIONAL_ADMINS),
  uploadXlsx,
  asyncHandler(ctrl.resetImportInternationalCtrl),
);

module.exports = router;
