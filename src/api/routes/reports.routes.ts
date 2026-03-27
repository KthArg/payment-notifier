import express, { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { MonthlyRecordRepository } from '../../database/repositories/monthly-record.repository';

const router = express.Router();
const monthlyRepo = new MonthlyRecordRepository();

router.use(requireAuth);

// GET /api/reports/monthly/:year/:month
router.get('/monthly/:year/:month', async (req: Request<{ year: string; month: string }>, res: Response) => {
  const year = parseInt(req.params.year);
  const month = parseInt(req.params.month);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    res.status(400).json({ error: 'Bad Request', message: 'Año y mes inválidos' });
    return;
  }

  const [records, stats] = await Promise.all([
    monthlyRepo.findByPeriod(month, year),
    monthlyRepo.getStats(month, year),
  ]);

  res.json({ data: { stats, records } });
});

// GET /api/reports/monthly — current month
router.get('/monthly', async (_req: Request, res: Response) => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const [records, stats] = await Promise.all([
    monthlyRepo.findByPeriod(month, year),
    monthlyRepo.getStats(month, year),
  ]);

  res.json({ data: { stats, records } });
});

export default router;
