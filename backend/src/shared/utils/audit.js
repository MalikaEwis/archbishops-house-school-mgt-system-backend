'use strict';

/**
 * audit.js
 * ─────────
 * Lightweight audit logger — inserts a row into audit_logs for every
 * admin write action.  Fire-and-forget: failures are logged to Winston
 * but never thrown, so an audit error never breaks the actual operation.
 *
 * Usage:
 *   const audit = require('../../shared/utils/audit');
 *   await audit(req, 'teacher.create', 'teacher', teacher.id, { tin: teacher.tin });
 *
 * @param {object}      req         Express request (provides user + IP)
 * @param {string}      action      Dot-namespaced action key  e.g. 'teacher.remove.approve'
 * @param {string|null} entityType  Table / domain name        e.g. 'teacher'
 * @param {number|null} entityId    PK of the affected row
 * @param {object|null} detail      Extra context (must be JSON-serialisable; never include passwords)
 */
async function audit(req, action, entityType = null, entityId = null, detail = null) {
  try {
    const { getPool } = require('../../config/database');
    const pool = getPool();

    const userId   = req.user?.sub      ?? null;
    const username = req.user?.username ?? null;
    const ip       = req.ip ?? req.headers['x-forwarded-for'] ?? null;

    await pool.execute(
      `INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, detail, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        username,
        action,
        entityType,
        entityId   ?? null,
        detail     ? JSON.stringify(detail) : null,
        ip         ? String(ip).slice(0, 45) : null,
      ],
    );
  } catch (err) {
    // Never let an audit failure surface to the caller
    const logger = require('./logger');
    logger.warn(`Audit log failed [${action}]: ${err.message}`);
  }
}

module.exports = audit;
