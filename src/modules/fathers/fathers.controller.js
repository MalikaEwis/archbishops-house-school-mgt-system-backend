'use strict';

const service                              = require('./fathers.service');
const { sendSuccess, sendCreated, sendNoContent } = require('../../shared/utils/response');
const audit                                = require('../../shared/utils/audit');

// GET /api/fathers?schoolId=&name=
async function getAll(req, res) {
  const fathers = await service.findAll({
    schoolId: req.query.schoolId ?? undefined,
    name:     req.query.name     ?? undefined,
  });
  return sendSuccess(res, fathers);
}

// GET /api/fathers/:id
async function getOne(req, res) {
  const father = await service.findById(req.params.id);
  return sendSuccess(res, father);
}

// POST /api/fathers  (admin_vested only)
async function create(req, res) {
  const father = await service.create(req.body);
  await audit(req, 'father.create', 'father', father.id, { father_no: father.father_no });
  return sendCreated(res, father, 'Father created successfully');
}

// PATCH /api/fathers/:id  (admin_vested only)
async function update(req, res) {
  const father = await service.update(req.params.id, req.body);
  await audit(req, 'father.update', 'father', father.id, { fields: Object.keys(req.body) });
  return sendSuccess(res, father, 'Father updated successfully');
}

// DELETE /api/fathers/:id  (admin_vested only)
async function remove(req, res) {
  await service.remove(req.params.id);
  await audit(req, 'father.delete', 'father', Number(req.params.id));
  return sendNoContent(res);
}

module.exports = { getAll, getOne, create, update, remove };
