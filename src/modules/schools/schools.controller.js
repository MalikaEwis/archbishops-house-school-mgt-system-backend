'use strict';

const schoolsService = require('./schools.service');
const { sendSuccess, sendCreated, sendNoContent } = require('../../shared/utils/response');

async function getAll(req, res) {
  const schools = await schoolsService.findAll(req.query);
  return sendSuccess(res, schools);
}

async function getOne(req, res) {
  const school = await schoolsService.findById(req.params.id);
  return sendSuccess(res, school);
}

async function create(req, res) {
  const school = await schoolsService.create(req.body);
  return sendCreated(res, school, 'School created successfully');
}

async function update(req, res) {
  const school = await schoolsService.update(req.params.id, req.body);
  return sendSuccess(res, school, 'School updated successfully');
}

async function remove(req, res) {
  await schoolsService.remove(req.params.id);
  return sendNoContent(res);
}

module.exports = { getAll, getOne, create, update, remove };
