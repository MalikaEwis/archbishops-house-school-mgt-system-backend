'use strict';

const service        = require('./international.service');
const { sendSuccess } = require('../../shared/utils/response');

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

module.exports = { getAll, getOne };
