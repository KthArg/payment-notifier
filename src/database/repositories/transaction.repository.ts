import { db } from '../../config/database';
import { logger } from '../../utils/logger';
import { encrypt, decrypt, buildDedupHash, hashValue } from '../../utils/encryption';
import { normalizeCostaRicaPhone } from '../../utils/phone-formatter';
import { ParsedTransaction, Transaction, TransactionStatus } from '../../types/transaction.types';

/**
 * Raw row from the transactions table
 */
interface TransactionRow {
  id: string;
  transaction_id: string;
  bank_name: string;
  amount: string;
  currency: string;
  sender_name: string | null;
  sender_phone: string | null;
  receiver_name: string | null;
  receiver_phone: string | null;
  reference_number: string | null;
  transaction_date: Date;
  email_message_id: string | null;
  status: TransactionStatus;
  user_id: string | null;
  dedup_hash: string;
  processed_at: Date | null;
  created_at: Date;
}

/**
 * Maps a database row to Transaction, decrypting sensitive fields.
 */
function rowToTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    bankName: row.bank_name as Transaction['bankName'],
    amount: parseFloat(row.amount),
    currency: row.currency as 'CRC' | 'USD',
    senderName: row.sender_name ? decrypt(row.sender_name) : undefined,
    senderPhone: row.sender_phone ? decrypt(row.sender_phone) : undefined,
    receiverName: row.receiver_name ? decrypt(row.receiver_name) : undefined,
    receiverPhone: row.receiver_phone ? decrypt(row.receiver_phone) : undefined,
    referenceNumber: row.reference_number ?? undefined,
    transactionDate: row.transaction_date,
    emailMessageId: row.email_message_id ?? undefined,
    status: row.status,
    userId: row.user_id ?? undefined,
    processedAt: row.processed_at ?? new Date(),
    createdAt: row.created_at,
  };
}

export class TransactionRepository {
  /**
   * Check if a transaction already exists (deduplication).
   * Returns true if the transaction has already been processed.
   */
  async isDuplicate(parsed: ParsedTransaction): Promise<boolean> {
    try {
      const hash = buildDedupHash(
        parsed.transactionId,
        parsed.bankName,
        parsed.amount,
        parsed.transactionDate
      );

      const row = await db.oneOrNone<{ id: string }>(
        'SELECT id FROM transactions WHERE dedup_hash = $1',
        [hash]
      );

      return row !== null;
    } catch (error: any) {
      logger.error('TransactionRepository.isDuplicate error', { error: error.message });
      // Fail safe: treat as duplicate to avoid double-processing
      return true;
    }
  }

  /**
   * Create a transaction from a parsed email.
   * Encrypts sensitive fields and computes dedup hash.
   * Returns null if the transaction is a duplicate.
   */
  async create(parsed: ParsedTransaction, userId?: string): Promise<Transaction | null> {
    try {
      const dedupHash = buildDedupHash(
        parsed.transactionId,
        parsed.bankName,
        parsed.amount,
        parsed.transactionDate
      );

      // Find matching user by receiver phone if not provided
      let resolvedUserId = userId;
      if (!resolvedUserId && parsed.receiverPhone) {
        const normalized = normalizeCostaRicaPhone(parsed.receiverPhone);
        const phoneHash = hashValue(normalized);
        const userRow = await db.oneOrNone<{ id: string }>(
          'SELECT id FROM users WHERE phone_hash = $1 AND is_active = true',
          [phoneHash]
        );
        resolvedUserId = userRow?.id;
      }

      const row = await db.one<TransactionRow>(
        `INSERT INTO transactions
           (transaction_id, bank_name, amount, currency,
            sender_name, sender_phone, receiver_name, receiver_phone,
            reference_number, transaction_date, email_message_id,
            status, user_id, dedup_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING *`,
        [
          parsed.transactionId,
          parsed.bankName,
          parsed.amount,
          parsed.currency,
          parsed.senderName ? encrypt(parsed.senderName) : null,
          parsed.senderPhone ? encrypt(normalizeCostaRicaPhone(parsed.senderPhone)) : null,
          parsed.receiverName ? encrypt(parsed.receiverName) : null,
          parsed.receiverPhone ? encrypt(normalizeCostaRicaPhone(parsed.receiverPhone)) : null,
          parsed.referenceNumber ?? null,
          parsed.transactionDate,
          parsed.emailMessageId ?? null,
          'pending',
          resolvedUserId ?? null,
          dedupHash,
        ]
      );

      logger.info('Transaction created', {
        id: row.id,
        bank: parsed.bankName,
        amount: parsed.amount,
        currency: parsed.currency,
        userId: resolvedUserId,
      });

      return rowToTransaction(row);
    } catch (error: any) {
      if (error.code === '23505') {
        // Unique constraint on dedup_hash — duplicate
        logger.warn('TransactionRepository.create: duplicate transaction skipped', {
          transactionId: parsed.transactionId,
          bank: parsed.bankName,
        });
        return null;
      }
      logger.error('TransactionRepository.create error', { error: error.message });
      return null;
    }
  }

