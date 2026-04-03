'use strict';

const { Router } = require('express');
const tinController = require('./tin.controller');
const asyncHandler = require('../../shared/utils/asyncHandler');

const router = Router();

// POST /api/tin/generate  – allocate next available TIN for a teacher
router.post('/generate', asyncHandler(tinController.generate));

// GET  /api/tin/:tin      – look up a teacher by TIN
router.get('/:tin', asyncHandler(tinController.getByTin));

module.exports = router;
