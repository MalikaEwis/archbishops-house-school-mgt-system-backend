'use strict';

// Placeholder – full implementation in Prompt 05 (TIN module)
// TIN format: Category/SchoolNumber/TeacherNumberInSchool/TeacherNumberInFullList
// e.g.  1/026/013/2524
const AppError = require('../../shared/utils/AppError');

async function generate(category, schoolNumber, schoolType) {
  throw new AppError('TIN service not yet implemented.', 501);
}

async function findByTin(tin) {
  throw new AppError('TIN service not yet implemented.', 501);
}

module.exports = { generate, findByTin };
