export interface ParsedTransaction {
  transactionId: string;
  amount: number;
  currency: 'CRC' | 'USD';
  senderName?: string;
  senderPhone?: string;
  receiverName?: string;
  receiverPhone?: string;
  referenceNumber?: string;
  transactionDate: Date;
  bankName: 'BAC' | 'BCR' | 'BN' | 'Scotiabank' | 'Davivienda';
  emailMessageId?: string;
  rawEmailContent?: string;
}

export interface Transaction extends ParsedTransaction {
  id: string;
  userId?: string;
  status: 'pending' | 'processed' | 'failed';
  processedAt: Date;
  createdAt: Date;
}

export type TransactionStatus = Transaction['status'];
export type BankName = ParsedTransaction['bankName'];
export type Currency = ParsedTransaction['currency'];
