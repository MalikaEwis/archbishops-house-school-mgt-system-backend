'use strict';

const tinService = require('./tin.service');
const { sendSuccess } = require('../../shared/utils/response');

/**
 * GET /api/tin/preview
 * Query params: tableType, category, schoolNumber
 *
 * Returns the TIN that WOULD be generated — non-destructive preview.
 * Useful for the UI to display the upcoming TIN before form submission.
 */
async function preview(req, res) {
  const { tableType, category, schoolNumber } = req.query;

  const result = await tinService.previewNext({
    tableType,
    category:     Number(category),
    schoolNumber: Number(schoolNumber),
  });

  return sendSuccess(res, result);
}

/**
 * GET /api/tin/:tin
 * Path param: tin  e.g. 1/026/013/2524 (URL-encoded as 1%2F026%2F013%2F2524)
 *
 * Looks up a teacher by their exact TIN string across both tables.
 */
async function getByTin(req, res) {
  // Express decodes %2F automatically in the path segment
  const teacher = await tinService.findByTin(req.params.tin);
  return sendSuccess(res, teacher);
}

module.exports = { preview, getByTin };
