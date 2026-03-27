import { db } from '../../config/database';
import { logger } from '../../utils/logger';
import { encrypt, decrypt, hashValue } from '../../utils/encryption';
import { normalizeCostaRicaPhone, maskPhoneNumber } from '../../utils/phone-formatter';
import { User, CreateUserDto, UpdateUserDto, SenderStatus, SinpeSenderWithTransaction } from '../../types/user.types';

interface UserRow {
  id: string;
  phone_number: string;
  phone_hash: string;
  full_name: string | null;
  email: string | null;
  bank_accounts: any;
  is_active: boolean;
  notification_preferences: any;
  status: SenderStatus;
  member_id: string | null;
  dismissed_at: Date | null;
  last_transaction_id: string | null;
  last_seen_at: Date;
  created_at: Date;
  updated_at: Date;
}

interface SenderRow extends UserRow {
  tx_id: string | null;
  tx_amount: number | null;
  tx_currency: string | null;
  tx_bank_name: string | null;
  tx_transaction_date: Date | null;
  tx_sender_name: string | null;
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    phoneNumber: decrypt(row.phone_number),
    fullName: row.full_name ?? undefined,
    email: row.email ?? undefined,
    bankAccounts: row.bank_accounts ?? [],
    isActive: row.is_active,
    notificationPreferences: row.notification_preferences,
    status: row.status ?? 'unknown',
    memberId: row.member_id ?? undefined,
    dismissedAt: row.dismissed_at ?? undefined,
    lastTransactionId: row.last_transaction_id ?? undefined,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToSender(row: SenderRow): SinpeSenderWithTransaction {
  const user = rowToUser(row);
  return {
    ...user,
    lastTransaction: row.tx_id ? {
      id: row.tx_id,
      amount: Number(row.tx_amount),
      currency: row.tx_currency!,
      bankName: row.tx_bank_name!,
      transactionDate: row.tx_transaction_date!,
      senderName: row.tx_sender_name ?? undefined,
    } : undefined,
  };
}

const SENDER_JOIN = `
  SELECT u.*,
    t.id            AS tx_id,
    t.amount        AS tx_amount,
    t.currency      AS tx_currency,
    t.bank_name     AS tx_bank_name,
    t.transaction_date AS tx_transaction_date,
    t.sender_name   AS tx_sender_name
  FROM users u
  LEFT JOIN transactions t ON t.id = u.last_transaction_id
`;

export class UserRepository {
  async findByPhone(phone: string): Promise<User | null> {
    try {
      const normalized = normalizeCostaRicaPhone(phone);
      const hash = hashValue(normalized);
      const row = await db.oneOrNone<UserRow>('SELECT * FROM users WHERE phone_hash = $1', [hash]);
      return row ? rowToUser(row) : null;
    } catch (error: any) {
      logger.error('UserRepository.findByPhone error', { phone: maskPhoneNumber(phone), error: error.message });
      return null;
    }
  }

  async findById(id: string): Promise<User | null> {
    try {
      const row = await db.oneOrNone<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
      return row ? rowToUser(row) : null;
    } catch (error: any) {
      logger.error('UserRepository.findById error', { id, error: error.message });
      return null;
    }
  }

  async findAllActive(): Promise<User[]> {
    try {
      const rows = await db.any<UserRow>('SELECT * FROM users WHERE is_active = true ORDER BY created_at DESC');
      return rows.map(rowToUser);
    } catch (error: any) {
      logger.error('UserRepository.findAllActive error', { error: error.message });
      return [];
    }
  }

  /** Find senders by status, joining their last transaction for context. */
  async findByStatus(status: SenderStatus): Promise<SinpeSenderWithTransaction[]> {
    try {
      const rows = await db.any<SenderRow>(
        `${SENDER_JOIN} WHERE u.status = $1 ORDER BY u.last_seen_at DESC`,
        [status]
      );
      return rows.map(rowToSender);
    } catch (error: any) {
      logger.error('UserRepository.findByStatus error', { status, error: error.message });
      return [];
    }
  }

  /** Count senders per status (for dashboard badge). */
  async countByStatus(): Promise<Record<SenderStatus, number>> {
    try {
      const rows = await db.any<{ status: SenderStatus; count: string }>(
        `SELECT status, COUNT(*) as count FROM users GROUP BY status`
      );
      const result: Record<SenderStatus, number> = { unknown: 0, dismissed: 0, linked: 0 };
      for (const r of rows) result[r.status] = parseInt(r.count, 10);
      return result;
    } catch {
      return { unknown: 0, dismissed: 0, linked: 0 };
    }
  }

