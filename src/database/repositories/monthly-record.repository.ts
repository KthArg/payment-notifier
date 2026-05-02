import { db } from '../../config/database';
import { logger } from '../../utils/logger';
import { MonthlyRecord, MonthlyRecordWithMember, MonthlyReportStats, PaymentStatus } from '../../types/member.types';
import { decrypt } from '../../utils/encryption';

interface MonthlyRecordRow {
  id: string;
  member_id: string;
  month: number;
  year: number;
  amount_due: string;
  amount_paid: string | null;
  transaction_id: string | null;
  status: PaymentStatus;
  paid_at: Date | null;
  reminder_sent_at: Date | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

interface MonthlyRecordWithMemberRow extends MonthlyRecordRow {
  member_full_name: string;
  member_phone_number: string;
  member_email: string | null;
}

function rowToRecord(row: MonthlyRecordRow): MonthlyRecord {
  return {
    id: row.id,
    memberId: row.member_id,
    month: row.month,
    year: row.year,
    amountDue: parseFloat(row.amount_due),
    amountPaid: row.amount_paid ? parseFloat(row.amount_paid) : undefined,
    transactionId: row.transaction_id ?? undefined,
    status: row.status,
    paidAt: row.paid_at ?? undefined,
    reminderSentAt: row.reminder_sent_at ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToRecordWithMember(row: MonthlyRecordWithMemberRow): MonthlyRecordWithMember {
  return {
    ...rowToRecord(row),
    member: {
      id: row.member_id,
      fullName: row.member_full_name,
      phoneNumber: decrypt(row.member_phone_number),
      email: row.member_email ?? undefined,
    },
  };
}

export class MonthlyRecordRepository {
  /** Find or create a monthly record for a member in a given month/year */
  async findOrCreate(memberId: string, month: number, year: number, amountDue: number): Promise<MonthlyRecord> {
    const existing = await this.findByMemberAndPeriod(memberId, month, year);
    if (existing) return existing;

    const row = await db.one<MonthlyRecordRow>(
      `INSERT INTO monthly_records (member_id, month, year, amount_due)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [memberId, month, year, amountDue]
    );
    return rowToRecord(row);
  }

  async findByMemberAndPeriod(memberId: string, month: number, year: number): Promise<MonthlyRecord | null> {
    try {
      const row = await db.oneOrNone<MonthlyRecordRow>(
        'SELECT * FROM monthly_records WHERE member_id = $1 AND month = $2 AND year = $3',
        [memberId, month, year]
      );
      return row ? rowToRecord(row) : null;
    } catch (error: any) {
      logger.error('MonthlyRecordRepository.findByMemberAndPeriod error', { error: error.message });
      return null;
    }
  }

  /** Mark a record as paid */
  async markPaid(
    id: string,
    opts: { amountPaid: number; transactionId?: string; status: 'paid_on_time' | 'paid_late'; paidAt: Date; notes?: string }
  ): Promise<MonthlyRecord | null> {
    try {
      const row = await db.oneOrNone<MonthlyRecordRow>(
        `UPDATE monthly_records
         SET amount_paid = $1, transaction_id = $2, status = $3, paid_at = $4,
             notes = COALESCE($6, notes), updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [opts.amountPaid, opts.transactionId ?? null, opts.status, opts.paidAt, id, opts.notes ?? null]
      );
      return row ? rowToRecord(row) : null;
    } catch (error: any) {
      logger.error('MonthlyRecordRepository.markPaid error', { id, error: error.message });
      return null;
    }
  }

  /** Find a record by ID */
  async findById(id: string): Promise<MonthlyRecord | null> {
    try {
      const row = await db.oneOrNone<MonthlyRecordRow>('SELECT * FROM monthly_records WHERE id = $1', [id]);
      return row ? rowToRecord(row) : null;
    } catch (error: any) {
      logger.error('MonthlyRecordRepository.findById error', { id, error: error.message });
      return null;
    }
  }

  /** Mark pending records as overdue (called at start of next month) */
  async markOverdue(month: number, year: number): Promise<number> {
    try {
      const result = await db.result(
        `UPDATE monthly_records SET status = 'overdue', updated_at = NOW()
         WHERE month = $1 AND year = $2 AND status = 'pending'`,
        [month, year]
      );
      return result.rowCount;
    } catch (error: any) {
      logger.error('MonthlyRecordRepository.markOverdue error', { error: error.message });
      return 0;
    }
  }

  /** Record that a reminder was sent */
  async markReminderSent(id: string): Promise<void> {
    await db.none(
      'UPDATE monthly_records SET reminder_sent_at = NOW(), updated_at = NOW() WHERE id = $1',
      [id]
    );
  }

  /** Get all records for a month/year with member info (for reports) */
  async findByPeriod(month: number, year: number): Promise<MonthlyRecordWithMember[]> {
    try {
      const rows = await db.any<MonthlyRecordWithMemberRow>(
        `SELECT mr.*,
                m.full_name AS member_full_name,
                m.phone_number AS member_phone_number,
                m.email AS member_email
         FROM monthly_records mr
         JOIN members m ON m.id = mr.member_id
         WHERE mr.month = $1 AND mr.year = $2
         ORDER BY m.full_name ASC`,
        [month, year]
      );
      return rows.map(rowToRecordWithMember);
    } catch (error: any) {
      logger.error('MonthlyRecordRepository.findByPeriod error', { error: error.message });
      return [];
    }
  }

  /** Get pending records for active members approaching due date (for reminders) */
  async findPendingForReminder(dueDay: number, month: number, year: number): Promise<MonthlyRecordWithMember[]> {
    try {
      const rows = await db.any<MonthlyRecordWithMemberRow>(
        `SELECT mr.*,
                m.full_name AS member_full_name,
                m.phone_number AS member_phone_number,
                m.email AS member_email
         FROM monthly_records mr
         JOIN members m ON m.id = mr.member_id
         WHERE mr.month = $1 AND mr.year = $2
           AND mr.status = 'pending'
           AND mr.reminder_sent_at IS NULL
           AND m.due_day = $3
           AND m.is_active = true`,
        [month, year, dueDay]
      );
      return rows.map(rowToRecordWithMember);
    } catch (error: any) {
      logger.error('MonthlyRecordRepository.findPendingForReminder error', { error: error.message });
      return [];
    }
  }

  /** Get member's full payment history */
  async findByMember(memberId: string, limit = 12): Promise<MonthlyRecord[]> {
    try {
      const rows = await db.any<MonthlyRecordRow>(
        `SELECT * FROM monthly_records
         WHERE member_id = $1
         ORDER BY year DESC, month DESC
         LIMIT $2`,
        [memberId, limit]
      );
      return rows.map(rowToRecord);
    } catch (error: any) {
      logger.error('MonthlyRecordRepository.findByMember error', { error: error.message });
      return [];
    }
  }

  /** Aggregate stats for a month (for report summary) */
  async getStats(month: number, year: number): Promise<MonthlyReportStats> {
    try {
      const row = await db.one<{
        total: string; paid_on_time: string; paid_late: string;
        overdue: string; pending: string;
        total_collected: string; total_outstanding: string;
      }>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'paid_on_time') AS paid_on_time,
           COUNT(*) FILTER (WHERE status = 'paid_late')    AS paid_late,
           COUNT(*) FILTER (WHERE status = 'overdue')      AS overdue,
           COUNT(*) FILTER (WHERE status = 'pending')      AS pending,
           COALESCE(SUM(amount_paid) FILTER (WHERE status IN ('paid_on_time','paid_late')), 0) AS total_collected,
           COALESCE(SUM(amount_due)  FILTER (WHERE status IN ('pending','overdue')), 0) AS total_outstanding
         FROM monthly_records
         WHERE month = $1 AND year = $2`,
        [month, year]
      );
      return {
        month, year,
        totalMembers: parseInt(row.total),
        paidOnTime: parseInt(row.paid_on_time),
        paidLate: parseInt(row.paid_late),
        overdue: parseInt(row.overdue),
        pending: parseInt(row.pending),
        totalCollected: parseFloat(row.total_collected),
        totalOutstanding: parseFloat(row.total_outstanding),
      };
    } catch (error: any) {
      logger.error('MonthlyRecordRepository.getStats error', { error: error.message });
      return { month, year, totalMembers: 0, paidOnTime: 0, paidLate: 0, overdue: 0, pending: 0, totalCollected: 0, totalOutstanding: 0 };
    }
  }

  /** Bulk-create pending records for all active members at start of month */
  async generateForMonth(month: number, year: number): Promise<number> {
    try {
      const result = await db.result(
        `INSERT INTO monthly_records (member_id, month, year, amount_due)
         SELECT id, $1, $2, monthly_amount
         FROM members
         WHERE is_active = true
         ON CONFLICT (member_id, month, year) DO NOTHING`,
        [month, year]
      );
      logger.info('Monthly records generated', { month, year, count: result.rowCount });
      return result.rowCount;
    } catch (error: any) {
      logger.error('MonthlyRecordRepository.generateForMonth error', { error: error.message });
      return 0;
    }
  }
}

export const monthlyRecordRepository = new MonthlyRecordRepository();
