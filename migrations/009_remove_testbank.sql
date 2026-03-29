-- Run this before going to production to remove TestBank from the constraint.
-- Also remove: src/parsers/test.parser.ts and its import in parser-factory.ts

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_bank_name_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_bank_name_check
  CHECK (bank_name IN ('BAC', 'BCR', 'BN', 'Scotiabank', 'Davivienda'));
