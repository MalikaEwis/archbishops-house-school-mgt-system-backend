'use strict';

const teachersService = require('./teachers.service');
const { handleProfilePictureUpload } = require('./teachers.upload');
const { sendSuccess, sendCreated, sendNoContent } = require('../../shared/utils/response');
const audit = require('../../shared/utils/audit');
const path  = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/teachers
// Query params: schoolId, tin, name, category, page, limit
// ─────────────────────────────────────────────────────────────────────────────
async function getAll(req, res) {
  const filters = {
    // Principal / HR: req.schoolFilter.school_id overrides any query param.
    // Admin: req.schoolFilter is null — use query param or no filter.
    schoolId: req.schoolFilter
      ? req.schoolFilter.school_id
      : (req.query.schoolId ?? null),
    tin:      req.query.tin      ?? null,
    name:     req.query.name     ?? null,
    category: req.query.category ?? null,
    // isActive: omit → active only; 'all' → include removed; '0' → removed only
    // Principal/HR are never allowed to see removed teachers.
    isActive: req.schoolFilter ? undefined : (req.query.isActive ?? undefined),
  };

  const result = await teachersService.findAll(filters, {
    page:  req.query.page,
    limit: req.query.limit,
  });

  return sendSuccess(res, {
    items: result.items,
    pagination: {
      total:      result.total,
      page:       result.page,
      limit:      result.limit,
      totalPages: Math.ceil(result.total / result.limit),
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/teachers/:id
// ─────────────────────────────────────────────────────────────────────────────
async function getOne(req, res) {
  const teacher = await teachersService.findById(req.params.id, req.schoolFilter);
  return sendSuccess(res, teacher);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/teachers  (admin only)
// ─────────────────────────────────────────────────────────────────────────────
async function create(req, res) {
  const teacher = await teachersService.create(req.body);
  await audit(req, 'teacher.create', 'teacher', teacher.id, { tin: teacher.tin });
  return sendCreated(res, teacher, 'Teacher created successfully');
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/teachers/:id  (admin only)
// ─────────────────────────────────────────────────────────────────────────────
async function update(req, res) {
  const teacher = await teachersService.update(req.params.id, req.body);
  await audit(req, 'teacher.update', 'teacher', teacher.id, { fields: Object.keys(req.body) });
  return sendSuccess(res, teacher, 'Teacher updated successfully');
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/teachers/:id/profile-picture  (admin only)
// ─────────────────────────────────────────────────────────────────────────────
async function uploadProfilePicture(req, res) {
  // Multer runs first; on success req.file is populated
  await handleProfilePictureUpload(req, res);

  if (!req.file) {
    const { AppError } = require('../../shared/utils/AppError');
    throw new AppError('No file uploaded.', 400);
  }

  // Store relative path so it stays portable
  const relativePath = path.join('profile-pictures', req.file.filename).replace(/\\/g, '/');
  const teacher = await teachersService.updateProfilePicture(req.params.id, relativePath);
  return sendSuccess(res, teacher, 'Profile picture updated');
}

// ─────────────────────────────────────────────────────────────────────────────
// Removal workflow  (FR-19, FR-20)
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/teachers/:id/removal-request  (admin A initiates)
async function requestRemoval(req, res) {
  const result = await teachersService.requestRemoval(
    req.params.id,
    req.body.reason,
    req.user.sub,
  );
  await audit(req, 'teacher.removal.request', 'teacher', Number(req.params.id), { reason: req.body.reason });
  return sendCreated(res, result, result.message);
}

// POST /api/teachers/removal-requests/:requestId/approve  (admin B approves)
async function approveRemoval(req, res) {
  const result = await teachersService.approveRemoval(
    req.params.requestId,
    req.user.sub,
  );
  await audit(req, 'teacher.removal.approve', 'teacher_removal_approval', Number(req.params.requestId));
  return sendSuccess(res, result, result.message);
}

// POST /api/teachers/removal-requests/:requestId/reject
async function rejectRemoval(req, res) {
  const result = await teachersService.rejectRemoval(
    req.params.requestId,
    req.body.rejection_note,
  );
  await audit(req, 'teacher.removal.reject', 'teacher_removal_approval', Number(req.params.requestId));
  return sendSuccess(res, result, result.message);
}

// GET /api/teachers/removal-requests
async function getRemovalRequests(req, res) {
  const filters = {
    teacherId:   req.query.teacherId   ?? undefined,
    teacherType: req.query.teacherType ?? undefined,
    status:      req.query.status      ?? undefined,
  };
  const requests = await teachersService.getRemovalRequests(filters);
  return sendSuccess(res, requests);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/teachers/:id/upgrade-category  (admin only — FR-15)
// ─────────────────────────────────────────────────────────────────────────────
async function upgradeCategory(req, res) {
  const teacher = await teachersService.upgradeCategory(req.params.id);
  await audit(req, 'teacher.upgrade_category', 'teacher', teacher.id, { present_category: teacher.present_category });
  return sendSuccess(res, teacher, `Category upgraded to ${teacher.present_category}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/teachers/:id  — redirect to workflow
// ─────────────────────────────────────────────────────────────────────────────
async function remove(req, res) {
  await teachersService.remove(req.params.id, req.user.sub);
  return sendNoContent(res);
}

module.exports = {
  getAll,
  getOne,
  create,
  update,
  uploadProfilePicture,
  upgradeCategory,
  requestRemoval,
  approveRemoval,
  rejectRemoval,
  getRemovalRequests,
  remove,
};
