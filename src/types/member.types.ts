export interface Member {
  id: string;
  fullName: string;
  phoneNumber: string;      // decrypted
  email?: string;
  monthlyAmount: number;
  dueDay: number;           // 1-28
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMemberDto {
  fullName: string;
  phoneNumber: string;
  email?: string;
  monthlyAmount: number;
  dueDay?: number;
  notes?: string;
}

export interface UpdateMemberDto {
  fullName?: string;
  phoneNumber?: string;
  email?: string;
  monthlyAmount?: number;
  dueDay?: number;
  notes?: string;
  isActive?: boolean;
}

export type PaymentStatus = 'pending' | 'paid_on_time' | 'paid_late' | 'overdue';

export interface MonthlyRecord {
  id: string;
  memberId: string;
  month: number;
  year: number;
  amountDue: number;
  amountPaid?: number;
  transactionId?: string;
  status: PaymentStatus;
  paidAt?: Date;
  reminderSentAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MonthlyRecordWithMember extends MonthlyRecord {
  member: Pick<Member, 'id' | 'fullName' | 'phoneNumber' | 'email'>;
}

export interface MonthlyReportStats {
  month: number;
  year: number;
  totalMembers: number;
  paidOnTime: number;
  paidLate: number;
  overdue: number;
  pending: number;
  totalCollected: number;
  totalOutstanding: number;
}
