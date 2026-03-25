import { env } from './config/environment';
import { logger } from './utils/logger';
import { testDatabaseConnection } from './config/database';
import { testRedisConnection } from './config/redis';
import { testGmailConnection } from './config/gmail';
import { testWhatsAppConnection } from './config/whatsapp';
import { runMigrations } from './database/migrate';
import { createApp } from './app';
import { createTransactionWorker, closeWorker } from './queues/workers/transaction.worker';
import { closeQueue } from './queues/transaction.queue';
import { startScheduler, stopScheduler } from './scheduler';

let worker: ReturnType<typeof createTransactionWorker> | null = null;

async function startServer() {
  try {
    logger.info('🚀 Starting SINPE Notifier...');
    logger.info(`Environment: ${env.NODE_ENV}`);
    logger.info(`Port: ${env.PORT}`);

    // Test database connection (non-blocking in development)
    const dbConnected = await testDatabaseConnection();
    if (!dbConnected) {
      logger.warn('⚠️  Database not connected - some features will be unavailable');
      if (env.NODE_ENV === 'production') {
        throw new Error('Failed to connect to database');
      }
    }

    // Run database migrations (only if connected)
    if (dbConnected) {
      try {
        await runMigrations();
      } catch (migrationError: any) {
        logger.warn('⚠️  Migrations could not run automatically. See instructions above.');
        if (env.NODE_ENV === 'production') {
          throw migrationError;
        }
      }
    }

    // Test Redis connection (non-blocking in development)
    const redisConnected = await testRedisConnection();
    if (!redisConnected) {
      logger.warn('⚠️  Redis not connected - queue features will be unavailable');
      if (env.NODE_ENV === 'production') {
        throw new Error('Failed to connect to Redis');
      }
    }

    // Test Gmail API connection (non-blocking in development)
    const gmailConnected = await testGmailConnection();
    if (!gmailConnected) {
      logger.warn('⚠️  Gmail API not connected - email monitoring will be unavailable');
      if (env.NODE_ENV === 'production') {
        throw new Error('Failed to connect to Gmail API');
      }
    }

    // Test WhatsApp API connection (non-blocking in development)
    const whatsappConnected = await testWhatsAppConnection();
    if (!whatsappConnected) {
      logger.warn('⚠️  WhatsApp API not connected - notifications will be unavailable');
      if (env.NODE_ENV === 'production') {
        throw new Error('Failed to connect to WhatsApp API');
      }
    }

    // Check if all services are connected
    const allServicesConnected = dbConnected && redisConnected && gmailConnected && whatsappConnected;

    if (allServicesConnected) {
      logger.info('✅ All services connected successfully');
    } else {
      logger.warn('⚠️  Running in degraded mode - not all services are available');
      logger.info('Connection status:', {
        database: dbConnected ? '✅' : '❌',
        redis: redisConnected ? '✅' : '❌',
        gmail: gmailConnected ? '✅' : '❌',
        whatsapp: whatsappConnected ? '✅' : '❌',
      });
    }

    // Create and start Express server
    const app = createApp();
    const server = app.listen(env.PORT, () => {
      logger.info(`🎯 Server listening on http://localhost:${env.PORT}`);
      logger.info(`📋 Health check: http://localhost:${env.PORT}/health`);
      logger.info(`🔗 Webhook endpoint: http://localhost:${env.PORT}/api/webhooks/whatsapp`);
      logger.info(`📊 Queue dashboard: http://localhost:${env.PORT}/admin/queues`);
    });

    // Store server for graceful shutdown
    (global as any).httpServer = server;

    // Start BullMQ worker (only if Redis is available)
    if (redisConnected) {
      worker = createTransactionWorker();
      logger.info('✅ Transaction worker started');
    } else {
      logger.warn('⚠️  Transaction worker NOT started (Redis unavailable)');
    }

    // Start email polling scheduler (only if Gmail is available)
    if (gmailConnected) {
      startScheduler();
      logger.info('✅ Email poll scheduler started');
    } else {
      logger.warn('⚠️  Email poll scheduler NOT started (Gmail unavailable)');
    }

    logger.info('✨ Server is ready!');
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
async function gracefulShutdown(signal: string) {
  logger.info(`${signal} signal received: closing server gracefully`);

  // Stop accepting new emails
  stopScheduler();

  // Close HTTP server
  const server = (global as any).httpServer;
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
    });
  }

  // Drain worker and close queue
  try {
    if (worker) {
      await closeWorker(worker);
    }
    await closeQueue();
  } catch (err) {
    logger.error('Error during queue/worker shutdown', { error: err });
  }

  logger.info('✅ Graceful shutdown completed');

  // Force exit after 30 seconds
  const forceExit = setTimeout(() => {
    logger.error('⚠️  Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
  forceExit.unref();

  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start the server
startServer();