  /**
   * Find a transaction by its internal UUID.
   */
  async findById(id: string): Promise<Transaction | null> {
    try {
      const row = await db.oneOrNone<TransactionRow>(
        'SELECT * FROM transactions WHERE id = $1',
        [id]
      );
      return row ? rowToTransaction(row) : null;
    } catch (error: any) {
      logger.error('TransactionRepository.findById error', { id, error: error.message });
      return null;
    }
  }

  /**
   * Get all pending transactions (waiting to be sent via WhatsApp).
   */
  async findPending(): Promise<Transaction[]> {
    try {
      const rows = await db.any<TransactionRow>(
        `SELECT * FROM transactions
         WHERE status = 'pending'
         ORDER BY created_at ASC`
      );
      return rows.map(rowToTransaction);
    } catch (error: any) {
      logger.error('TransactionRepository.findPending error', { error: error.message });
      return [];
    }
  }

  /**
   * Get transactions for a specific user (their history).
   */
  async findByUserId(
    userId: string,
    limit = 20,
    offset = 0
  ): Promise<Transaction[]> {
    try {
      const rows = await db.any<TransactionRow>(
        `SELECT * FROM transactions
         WHERE user_id = $1
         ORDER BY transaction_date DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );
      return rows.map(rowToTransaction);
    } catch (error: any) {
      logger.error('TransactionRepository.findByUserId error', { userId, error: error.message });
      return [];
    }
  }

  /**
   * Update transaction status after attempting to send WhatsApp notification.
   */
  async updateStatus(
    id: string,
    status: TransactionStatus,
    processedAt?: Date
  ): Promise<boolean> {
    try {
      const result = await db.result(
        `UPDATE transactions
         SET status = $1, processed_at = $2
         WHERE id = $3`,
        [status, processedAt ?? new Date(), id]
      );
      return result.rowCount === 1;
    } catch (error: any) {
      logger.error('TransactionRepository.updateStatus error', { id, status, error: error.message });
      return false;
    }
  }

  /**
   * Link a transaction to a user (when user registers after transaction was processed).
   */
  async linkToUser(transactionId: string, userId: string): Promise<boolean> {
    try {
      const result = await db.result(
        'UPDATE transactions SET user_id = $1 WHERE id = $2',
        [userId, transactionId]
      );
      return result.rowCount === 1;
    } catch (error: any) {
      logger.error('TransactionRepository.linkToUser error', { transactionId, userId, error: error.message });
      return false;
    }
  }

  /**
   * Find transactions by decrypted sender name (normalized lowercase match).
   * Used for retroactive payment matching when admin links a name to a member.
   * Note: decrypts all rows with a sender_name — acceptable for small datasets.
   */
  async findBySenderName(normalizedName: string): Promise<Transaction[]> {
    try {
      const rows = await db.any<TransactionRow>(
        'SELECT * FROM transactions WHERE sender_name IS NOT NULL ORDER BY transaction_date ASC'
      );
      return rows
        .map(rowToTransaction)
        .filter(tx => tx.senderName?.toLowerCase().trim().replace(/\s+/g, ' ') === normalizedName);
    } catch (error: any) {
      logger.error('TransactionRepository.findBySenderName error', { error: error.message });
      return [];
    }
  }

  /**
   * Count transactions in a date range (for stats).
   */
  async countByDateRange(from: Date, to: Date): Promise<number> {
    const row = await db.one<{ count: string }>(
      `SELECT COUNT(*) FROM transactions
       WHERE transaction_date BETWEEN $1 AND $2`,
      [from, to]
    );
    return parseInt(row.count, 10);
  }
}

export const transactionRepository = new TransactionRepository();
