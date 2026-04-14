'use strict';

const AppError = require('../utils/AppError');

/**
 * Catch-all for routes that do not exist.
 * Registered after all valid routes.
 */
function notFound(req, res, next) {
  next(new AppError(`Route ${req.method} ${req.originalUrl} not found.`, 404));
}

module.exports = notFound;
