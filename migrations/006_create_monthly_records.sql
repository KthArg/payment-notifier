-- Migration 006: Create monthly_records table
-- Tracks each member's payment status per calendar month

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
