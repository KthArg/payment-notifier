import { Router, Response } from 'express';
import { UserRepository } from '../../database/repositories/user.repository';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware';
import { logger } from '../../utils/logger';

const router = Router();
const userRepo = new UserRepository();

// All user routes require authentication
router.use(requireAuth);

/**
 * GET /api/users
 * List all active users
 */
router.get('/', async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const users = await userRepo.findAllActive();
    res.status(200).json({ data: users, count: users.length });
  } catch (err: any) {
    logger.error('GET /api/users failed', { error: err.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /api/users/:id
 * Get a single user by ID
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = await userRepo.findById(req.params['id'] as string);
    if (!user) {
      res.status(404).json({ error: 'Not Found', message: 'User not found' });
      return;
    }
    res.status(200).json({ data: user });
  } catch (err: any) {
    logger.error('GET /api/users/:id failed', { error: err.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/users
 * Create a new user
 */
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { phoneNumber, fullName, email, bankAccounts, notificationPreferences } = req.body;

  if (!phoneNumber) {
    res.status(400).json({ error: 'Bad Request', message: 'phoneNumber is required' });
    return;
  }

  try {
    const user = await userRepo.create({
      phoneNumber,
      fullName,
      email,
      bankAccounts,
    });
    if (!user) {
      res.status(409).json({ error: 'Conflict', message: 'A user with this phone number already exists' });
      return;
    }
    res.status(201).json({ data: user });
  } catch (err: any) {
    logger.error('POST /api/users failed', { error: err.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * PUT /api/users/:id
 * Update a user
 */
router.put('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = await userRepo.update(req.params['id'] as string, req.body);
    if (!user) {
      res.status(404).json({ error: 'Not Found', message: 'User not found' });
      return;
    }
    res.status(200).json({ data: user });
  } catch (err: any) {
    logger.error('PUT /api/users/:id failed', { error: err.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * DELETE /api/users/:id
 * Soft-delete (deactivate) a user
 */
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    await userRepo.deactivate(req.params['id'] as string);
    res.status(204).send();
  } catch (err: any) {
    logger.error('DELETE /api/users/:id failed', { error: err.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
