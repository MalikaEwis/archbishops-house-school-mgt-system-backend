'use strict';

/**
 * documents.repository.js
 * ────────────────────────
 * Raw SQL for the documents table.
 * No business logic here — only DB I/O.
 */

const { getPool } = require('../../config/database');

// ─── Base SELECT ──────────────────────────────────────────────────────────────

const BASE_SELECT = `
  SELECT
    d.id,
    d.owner_type,
    d.owner_id,
    d.doc_category,
    d.form_code,
    d.original_name,
    d.stored_path,
    d.mime_type,
    d.file_size_bytes,
    d.admin_only,
    d.uploaded_by,
    u.full_name   AS uploaded_by_name,
    d.created_at,
    d.updated_at
  FROM documents d
  JOIN users u ON u.id = d.uploaded_by
`;

// ─── findAll ─────────────────────────────────────────────────────────────────

/**
 * Returns documents matching the given filters.
 *
 * @param {{
 *   ownerType?:   string,
 *   ownerId?:     number,
 *   docCategory?: string,
 *   formCode?:    string,
 *   adminOnly?:   boolean,   when false → exclude admin-only rows
 * }} filters
 * @returns {Promise<object[]>}
 */
async function findAll(filters = {}) {
  const pool   = getPool();
  const where  = [];
  const params = [];

  if (filters.ownerType) {
    where.push('d.owner_type = ?');
    params.push(filters.ownerType);
  }
  if (filters.ownerId) {
    where.push('d.owner_id = ?');
    params.push(filters.ownerId);
  }
  if (filters.docCategory) {
    where.push('d.doc_category = ?');
    params.push(filters.docCategory);
  }
  if (filters.formCode) {
    where.push('d.form_code = ?');
    params.push(filters.formCode);
  }
  // When caller specifies adminOnly = false, exclude restricted rows
  if (filters.adminOnly === false) {
    where.push('d.admin_only = 0');
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `${BASE_SELECT} ${whereClause} ORDER BY d.doc_category ASC, d.form_code ASC, d.created_at DESC`;

  const [rows] = await pool.execute(sql, params);
  return rows;
}

// ─── findById ────────────────────────────────────────────────────────────────

/**
 * Returns a single document row by primary key.
 *
 * @param {number} id
 * @returns {Promise<object|undefined>}
 */
async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `${BASE_SELECT} WHERE d.id = ? LIMIT 1`,
    [id],
  );
  return rows[0];
}

// ─── insert ──────────────────────────────────────────────────────────────────

/**
 * Inserts a new document row.
 *
 * @param {{
 *   owner_type?:     string,
 *   owner_id?:       number,
 *   doc_category:    string,
 *   form_code:       string,
 *   original_name:   string,
 *   stored_path:     string,
 *   mime_type:       string,
 *   file_size_bytes: number,
 *   admin_only:      number,
 *   uploaded_by:     number,
 * }} data
 * @returns {Promise<number>} insertId
 */
async function insert(data) {
  const pool = getPool();
  const [result] = await pool.execute(
    `INSERT INTO documents
       (owner_type, owner_id, doc_category, form_code,
        original_name, stored_path, mime_type, file_size_bytes,
        admin_only, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.owner_type     ?? null,
      data.owner_id       ?? null,
      data.doc_category,
      data.form_code,
      data.original_name,
      data.stored_path,
      data.mime_type      || 'application/pdf',
      data.file_size_bytes ?? null,
      data.admin_only ? 1 : 0,
      data.uploaded_by,
    ],
  );
  return result.insertId;
}

// ─── updateFile ──────────────────────────────────────────────────────────────

/**
 * Updates the file fields of an existing document (replace / versioning).
 * Returns the previous stored_path so the caller can delete the old file.
 *
 * @param {number} id
 * @param {{ stored_path, original_name, file_size_bytes }} data
 * @returns {Promise<string|undefined>} previous stored_path
 */
async function updateFile(id, data) {
  const pool = getPool();

  // Fetch old path before overwriting
  const [rows] = await pool.execute(
    'SELECT stored_path FROM documents WHERE id = ? LIMIT 1',
    [id],
  );
  const previous = rows[0]?.stored_path;

  await pool.execute(
    `UPDATE documents
     SET stored_path      = ?,
         original_name    = ?,
         file_size_bytes  = ?
     WHERE id = ?`,
    [data.stored_path, data.original_name, data.file_size_bytes ?? null, id],
  );

  return previous;
}

// ─── deleteById ──────────────────────────────────────────────────────────────

/**
 * Deletes a document row and returns the stored_path so the caller
 * can remove the physical file.
 *
 * @param {number} id
 * @returns {Promise<string|undefined>} stored_path of the deleted row
 */
async function deleteById(id) {
  const pool = getPool();

  const [rows] = await pool.execute(
    'SELECT stored_path FROM documents WHERE id = ? LIMIT 1',
    [id],
  );
  const storedPath = rows[0]?.stored_path;

  await pool.execute('DELETE FROM documents WHERE id = ?', [id]);
  return storedPath;
}

module.exports = { findAll, findById, insert, updateFile, deleteById };
