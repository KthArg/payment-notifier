import { Router, Response } from 'express';
import { TransactionRepository } from '../../database/repositories/transaction.repository';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware';
import { logger } from '../../utils/logger';

const router = Router();
const transactionRepo = new TransactionRepository();

router.use(requireAuth);

/**
 * GET /api/transactions/pending
 * List all pending transactions
 */
router.get('/pending', async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const transactions = await transactionRepo.findPending();
    res.status(200).json({ data: transactions, count: transactions.length });
  } catch (err: any) {
    logger.error('GET /api/transactions/pending failed', { error: err.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /api/transactions/stats
 * Count transactions in a date range
 * Query params: from, to (ISO date strings)
 */
router.get('/stats', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const from = req.query.from ? new Date(req.query.from as string) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const to = req.query.to ? new Date(req.query.to as string) : new Date();

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    res.status(400).json({ error: 'Bad Request', message: 'Invalid date format for from/to' });
    return;
  }

  try {
    const count = await transactionRepo.countByDateRange(from, to);
    res.status(200).json({ data: { count, from, to } });
  } catch (err: any) {
    logger.error('GET /api/transactions/stats failed', { error: err.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /api/transactions/user/:userId
 * List transactions for a specific user
 */
router.get('/user/:userId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const transactions = await transactionRepo.findByUserId(req.params['userId'] as string);
    res.status(200).json({ data: transactions, count: transactions.length });
  } catch (err: any) {
    logger.error('GET /api/transactions/user/:userId failed', { error: err.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
