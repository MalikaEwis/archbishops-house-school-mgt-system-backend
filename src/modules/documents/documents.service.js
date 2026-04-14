'use strict';

/**
 * documents.service.js
 * ─────────────────────
 * Business logic for the document management system.
 *
 * Access rules:
 *   - All authenticated roles  → list and download non-admin documents
 *   - admin_* roles only       → list and download admin_only documents
 *   - admin_* roles only       → upload, replace, delete
 *
 * File lifecycle:
 *   Upload  → multer writes file to disk, service inserts DB row
 *   Replace → multer writes new file, service updates DB row,
 *             old physical file is deleted
 *   Delete  → DB row removed, physical file deleted
 */

const fs   = require('fs');
const path = require('path');

const repo       = require('./documents.repository');
const AppError   = require('../../shared/utils/AppError');
const config     = require('../../config/env');
const { VALID_CATEGORIES, VALID_OWNER_TYPES } = require('./documents.upload');
const { ROLE_GROUPS } = require('../../shared/constants/roles');

// Form codes that are always restricted to administrators, regardless of the
// admin_only flag sent by the caller.  ACIS_03 and ACIS_11 contain sensitive
// personnel information and must never be visible to principal / head_of_hr.
const ALWAYS_ADMIN_ONLY_FORMS = new Set(['ACIS_03', 'ACIS_11']);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAdmin(user) {
  return ROLE_GROUPS.ALL_ADMINS.includes(user.role);
}

/**
 * Resolves the absolute path for a relative stored_path.
 * stored_path is relative to config.upload.dir,
 * e.g. "documents/abc123.pdf" → "<upload_dir>/documents/abc123.pdf"
 */
function absolutePath(storedPath) {
  return path.resolve(config.upload.dir, storedPath);
}

/**
 * Deletes a physical file from disk.
 * Logs but does NOT throw if the file is missing — a missing file
 * should not prevent the DB operation from completing.
 *
 * @param {string} storedPath  - relative path stored in DB
 */
function deleteFile(storedPath) {
  if (!storedPath) return;
  const abs = absolutePath(storedPath);
  try {
    fs.unlinkSync(abs);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // Log unexpected errors but do not surface them to the caller
      const logger = require('../../shared/utils/logger');
      logger.warn(`Could not delete document file "${abs}": ${err.message}`);
    }
  }
}

// ─── findAll ─────────────────────────────────────────────────────────────────

/**
 * Lists documents based on query filters and the caller's role.
 *
 * Non-admin callers never see admin_only documents.
 *
 * Query params supported:
 *   ownerType, ownerId, docCategory, formCode
 *
 * @param {object} query  - parsed req.query
 * @param {object} user   - decoded JWT (req.user)
 * @returns {Promise<object[]>}
 */
async function findAll(query, user) {
  const filters = {
    ownerType:   query.ownerType   || null,
    ownerId:     query.ownerId     ? Number(query.ownerId) : null,
    docCategory: query.docCategory || null,
    formCode:    query.formCode    || null,
    // Non-admins may only see public documents
    adminOnly:   isAdmin(user) ? undefined : false,
  };

  return repo.findAll(filters);
}

// ─── getFile ─────────────────────────────────────────────────────────────────

/**
 * Resolves a document for download.
 * Throws 403 if the document is admin-only and the caller is not an admin.
 * Throws 404 if the DB row or physical file is missing.
 *
 * @param {number|string} id
 * @param {object}        user - decoded JWT (req.user)
 * @returns {Promise<{ absPath: string, originalName: string }>}
 */
async function getFile(id, user) {
  const doc = await repo.findById(Number(id));

  if (!doc) {
    throw new AppError('Document not found.', 404);
  }

  if (doc.admin_only && !isAdmin(user)) {
    throw new AppError('This document is restricted to administrators.', 403);
  }

  const abs = absolutePath(doc.stored_path);
  if (!fs.existsSync(abs)) {
    throw new AppError('Document file not found on server. Contact an administrator.', 404);
  }

  return { absPath: abs, originalName: doc.original_name };
}

// ─── upload ──────────────────────────────────────────────────────────────────

