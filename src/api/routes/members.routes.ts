import express, { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { MemberRepository } from '../../database/repositories/member.repository';
import { MonthlyRecordRepository } from '../../database/repositories/monthly-record.repository';

const router = express.Router();
const memberRepo = new MemberRepository();
const monthlyRepo = new MonthlyRecordRepository();

router.use(requireAuth);

// GET /api/members
router.get('/', async (_req: Request, res: Response) => {
  const members = await memberRepo.findAll();
  res.json({ data: members });
});

// GET /api/members/:id
router.get('/:id', async (req: Request<{ id: string }>, res: Response) => {
  const member = await memberRepo.findById(req.params.id);
  if (!member) { res.status(404).json({ error: 'Not Found' }); return; }
  res.json({ data: member });
});

// GET /api/members/:id/records — payment history
router.get('/:id/records', async (req: Request<{ id: string }>, res: Response) => {
  const member = await memberRepo.findById(req.params.id);
  if (!member) { res.status(404).json({ error: 'Not Found' }); return; }
  const records = await monthlyRepo.findByMember(req.params.id);
  res.json({ data: records });
});

// POST /api/members
router.post('/', async (req: Request, res: Response) => {
  const { fullName, phoneNumber, email, monthlyAmount, dueDay, notes } = req.body;
  if (!fullName || !phoneNumber || !monthlyAmount) {
    res.status(400).json({ error: 'Bad Request', message: 'fullName, phoneNumber y monthlyAmount son requeridos' });
    return;
  }
  const member = await memberRepo.create({ fullName, phoneNumber, email, monthlyAmount: Number(monthlyAmount), dueDay: dueDay ? Number(dueDay) : 1, notes });
  if (!member) {
    res.status(409).json({ error: 'Conflict', message: 'Ya existe un miembro con ese número de teléfono' });
    return;
  }
  res.status(201).json({ data: member });
});

// PUT /api/members/:id
router.put('/:id', async (req: Request<{ id: string }>, res: Response) => {
  const { fullName, phoneNumber, email, monthlyAmount, dueDay, notes, isActive } = req.body;
  const updated = await memberRepo.update(req.params.id, {
    fullName, phoneNumber, email,
    monthlyAmount: monthlyAmount !== undefined ? Number(monthlyAmount) : undefined,
    dueDay: dueDay !== undefined ? Number(dueDay) : undefined,
    notes,
    isActive,
  });
  if (!updated) { res.status(404).json({ error: 'Not Found' }); return; }
  res.json({ data: updated });
});

// POST /api/members/:id/records/:recordId/pay — manual cash payment
router.post('/:id/records/:recordId/pay', async (
  req: Request<{ id: string; recordId: string }>, res: Response
) => {
  const member = await memberRepo.findById(req.params.id);
  if (!member) { res.status(404).json({ error: 'Miembro no encontrado' }); return; }

  const record = await monthlyRepo.findById(req.params.recordId);
  if (!record || record.memberId !== req.params.id) {
    res.status(404).json({ error: 'Registro no encontrado' }); return;
  }
  if (record.status === 'paid_on_time' || record.status === 'paid_late') {
    res.status(409).json({ error: 'Este mes ya está marcado como pagado' }); return;
  }

  const amountPaid = Number(req.body.amountPaid) || record.amountDue;
  const notes = req.body.notes ? `[Efectivo] ${req.body.notes}` : '[Efectivo]';
  const now = new Date();
  const isPaidOnTime = now.getDate() <= member.dueDay;

  const updated = await monthlyRepo.markPaid(record.id, {
    amountPaid,
    status: isPaidOnTime ? 'paid_on_time' : 'paid_late',
    paidAt: now,
    notes,
  });
  if (!updated) { res.status(500).json({ error: 'Error al actualizar el registro' }); return; }
  res.json({ data: updated });
});

// DELETE /api/members/:id (soft delete)
router.delete('/:id', async (req: Request<{ id: string }>, res: Response) => {
  const ok = await memberRepo.deactivate(req.params.id);
  if (!ok) { res.status(404).json({ error: 'Not Found' }); return; }
  res.status(204).send();
});

export default router;
