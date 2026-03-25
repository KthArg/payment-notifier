import rateLimit from 'express-rate-limit';

/**
 * General API rate limiter: 100 requests per minute per IP
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests', message: 'Too many requests, please try again later.' },
});

/**
 * Stricter limiter for auth endpoints: 10 attempts per 15 minutes per IP
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests', message: 'Too many login attempts, please try again later.' },
});
