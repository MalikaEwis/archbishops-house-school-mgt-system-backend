'use strict';

const { Router } = require('express');

const authRoutes      = require('./modules/auth/auth.routes');
const teachersRoutes  = require('./modules/teachers/teachers.routes');
const schoolsRoutes   = require('./modules/schools/schools.routes');
const tinRoutes       = require('./modules/tin/tin.routes');
const documentsRoutes = require('./modules/documents/documents.routes');
const vestedRoutes    = require('./modules/vested/vested.routes');

const router = Router();

router.use('/auth',      authRoutes);
router.use('/teachers',  teachersRoutes);
router.use('/schools',   schoolsRoutes);
router.use('/tin',       tinRoutes);
router.use('/documents', documentsRoutes);
router.use('/vested',    vestedRoutes);

module.exports = router;
