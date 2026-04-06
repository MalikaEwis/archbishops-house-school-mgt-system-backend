'use strict';

const documentsService               = require('./documents.service');
const { handleDocumentUpload }       = require('./documents.upload');
const { sendSuccess, sendCreated, sendNoContent } = require('../../shared/utils/response');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/documents
// Query params: ownerType, ownerId, docCategory, formCode
// ─────────────────────────────────────────────────────────────────────────────
async function getAll(req, res) {
  const docs = await documentsService.findAll(req.query, req.user);
  return sendSuccess(res, docs);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/documents/:id/download
// ─────────────────────────────────────────────────────────────────────────────
async function download(req, res) {
  const { absPath, originalName } = await documentsService.getFile(
    req.params.id,
    req.user,
  );
  // res.download sets Content-Disposition: attachment and handles streaming
  return res.download(absPath, originalName);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/documents  (admin only — FR-33)
// Expects multipart/form-data with field "document" (PDF) plus body fields:
//   doc_category, form_code, owner_type?, owner_id?, admin_only?
// ─────────────────────────────────────────────────────────────────────────────
async function upload(req, res) {
  // Multer must run before we read req.body or req.file
  await handleDocumentUpload(req, res);

  const doc = await documentsService.upload(req.body, req.file, req.user);
  return sendCreated(res, doc, 'Document uploaded successfully');
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/documents/:id  (admin only)
// Replace the physical file; metadata (category, form_code) is unchanged.
// Expects multipart/form-data with field "document" (PDF).
// ─────────────────────────────────────────────────────────────────────────────
async function replace(req, res) {
  await handleDocumentUpload(req, res);

  const doc = await documentsService.replace(req.params.id, req.file);
  return sendSuccess(res, doc, 'Document replaced successfully');
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/documents/:id  (admin only — FR-33)
// ─────────────────────────────────────────────────────────────────────────────
async function remove(req, res) {
  await documentsService.remove(req.params.id);
  return sendNoContent(res);
}

module.exports = { getAll, download, upload, replace, remove };
