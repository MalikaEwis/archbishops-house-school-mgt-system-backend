'use strict';

const { resetImportPrivate, resetImportInternational } = require('./admin.service');
const { sendSuccess } = require('../../shared/utils/response');

async function resetImportPrivateCtrl(req, res) {
  if (!req.file) {
    return res.status(400).json({ status: 'error', message: 'No file uploaded' });
  }
  const result = await resetImportPrivate(req.file.buffer);
  sendSuccess(res, result, 'Private school data reset and re-imported successfully');
}

async function resetImportInternationalCtrl(req, res) {
  if (!req.file) {
    return res.status(400).json({ status: 'error', message: 'No file uploaded' });
  }
  const result = await resetImportInternational(req.file.buffer);
  sendSuccess(res, result, 'International school data reset and re-imported successfully');
}

module.exports = { resetImportPrivateCtrl, resetImportInternationalCtrl };
