'use strict';

const { Router } = require('express');
const schoolsController = require('./schools.controller');
const asyncHandler = require('../../shared/utils/asyncHandler');

const router = Router();

// GET  /api/schools
router.get('/', asyncHandler(schoolsController.getAll));

// GET  /api/schools/:id
router.get('/:id', asyncHandler(schoolsController.getOne));

// POST /api/schools
router.post('/', asyncHandler(schoolsController.create));

// PATCH /api/schools/:id
router.patch('/:id', asyncHandler(schoolsController.update));

// DELETE /api/schools/:id
router.delete('/:id', asyncHandler(schoolsController.remove));

module.exports = router;
