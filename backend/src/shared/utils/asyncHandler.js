'use strict';

/**
 * Wraps an async route handler and forwards any rejected promise
 * to Express's next() so the central error handler can deal with it.
 *
 * Usage:
 *   router.get('/path', asyncHandler(async (req, res) => { ... }));
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
