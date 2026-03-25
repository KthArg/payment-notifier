import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/environment';
import { logger } from '../../utils/logger';

export interface AuthenticatedRequest extends Request {
  admin?: { sub: string; iat: number; exp: number };
}

/**
 * JWT authentication middleware.
 * Expects: Authorization: Bearer <token>
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthenticatedRequest['admin'];
    req.admin = payload;
    next();
  } catch (err: any) {
    logger.warn('JWT verification failed', { error: err.message, ip: req.ip });

    if (err.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Unauthorized', message: 'Token expired' });
    } else {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid token' });
    }
  }
}
