'use strict';

// Placeholder – full implementation in Prompt 02 (Auth module)
const AppError = require('../../shared/utils/AppError');

async function login(username, password, schoolType) {
  if (!username || !password) {
    throw new AppError('Username and password are required.', 400);
  }
  // TODO: implement credential verification + JWT signing
  throw new AppError('Auth service not yet implemented.', 501);
}

module.exports = { login };
