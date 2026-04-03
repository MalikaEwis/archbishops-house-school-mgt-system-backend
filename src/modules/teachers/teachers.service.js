'use strict';

// Placeholder – full implementation in Prompt 03 (Teachers module)
const AppError = require('../../shared/utils/AppError');

async function findAll(filters) {
  throw new AppError('Teachers service not yet implemented.', 501);
}

async function findById(id) {
  throw new AppError('Teachers service not yet implemented.', 501);
}

async function create(data) {
  throw new AppError('Teachers service not yet implemented.', 501);
}

async function update(id, data) {
  throw new AppError('Teachers service not yet implemented.', 501);
}

async function remove(id, approvedBy) {
  throw new AppError('Teachers service not yet implemented.', 501);
}

module.exports = { findAll, findById, create, update, remove };
