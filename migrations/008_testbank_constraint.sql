-- ⚠️  TEST ONLY — revert this migration before production (see 009_remove_testbank.sql)
-- Allows 'TestBank' in the transactions.bank_name check constraint for local testing.

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_bank_name_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_bank_name_check
  CHECK (bank_name IN ('BAC', 'BCR', 'BN', 'Scotiabank', 'Davivienda', 'TestBank'));
