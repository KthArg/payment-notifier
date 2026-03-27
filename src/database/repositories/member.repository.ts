import { db } from '../../config/database';
import { logger } from '../../utils/logger';
import { encrypt, decrypt, hashValue } from '../../utils/encryption';
import { normalizeCostaRicaPhone, maskPhoneNumber } from '../../utils/phone-formatter';
import { Member, CreateMemberDto, UpdateMemberDto } from '../../types/member.types';

interface MemberRow {
  id: string;
  full_name: string;
  phone_number: string;
  phone_hash: string;
  email: string | null;
  monthly_amount: string;
  due_day: number;
  notes: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

function rowToMember(row: MemberRow): Member {
  return {
    id: row.id,
    fullName: row.full_name,
    phoneNumber: decrypt(row.phone_number),
    email: row.email ?? undefined,
    monthlyAmount: parseFloat(row.monthly_amount),
    dueDay: row.due_day,
    notes: row.notes ?? undefined,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class MemberRepository {
  async findAll(includeInactive = false): Promise<Member[]> {
    try {
      const rows = await db.any<MemberRow>(
        `SELECT * FROM members ${includeInactive ? '' : 'WHERE is_active = true'} ORDER BY full_name ASC`
      );
      return rows.map(rowToMember);
    } catch (error: any) {
      logger.error('MemberRepository.findAll error', { error: error.message });
      return [];
    }
  }

  async findById(id: string): Promise<Member | null> {
    try {
      const row = await db.oneOrNone<MemberRow>('SELECT * FROM members WHERE id = $1', [id]);
      return row ? rowToMember(row) : null;
    } catch (error: any) {
      logger.error('MemberRepository.findById error', { id, error: error.message });
      return null;
    }
  }

  async findByPhone(phone: string): Promise<Member | null> {
    try {
      const normalized = normalizeCostaRicaPhone(phone);
      const hash = hashValue(normalized);
      const row = await db.oneOrNone<MemberRow>(
        'SELECT * FROM members WHERE phone_hash = $1',
        [hash]
      );
      return row ? rowToMember(row) : null;
    } catch (error: any) {
      logger.error('MemberRepository.findByPhone error', {
        phone: maskPhoneNumber(phone),
        error: error.message,
      });
      return null;
    }
  }

  async create(dto: CreateMemberDto): Promise<Member | null> {
    try {
      const normalized = normalizeCostaRicaPhone(dto.phoneNumber);
      const row = await db.one<MemberRow>(
        `INSERT INTO members (full_name, phone_number, phone_hash, email, monthly_amount, due_day, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          dto.fullName,
          encrypt(normalized),
          hashValue(normalized),
          dto.email ?? null,
          dto.monthlyAmount,
          dto.dueDay ?? 1,
          dto.notes ?? null,
        ]
      );
      logger.info('Member created', { id: row.id, name: dto.fullName });
      return rowToMember(row);
    } catch (error: any) {
      if (error.code === '23505') {
        logger.warn('MemberRepository.create: phone already registered', {
          phone: maskPhoneNumber(dto.phoneNumber),
        });
        return null;
      }
      logger.error('MemberRepository.create error', { error: error.message });
      return null;
    }
  }

  async update(id: string, dto: UpdateMemberDto): Promise<Member | null> {
    try {
      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (dto.fullName !== undefined) { updates.push(`full_name = $${idx++}`); values.push(dto.fullName); }
      if (dto.email !== undefined) { updates.push(`email = $${idx++}`); values.push(dto.email); }
      if (dto.monthlyAmount !== undefined) { updates.push(`monthly_amount = $${idx++}`); values.push(dto.monthlyAmount); }
      if (dto.dueDay !== undefined) { updates.push(`due_day = $${idx++}`); values.push(dto.dueDay); }
      if (dto.notes !== undefined) { updates.push(`notes = $${idx++}`); values.push(dto.notes); }
      if (dto.isActive !== undefined) { updates.push(`is_active = $${idx++}`); values.push(dto.isActive); }
      if (dto.phoneNumber !== undefined) {
        const normalized = normalizeCostaRicaPhone(dto.phoneNumber);
        updates.push(`phone_number = $${idx++}`); values.push(encrypt(normalized));
        updates.push(`phone_hash = $${idx++}`); values.push(hashValue(normalized));
      }

      if (updates.length === 0) return this.findById(id);

      updates.push(`updated_at = NOW()`);
      values.push(id);

      const row = await db.oneOrNone<MemberRow>(
        `UPDATE members SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
      );
      return row ? rowToMember(row) : null;
    } catch (error: any) {
      logger.error('MemberRepository.update error', { id, error: error.message });
      return null;
    }
  }

  async deactivate(id: string): Promise<boolean> {
    try {
      const result = await db.result(
        'UPDATE members SET is_active = false, updated_at = NOW() WHERE id = $1',
        [id]
      );
      return result.rowCount === 1;
    } catch (error: any) {
      logger.error('MemberRepository.deactivate error', { id, error: error.message });
      return false;
    }
  }

  async count(): Promise<number> {
    const row = await db.one<{ count: string }>('SELECT COUNT(*) FROM members WHERE is_active = true');
    return parseInt(row.count, 10);
  }
}

export const memberRepository = new MemberRepository();
