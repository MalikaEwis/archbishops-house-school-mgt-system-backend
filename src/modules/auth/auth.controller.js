'use strict';

const authService = require('./auth.service');
const { sendSuccess } = require('../../shared/utils/response');

async function login(req, res) {
  const { username, password, schoolType } = req.body;
  const result = await authService.login(username, password, schoolType);
  return sendSuccess(res, result, 'Login successful');
}

async function logout(req, res) {
  return sendSuccess(res, null, 'Logged out successfully');
}

module.exports = { login, logout };
