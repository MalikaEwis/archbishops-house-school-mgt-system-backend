'use strict';

const multer = require('multer');
const path   = require('path');
const crypto = require('crypto');
const config = require('../../config/env');
const AppError = require('../../shared/utils/AppError');

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES    = config.upload.maxFileSizeMB * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(config.upload.dir, 'profile-pictures'));
  },
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = crypto.randomBytes(16).toString('hex');
    cb(null, `${name}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  if (ALLOWED_MIME.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Only JPEG, PNG and WebP images are allowed.', 400));
  }
}

const uploadProfilePicture = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_BYTES },
}).single('profile_picture');

/**
 * Wraps multer in a promise so errors propagate to asyncHandler / errorHandler.
 */
function handleProfilePictureUpload(req, res) {
  return new Promise((resolve, reject) => {
    uploadProfilePicture(req, res, (err) => {
      if (!err) return resolve();
      if (err.code === 'LIMIT_FILE_SIZE') {
        return reject(new AppError(`File exceeds ${config.upload.maxFileSizeMB} MB limit.`, 400));
      }
      return reject(err);
    });
  });
}

module.exports = { handleProfilePictureUpload };
