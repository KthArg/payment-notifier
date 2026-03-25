import { Router, Response } from 'express';
import { NotificationLogRepository } from '../../database/repositories/notification-log.repository';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware';
import { logger } from '../../utils/logger';
import { db } from '../../config/database';

const router = Router();
const notificationLogRepo = new NotificationLogRepository();

router.use(requireAuth);

/**
 * GET /api/notifications/retryable
 * List failed notifications that can still be retried
 */
router.get('/retryable', async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const logs = await notificationLogRepo.findRetryable();
    res.status(200).json({ data: logs, count: logs.length });
  } catch (err: any) {
    logger.error('GET /api/notifications/retryable failed', { error: err.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /api/notifications/transaction/:transactionId
 * List all notification logs for a transaction
 */
router.get('/transaction/:transactionId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const logs = await notificationLogRepo.findByTransactionId(req.params['transactionId'] as string);
    res.status(200).json({ data: logs, count: logs.length });
  } catch (err: any) {
    logger.error('GET /api/notifications/transaction/:id failed', { error: err.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * PATCH /api/notifications/:id/status
 * Manually update delivery status of a notification log
 */
router.patch('/:id/status', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { status } = req.body;
  const validStatuses = ['pending', 'sent', 'delivered', 'read', 'failed'];

  if (!status || !validStatuses.includes(status)) {
    res.status(400).json({ error: 'Bad Request', message: `status must be one of: ${validStatuses.join(', ')}` });
    return;
  }

  try {
    const id = req.params['id'] as string;
    const result = await db.result(
      `UPDATE notification_logs SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, id]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Not Found', message: 'Notification log not found' });
      return;
    }
    res.status(200).json({ message: 'Status updated' });
  } catch (err: any) {
    logger.error('PATCH /api/notifications/:id/status failed', { error: err.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
