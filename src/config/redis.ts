import Redis from 'ioredis';
import { env } from './environment';
import { logger } from '../utils/logger';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError(err) {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      // Reconnect when Redis is in READONLY mode
      return true;
    }
    return false;
  },
});

redis.on('connect', () => {
  logger.info('✅ Redis connection successful');
});

redis.on('error', (err) => {
  logger.error('❌ Redis connection error:', err);
});

redis.on('ready', () => {
  logger.info('Redis client ready');
});

redis.on('reconnecting', () => {
  logger.warn('Redis client reconnecting...');
});

// Test Redis connection
export async function testRedisConnection(): Promise<boolean> {
  try {
    await redis.ping();
    logger.info('✅ Redis ping successful');
    return true;
  } catch (error) {
    logger.error('❌ Redis ping failed:', error);
    return false;
  }
}

export default redis;
