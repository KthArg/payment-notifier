import Bottleneck from 'bottleneck';
import { whatsappClient } from '../config/whatsapp';
import { logger } from '../utils/logger';
import { normalizeCostaRicaPhone, maskPhoneNumber } from '../utils/phone-formatter';
import {
  WhatsAppMessageRequest,
  WhatsAppMessageResponse,
  WhatsAppErrorResponse,
  SendNotificationOptions,
  TemplateName,
  SinpeRecibidoTemplateData,
  SinpeErrorTemplateData,
  WhatsAppTemplate,
  TemplateParameter,
} from '../types/whatsapp.types';

/**
 * Service to send WhatsApp notifications using Meta Cloud API
 */
export class WhatsAppService {
  private limiter: Bottleneck;

  constructor() {
    // Rate limiter: 20 messages per second (WhatsApp Cloud API limit is 80/s, using conservative limit)
    this.limiter = new Bottleneck({
      reservoir: 20, // Initial number of tokens
      reservoirRefreshAmount: 20, // Tokens to add
      reservoirRefreshInterval: 1000, // Every 1 second
      maxConcurrent: 5, // Max concurrent requests
    });

    logger.debug('WhatsApp Service initialized with rate limiting');
  }

  /**
   * Send a notification using a template
   * @param options - Notification options
   * @returns WhatsApp message ID or null if failed
   */
  async sendNotification(options: SendNotificationOptions): Promise<string | null> {
    try {
      const { phoneNumber, templateName, templateData } = options;

      // Normalize phone number to WhatsApp format (+506XXXXXXXX)
      const formattedPhone = normalizeCostaRicaPhone(phoneNumber);
      if (!formattedPhone) {
        logger.error('Invalid phone number format', { phoneNumber: maskPhoneNumber(phoneNumber) });
        return null;
      }

      // Build template
      const template = this.buildTemplate(templateName, templateData);

      // Build message request
      const messageRequest: WhatsAppMessageRequest = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'template',
        template,
      };

      // Send with rate limiting
      const messageId = await this.limiter.schedule(() =>
        this.sendMessage(messageRequest, formattedPhone)
      );

      return messageId;
    } catch (error: any) {
      logger.error('Error sending WhatsApp notification', {
        error: error.message,
        templateName: options.templateName,
      });
      return null;
    }
  }

  /**
   * Send a message via WhatsApp API
   * @param request - Message request
   * @param phoneNumber - Recipient phone number (for logging)
   * @returns Message ID
   */
  private async sendMessage(
    request: WhatsAppMessageRequest,
    phoneNumber: string
  ): Promise<string | null> {
    try {
      const endpoint = whatsappClient.getMessagesEndpoint();

      const response = await whatsappClient.getClient().post<WhatsAppMessageResponse>(
        endpoint,
        request
      );

      const messageId = response.data.messages?.[0]?.id;
      const waId = response.data.contacts?.[0]?.wa_id;

      if (!messageId) {
        logger.error('WhatsApp API returned invalid response - missing message ID');
        return null;
      }

      logger.info('WhatsApp message sent successfully', {
        messageId,
        to: maskPhoneNumber(phoneNumber),
        waId,
        templateName: request.template?.name,
      });

      return messageId;
    } catch (error: any) {
      if (error.response?.data) {
        const errorData = error.response.data as WhatsAppErrorResponse;
        logger.error('WhatsApp API error', {
          code: errorData.error.code,
          message: errorData.error.message,
          type: errorData.error.type,
          details: errorData.error.error_data?.details,
          to: maskPhoneNumber(phoneNumber),
        });
      } else {
        logger.error('Failed to send WhatsApp message', {
          error: error.message,
          to: maskPhoneNumber(phoneNumber),
        });
      }
      throw error;
    }
  }

  /**
   * Build a WhatsApp template object
   * @param templateName - Name of the template
   * @param data - Template data
   * @returns WhatsApp template object
   */
  private buildTemplate(
    templateName: TemplateName,
    data: SinpeRecibidoTemplateData | SinpeErrorTemplateData
  ): WhatsAppTemplate {
    let parameters: TemplateParameter[];

    switch (templateName) {
      case 'sinpe_recibido':
        parameters = this.buildSinpeRecibidoParameters(data as SinpeRecibidoTemplateData);
        break;
      case 'sinpe_error':
        parameters = this.buildSinpeErrorParameters(data as SinpeErrorTemplateData);
        break;
      default:
        throw new Error(`Unknown template: ${templateName}`);
    }

    return {
      name: templateName,
      language: {
        code: 'es', // Spanish
      },
      components: [
        {
          type: 'body',
          parameters,
        },
      ],
    };
  }

  /**
   * Build parameters for sinpe_recibido template
   * Template: "Hola {{1}}, has recibido un pago SINPE Móvil..."
   */
  private buildSinpeRecibidoParameters(data: SinpeRecibidoTemplateData): TemplateParameter[] {
    return [
      { type: 'text', text: data.recipientName },    // {{1}}
      { type: 'text', text: data.amount },            // {{2}}
      { type: 'text', text: data.senderName },        // {{3}}
      { type: 'text', text: data.bankName },          // {{4}}
      { type: 'text', text: data.date },              // {{5}}
      { type: 'text', text: data.reference },         // {{6}}
    ];
  }

  /**
   * Build parameters for sinpe_error template
   * Template: "❌ No pudimos procesar una notificación SINPE..."
   */
  private buildSinpeErrorParameters(data: SinpeErrorTemplateData): TemplateParameter[] {
    return [
      { type: 'text', text: data.emailFrom },  // {{1}}
      { type: 'text', text: data.date },       // {{2}}
    ];
  }

  /**
   * Send a simple text message (for testing - requires approved number)
   * @param phoneNumber - Recipient phone number
   * @param message - Message text
   * @returns Message ID or null if failed
   */
  async sendTextMessage(phoneNumber: string, message: string): Promise<string | null> {
    try {
      const formattedPhone = normalizeCostaRicaPhone(phoneNumber);
      if (!formattedPhone) {
        logger.error('Invalid phone number format', { phoneNumber: maskPhoneNumber(phoneNumber) });
        return null;
      }

      const messageRequest: WhatsAppMessageRequest = {
        messaging_product: 'whatsapp',
        to: formattedPhone,
        type: 'text',
        text: {
          preview_url: false,
          body: message,
        },
      };

      const messageId = await this.limiter.schedule(() =>
        this.sendMessage(messageRequest, formattedPhone)
      );

      return messageId;
    } catch (error: any) {
      logger.error('Error sending text message', {
        error: error.message,
        to: maskPhoneNumber(phoneNumber),
      });
      return null;
    }
  }

  /**
   * Format amount with thousands separator
   * @param amount - Amount in number
   * @param currency - Currency code
   * @returns Formatted amount string
   */
  static formatAmount(amount: number, currency: 'CRC' | 'USD' = 'CRC'): string {
    const symbol = currency === 'CRC' ? '₡' : '$';
    const formatted = amount.toLocaleString('es-CR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${symbol}${formatted}`;
  }

  /**
   * Format date for WhatsApp message
   * @param date - Date object
   * @returns Formatted date string (DD/MM/YYYY HH:mm)
   */
  static formatDate(date: Date): string {
    return date.toLocaleString('es-CR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).replace(',', '');
  }

  /**
   * Get rate limiter statistics
   */
  getRateLimiterStats() {
    return {
      running: this.limiter.counts().RUNNING,
      queued: this.limiter.counts().QUEUED,
      executing: this.limiter.counts().EXECUTING,
    };
  }
}

// Export singleton instance
export const whatsappService = new WhatsAppService();
