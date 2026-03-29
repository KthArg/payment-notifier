import { db } from '../../config/database';
import { logger } from '../../utils/logger';
import { SinpeNameMapping, SinpeNameMappingWithMember } from '../../types/sinpe-mapping.types';

interface MappingRow {
  id: string;
  sender_name: string;
  sender_name_display: string;
  member_id: string | null;
  is_ambiguous: boolean;
  created_at: Date;
  updated_at: Date;
}

interface MappingWithMemberRow extends MappingRow {
  member_name: string | null;
}

function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

function rowToMapping(row: MappingRow): SinpeNameMapping {
  return {
    id: row.id,
    senderName: row.sender_name,
    senderNameDisplay: row.sender_name_display,
    memberId: row.member_id,
    isAmbiguous: row.is_ambiguous,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMappingWithMember(row: MappingWithMemberRow): SinpeNameMappingWithMember {
  return { ...rowToMapping(row), memberName: row.member_name ?? undefined };
}

export class SinpeNameMappingRepository {
  /** Look up a mapping by sender name (normalizes before searching). */
  async findByName(name: string): Promise<SinpeNameMapping | null> {
    try {
      const row = await db.oneOrNone<MappingRow>(
        'SELECT * FROM sinpe_name_mappings WHERE sender_name = $1',
        [normalizeName(name)]
      );
      return row ? rowToMapping(row) : null;
    } catch (error: any) {
      logger.error('SinpeNameMappingRepository.findByName error', { error: error.message });
      return null;
    }
  }

  /** Get all mappings joined with member name. */
  async findAll(): Promise<SinpeNameMappingWithMember[]> {
    try {
      const rows = await db.any<MappingWithMemberRow>(`
        SELECT snm.*, m.full_name AS member_name
        FROM sinpe_name_mappings snm
        LEFT JOIN members m ON m.id = snm.member_id
        ORDER BY snm.created_at DESC
      `);
      return rows.map(rowToMappingWithMember);
    } catch (error: any) {
      logger.error('SinpeNameMappingRepository.findAll error', { error: error.message });
      return [];
    }
  }

  /** Get unlinked mappings (pending admin action). */
  async findPending(): Promise<SinpeNameMappingWithMember[]> {
    try {
      const rows = await db.any<MappingWithMemberRow>(`
        SELECT snm.*, NULL::text AS member_name
        FROM sinpe_name_mappings snm
        WHERE snm.member_id IS NULL AND snm.is_ambiguous = false
        ORDER BY snm.created_at DESC
      `);
      return rows.map(rowToMappingWithMember);
    } catch (error: any) {
      logger.error('SinpeNameMappingRepository.findPending error', { error: error.message });
      return [];
    }
  }

  /** Count by status for dashboard badge. */
  async countPending(): Promise<number> {
    try {
      const row = await db.one<{ count: string }>(
        `SELECT COUNT(*) FROM sinpe_name_mappings WHERE member_id IS NULL AND is_ambiguous = false`
      );
      return parseInt(row.count, 10);
    } catch {
      return 0;
    }
  }

  /**
   * Register a new sender name (called by worker when name is first seen).
   * If the name already exists, returns the existing mapping without modifying it.
   */
  async register(nameDisplay: string): Promise<SinpeNameMapping | null> {
    try {
      const normalized = normalizeName(nameDisplay);
      const row = await db.one<MappingRow>(`
        INSERT INTO sinpe_name_mappings (sender_name, sender_name_display)
        VALUES ($1, $2)
        ON CONFLICT (sender_name) DO UPDATE SET updated_at = NOW()
        RETURNING *
      `, [normalized, nameDisplay]);
      return rowToMapping(row);
    } catch (error: any) {
      logger.error('SinpeNameMappingRepository.register error', { error: error.message });
      return null;
    }
  }

  /** Link a mapping to a member. Clears ambiguous flag. */
  async linkToMember(id: string, memberId: string): Promise<SinpeNameMapping | null> {
    try {
      const row = await db.oneOrNone<MappingRow>(`
        UPDATE sinpe_name_mappings
        SET member_id = $2, is_ambiguous = false, updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [id, memberId]);
      return row ? rowToMapping(row) : null;
    } catch (error: any) {
      logger.error('SinpeNameMappingRepository.linkToMember error', { error: error.message });
      return null;
    }
  }

  /** Mark a name as ambiguous (multiple real members share it). Clears member link. */
  async markAmbiguous(id: string): Promise<boolean> {
    try {
      const result = await db.result(`
        UPDATE sinpe_name_mappings
        SET is_ambiguous = true, member_id = NULL, updated_at = NOW()
        WHERE id = $1
      `, [id]);
      return result.rowCount === 1;
    } catch (error: any) {
      logger.error('SinpeNameMappingRepository.markAmbiguous error', { error: error.message });
      return false;
    }
  }

  /** Revert ambiguous back to pending (unlinked, not ambiguous). */
  async revertAmbiguous(id: string): Promise<boolean> {
    try {
      const result = await db.result(`
        UPDATE sinpe_name_mappings
        SET is_ambiguous = false, member_id = NULL, updated_at = NOW()
        WHERE id = $1
      `, [id]);
      return result.rowCount === 1;
    } catch (error: any) {
      logger.error('SinpeNameMappingRepository.revertAmbiguous error', { error: error.message });
      return false;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await db.result('DELETE FROM sinpe_name_mappings WHERE id = $1', [id]);
      return result.rowCount === 1;
    } catch (error: any) {
      logger.error('SinpeNameMappingRepository.delete error', { error: error.message });
      return false;
    }
  }
}

export const sinpeNameMappingRepository = new SinpeNameMappingRepository();
