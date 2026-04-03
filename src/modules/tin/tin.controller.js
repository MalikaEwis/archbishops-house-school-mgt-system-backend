'use strict';

const tinService = require('./tin.service');
const { sendSuccess, sendCreated } = require('../../shared/utils/response');

async function generate(req, res) {
  const { category, schoolNumber, schoolType } = req.body;
  const tin = await tinService.generate(category, schoolNumber, schoolType);
  return sendCreated(res, { tin }, 'TIN generated successfully');
}

async function getByTin(req, res) {
  const teacher = await tinService.findByTin(req.params.tin);
  return sendSuccess(res, teacher);
}

module.exports = { generate, getByTin };
