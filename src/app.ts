import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { logger } from './utils/logger';
import { env } from './config/environment';
import webhooksRouter from './api/routes/webhooks.routes';
import authRouter from './api/routes/auth.routes';
import usersRouter from './api/routes/users.routes';
import transactionsRouter from './api/routes/transactions.routes';
import notificationsRouter from './api/routes/notifications.routes';
import queueRouter from './api/routes/queue.routes';
import { apiLimiter } from './api/middleware/rate-limit.middleware';
import { transactionQueue } from './queues/transaction.queue';

/**
 * Create Express application
 */
export function createApp(): Application {
  const app = express();

  // Security middleware
  app.use(helmet());

  // CORS configuration
  const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) === -1 && env.NODE_ENV === 'production') {
        const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    credentials: true,
  }));

  // Body parsers
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging middleware
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug('Incoming request', {
      method: req.method,
      path: req.path,
      ip: req.ip,
    });
    next();
  });

  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: env.NODE_ENV,
    });
  });

  // BullBoard queue dashboard (development only or behind auth in production)
  const bullBoardAdapter = new ExpressAdapter();
  bullBoardAdapter.setBasePath('/admin/queues');
  createBullBoard({
    queues: [new BullMQAdapter(transactionQueue)],
    serverAdapter: bullBoardAdapter,
  });
  // In production you'd add auth middleware before this route
  app.use('/admin/queues', bullBoardAdapter.getRouter());

  // API routes
  app.use('/api', apiLimiter);
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/transactions', transactionsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/queue', queueRouter);
  app.use('/api/webhooks', webhooksRouter);

  // 404 handler
  app.use((_req: Request, res: Response) => {
    logger.warn('404 Not Found', {
      method: _req.method,
      path: _req.path,
    });
    res.status(404).json({
      error: 'Not Found',
      message: `Route ${_req.method} ${_req.path} not found`,
    });
  });

  // Global error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error', {
      error: err.message,
      stack: err.stack,
      path: _req.path,
      method: _req.method,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
    });
  });

  return app;
}
