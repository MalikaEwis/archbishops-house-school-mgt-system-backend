'use strict';

const teachersService = require('./teachers.service');
const { sendSuccess, sendCreated, sendNoContent } = require('../../shared/utils/response');

async function getAll(req, res) {
  const filters = {
    schoolId: req.query.schoolId,
    tin: req.query.tin,
    name: req.query.name,
    category: req.query.category,
  };
  const teachers = await teachersService.findAll(filters);
  return sendSuccess(res, teachers);
}

async function getOne(req, res) {
  const teacher = await teachersService.findById(req.params.id);
  return sendSuccess(res, teacher);
}

async function create(req, res) {
  const teacher = await teachersService.create(req.body);
  return sendCreated(res, teacher, 'Teacher created successfully');
}

async function update(req, res) {
  const teacher = await teachersService.update(req.params.id, req.body);
  return sendSuccess(res, teacher, 'Teacher updated successfully');
}

async function remove(req, res) {
  await teachersService.remove(req.params.id, req.body.approvedBy);
  return sendNoContent(res);
}

module.exports = { getAll, getOne, create, update, remove };
