import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../../config/environment';
import { logger } from '../../utils/logger';
import { authLimiter } from '../middleware/rate-limit.middleware';

const router = Router();

/**
 * POST /api/auth/login
 * Returns a JWT token for valid admin credentials.
 */
router.post('/login', authLimiter, async (req: Request, res: Response): Promise<void> => {
  const { password } = req.body;

  if (!password || typeof password !== 'string') {
    res.status(400).json({ error: 'Bad Request', message: 'password is required' });
    return;
  }

  const isValid = await bcrypt.compare(password, env.ADMIN_PASSWORD_HASH);

  if (!isValid) {
    logger.warn('Failed admin login attempt', { ip: req.ip });
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' });
    return;
  }

  const token = jwt.sign({ sub: 'admin' }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRY as any,
  });

  logger.info('Admin login successful', { ip: req.ip });

  res.status(200).json({ token, expiresIn: env.JWT_EXPIRY });
});

export default router;
