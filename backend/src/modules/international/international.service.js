'use strict';

/**
 * international.service.js
 * ─────────────────────────
 * Business logic for the International Schools teacher module.
 * Enforces FR-39 to FR-46 rules.
 */

const { getPool }  = require('../../config/database');
const repo         = require('./international.repository');
const tinService   = require('../tin/tin.service');
const AppError     = require('../../shared/utils/AppError');

const VALID_CATEGORIES = new Set(['Permanent', 'Fixed_Term_Contract']);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function attachSatelliteData(teacher) {
  if (!teacher) return teacher;

  const [phones, contract, mediums, classLevels, education, profQuals, subjects] =
    await Promise.all([
      repo.getPhones(teacher.id),
      repo.getContract(teacher.id),
      repo.getMediums(teacher.id),
      repo.getClassLevels(teacher.id),
      repo.getEducation(teacher.id),
      repo.getProfessionalQualifications(teacher.id),
      repo.getSubjects(teacher.id),
    ]);

  return {
    ...teacher,
    phones,
    contract,
    mediums,
    class_levels:               classLevels,
    education,
    professional_qualifications: profQuals,
    subjects,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// findAll
// ─────────────────────────────────────────────────────────────────────────────

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

async function findById(id, schoolFilter) {
  const teacher = await repo.findById(Number(id));

  if (!teacher) throw new AppError('Teacher not found.', 404);

  if (schoolFilter && teacher.school_id !== schoolFilter.school_id) {
    throw new AppError('Access denied. Teacher does not belong to your school.', 403);
  }

  return attachSatelliteData(teacher);
}

// ─────────────────────────────────────────────────────────────────────────────
// create
// ─────────────────────────────────────────────────────────────────────────────

async function create(body) {
  // ── Required field validation ─────────────────────────────────────────────
  const required = ['tin_category', 'tin_school_number', 'category',
                    'full_name', 'nic', 'date_of_birth', 'school_id'];
  for (const field of required) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      throw new AppError(`Field "${field}" is required.`, 400);
    }
  }

  if (!VALID_CATEGORIES.has(body.category)) {
    throw new AppError(
      `Invalid category "${body.category}". Must be "Permanent" or "Fixed_Term_Contract".`,
      400,
    );
  }

  // ── TIN allocation (same concurrency-safe pattern as private module) ──────
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const allocation = await tinService.allocate({
      tableType:    'International',
      category:     Number(body.tin_category),
      schoolNumber: Number(body.tin_school_number),
      conn,
    });

    let teacherId;

    if (allocation.isReuse) {
      await repo.reactivateVacantRow(allocation.rowId, body, conn);
      teacherId = allocation.rowId;
    } else {
      teacherId = await repo.insertTeacher(
        {
          ...body,
          tin_category:          Number(body.tin_category),
          tin_school_number:     Number(body.tin_school_number),
          tin_teacher_no_school: allocation.tin_teacher_no_school,
          tin_teacher_no_global: allocation.tin_teacher_no_global,
        },
        conn,
      );
    }

    // ── Satellite data ──────────────────────────────────────────────────────
    if (Array.isArray(body.phones) && body.phones.length) {
      await repo.setPhones(teacherId, body.phones, conn);
    }
    if (body.contract) {
      await repo.upsertContract(teacherId, body.contract, conn);
    }
    if (Array.isArray(body.mediums) && body.mediums.length) {
      await repo.setMediums(teacherId, body.mediums, conn);
    }
    if (Array.isArray(body.class_levels) && body.class_levels.length) {
      await repo.setClassLevels(teacherId, body.class_levels, conn);
    }
    if (Array.isArray(body.education) && body.education.length) {
      await repo.setEducation(teacherId, body.education, conn);
    }
    if (Array.isArray(body.professional_qualifications) && body.professional_qualifications.length) {
      await repo.setProfessionalQualifications(teacherId, body.professional_qualifications, conn);
    }
    if (Array.isArray(body.subjects) && body.subjects.length) {
      await repo.setSubjects(teacherId, body.subjects, conn);
    }

    await conn.commit();
    return findById(teacherId, null);

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// update
// ─────────────────────────────────────────────────────────────────────────────

async function update(id, body) {
  const existing = await repo.findById(Number(id));
  if (!existing)        throw new AppError('Teacher not found.', 404);
  if (!existing.is_active) throw new AppError('Cannot update a removed teacher.', 409);

  if (body.category !== undefined && !VALID_CATEGORIES.has(body.category)) {
    throw new AppError(
      `Invalid category "${body.category}". Must be "Permanent" or "Fixed_Term_Contract".`,
      400,
    );
  }

  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    await repo.updateTeacher(Number(id), body, conn);

    if (body.phones !== undefined) {
      await repo.setPhones(Number(id), body.phones ?? [], conn);
    }
    if (body.contract !== undefined) {
      await repo.upsertContract(Number(id), body.contract ?? {}, conn);
    }
    if (body.mediums !== undefined) {
      await repo.setMediums(Number(id), body.mediums ?? [], conn);
    }
    if (body.class_levels !== undefined) {
      await repo.setClassLevels(Number(id), body.class_levels ?? [], conn);
    }
    if (body.education !== undefined) {
      await repo.setEducation(Number(id), body.education ?? [], conn);
    }
    if (body.professional_qualifications !== undefined) {
      await repo.setProfessionalQualifications(Number(id), body.professional_qualifications ?? [], conn);
    }
    if (body.subjects !== undefined) {
      await repo.setSubjects(Number(id), body.subjects ?? [], conn);
    }

    await conn.commit();
    return findById(Number(id), null);

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function updateProfilePicture(id, filePath) {
  const existing = await repo.findById(Number(id));
  if (!existing)        throw new AppError('Teacher not found.', 404);
  if (!existing.is_active) throw new AppError('Cannot update a removed teacher.', 409);
  await repo.updateProfilePicture(Number(id), filePath);
  return findById(Number(id), null);
}

async function removeProfilePicture(id) {
  const existing = await repo.findById(Number(id));
  if (!existing)        throw new AppError('Teacher not found.', 404);
  if (!existing.is_active) throw new AppError('Cannot update a removed teacher.', 409);
  await repo.updateProfilePicture(Number(id), null);
  return findById(Number(id), null);
}

module.exports = { findAll, findById, create, update, updateProfilePicture, removeProfilePicture };