  async create(dto: CreateUserDto): Promise<User | null> {
    try {
      const normalized = normalizeCostaRicaPhone(dto.phoneNumber);
      const encryptedPhone = encrypt(normalized);
      const phoneHash = hashValue(normalized);

      const row = await db.one<UserRow>(
        `INSERT INTO users (phone_number, phone_hash, full_name, email, bank_accounts)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [encryptedPhone, phoneHash, dto.fullName ?? null, dto.email ?? null, JSON.stringify(dto.bankAccounts ?? [])]
      );

      logger.info('User created', { id: row.id, phone: maskPhoneNumber(normalized) });
      return rowToUser(row);
    } catch (error: any) {
      if (error.code === '23505') return null; // duplicate phone
      logger.error('UserRepository.create error', { error: error.message });
      return null;
    }
  }

  async update(id: string, dto: UpdateUserDto): Promise<User | null> {
    try {
      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (dto.fullName !== undefined)               { updates.push(`full_name = $${idx++}`);                values.push(dto.fullName); }
      if (dto.email !== undefined)                  { updates.push(`email = $${idx++}`);                   values.push(dto.email); }
      if (dto.bankAccounts !== undefined)           { updates.push(`bank_accounts = $${idx++}`);           values.push(JSON.stringify(dto.bankAccounts)); }
      if (dto.isActive !== undefined)               { updates.push(`is_active = $${idx++}`);               values.push(dto.isActive); }
      if (dto.notificationPreferences !== undefined){ updates.push(`notification_preferences = $${idx++}`); values.push(JSON.stringify(dto.notificationPreferences)); }

      if (updates.length === 0) return this.findById(id);

      values.push(id);
      const row = await db.oneOrNone<UserRow>(
        `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
        values
      );
      return row ? rowToUser(row) : null;
    } catch (error: any) {
      logger.error('UserRepository.update error', { id, error: error.message });
      return null;
    }
  }

  async deactivate(id: string): Promise<boolean> {
    try {
      const result = await db.result('UPDATE users SET is_active = false WHERE id = $1', [id]);
      return result.rowCount === 1;
    } catch (error: any) {
      logger.error('UserRepository.deactivate error', { id, error: error.message });
      return false;
    }
  }

  /** Dismiss a sender: no future WhatsApp notifications. */
  async dismiss(id: string): Promise<boolean> {
    try {
      const result = await db.result(
        `UPDATE users SET status = 'dismissed', dismissed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [id]
      );
      return result.rowCount === 1;
    } catch (error: any) {
      logger.error('UserRepository.dismiss error', { id, error: error.message });
      return false;
    }
  }

  /** Revert a dismissed sender back to unknown (re-enable notifications). */
  async revert(id: string): Promise<boolean> {
    try {
      const result = await db.result(
        `UPDATE users SET status = 'unknown', dismissed_at = NULL, updated_at = NOW() WHERE id = $1`,
        [id]
      );
      return result.rowCount === 1;
    } catch (error: any) {
      logger.error('UserRepository.revert error', { id, error: error.message });
      return false;
    }
  }

  /** Link a SINPE sender to an existing member. */
  async linkToMember(id: string, memberId: string): Promise<boolean> {
    try {
      const result = await db.result(
        `UPDATE users SET status = 'linked', member_id = $2, updated_at = NOW() WHERE id = $1`,
        [id, memberId]
      );
      return result.rowCount === 1;
    } catch (error: any) {
      logger.error('UserRepository.linkToMember error', { id, memberId, error: error.message });
      return false;
    }
  }

  /** Update last seen timestamp and last transaction reference. */
  async updateLastSeen(id: string, transactionId: string): Promise<void> {
    await db.none(
      `UPDATE users SET last_seen_at = NOW(), last_transaction_id = $2 WHERE id = $1`,
      [id, transactionId]
    ).catch(() => {});
  }

  /**
   * Upsert a sender from SINPE email.
   * - Creates if not found (status = 'unknown')
   * - Updates name only if currently empty
   */
  async upsertFromSinpe(phone: string, name?: string): Promise<User | null> {
    const existing = await this.findByPhone(phone);
    if (existing) {
      if (name && !existing.fullName) {
        return this.update(existing.id, { fullName: name });
      }
      return existing;
    }
    return this.create({ phoneNumber: phone, fullName: name });
  }

  async count(): Promise<number> {
    const row = await db.one<{ count: string }>('SELECT COUNT(*) FROM users');
    return parseInt(row.count, 10);
  }
}

export const userRepository = new UserRepository();
