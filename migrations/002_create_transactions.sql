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
