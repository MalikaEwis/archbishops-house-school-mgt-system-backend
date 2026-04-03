'use strict';

const { Router } = require('express');
const documentsController = require('./documents.controller');
const asyncHandler = require('../../shared/utils/asyncHandler');

const router = Router();

// GET    /api/documents?teacherId=&type=
router.get('/', asyncHandler(documentsController.getAll));

// GET    /api/documents/:id/download
router.get('/:id/download', asyncHandler(documentsController.download));

// POST   /api/documents  (admin only – FR-33)
router.post('/', asyncHandler(documentsController.upload));

// PATCH  /api/documents/:id  – replace document
router.patch('/:id', asyncHandler(documentsController.replace));

// DELETE /api/documents/:id  (admin only – FR-33)
router.delete('/:id', asyncHandler(documentsController.remove));

module.exports = router;
