export interface User {
  id: string;
  phoneNumber: string;
  fullName?: string;
  email?: string;
  bankAccounts?: BankAccount[];
  isActive: boolean;
  notificationPreferences: NotificationPreferences;
  createdAt: Date;
  updatedAt: Date;
}

export interface BankAccount {
  bank: string;
  account: string;
}

export interface NotificationPreferences {
  enabled: boolean;
  language: 'es' | 'en';
}

export interface CreateUserDto {
  phoneNumber: string;
  fullName?: string;
  email?: string;
  bankAccounts?: BankAccount[];
}

export interface UpdateUserDto {
  fullName?: string;
  email?: string;
  bankAccounts?: BankAccount[];
  isActive?: boolean;
  notificationPreferences?: NotificationPreferences;
}

export interface NotificationLog {
  id: string;
  transactionId: string;
  userId?: string;
  whatsappMessageId?: string;
  phoneNumber: string;
  templateName: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  deliveryStatus?: any;
  errorMessage?: string;
  retryCount: number;
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  createdAt: Date;
}

export type NotificationStatus = NotificationLog['status'];
