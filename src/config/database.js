'use strict';

const mysql = require('mysql2/promise');
const config = require('./env');
const logger = require('../shared/utils/logger');

let pool;

/**
 * Initialise the MySQL connection pool.
 * Call once at application startup.
 */
async function connectDB() {
  pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.name,
    connectionLimit: config.db.connectionLimit,
    waitForConnections: true,
    queueLimit: 0,
    timezone: '+00:00',
    decimalNumbers: true,
  });

  // Verify connection on startup
  const connection = await pool.getConnection();
  connection.release();
  logger.info(`MySQL connected → ${config.db.host}:${config.db.port}/${config.db.name}`);

  return pool;
}

/**
 * Returns the active pool.
 * Throws if connectDB() has not been called first.
 */
function getPool() {
  if (!pool) {
    throw new Error('Database pool not initialised. Call connectDB() first.');
  }
  return pool;
}

module.exports = { connectDB, getPool };
