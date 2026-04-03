'use strict';

const app            = require('./src/app');
const config         = require('./src/config/env');
const { connectDB }  = require('./src/config/database');
const logger         = require('./src/shared/utils/logger');

const PORT = config.port;

async function startServer() {
  try {
    await connectDB();

    const server = app.listen(PORT, () => {
      logger.info(`Server running in ${config.env} mode on port ${PORT}`);
    });

    // ─── Graceful shutdown ──────────────────────────────────────────────────
    const shutdown = (signal) => {
      logger.info(`${signal} received. Shutting down gracefully…`);
      server.close(() => {
        logger.info('HTTP server closed.');
        process.exit(0);
      });

      // Force exit if shutdown hangs beyond 10 s
      setTimeout(() => process.exit(1), 10_000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

    // ─── Unhandled rejections / exceptions ─────────────────────────────────
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Rejection:', reason);
      shutdown('unhandledRejection');
    });

    process.on('uncaughtException', (err) => {
      logger.error('Uncaught Exception:', err);
      shutdown('uncaughtException');
    });

  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
