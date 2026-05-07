'use strict';

/**
 * international.service.js
 * ─────────────────────────
 * Business logic for the International Schools teacher module.
 * Only read operations are implemented at this stage.
 */

const repo     = require('./international.repository');
const AppError = require('../../shared/utils/AppError');

// ─────────────────────────────────────────────────────────────────────────────
// findAll
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a paginated list of international teachers matching the filters.
 * schoolFilter from middleware is already baked into filters.schoolId
 * for principal/HR roles — this function does not re-check roles.
 *
 * @param {{ schoolId?, tin?, name?, category?, isActive? }} filters
 * @param {{ page?: number, limit?: number }}               pagination
 * @returns {Promise<{ items: object[], total: number, page: number, limit: number }>}
 */
async function findAll(filters, pagination = {}) {
  const page   = Math.max(1, Number(pagination.page)  || 1);
  const limit  = Math.min(100, Math.max(1, Number(pagination.limit) || 20));
  const offset = (page - 1) * limit;

  const repoFilters = {
    schoolId: filters.schoolId,
    tin:      filters.tin,
    name:     filters.name,
    category: filters.category,
    isActive: filters.isActive,
  };

  const [items, total] = await Promise.all([
    repo.findAll(repoFilters, { limit, offset }),
    repo.countAll(repoFilters),
  ]);

  return { items, total, page, limit };
}

// ─────────────────────────────────────────────────────────────────────────────
// findById
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a single international teacher with phones and contract attached.
 * If schoolFilter is provided (Principal / HR), verifies school ownership.
 *
 * @param {number|string}               id
 * @param {{ school_id: number }|null}  schoolFilter
 * @returns {Promise<object>}
 */
async function findById(id, schoolFilter) {
  const teacher = await repo.findById(Number(id));

  if (!teacher) {
    throw new AppError('Teacher not found.', 404);
  }

  if (schoolFilter && teacher.school_id !== schoolFilter.school_id) {
    throw new AppError('Access denied. Teacher does not belong to your school.', 403);
  }

  const [phones, contract] = await Promise.all([
    repo.getPhones(teacher.id),
    repo.getContract(teacher.id),
  ]);

  return { ...teacher, phones, contract };
}

module.exports = { findAll, findById };
