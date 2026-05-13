'use strict';

const { Router }      = require('express');
const ctrl            = require('./international.controller');
const authenticate    = require('../../shared/middleware/authenticate');
const authorize       = require('../../shared/middleware/authorize');
const schoolFilter    = require('../../shared/middleware/schoolFilter');
const asyncHandler    = require('../../shared/utils/asyncHandler');
const { ROLE_GROUPS } = require('../../shared/constants/roles');

const router = Router();

router.use(authenticate);
router.use(schoolFilter);

// GET  /api/international-teachers
router.get(
  '/',
  authorize(...ROLE_GROUPS.INTERNATIONAL_MODULE_ACCESS),
  asyncHandler(ctrl.getAll),
);

// POST /api/international-teachers
router.post(
  '/',
  authorize(...ROLE_GROUPS.INTERNATIONAL_ADMINS),
  asyncHandler(ctrl.create),
);

// GET  /api/international-teachers/:id
router.get(
  '/:id',
  authorize(...ROLE_GROUPS.INTERNATIONAL_MODULE_ACCESS),
  asyncHandler(ctrl.getOne),
);

// PATCH /api/international-teachers/:id
router.patch(
  '/:id',
  authorize(...ROLE_GROUPS.INTERNATIONAL_ADMINS),
  asyncHandler(ctrl.update),
);

// PUT /api/international-teachers/:id/profile-picture
router.put(
  '/:id/profile-picture',
  authorize(...ROLE_GROUPS.INTERNATIONAL_ADMINS),
  asyncHandler(ctrl.uploadProfilePicture),
);

// DELETE /api/international-teachers/:id/profile-picture
router.delete(
  '/:id/profile-picture',
  authorize(...ROLE_GROUPS.INTERNATIONAL_ADMINS),
  asyncHandler(ctrl.removeProfilePicture),
);

module.exports = router;
