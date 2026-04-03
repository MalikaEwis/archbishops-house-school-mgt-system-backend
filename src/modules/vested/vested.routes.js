'use strict';

const { Router } = require('express');
const vestedController = require('./vested.controller');
const asyncHandler = require('../../shared/utils/asyncHandler');

const router = Router();

// GET  /api/vested/schools
router.get('/schools', asyncHandler(vestedController.getAllSchools));

// GET  /api/vested/schools/:id
router.get('/schools/:id', asyncHandler(vestedController.getSchool));

// POST /api/vested/schools
router.post('/schools', asyncHandler(vestedController.createSchool));

// PATCH /api/vested/schools/:id
router.patch('/schools/:id', asyncHandler(vestedController.updateSchool));

// POST /api/vested/schools/import  – CSV import (FR-48)
router.post('/schools/import', asyncHandler(vestedController.importCsv));

// GET  /api/vested/schools/:id/principals  – principal history (FR-50)
router.get('/schools/:id/principals', asyncHandler(vestedController.getPrincipalHistory));

module.exports = router;
