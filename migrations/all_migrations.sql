-- ============================================================
-- SINPE Notifier - All Migrations
-- Run this entire file in Supabase SQL Editor:
-- Dashboard → SQL Editor → New query → Paste → Run
-- ============================================================

-- Migration 001: Create users table
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number  TEXT NOT NULL,
  phone_hash    TEXT NOT NULL UNIQUE,
  full_name     TEXT,
  email         TEXT,
  bank_accounts JSONB NOT NULL DEFAULT '[]',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  notification_preferences JSONB NOT NULL DEFAULT '{"enabled": true, "language": "es"}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_phone_hash ON users(phone_hash);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active) WHERE is_active = true;

-- Migration 002: Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id      TEXT NOT NULL,
  bank_name           TEXT NOT NULL CHECK (bank_name IN ('BAC', 'BCR', 'BN', 'Scotiabank', 'Davivienda')),
  amount              NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  currency            CHAR(3) NOT NULL DEFAULT 'CRC' CHECK (currency IN ('CRC', 'USD')),
  sender_name         TEXT,
  sender_phone        TEXT,
  receiver_name       TEXT,
  receiver_phone      TEXT,
  reference_number    TEXT,
  transaction_date    TIMESTAMPTZ NOT NULL,
  email_message_id    TEXT,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  dedup_hash          TEXT NOT NULL UNIQUE,
  processed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_dedup_hash ON transactions(dedup_hash);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_bank ON transactions(bank_name);

-- Migration 003: Create notification_logs table
CREATE TABLE IF NOT EXISTS notification_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id      UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  whatsapp_message_id TEXT,
  phone_number        TEXT NOT NULL,
  template_name       TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  delivery_status     JSONB,
  error_message       TEXT,
  retry_count         INTEGER NOT NULL DEFAULT 0,
  max_retries         INTEGER NOT NULL DEFAULT 3,
  sent_at             TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,
  read_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_wa_message_id ON notification_logs(whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notification_logs_transaction_id ON notification_logs(transaction_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_retry ON notification_logs(status, retry_count) WHERE status = 'failed' AND retry_count < 3;

-- Migration 004: Create migration history table
CREATE TABLE IF NOT EXISTS migration_history (
  id          SERIAL PRIMARY KEY,
  filename    TEXT NOT NULL UNIQUE,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migration 005: Create members table
CREATE TABLE IF NOT EXISTS members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name       TEXT NOT NULL,
  phone_number    TEXT NOT NULL,
  phone_hash      TEXT NOT NULL UNIQUE,
  email           TEXT,
  monthly_amount  NUMERIC(15, 2) NOT NULL CHECK (monthly_amount > 0),
  due_day         INTEGER NOT NULL DEFAULT 1 CHECK (due_day BETWEEN 1 AND 28),
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_members_phone_hash ON members(phone_hash);
CREATE INDEX IF NOT EXISTS idx_members_is_active ON members(is_active) WHERE is_active = true;

-- Migration 006: Create monthly_records table
CREATE TABLE IF NOT EXISTS monthly_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id        UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  month            INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year             INTEGER NOT NULL CHECK (year >= 2024),
  amount_due       NUMERIC(15, 2) NOT NULL CHECK (amount_due > 0),
  amount_paid      NUMERIC(15, 2) CHECK (amount_paid >= 0),
  transaction_id   UUID REFERENCES transactions(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'paid_on_time', 'paid_late', 'overdue')),
  paid_at          TIMESTAMPTZ,
  reminder_sent_at TIMESTAMPTZ,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(member_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_monthly_records_member ON monthly_records(member_id);
CREATE INDEX IF NOT EXISTS idx_monthly_records_period ON monthly_records(year, month);
CREATE INDEX IF NOT EXISTS idx_monthly_records_status ON monthly_records(status);

-- Migration 007: Add status tracking to users (SINPE senders)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (status IN ('unknown', 'dismissed', 'linked')),
  ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_users_status    ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_member_id ON users(member_id) WHERE member_id IS NOT NULL;

-- Migration 008: Allow TestBank in constraint (TEST ONLY — revert with 009 before production)
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_bank_name_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_bank_name_check
  CHECK (bank_name IN ('BAC', 'BCR', 'BN', 'Scotiabank', 'Davivienda', 'TestBank'));

-- Record all migrations as applied
INSERT INTO migration_history (filename) VALUES
  ('001_create_users.sql'),
  ('002_create_transactions.sql'),
  ('003_create_notification_logs.sql'),
  ('004_create_migration_history.sql'),
  ('005_create_members.sql'),
  ('006_create_monthly_records.sql'),
  ('007_users_status.sql'),
  ('008_testbank_constraint.sql')
ON CONFLICT (filename) DO NOTHING;
