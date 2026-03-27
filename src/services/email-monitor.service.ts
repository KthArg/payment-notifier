import { gmail } from '../config/gmail';
import { GmailEmail } from '../parsers/base.parser';
import { logger } from '../utils/logger';

/**
 * Service to monitor Gmail inbox for SINPE emails
 */
export class EmailMonitorService {
  private readonly SINPE_QUERY = 'subject:(SINPE OR SINPEMOVIL OR "SINPE Móvil" OR transferencia OR "pago recibido") is:unread';
  private readonly MAX_RESULTS = 10;

  /**
   * Fetch new unread SINPE emails from Gmail
   * @returns Array of parsed email objects
   */
  async fetchNewEmails(): Promise<GmailEmail[]> {
    try {
      logger.debug('Fetching new SINPE emails from Gmail');

      // List messages matching query
      const listResponse = await gmail.users.messages.list({
        userId: 'me',
        q: this.SINPE_QUERY,
        maxResults: this.MAX_RESULTS,
      });

      const messages = listResponse.data.messages || [];

      if (messages.length === 0) {
        logger.debug('No new SINPE emails found');
        return [];
      }

      logger.info(`Found ${messages.length} new SINPE email(s)`);

      // Fetch full email details for each message
      const emails = await Promise.all(
        messages.map(msg => this.getEmailDetails(msg.id!))
      );

      return emails.filter((email): email is GmailEmail => email !== null);
    } catch (error: any) {
      logger.error('Error fetching emails from Gmail:', {
        error: error.message,
        code: error.code,
      });
      throw error;
    }
  }

  /**
   * Get full details of a specific email
   * @param messageId - Gmail message ID
   * @returns Parsed email object or null if error
   */
  private async getEmailDetails(messageId: string): Promise<GmailEmail | null> {
    try {
      const response = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const message = response.data;
      const headers = message.payload?.headers || [];

      // Extract headers
      const getHeader = (name: string) =>
        headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

      const from = getHeader('From');
      const to = getHeader('To');
      const subject = getHeader('Subject');
      const dateStr = getHeader('Date');

      // Parse email body
      const { text, html } = this.extractEmailBody(message.payload);

      const email: GmailEmail = {
        id: message.id!,
        threadId: message.threadId!,
        from,
        to,
        subject,
        date: dateStr ? new Date(dateStr) : new Date(),
        body: {
          text,
          html,
        },
        raw: message.raw || undefined,
      };

      logger.debug('Retrieved email details', {
        id: email.id,
        from: email.from,
        subject: email.subject,
      });

      return email;
    } catch (error: any) {
      logger.error('Error getting email details:', {
        messageId,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Extract text and HTML body from email payload
   */
  private extractEmailBody(payload: any): { text?: string; html?: string } {
    let text: string | undefined;
    let html: string | undefined;

    if (payload.mimeType === 'text/plain' && payload.body?.data) {
      text = this.decodeBase64(payload.body.data);
    } else if (payload.mimeType === 'text/html' && payload.body?.data) {
      html = this.decodeBase64(payload.body.data);
    } else if (payload.parts) {
      // Multipart email
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          text = this.decodeBase64(part.body.data);
        } else if (part.mimeType === 'text/html' && part.body?.data) {
          html = this.decodeBase64(part.body.data);
        } else if (part.parts) {
          // Nested parts
          const nested = this.extractEmailBody(part);
          text = text || nested.text;
          html = html || nested.html;
        }
      }
    }

    return { text, html };
  }

  /**
   * Decode base64url encoded string
   */
  private decodeBase64(data: string): string {
    try {
      // Gmail uses base64url encoding (- instead of +, _ instead of /)
      const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
      return Buffer.from(base64, 'base64').toString('utf-8');
    } catch (error) {
      logger.error('Error decoding base64:', error);
      return '';
    }
  }

  /**
   * Mark an email as read
   * @param messageId - Gmail message ID
   */
  async markAsRead(messageId: string): Promise<void> {
    try {
      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD'],
        },
      });

      logger.debug('Marked email as read', { messageId });
    } catch (error: any) {
      logger.error('Error marking email as read:', {
        messageId,
        error: error.message,
      });
    }
  }

  /**
   * Add a label to an email
   * @param messageId - Gmail message ID
   * @param label - Label to add (e.g., 'PROCESSED', 'FAILED')
   */
  async addLabel(messageId: string, label: string): Promise<void> {
    try {
      // First, check if label exists, create if not
      const labelsResponse = await gmail.users.labels.list({ userId: 'me' });
      const labels = labelsResponse.data.labels || [];

      let labelId = labels.find(l => l.name === label)?.id;

      if (!labelId) {
        // Create label
        const createResponse = await gmail.users.labels.create({
          userId: 'me',
          requestBody: {
            name: label,
            labelListVisibility: 'labelShow',
            messageListVisibility: 'show',
          },
        });
        labelId = createResponse.data.id!;
        logger.info('Created new Gmail label', { label, labelId });
      }

      // Add label to message
      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: [labelId],
        },
      });

      logger.debug('Added label to email', { messageId, label });
    } catch (error: any) {
      logger.error('Error adding label to email:', {
        messageId,
        label,
        error: error.message,
      });
    }
  }
}

// Export singleton instance
export const emailMonitorService = new EmailMonitorService();
