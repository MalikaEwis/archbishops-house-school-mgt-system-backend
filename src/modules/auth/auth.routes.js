'use strict';

const { Router } = require('express');
const authController = require('./auth.controller');
const asyncHandler = require('../../shared/utils/asyncHandler');

const router = Router();

// POST /api/auth/login
router.post('/login', asyncHandler(authController.login));

// POST /api/auth/logout
router.post('/logout', asyncHandler(authController.logout));

module.exports = router;
