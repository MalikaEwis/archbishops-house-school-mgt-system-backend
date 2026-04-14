'use strict';

const repo                 = require('./rectors.repository');
const { getPool }          = require('../../config/database');
const { AppError }         = require('../../shared/utils/AppError');

// ─── findAll ──────────────────────────────────────────────────────────────────

async function findAll(filters = {}) {
  return repo.findAll({
    schoolId:           filters.schoolId           ?? undefined,
    name:               filters.name               ?? undefined,
    registrationStatus: filters.registrationStatus ?? undefined,
  });
}

// ─── findById ─────────────────────────────────────────────────────────────────

async function findById(id) {
  const rector = await repo.findById(Number(id));
  if (!rector) throw new AppError('Rector not found.', 404);
  return rector;
}

// ─── create ───────────────────────────────────────────────────────────────────

async function create(body) {
  if (!body.rector_no) throw new AppError('rector_no is required.', 400);
  if (!body.full_name)  throw new AppError('full_name is required.', 400);

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const id = await repo.insert(body);

    if (Array.isArray(body.qualifications) && body.qualifications.length) {
      await repo.replaceQualifications(id, body.qualifications, conn);
    }

    await conn.commit();
    return findById(id);
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      throw new AppError(`rector_no ${body.rector_no} already exists.`, 409);
    }
    throw err;
  } finally {
    conn.release();
  }
}

// ─── update ───────────────────────────────────────────────────────────────────

async function update(id, body) {
  const rector = await repo.findById(Number(id));
  if (!rector) throw new AppError('Rector not found.', 404);

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await repo.update(Number(id), body);

    if (Array.isArray(body.qualifications)) {
      await repo.replaceQualifications(Number(id), body.qualifications, conn);
    }

    await conn.commit();
    return findById(Number(id));
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      throw new AppError(`rector_no ${body.rector_no} already exists.`, 409);
    }
    throw err;
  } finally {
    conn.release();
  }
}

// ─── remove ───────────────────────────────────────────────────────────────────

async function remove(id) {
  const rector = await repo.findById(Number(id));
  if (!rector) throw new AppError('Rector not found.', 404);
  await repo.remove(Number(id));
}

module.exports = { findAll, findById, create, update, remove };
