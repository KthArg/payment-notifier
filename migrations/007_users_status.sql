-- Migration 007: Add status tracking to users (SINPE senders)
-- Allows admin to dismiss unknown senders or link them to members

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (status IN ('unknown', 'dismissed', 'linked')),
  ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_users_status     ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_member_id  ON users(member_id) WHERE member_id IS NOT NULL;
