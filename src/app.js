'use strict';

const express  = require('express');
const helmet   = require('helmet');
const cors     = require('cors');

const config         = require('./config/env');
const routes         = require('./routes');
const requestLogger  = require('./shared/middleware/requestLogger');
const rateLimiter    = require('./shared/middleware/rateLimiter');
const notFound       = require('./shared/middleware/notFound');
const errorHandler   = require('./shared/middleware/errorHandler');

const app = express();

// ─── Security ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: config.env === 'production' ? process.env.ALLOWED_ORIGINS?.split(',') : '*',
  credentials: true,
}));
app.use(rateLimiter);

// ─── Body parsing ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Request logging ─────────────────────────────────────────────────────────
app.use(requestLogger);

// ─── Health check (no auth required) ─────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    env: config.env,
    timestamp: new Date().toISOString(),
  });
});

// ─── API routes ───────────────────────────────────────────────────────────────
app.use('/api', routes);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use(notFound);

// ─── Central error handler (must be last) ────────────────────────────────────
app.use(errorHandler);

module.exports = app;