/**
 * Stores a new document record after multer has written the file to disk.
 *
 * Required body fields:
 *   doc_category, form_code
 * Optional body fields:
 *   owner_type, owner_id, admin_only (0|1)
 *
 * @param {object} body - req.body (after multer parses the multipart form)
 * @param {object} file - req.file (multer file descriptor)
 * @param {object} user - decoded JWT (req.user)
 * @returns {Promise<object>} created document row
 */
async function upload(body, file, user) {
  if (!file) {
    throw new AppError('No file uploaded. Send a PDF as the "document" field.', 400);
  }

  // ── Validate required fields ────────────────────────────────────────────────
  if (!body.doc_category) {
    throw new AppError('"doc_category" is required.', 400);
  }
  if (!VALID_CATEGORIES.includes(body.doc_category)) {
    throw new AppError(
      `Invalid doc_category. Must be one of: ${VALID_CATEGORIES.join(', ')}.`,
      400,
    );
  }
  if (!body.form_code) {
    throw new AppError('"form_code" is required (e.g. ACPS_01, ACIS_03).', 400);
  }

  // ── Validate optional owner fields ─────────────────────────────────────────
  if (body.owner_type && !VALID_OWNER_TYPES.includes(body.owner_type)) {
    throw new AppError(
      `Invalid owner_type. Must be one of: ${VALID_OWNER_TYPES.join(', ')}.`,
      400,
    );
  }
  if (body.owner_type && !body.owner_id) {
    throw new AppError('"owner_id" is required when "owner_type" is provided.', 400);
  }

  // stored_path is relative to config.upload.dir
  const storedPath = path.join('documents', file.filename).replace(/\\/g, '/');

  // ACIS_03 and ACIS_11 are always admin-only; override whatever the caller sent.
  const adminOnly = ALWAYS_ADMIN_ONLY_FORMS.has(body.form_code)
    ? 1
    : (body.admin_only === '1' || body.admin_only === true ? 1 : 0);

  const insertId = await repo.insert({
    owner_type:      body.owner_type   || null,
    owner_id:        body.owner_id     ? Number(body.owner_id) : null,
    doc_category:    body.doc_category,
    form_code:       body.form_code,
    original_name:   file.originalname,
    stored_path:     storedPath,
    mime_type:       file.mimetype,
    file_size_bytes: file.size,
    admin_only:      adminOnly,
    uploaded_by:     user.sub,
  });

  return repo.findById(insertId);
}

// ─── replace ─────────────────────────────────────────────────────────────────

/**
 * Replaces the physical file for an existing document record.
 * The old file is deleted from disk after the DB row is updated.
 * The document ID, category, form_code, and admin_only flag are unchanged.
 *
 * @param {number|string} id
 * @param {object}        file - req.file from multer
 * @returns {Promise<object>} updated document row
 */
async function replace(id, file) {
  if (!file) {
    throw new AppError('No file uploaded. Send a PDF as the "document" field.', 400);
  }

  const doc = await repo.findById(Number(id));
  if (!doc) {
    // Clean up the uploaded file before throwing
    deleteFile(path.join('documents', file.filename).replace(/\\/g, '/'));
    throw new AppError('Document not found.', 404);
  }

  const newStoredPath = path.join('documents', file.filename).replace(/\\/g, '/');

  const previousStoredPath = await repo.updateFile(Number(id), {
    stored_path:     newStoredPath,
    original_name:   file.originalname,
    file_size_bytes: file.size,
  });

  // Delete old file — do this after the DB update succeeds
  deleteFile(previousStoredPath);

  return repo.findById(Number(id));
}

// ─── remove ──────────────────────────────────────────────────────────────────

/**
 * Deletes the document DB row and its physical file.
 *
 * @param {number|string} id
 * @returns {Promise<void>}
 */
async function remove(id) {
  const doc = await repo.findById(Number(id));
  if (!doc) {
    throw new AppError('Document not found.', 404);
  }

  const storedPath = await repo.deleteById(Number(id));
  deleteFile(storedPath);
}

module.exports = { findAll, getFile, upload, replace, remove };
