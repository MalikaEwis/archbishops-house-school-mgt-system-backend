'use strict';

const service                              = require('./rectors.service');
const { sendSuccess, sendCreated, sendNoContent } = require('../../shared/utils/response');
const audit                                = require('../../shared/utils/audit');

// GET /api/rectors?schoolId=&name=&registrationStatus=
async function getAll(req, res) {
  const rectors = await service.findAll({
    schoolId:           req.query.schoolId           ?? undefined,
    name:               req.query.name               ?? undefined,
    registrationStatus: req.query.registrationStatus ?? undefined,
  });
  return sendSuccess(res, rectors);
}

// GET /api/rectors/:id
async function getOne(req, res) {
  const rector = await service.findById(req.params.id);
  return sendSuccess(res, rector);
}

// POST /api/rectors  (admin_vested only)
async function create(req, res) {
  const rector = await service.create(req.body);
  await audit(req, 'rector.create', 'rector', rector.id, { rector_no: rector.rector_no });
  return sendCreated(res, rector, 'Rector created successfully');
}

// PATCH /api/rectors/:id  (admin_vested only)
async function update(req, res) {
  const rector = await service.update(req.params.id, req.body);
  await audit(req, 'rector.update', 'rector', rector.id, { fields: Object.keys(req.body) });
  return sendSuccess(res, rector, 'Rector updated successfully');
}

// DELETE /api/rectors/:id  (admin_vested only)
async function remove(req, res) {
  await service.remove(req.params.id);
  await audit(req, 'rector.delete', 'rector', Number(req.params.id));
  return sendNoContent(res);
}

module.exports = { getAll, getOne, create, update, remove };
