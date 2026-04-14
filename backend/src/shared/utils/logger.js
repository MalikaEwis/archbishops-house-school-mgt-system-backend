'use strict';

const { createLogger, format, transports } = require('winston');
const path = require('path');
const config = require('../../config/env');

const { combine, timestamp, printf, colorize, errors, splat } = format;

const logFormat = printf(({ level, message, timestamp: ts, stack }) => {
  return stack
    ? `${ts} [${level}]: ${message}\n${stack}`
    : `${ts} [${level}]: ${message}`;
});

const logger = createLogger({
  level: config.logging.level,
  format: combine(
    errors({ stack: true }),
    splat(),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat
  ),
  transports: [
    // Console – coloured in development
    new transports.Console({
      format: combine(colorize(), logFormat),
      silent: config.env === 'test',
    }),
    // Persistent error log
    new transports.File({
      filename: path.join('logs', 'error.log'),
      level: 'error',
    }),
    // Combined log for all levels
    new transports.File({
      filename: path.join('logs', 'combined.log'),
    }),
  ],
  exitOnError: false,
});

module.exports = logger;
