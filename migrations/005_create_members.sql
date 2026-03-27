-- Migration 005: Create members table
-- Members are the paying clients of the business (e.g., gym/dance academy students)

CREATE TABLE IF NOT EXISTS members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name       TEXT NOT NULL,
  phone_number    TEXT NOT NULL,          -- AES-256-GCM encrypted
  phone_hash      TEXT NOT NULL UNIQUE,   -- SHA-256 for indexed lookup
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
