'use strict';

const documentsService = require('./documents.service');
const { sendSuccess, sendCreated, sendNoContent } = require('../../shared/utils/response');

async function getAll(req, res) {
  const docs = await documentsService.findAll(req.query);
  return sendSuccess(res, docs);
}

async function download(req, res) {
  const file = await documentsService.getFile(req.params.id, req.user);
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.setHeader('Content-Type', 'application/pdf');
  return file.stream.pipe(res);
}

async function upload(req, res) {
  const doc = await documentsService.upload(req.body, req.file);
  return sendCreated(res, doc, 'Document uploaded successfully');
}

async function replace(req, res) {
  const doc = await documentsService.replace(req.params.id, req.file);
  return sendSuccess(res, doc, 'Document replaced successfully');
}

async function remove(req, res) {
  await documentsService.remove(req.params.id);
  return sendNoContent(res);
}

module.exports = { getAll, download, upload, replace, remove };
