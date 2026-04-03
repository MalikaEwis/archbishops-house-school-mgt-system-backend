'use strict';

const { Router } = require('express');
const teachersController = require('./teachers.controller');
const asyncHandler = require('../../shared/utils/asyncHandler');

const router = Router();

// GET  /api/teachers
router.get('/', asyncHandler(teachersController.getAll));

// GET  /api/teachers/:id
router.get('/:id', asyncHandler(teachersController.getOne));

// POST /api/teachers
router.post('/', asyncHandler(teachersController.create));

// PATCH /api/teachers/:id
router.patch('/:id', asyncHandler(teachersController.update));

// DELETE /api/teachers/:id  (clears fields, preserves TIN – FR-19)
router.delete('/:id', asyncHandler(teachersController.remove));

module.exports = router;
