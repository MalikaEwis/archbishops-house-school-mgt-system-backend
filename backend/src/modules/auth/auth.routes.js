'use strict';

const { Router }   = require('express');
const authController = require('./auth.controller');
const authenticate   = require('../../shared/middleware/authenticate');
const asyncHandler   = require('../../shared/utils/asyncHandler');

const router = Router();

// ── Public routes (no token required) ────────────────────────
// POST /api/auth/login
router.post('/login', asyncHandler(authController.login));

// ── Protected routes ──────────────────────────────────────────
// POST /api/auth/logout  (authenticate confirms a valid session)
router.post('/logout', authenticate, asyncHandler(authController.logout));

// GET  /api/auth/me
router.get('/me', authenticate, asyncHandler(authController.getMe));

module.exports = router;
