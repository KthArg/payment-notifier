import pgPromise from 'pg-promise';
import { env } from './environment';
import { logger } from '../utils/logger';

const pgp = pgPromise({
  // Initialization options
  query(e) {
    if (env.LOG_LEVEL === 'debug') {
      logger.debug('SQL Query:', { query: e.query });
    }
  },
  error(err, e) {
    logger.error('Database error:', {
      error: err.message,
      query: e.query,
    });
  },
});

// Configure connection with options for better DNS/IPv6 handling
const connectionConfig = {
  connectionString: env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Supabase requires SSL
  },
  // Force IPv4 or allow both
  options: '-c search_path=public',
};

export const db = pgp(connectionConfig);

// Test database connection
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    await db.one('SELECT 1 as test');
    logger.info('✅ Database connection successful');
    return true;
  } catch (error) {
    logger.error('❌ Database connection failed:', error);
    return false;
  }
}

export { pgp };
