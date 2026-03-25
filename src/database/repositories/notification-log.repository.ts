import { db } from '../../config/database';
import { logger } from '../../utils/logger';
import { encrypt, decrypt } from '../../utils/encryption';
import { maskPhoneNumber } from '../../utils/phone-formatter';
import { NotificationLog, NotificationStatus } from '../../types/user.types';
import { MessageStatus } from '../../types/whatsapp.types';

/**
 * Raw row from the notification_logs table
 */
interface NotificationLogRow {
  id: string;
  transaction_id: string;
  user_id: string | null;
  whatsapp_message_id: string | null;
  phone_number: string;
  template_name: string;
  status: NotificationStatus;
  delivery_status: any;
  error_message: string | null;
  retry_count: number;
  max_retries: number;
  sent_at: Date | null;
  delivered_at: Date | null;
  read_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function rowToLog(row: NotificationLogRow): NotificationLog {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    userId: row.user_id ?? undefined,
    whatsappMessageId: row.whatsapp_message_id ?? undefined,
    phoneNumber: decrypt(row.phone_number),
    templateName: row.template_name,
    status: row.status,
    deliveryStatus: row.delivery_status,
    errorMessage: row.error_message ?? undefined,
    retryCount: row.retry_count,
    sentAt: row.sent_at ?? undefined,
    deliveredAt: row.delivered_at ?? undefined,
    readAt: row.read_at ?? undefined,
    createdAt: row.created_at,
  };
}

export class NotificationLogRepository {
  /**
   * Create a new notification log entry when a WhatsApp message is sent.
   */
  async create(data: {
    transactionId: string;
    userId?: string;
    whatsappMessageId?: string;
    phoneNumber: string;
    templateName: string;
  }): Promise<NotificationLog | null> {
    try {
      const row = await db.one<NotificationLogRow>(
        `INSERT INTO notification_logs
           (transaction_id, user_id, whatsapp_message_id, phone_number, template_name, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          data.transactionId,
          data.userId ?? null,
          data.whatsappMessageId ?? null,
          encrypt(data.phoneNumber),
          data.templateName,
          data.whatsappMessageId ? 'sent' : 'pending',
        ]
      );

      logger.info('Notification log created', {
        id: row.id,
        transactionId: data.transactionId,
        phone: maskPhoneNumber(data.phoneNumber),
        template: data.templateName,
        waMessageId: data.whatsappMessageId,
      });

      return rowToLog(row);
    } catch (error: any) {
      logger.error('NotificationLogRepository.create error', { error: error.message });
      return null;
    }
  }

  /**
   * Find a log entry by WhatsApp message ID.
   * Used by the webhook handler to update delivery status.
   */
  async findByWhatsAppMessageId(waMessageId: string): Promise<NotificationLog | null> {
    try {
      const row = await db.oneOrNone<NotificationLogRow>(
        'SELECT * FROM notification_logs WHERE whatsapp_message_id = $1',
        [waMessageId]
      );
      return row ? rowToLog(row) : null;
    } catch (error: any) {
      logger.error('NotificationLogRepository.findByWhatsAppMessageId error', {
        waMessageId,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Update delivery status from a WhatsApp webhook event.
   */
  async updateDeliveryStatus(
    waMessageId: string,
    status: MessageStatus,
    timestamp: Date,
    deliveryPayload?: any,
    errorMessage?: string
  ): Promise<boolean> {
    try {
      const updates: Record<string, any> = { status, delivery_status: deliveryPayload };

      if (status === 'sent')      updates['sent_at']      = timestamp;
      if (status === 'delivered') updates['delivered_at'] = timestamp;
      if (status === 'read')      updates['read_at']      = timestamp;
      if (errorMessage)           updates['error_message'] = errorMessage;

      const setClauses = Object.keys(updates)
        .map((key, i) => `${key} = $${i + 2}`)
        .join(', ');

      const result = await db.result(
        `UPDATE notification_logs
         SET ${setClauses}
         WHERE whatsapp_message_id = $1`,
        [waMessageId, ...Object.values(updates)]
      );

      if (result.rowCount > 0) {
        logger.info('Notification delivery status updated', {
          waMessageId,
          status,
        });
      }

      return result.rowCount > 0;
    } catch (error: any) {
      logger.error('NotificationLogRepository.updateDeliveryStatus error', {
        waMessageId,
        status,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Get failed notifications that can still be retried.
   */
  async findRetryable(): Promise<NotificationLog[]> {
    try {
      const rows = await db.any<NotificationLogRow>(
        `SELECT * FROM notification_logs
         WHERE status = 'failed' AND retry_count < max_retries
         ORDER BY updated_at ASC`
      );
      return rows.map(rowToLog);
    } catch (error: any) {
      logger.error('NotificationLogRepository.findRetryable error', { error: error.message });
      return [];
    }
  }

  /**
   * Increment retry count after a failed send attempt.
   */
  async incrementRetry(id: string, errorMessage: string): Promise<boolean> {
    try {
      const result = await db.result(
        `UPDATE notification_logs
         SET retry_count = retry_count + 1,
             error_message = $2,
             status = CASE
               WHEN retry_count + 1 >= max_retries THEN 'failed'
               ELSE status
             END
         WHERE id = $1`,
        [id, errorMessage]
      );
      return result.rowCount === 1;
    } catch (error: any) {
      logger.error('NotificationLogRepository.incrementRetry error', { id, error: error.message });
      return false;
    }
  }

  /**
   * Get all logs for a transaction (for admin view).
   */
  async findByTransactionId(transactionId: string): Promise<NotificationLog[]> {
    try {
      const rows = await db.any<NotificationLogRow>(
        'SELECT * FROM notification_logs WHERE transaction_id = $1 ORDER BY created_at DESC',
        [transactionId]
      );
      return rows.map(rowToLog);
    } catch (error: any) {
      logger.error('NotificationLogRepository.findByTransactionId error', { transactionId, error: error.message });
      return [];
    }
  }
}

export const notificationLogRepository = new NotificationLogRepository();
