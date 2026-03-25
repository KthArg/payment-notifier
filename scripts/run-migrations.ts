import { runMigrations } from '../src/database/migrate';
import { logger } from '../src/utils/logger';
import { db } from '../src/config/database';

async function main() {
  try {
    await runMigrations();
    process.exit(0);
  } catch (error: any) {
    logger.error('Migration failed', { error: error.message });
    process.exit(1);
  } finally {
    db.$pool.end();
  }
}

main();
