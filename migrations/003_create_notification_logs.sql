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
