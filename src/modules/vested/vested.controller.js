'use strict';

const vestedService = require('./vested.service');
const { sendSuccess, sendCreated } = require('../../shared/utils/response');

async function getAllSchools(req, res) {
  const schools = await vestedService.findAllSchools(req.query);
  return sendSuccess(res, schools);
}

async function getSchool(req, res) {
  const school = await vestedService.findSchoolById(req.params.id);
  return sendSuccess(res, school);
}

async function createSchool(req, res) {
  const school = await vestedService.createSchool(req.body);
  return sendCreated(res, school, 'Vested school created successfully');
}

async function updateSchool(req, res) {
  const school = await vestedService.updateSchool(req.params.id, req.body);
  return sendSuccess(res, school, 'Vested school updated successfully');
}

async function importCsv(req, res) {
  const result = await vestedService.importCsv(req.file);
  return sendSuccess(res, result, 'CSV imported successfully');
}

async function getPrincipalHistory(req, res) {
  const history = await vestedService.getPrincipalHistory(req.params.id);
  return sendSuccess(res, history);
}

module.exports = {
  getAllSchools,
  getSchool,
  createSchool,
  updateSchool,
  importCsv,
  getPrincipalHistory,
};
