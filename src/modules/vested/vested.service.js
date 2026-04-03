'use strict';

// Placeholder – full implementation in Prompt 07 (Vested Schools module)
const AppError = require('../../shared/utils/AppError');

async function findAllSchools(filters) {
  throw new AppError('Vested service not yet implemented.', 501);
}

async function findSchoolById(id) {
  throw new AppError('Vested service not yet implemented.', 501);
}

async function createSchool(data) {
  throw new AppError('Vested service not yet implemented.', 501);
}

async function updateSchool(id, data) {
  throw new AppError('Vested service not yet implemented.', 501);
}

async function importCsv(file) {
  throw new AppError('Vested service not yet implemented.', 501);
}

async function getPrincipalHistory(schoolId) {
  throw new AppError('Vested service not yet implemented.', 501);
}

module.exports = {
  findAllSchools,
  findSchoolById,
  createSchool,
  updateSchool,
  importCsv,
  getPrincipalHistory,
};
