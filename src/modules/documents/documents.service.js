'use strict';

// Placeholder – full implementation in Prompt 06 (Documents module)
const AppError = require('../../shared/utils/AppError');

async function findAll(filters) {
  throw new AppError('Documents service not yet implemented.', 501);
}

async function getFile(id, user) {
  throw new AppError('Documents service not yet implemented.', 501);
}

async function upload(metadata, file) {
  throw new AppError('Documents service not yet implemented.', 501);
}

async function replace(id, file) {
  throw new AppError('Documents service not yet implemented.', 501);
}

async function remove(id) {
  throw new AppError('Documents service not yet implemented.', 501);
}

module.exports = { findAll, getFile, upload, replace, remove };
