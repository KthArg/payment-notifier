import { BaseParser, GmailEmail } from './base.parser';
import { ParsedTransaction } from '../types/transaction.types';
import { logger } from '../utils/logger';

/**
 * Parser for Banco de Costa Rica (BCR) SINPE Móvil emails
 *
 * Email format example:
 * From: alertas@bancobcr.com
 * Subject: Transferencia SINPE recibida
 *
 * Body:
 * Transferencia recibida
 * Monto: ₡50,000.00
 * De: María González
 * Teléfono: 8888-9999
 * Comprobante: BCR-2024-03-04-001
 */
export class BCRParser extends BaseParser {
  private readonly VALID_SENDERS = [
    'alertas@bancobcr.com',
    'notificaciones@bancobcr.com',
    '@bancobcr.com',
    '@bcr.fi.cr',
  ];

  private readonly VALID_SUBJECTS = [
    'SINPE',
    'Transferencia',
    'Pago recibido',
    'Recibiste',
  ];

  getBankName(): string {
    return 'BCR';
  }

  canParse(email: GmailEmail): boolean {
    const fromLower = email.from.toLowerCase();
    const subjectLower = email.subject.toLowerCase();

    const validSender = this.VALID_SENDERS.some(sender =>
      fromLower.includes(sender.toLowerCase())
    );

    const validSubject = this.VALID_SUBJECTS.some(keyword =>
      subjectLower.includes(keyword.toLowerCase())
    );

    return validSender && validSubject;
  }

  parse(email: GmailEmail): ParsedTransaction | null {
    try {
      const content = this.getEmailContent(email);

      logger.debug('Parsing BCR email', {
        emailId: email.id,
        subject: email.subject,
      });

      // Extract transaction data
      const amount = this.extractAmount(content);
      const senderName = this.extractSenderName(content);
      const senderPhone = this.extractPhone(content);
      const reference = this.extractTransactionReference(content);
      const date = this.extractDate(content) || email.date;
      const currency = this.detectCurrency(content);

      // Validate required fields
      if (!amount) {
        logger.warn('BCR parser: No amount found', { emailId: email.id });
        return null;
      }

      if (!reference) {
        logger.warn('BCR parser: No reference found', { emailId: email.id });
        return null;
      }

      const transaction: ParsedTransaction = {
        transactionId: reference,
        amount,
        currency,
        senderName: senderName || undefined,
        senderPhone: senderPhone || undefined,
        transactionDate: date,
        bankName: 'BCR',
        emailMessageId: email.id,
        rawEmailContent: content,
      };

      logger.info('Successfully parsed BCR transaction', {
        transactionId: reference,
        amount,
      });

      return transaction;
    } catch (error) {
      logger.error('Error parsing BCR email:', {
        error,
        emailId: email.id,
      });
      return null;
    }
  }

  /**
   * Extract sender name from BCR email
   * Format: "De: María González" or "Remitente: XXX"
   */
  private extractSenderName(text: string): string | null {
    const patterns = [
      /(?:de|from):\s*([A-Za-zÁ-Źá-ź\s]+?)(?:\n|teléfono|tel|$)/i,
      /remitente:\s*([A-Za-zÁ-Źá-ź\s]+)/i,
      /enviado\s+por:\s*([A-Za-zÁ-Źá-ź\s]+)/i,
    ];

    for (const pattern of patterns) {
      const name = this.extractName(text, pattern);
      if (name) return name;
    }

    return null;
  }

  /**
   * Extract transaction reference from BCR email
   * Format: "Comprobante: BCR-2024-03-04-001" or "Referencia: XXX"
   */
  private extractTransactionReference(text: string): string | null {
    const patterns = [
      /(?:comprobante|voucher)[:\s]+([A-Z0-9-]+)/i,
      /(?:referencia|reference|ref)[:\s]+([A-Z0-9-]+)/i,
      /BCR-\d{4}-\d{2}-\d{2}-\d+/i,
    ];

    return this.extractReference(text, patterns);
  }
}
