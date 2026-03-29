import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { SinpeNameMappingRepository } from '../../database/repositories/sinpe-name-mapping.repository';
import { MonthlyRecordRepository } from '../../database/repositories/monthly-record.repository';
import { MemberRepository } from '../../database/repositories/member.repository';
import { TransactionRepository } from '../../database/repositories/transaction.repository';

const router = Router();
const mappingRepo = new SinpeNameMappingRepository();
const memberRepo = new MemberRepository();
const monthlyRecordRepo = new MonthlyRecordRepository();
const transactionRepo = new TransactionRepository();

// GET /api/sinpe-mappings — all mappings with member name
router.get('/', requireAuth, async (_req: Request, res: Response) => {
  const mappings = await mappingRepo.findAll();
  res.json(mappings);
});

// GET /api/sinpe-mappings/pending — unlinked names needing admin action
router.get('/pending', requireAuth, async (_req: Request, res: Response) => {
  const mappings = await mappingRepo.findPending();
  res.json(mappings);
});

// GET /api/sinpe-mappings/badge — count of pending names
router.get('/badge', requireAuth, async (_req: Request, res: Response) => {
  const count = await mappingRepo.countPending();
  res.json({ pending: count });
});

// POST /api/sinpe-mappings/:id/link — link name to a member
// Body: { memberId: string }
router.post('/:id/link', requireAuth, async (req: Request<{ id: string }>, res: Response) => {
  const { memberId } = req.body;
  if (!memberId) {
    res.status(400).json({ error: 'memberId is required' });
    return;
  }

  const member = await memberRepo.findById(memberId);
  if (!member) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }

  const mapping = await mappingRepo.linkToMember(req.params.id, memberId);
  if (!mapping) {
    res.status(404).json({ error: 'Mapping not found' });
    return;
  }

  // Retroactively process any pending transactions from this sender name
  // that haven't been matched to a monthly record yet
  const pendingTransactions = await transactionRepo.findBySenderName(mapping.senderName);
  for (const tx of pendingTransactions) {
    const now = new Date(tx.transactionDate);
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const record = await monthlyRecordRepo.findOrCreate(member.id, month, year, member.monthlyAmount).catch(() => null);
    if (record && record.status === 'pending') {
      const isPaidOnTime = now.getDate() <= member.dueDay;
      await monthlyRecordRepo.markPaid(record.id, {
        amountPaid: tx.amount,
        transactionId: tx.id,
        status: isPaidOnTime ? 'paid_on_time' : 'paid_late',
        paidAt: now,
      }).catch(() => {});
    }
  }

  res.json(mapping);
});

// POST /api/sinpe-mappings/:id/ambiguous — mark name as ambiguous
router.post('/:id/ambiguous', requireAuth, async (req: Request<{ id: string }>, res: Response) => {
  const ok = await mappingRepo.markAmbiguous(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Mapping not found' });
    return;
  }
  res.json({ success: true });
});

// POST /api/sinpe-mappings/:id/revert — revert ambiguous back to pending
router.post('/:id/revert', requireAuth, async (req: Request<{ id: string }>, res: Response) => {
  const ok = await mappingRepo.revertAmbiguous(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Mapping not found' });
    return;
  }
  res.json({ success: true });
});

// DELETE /api/sinpe-mappings/:id — remove a mapping entirely
router.delete('/:id', requireAuth, async (req: Request<{ id: string }>, res: Response) => {
  const ok = await mappingRepo.delete(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Mapping not found' });
    return;
  }
  res.json({ success: true });
});

export default router;
