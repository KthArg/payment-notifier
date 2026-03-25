import crypto from 'crypto';
import { env } from '../config/environment';

const ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = Buffer.from(env.ENCRYPTION_KEY, 'hex');

if (ENCRYPTION_KEY.length !== 32) {
  throw new Error('Encryption key must be exactly 32 bytes (64 hex characters)');
}

export function encrypt(text: string): string {
  if (!text) return '';

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(encryptedData: string): string {
  if (!encryptedData) return '';

  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// Generate a random encryption key (for setup only)
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generates a SHA-256 hash of a value.
 * Used for indexed lookups of encrypted fields (e.g., phone numbers)
 * without needing to decrypt them first.
 */
export function hashValue(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Generates a deduplication hash for a transaction.
 * Prevents processing the same transaction more than once.
 */
export function buildDedupHash(
  transactionId: string,
  bankName: string,
  amount: number,
  transactionDate: Date
): string {
  const raw = `${transactionId}|${bankName}|${amount}|${transactionDate.toISOString()}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}
