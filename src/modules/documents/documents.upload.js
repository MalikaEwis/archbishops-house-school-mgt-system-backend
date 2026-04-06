'use strict';

const multer   = require('multer');
const path     = require('path');
const crypto   = require('crypto');
const fs       = require('fs');
const config   = require('../../config/env');
const AppError = require('../../shared/utils/AppError');

const ALLOWED_MIME = ['application/pdf'];
const MAX_BYTES    = config.upload.maxFileSizeMB * 1024 * 1024;

const VALID_CATEGORIES = Object.freeze([
  'Teachers', 'Religious', 'Students', 'Principals', 'Non_academic',
]);

const VALID_OWNER_TYPES = Object.freeze([
  'Private', 'International', 'Father', 'Rector', 'Principal', 'Student', 'General',
]);

// All documents land in uploads/documents/ — category stored in DB, not path.
// This keeps the multer destination simple (no DB lookup needed at upload time).
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(config.upload.dir, 'documents');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, _file, cb) => {
    cb(null, `${crypto.randomBytes(16).toString('hex')}.pdf`);
  },
});

function fileFilter(_req, file, cb) {
  if (ALLOWED_MIME.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Only PDF files are allowed.', 400));
  }
}

const uploadDoc = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_BYTES },
}).single('document');

/**
 * Wraps multer in a promise so errors reach the central error handler.
 * Call this at the top of any controller that handles file uploads.
 */
function handleDocumentUpload(req, res) {
  return new Promise((resolve, reject) => {
    uploadDoc(req, res, (err) => {
      if (!err) return resolve();
      if (err.code === 'LIMIT_FILE_SIZE') {
        return reject(new AppError(`File exceeds ${config.upload.maxFileSizeMB} MB limit.`, 400));
      }
      return reject(err);
    });
  });
}

module.exports = { handleDocumentUpload, VALID_CATEGORIES, VALID_OWNER_TYPES };
