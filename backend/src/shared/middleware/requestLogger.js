'use strict';

const morgan = require('morgan');
const logger = require('../utils/logger');
const config = require('../../config/env');

// Pipe morgan output into the winston logger stream
const stream = {
  write: (message) => logger.http(message.trim()),
};

// Compact format for production, verbose for development
const format = config.env === 'production' ? 'combined' : 'dev';

const requestLogger = morgan(format, { stream });

module.exports = requestLogger;
