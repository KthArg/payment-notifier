-- Migration 008: SINPE name-to-member mappings
-- Enables name-based matching instead of phone-based matching.
-- Admin must manually create the first link; subsequent SINPEs with the
-- same normalized sender name are matched automatically.

CREATE TABLE IF NOT EXISTS sinpe_name_mappings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_name      TEXT NOT NULL UNIQUE,        -- normalized (lowercase, trimmed)
  sender_name_display TEXT NOT NULL,            -- original display name
  member_id        UUID REFERENCES members(id) ON DELETE SET NULL,
  is_ambiguous     BOOLEAN NOT NULL DEFAULT false,
  -- When is_ambiguous = true: multiple real members share this name →
  -- admin must manually assign each transaction. member_id is set to NULL.
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sinpe_name_mappings_member ON sinpe_name_mappings(member_id) WHERE member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sinpe_name_mappings_ambiguous ON sinpe_name_mappings(is_ambiguous);
