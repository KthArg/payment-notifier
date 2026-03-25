-- Migration 004: Create migration history table
-- Tracks which migrations have been applied

CREATE TABLE IF NOT EXISTS migration_history (
  id          SERIAL PRIMARY KEY,
  filename    TEXT NOT NULL UNIQUE,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE migration_history IS 'Tracks applied database migrations to prevent re-running';
