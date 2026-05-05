'use strict';

const { getPool } = require('../../config/database');
const AppError    = require('../../shared/utils/AppError');

const VALID_TYPES = new Set(['Private', 'International', 'Vested']);

async function findAll(filters = {}) {
  const pool = getPool();
  const clauses = [];
  const params  = [];

  if (filters.type && VALID_TYPES.has(filters.type)) {
    clauses.push('school_type = ?');
    params.push(filters.type);
  }
  if (filters.name) {
    clauses.push('school_name LIKE ?');
    params.push(`%${filters.name}%`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const [rows] = await pool.execute(
    `SELECT id, school_index, school_name, school_type,
            principal_name, school_phone, student_admission_type,
            school_category, no_of_students, no_of_teachers
     FROM schools
     ${where}
     ORDER BY school_index ASC`,
    params,
  );
  return rows;
}

async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id, school_index, school_name, school_type,
            principal_name, principal_phone, school_phone,
            student_admission_type, school_category, email,
            no_of_students, no_of_teachers, no_of_pensionable_teachers,
            created_at, updated_at
     FROM schools WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!rows[0]) throw new AppError('School not found.', 404);
  return rows[0];
}

async function create(data) {
  throw new AppError('Schools service not yet implemented.', 501);
}

async function update(id, data) {
  throw new AppError('Schools service not yet implemented.', 501);
}

async function remove(id) {
  throw new AppError('Schools service not yet implemented.', 501);
}

module.exports = { findAll, findById, create, update, remove };
