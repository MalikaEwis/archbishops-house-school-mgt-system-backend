'use strict';

const service                        = require('./international.service');
const { handleProfilePictureUpload } = require('./international.upload');
const { sendSuccess, sendCreated } = require('../../shared/utils/response');
const path                           = require('path');

async function getAll(req, res) {
  const filters = {
    schoolId: req.schoolFilter?.school_id,
    tin:      req.query.tin      || undefined,
    name:     req.query.name     || undefined,
    category: req.query.category || undefined,
    isActive: req.query.isActive || undefined,
  };

  const pagination = { page: req.query.page, limit: req.query.limit };
  const { items, total, page, limit } = await service.findAll(filters, pagination);
  const totalPages = Math.ceil(total / limit);

  sendSuccess(res, { items, pagination: { total, page, limit, totalPages } });
}

async function getOne(req, res) {
  const teacher = await service.findById(req.params.id, req.schoolFilter);
  sendSuccess(res, teacher);
}

async function create(req, res) {
  const teacher = await service.create(req.body);
  sendCreated(res, teacher);
}

async function update(req, res) {
  const teacher = await service.update(req.params.id, req.body);
  sendSuccess(res, teacher);
}

async function uploadProfilePicture(req, res) {
  await handleProfilePictureUpload(req, res);
  if (!req.file) {
    const AppError = require('../../shared/utils/AppError');
    throw new AppError('No file uploaded.', 400);
  }
  const relativePath = path.join('profile-pictures', req.file.filename).replace(/\\/g, '/');
  const teacher = await service.updateProfilePicture(req.params.id, relativePath);
  return sendSuccess(res, teacher, 'Profile picture updated');
}

async function removeProfilePicture(req, res) {
  const teacher = await service.removeProfilePicture(req.params.id);
  return sendSuccess(res, teacher, 'Profile picture removed');
}

module.exports = { getAll, getOne, create, update, uploadProfilePicture, removeProfilePicture };
