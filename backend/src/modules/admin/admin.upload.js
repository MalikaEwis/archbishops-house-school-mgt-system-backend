'use strict';

const multer = require('multer');
const path   = require('path');

const storage = multer.memoryStorage();

function xlsxFileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') {
    cb(null, true);
  } else {
    cb(new Error('Only .xlsx or .xls files are accepted'), false);
  }
}

const uploadXlsx = multer({
  storage,
  fileFilter: xlsxFileFilter,
  limits: { fileSize: 50 * 1024 * 1024 },
}).single('file');

module.exports = { uploadXlsx };
