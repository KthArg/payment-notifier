import fs from 'fs';
import path from 'path';
import pgPromise from 'pg-promise';
import { env } from '../config/environment';
import { logger } from '../utils/logger';

const MIGRATIONS_DIR = path.join(process.cwd(), 'migrations');

function createMigrationDb() {
  const pgp = pgPromise({});
  const url = process.env.MIGRATION_DATABASE_URL || env.DATABASE_URL;
  return pgp({ connectionString: url, ssl: { rejectUnauthorized: false } });
}

function getMigrationFiles(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && f !== 'all_migrations.sql')
    .sort();
}

async function getAppliedMigrations(db: any): Promise<string[]> {
  try {
    const rows: Array<{ filename: string }> = await db.any(
      'SELECT filename FROM migration_history ORDER BY applied_at'
    );
    return rows.map((r) => r.filename);
  } catch {
    return [];
  }
}

/**
 * Run all pending migrations.
 *
 * NOTE: Supabase Transaction Pooler (port 6543) does not support DDL.
 * If this fails, run migrations/all_migrations.sql manually in Supabase
 * SQL Editor and re-run this command to verify.
 */
export async function runMigrations(): Promise<void> {
  logger.info('🗄️  Checking database migrations...');

  const db = createMigrationDb();

  try {
    const files = getMigrationFiles();
    const applied = await getAppliedMigrations(db);
    const pending = files.filter((f) => !applied.includes(f));

    if (pending.length === 0) {
      logger.info('✅ Database is up to date — no pending migrations');
      return;
    }

    logger.info(`Found ${pending.length} pending migration(s): ${pending.join(', ')}`);

    for (const filename of pending) {
      const filepath = path.join(MIGRATIONS_DIR, filename);
      const raw = fs.readFileSync(filepath, 'utf-8');

      logger.info(`  ⏳ Applying: ${filename}`);

      try {
        // Split on semicolons and execute each statement individually
        const statements = raw
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && !s.startsWith('--'));

        for (const stmt of statements) {
          await db.none(stmt);
        }

        // Record migration
        try {
          await db.none(
            'INSERT INTO migration_history (filename) VALUES ($1)',
            [filename]
          );
        } catch {
          // migration_history doesn't exist yet — ok for first 3 files
        }

        logger.info(`  ✅ Applied: ${filename}`);
      } catch (err: any) {
        if (err.message?.includes('Tenant or user not found') || err.code === '42501') {
          logger.error('❌ Migration failed — Supabase pooler does not support DDL');
          logger.error('');
          logger.error('👉 Run migrations manually in Supabase SQL Editor:');
          logger.error('   1. Go to https://supabase.com/dashboard/project/xuajrzmoofkgkwknoeyr/sql/new');
          logger.error('   2. Open file: migrations/all_migrations.sql');
          logger.error('   3. Paste all contents and click Run');
          logger.error('   4. Then run: npm run migrate  (to verify)');
          logger.error('');
          throw err;
        }
        throw err;
      }
    }

    logger.info('✅ All migrations applied successfully');
  } finally {
    db.$pool.end();
  }
}
