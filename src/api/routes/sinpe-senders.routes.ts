import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { UserRepository } from '../../database/repositories/user.repository';
import { MemberRepository } from '../../database/repositories/member.repository';
import { logger } from '../../utils/logger';

const router = Router();
const userRepo = new UserRepository();
const memberRepo = new MemberRepository();

/** GET /api/sinpe-senders/badge — count of unknown senders (for sidebar badge) */
router.get('/badge', requireAuth, async (_req: Request, res: Response): Promise<void> => {
  const counts = await userRepo.countByStatus();
  res.json({ data: counts });
});

/** GET /api/sinpe-senders?status=unknown|dismissed|linked */
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const status = (req.query.status as string) ?? 'unknown';
  if (!['unknown', 'dismissed', 'linked'].includes(status)) {
    res.status(400).json({ error: 'Invalid status. Use unknown, dismissed, or linked.' });
    return;
  }
  const senders = await userRepo.findByStatus(status as any);
  res.json({ data: senders });
});

/** POST /api/sinpe-senders/:id/dismiss */
router.post('/:id/dismiss', requireAuth, async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  const ok = await userRepo.dismiss(req.params.id);
  if (!ok) { res.status(404).json({ error: 'Sender not found' }); return; }
  logger.info('Sender dismissed', { id: req.params.id });
  res.json({ success: true });
});

/** POST /api/sinpe-senders/:id/revert */
router.post('/:id/revert', requireAuth, async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  const ok = await userRepo.revert(req.params.id);
  if (!ok) { res.status(404).json({ error: 'Sender not found' }); return; }
  logger.info('Sender reverted to unknown', { id: req.params.id });
  res.json({ success: true });
});

/** POST /api/sinpe-senders/:id/link — link to an existing member */
router.post('/:id/link', requireAuth, async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  const { memberId } = req.body;
  if (!memberId) { res.status(400).json({ error: 'memberId is required' }); return; }

  const member = await memberRepo.findById(memberId);
  if (!member) { res.status(404).json({ error: 'Member not found' }); return; }

  const ok = await userRepo.linkToMember(req.params.id, memberId);
  if (!ok) { res.status(404).json({ error: 'Sender not found' }); return; }

  logger.info('Sender linked to member', { senderId: req.params.id, memberId });
  res.json({ success: true });
});

export default router;
