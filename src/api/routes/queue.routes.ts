import { Router, Response } from 'express';
import { getQueueStats, transactionQueue } from '../../queues/transaction.queue';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware';
import { logger } from '../../utils/logger';

const router = Router();

router.use(requireAuth);

/**
 * GET /api/queue/stats
 * Returns current queue counts
 */
router.get('/stats', async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const stats = await getQueueStats();
    res.status(200).json({ data: stats });
  } catch (err: any) {
    logger.error('GET /api/queue/stats failed', { error: err.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * DELETE /api/queue/failed
 * Clears all permanently failed jobs from the queue
 */
router.delete('/failed', async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    await transactionQueue.clean(0, 1000, 'failed');
    logger.info('Admin cleared failed jobs from queue');
    res.status(200).json({ message: 'Failed jobs cleared' });
  } catch (err: any) {
    logger.error('DELETE /api/queue/failed failed', { error: err.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
