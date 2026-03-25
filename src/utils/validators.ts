import { z } from 'zod';

/**
 * Schema for Costa Rica phone numbers
 * Format: +50612345678
 */
export const phoneNumberSchema = z
  .string()
  .regex(/^\+506\d{8}$/, 'Invalid Costa Rica phone number format (+50612345678)');

/**
 * Schema for validating parsed transactions
 */
export const parsedTransactionSchema = z.object({
  transactionId: z
    .string()
    .min(5, 'Transaction ID must be at least 5 characters')
    .max(100, 'Transaction ID must be less than 100 characters'),

  amount: z
    .number()
    .positive('Amount must be positive')
    .max(999999999, 'Amount too large'),

  currency: z.enum(['CRC', 'USD'], {
    message: 'Currency must be CRC or USD',
  }),

  senderName: z
    .string()
    .max(255, 'Sender name too long')
    .optional(),

  senderPhone: phoneNumberSchema.optional(),

  receiverName: z
    .string()
    .max(255, 'Receiver name too long')
    .optional(),

  receiverPhone: phoneNumberSchema.optional(),

  referenceNumber: z
    .string()
    .max(100, 'Reference number too long')
    .optional(),

  transactionDate: z.date({
    message: 'Invalid transaction date',
  }),

  bankName: z.enum(['BAC', 'BCR', 'BN', 'Scotiabank', 'Davivienda'], {
    message: 'Invalid bank name',
  }),

  emailMessageId: z.string().optional(),

  rawEmailContent: z.string().optional(),
});

/**
 * Schema for user creation
 */
export const createUserSchema = z.object({
  phoneNumber: phoneNumberSchema,

  fullName: z
    .string()
    .min(1, 'Name is required')
    .max(255, 'Name too long')
    .optional(),

  email: z
    .string()
    .email('Invalid email format')
    .optional(),

  bankAccounts: z
    .array(
      z.object({
        bank: z.string(),
        account: z.string(),
      })
    )
    .optional(),
});

/**
 * Schema for user update
 */
export const updateUserSchema = z.object({
  fullName: z.string().max(255).optional(),
  email: z.string().email().optional(),
  bankAccounts: z
    .array(
      z.object({
        bank: z.string(),
        account: z.string(),
      })
    )
    .optional(),
  isActive: z.boolean().optional(),
  notificationPreferences: z
    .object({
      enabled: z.boolean(),
      language: z.enum(['es', 'en']),
    })
    .optional(),
});

/**
 * Helper function to validate and parse data
 */
export function validateParsedTransaction(data: unknown) {
  return parsedTransactionSchema.parse(data);
}

/**
 * Safe validation that returns errors instead of throwing
 */
export function safeParsedTransaction(data: unknown) {
  return parsedTransactionSchema.safeParse(data);
}
