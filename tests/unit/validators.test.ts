import {
  phoneNumberSchema,
  safeParsedTransaction,
  validateParsedTransaction,
} from '../../src/utils/validators';

const validTransaction = {
  transactionId: 'BAC123456789',
  amount: 50000,
  currency: 'CRC' as const,
  transactionDate: new Date('2024-03-04T14:32:00Z'),
  bankName: 'BAC' as const,
};

describe('phoneNumberSchema', () => {
  it('accepts valid CR phone', () => {
    expect(() => phoneNumberSchema.parse('+50688887777')).not.toThrow();
  });

  it('rejects number without +506', () => {
    expect(() => phoneNumberSchema.parse('88887777')).toThrow();
  });

  it('rejects number that is too short', () => {
    expect(() => phoneNumberSchema.parse('+506888')).toThrow();
  });

  it('rejects empty string', () => {
    expect(() => phoneNumberSchema.parse('')).toThrow();
  });
});

describe('validateParsedTransaction', () => {
  it('accepts a valid transaction', () => {
    expect(() => validateParsedTransaction(validTransaction)).not.toThrow();
  });

  it('rejects negative amount', () => {
    expect(() =>
      validateParsedTransaction({ ...validTransaction, amount: -100 })
    ).toThrow();
  });

  it('rejects zero amount', () => {
    expect(() =>
      validateParsedTransaction({ ...validTransaction, amount: 0 })
    ).toThrow();
  });

  it('rejects invalid currency', () => {
    expect(() =>
      validateParsedTransaction({ ...validTransaction, currency: 'EUR' })
    ).toThrow();
  });

  it('rejects invalid bank name', () => {
    expect(() =>
      validateParsedTransaction({ ...validTransaction, bankName: 'Unknown' })
    ).toThrow();
  });

  it('rejects missing transactionId', () => {
    const { transactionId, ...rest } = validTransaction;
    expect(() => validateParsedTransaction(rest)).toThrow();
  });

  it('accepts all valid bank names', () => {
    const banks = ['BAC', 'BCR', 'BN', 'Scotiabank', 'Davivienda'] as const;
    for (const bank of banks) {
      expect(() =>
        validateParsedTransaction({ ...validTransaction, bankName: bank })
      ).not.toThrow();
    }
  });
});

describe('safeParsedTransaction', () => {
  it('returns success for valid transaction', () => {
    const result = safeParsedTransaction(validTransaction);
    expect(result.success).toBe(true);
  });

  it('returns failure with error details for invalid data', () => {
    const result = safeParsedTransaction({ ...validTransaction, amount: -1 });
    expect(result.success).toBe(false);
  });

  it('does not throw on invalid data', () => {
    expect(() => safeParsedTransaction(null)).not.toThrow();
    expect(() => safeParsedTransaction({})).not.toThrow();
  });
});
