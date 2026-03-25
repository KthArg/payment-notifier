import { encrypt, decrypt, hashValue, buildDedupHash } from '../../src/utils/encryption';

describe('encryption', () => {
  describe('encrypt / decrypt', () => {
    it('encrypts and decrypts a string correctly', () => {
      const original = 'hello world';
      const encrypted = encrypt(original);
      expect(decrypt(encrypted)).toBe(original);
    });

    it('produces different ciphertext each time (random IV)', () => {
      const value = 'same value';
      expect(encrypt(value)).not.toBe(encrypt(value));
    });

    it('decrypted value matches original for phone numbers', () => {
      const phone = '+50688887777';
      expect(decrypt(encrypt(phone))).toBe(phone);
    });

    it('handles empty string', () => {
      expect(decrypt(encrypt(''))).toBe('');
    });

    it('handles special characters and accents', () => {
      const text = 'María José Ñoño ₡€$';
      expect(decrypt(encrypt(text))).toBe(text);
    });
  });

  describe('hashValue', () => {
    it('returns a 64-char hex string (SHA-256)', () => {
      const hash = hashValue('test');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('is deterministic', () => {
      expect(hashValue('phone123')).toBe(hashValue('phone123'));
    });

    it('different inputs produce different hashes', () => {
      expect(hashValue('abc')).not.toBe(hashValue('def'));
    });
  });

  describe('buildDedupHash', () => {
    const base = {
      transactionId: 'TXN001',
      bankName: 'BAC',
      amount: 50000,
      date: new Date('2024-03-04T14:32:00Z'),
    };

    it('returns a 64-char hex string', () => {
      const hash = buildDedupHash(base.transactionId, base.bankName, base.amount, base.date);
      expect(hash).toHaveLength(64);
    });

    it('is deterministic for same inputs', () => {
      const h1 = buildDedupHash(base.transactionId, base.bankName, base.amount, base.date);
      const h2 = buildDedupHash(base.transactionId, base.bankName, base.amount, base.date);
      expect(h1).toBe(h2);
    });

    it('differs when amount changes', () => {
      const h1 = buildDedupHash(base.transactionId, base.bankName, 50000, base.date);
      const h2 = buildDedupHash(base.transactionId, base.bankName, 99999, base.date);
      expect(h1).not.toBe(h2);
    });

    it('differs when bank changes', () => {
      const h1 = buildDedupHash(base.transactionId, 'BAC', base.amount, base.date);
      const h2 = buildDedupHash(base.transactionId, 'BCR', base.amount, base.date);
      expect(h1).not.toBe(h2);
    });
  });
});
