import { db } from '../../config/database';
import { logger } from '../../utils/logger';
import { encrypt, decrypt, hashValue } from '../../utils/encryption';
import { normalizeCostaRicaPhone, maskPhoneNumber } from '../../utils/phone-formatter';
import { User, CreateUserDto, UpdateUserDto } from '../../types/user.types';

/**
 * Raw row from the users table (as stored in PostgreSQL)
 */
interface UserRow {
  id: string;
  phone_number: string;
  phone_hash: string;
  full_name: string | null;
  email: string | null;
  bank_accounts: any;
  is_active: boolean;
  notification_preferences: any;
  created_at: Date;
  updated_at: Date;
}

/**
 * Maps a database row to the User domain type, decrypting sensitive fields.
 */
function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    phoneNumber: decrypt(row.phone_number),
    fullName: row.full_name ?? undefined,
    email: row.email ?? undefined,
    bankAccounts: row.bank_accounts ?? [],
    isActive: row.is_active,
    notificationPreferences: row.notification_preferences,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class UserRepository {
  /**
   * Find a user by their phone number.
   * Normalizes then hashes the phone for an indexed lookup.
   */
  async findByPhone(phone: string): Promise<User | null> {
    try {
      const normalized = normalizeCostaRicaPhone(phone);
      const hash = hashValue(normalized);

      const row = await db.oneOrNone<UserRow>(
        'SELECT * FROM users WHERE phone_hash = $1',
        [hash]
      );

      return row ? rowToUser(row) : null;
    } catch (error: any) {
      logger.error('UserRepository.findByPhone error', {
        phone: maskPhoneNumber(phone),
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Find a user by their UUID.
   */
  async findById(id: string): Promise<User | null> {
    try {
      const row = await db.oneOrNone<UserRow>(
        'SELECT * FROM users WHERE id = $1',
        [id]
      );
      return row ? rowToUser(row) : null;
    } catch (error: any) {
      logger.error('UserRepository.findById error', { id, error: error.message });
      return null;
    }
  }

  /**
   * Get all active users (for admin purposes).
   */
  async findAllActive(): Promise<User[]> {
    try {
      const rows = await db.any<UserRow>(
        'SELECT * FROM users WHERE is_active = true ORDER BY created_at DESC'
      );
      return rows.map(rowToUser);
    } catch (error: any) {
      logger.error('UserRepository.findAllActive error', { error: error.message });
      return [];
    }
  }

  /**
   * Create a new user.
   * Normalizes and encrypts the phone number before storing.
   */
  async create(dto: CreateUserDto): Promise<User | null> {
    try {
      const normalized = normalizeCostaRicaPhone(dto.phoneNumber);
      const encryptedPhone = encrypt(normalized);
      const phoneHash = hashValue(normalized);

      const row = await db.one<UserRow>(
        `INSERT INTO users
           (phone_number, phone_hash, full_name, email, bank_accounts)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          encryptedPhone,
          phoneHash,
          dto.fullName ?? null,
          dto.email ?? null,
          JSON.stringify(dto.bankAccounts ?? []),
        ]
      );

      logger.info('User created', { id: row.id, phone: maskPhoneNumber(normalized) });
      return rowToUser(row);
    } catch (error: any) {
      // Duplicate phone (unique constraint on phone_hash)
      if (error.code === '23505') {
        logger.warn('UserRepository.create: phone already registered', {
          phone: maskPhoneNumber(dto.phoneNumber),
        });
        return null;
      }
      logger.error('UserRepository.create error', { error: error.message });
      return null;
    }
  }

  /**
   * Update an existing user.
   */
  async update(id: string, dto: UpdateUserDto): Promise<User | null> {
    try {
      // Build SET clause dynamically from provided fields
      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (dto.fullName !== undefined) {
        updates.push(`full_name = $${idx++}`);
        values.push(dto.fullName);
      }
      if (dto.email !== undefined) {
        updates.push(`email = $${idx++}`);
        values.push(dto.email);
      }
      if (dto.bankAccounts !== undefined) {
        updates.push(`bank_accounts = $${idx++}`);
        values.push(JSON.stringify(dto.bankAccounts));
      }
      if (dto.isActive !== undefined) {
        updates.push(`is_active = $${idx++}`);
        values.push(dto.isActive);
      }
      if (dto.notificationPreferences !== undefined) {
        updates.push(`notification_preferences = $${idx++}`);
        values.push(JSON.stringify(dto.notificationPreferences));
      }

      if (updates.length === 0) return this.findById(id);

      values.push(id);
      const row = await db.oneOrNone<UserRow>(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
      );

      return row ? rowToUser(row) : null;
    } catch (error: any) {
      logger.error('UserRepository.update error', { id, error: error.message });
      return null;
    }
  }

  /**
   * Soft-delete: mark user as inactive.
   */
  async deactivate(id: string): Promise<boolean> {
    try {
      const result = await db.result(
        'UPDATE users SET is_active = false WHERE id = $1',
        [id]
      );
      return result.rowCount === 1;
    } catch (error: any) {
      logger.error('UserRepository.deactivate error', { id, error: error.message });
      return false;
    }
  }

  /**
   * Total user count (for admin stats).
   */
  async count(): Promise<number> {
    const row = await db.one<{ count: string }>('SELECT COUNT(*) FROM users');
    return parseInt(row.count, 10);
  }
}

export const userRepository = new UserRepository();
