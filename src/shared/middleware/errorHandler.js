'use strict';

const logger = require('../utils/logger');
const AppError = require('../utils/AppError');
const config = require('../../config/env');

/**
 * Translate known MySQL error codes into friendly AppErrors.
 */
function handleDBError(err) {
  if (err.code === 'ER_DUP_ENTRY') {
    return new AppError('A record with that value already exists.', 409);
  }
  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return new AppError('Referenced resource does not exist.', 400);
  }
  return null;
}

/**
 * Central Express error-handling middleware.
 * Must be registered LAST (after all routes).
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Attempt to classify DB errors
  const dbErr = handleDBError(err);
  if (dbErr) {
    return errorHandler(dbErr, req, res, next);
  }

  // Default to 500 for unexpected errors
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Log all server errors; log operational errors at warn level
  if (!err.isOperational) {
    logger.error(err);
  } else {
    logger.warn(`[${err.statusCode}] ${err.message}`);
  }

  // In production hide internal details for non-operational errors
  if (config.env === 'production' && !err.isOperational) {
    return res.status(500).json({
      status: 'error',
      message: 'Something went wrong. Please try again later.',
    });
  }

  return res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
    ...(config.env !== 'production' && { stack: err.stack }),
  });
}

module.exports = errorHandler;
