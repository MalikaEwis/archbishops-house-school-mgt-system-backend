'use strict';

const vestedService = require('./vested.service');
const { sendSuccess, sendCreated, sendNoContent } = require('../../shared/utils/response');

// ─── Schools ─────────────────────────────────────────────────────────────────

// GET /api/vested/schools?zone=&district=&region=&province=&principalReligion=
async function getAllSchools(req, res) {
  const schools = await vestedService.findAllSchools(req.query);
  return sendSuccess(res, schools);
}

// GET /api/vested/schools/:id
async function getSchool(req, res) {
  const school = await vestedService.findSchoolById(req.params.id);
  return sendSuccess(res, school);
}

// POST /api/vested/schools
async function createSchool(req, res) {
  const school = await vestedService.createSchool(req.body);
  return sendCreated(res, school, 'Vested school created successfully');
}

// PATCH /api/vested/schools/:id
async function updateSchool(req, res) {
  const school = await vestedService.updateSchool(req.params.id, req.body);
  return sendSuccess(res, school, 'Vested school updated successfully');
}

// DELETE /api/vested/schools/:id
async function deleteSchool(req, res) {
  await vestedService.deleteSchool(req.params.id);
  return sendNoContent(res);
}

// POST /api/vested/schools/import  (CSV — not yet implemented)
async function importCsv(req, res) {
  await vestedService.importCsv(req.file);
  return sendSuccess(res, null, 'CSV imported successfully');
}

// ─── Principals ──────────────────────────────────────────────────────────────

// GET /api/vested/schools/:id/principals
async function getPrincipalHistory(req, res) {
  const history = await vestedService.getPrincipalHistory(req.params.id);
  return sendSuccess(res, history);
}

// POST /api/vested/schools/:id/principals
async function addPrincipal(req, res) {
  const principal = await vestedService.addPrincipal(req.params.id, req.body);
  return sendCreated(res, principal, 'Principal added successfully');
}

// PATCH /api/vested/schools/:id/principals/:pid
async function updatePrincipal(req, res) {
  const principal = await vestedService.updatePrincipal(
    req.params.id,
    req.params.pid,
    req.body,
  );
  return sendSuccess(res, principal, 'Principal updated successfully');
}

// POST /api/vested/schools/:id/principals/:pid/archive
async function archivePrincipal(req, res) {
  const principal = await vestedService.archivePrincipal(
    req.params.id,
    req.params.pid,
    req.body,
  );
  return sendSuccess(res, principal, 'Principal archived successfully');
}

// ─── Student Stats ────────────────────────────────────────────────────────────

// GET /api/vested/schools/:id/stats
async function getStats(req, res) {
  const stats = await vestedService.getStats(req.params.id);
  return sendSuccess(res, stats);
}

// POST /api/vested/schools/:id/stats  (body must include stat_year)
async function upsertStats(req, res) {
  const { stat_year, ...data } = req.body;
  if (!stat_year) {
    const AppError = require('../../shared/utils/AppError');
    throw new AppError('"stat_year" is required in the request body.', 400);
  }
  const stats = await vestedService.upsertStats(req.params.id, stat_year, data);
  return sendSuccess(res, stats, `Stats for ${stat_year} saved successfully`);
}

// PATCH /api/vested/schools/:id/stats/:year
async function updateStats(req, res) {
  const stats = await vestedService.upsertStats(
    req.params.id,
    req.params.year,
    req.body,
  );
  return sendSuccess(res, stats, `Stats for ${req.params.year} updated successfully`);
}

// DELETE /api/vested/schools/:id/stats/:year
async function deleteStats(req, res) {
  await vestedService.deleteStats(req.params.id, req.params.year);
  return sendNoContent(res);
}

module.exports = {
  // Schools
  getAllSchools,
  getSchool,
  createSchool,
  updateSchool,
  deleteSchool,
  importCsv,
  // Principals
  getPrincipalHistory,
  addPrincipal,
  updatePrincipal,
  archivePrincipal,
  // Stats
  getStats,
  upsertStats,
  updateStats,
  deleteStats,
};
