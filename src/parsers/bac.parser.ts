import { BaseParser, GmailEmail } from './base.parser';
import { ParsedTransaction } from '../types/transaction.types';
import { logger } from '../utils/logger';

/**
 * Parser for BAC Credomatic SINPE Móvil emails
 *
 * Email format example:
 * From: notificaciones@bac.cr
 * Subject: Confirmación SINPE Móvil
 *
 * Body:
 * Has recibido ₡50,000.00 de Juan Pérez (8765-4321)
 * Referencia: BAC123456789
 * Fecha: 04/03/2024 14:32
 */
export class BACParser extends BaseParser {
  private readonly VALID_SENDERS = [
    'notificaciones@bac.cr',
    'alertas@bac.cr',
    '@bac.cr',
    '@baccredomatic.com',
  ];

  private readonly VALID_SUBJECTS = [
    'SINPE',
    'SINPE Móvil',
    'SINPE Movil',
    'Transferencia',
    'Pago recibido',
  ];

  getBankName(): string {
    return 'BAC';
  }

  canParse(email: GmailEmail): boolean {
    const fromLower = email.from.toLowerCase();
    const subjectLower = email.subject.toLowerCase();

    // Check sender
    const validSender = this.VALID_SENDERS.some(sender =>
      fromLower.includes(sender.toLowerCase())
    );

    // Check subject contains SINPE or related keywords
    const validSubject = this.VALID_SUBJECTS.some(keyword =>
      subjectLower.includes(keyword.toLowerCase())
    );

    return validSender && validSubject;
  }

  parse(email: GmailEmail): ParsedTransaction | null {
    try {
      const content = this.getEmailContent(email);

      logger.debug('Parsing BAC email', {
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
        logger.warn('BAC parser: No amount found', { emailId: email.id });
        return null;
      }

      if (!reference) {
        logger.warn('BAC parser: No reference found', { emailId: email.id });
        return null;
      }

      const transaction: ParsedTransaction = {
        transactionId: reference,
        amount,
        currency,
        senderName: senderName || undefined,
        senderPhone: senderPhone || undefined,
        transactionDate: date,
        bankName: 'BAC',
        emailMessageId: email.id,
        rawEmailContent: content,
      };

      logger.info('Successfully parsed BAC transaction', {
        transactionId: reference,
        amount,
      });

      return transaction;
    } catch (error) {
      logger.error('Error parsing BAC email:', {
        error,
        emailId: email.id,
      });
      return null;
    }
  }

  /**
   * Extract sender name from BAC email
   * Format: "Has recibido ... de Juan Pérez (8765-4321)"
   */
  private extractSenderName(text: string): string | null {
    const patterns = [
      /(?:has\s+recibido|recibiste).*?de\s+([A-Za-zÁ-Źá-ź\s]+)\s*\(/i,
      /(?:de|from):\s*([A-Za-zÁ-Źá-ź\s]+)/i,
      /remitente:\s*([A-Za-zÁ-Źá-ź\s]+)/i,
    ];

    return this.extractName(text, patterns[0]) ||
           this.extractName(text, patterns[1]) ||
           this.extractName(text, patterns[2]);
  }

  /**
   * Extract transaction reference from BAC email
   * Format: "Referencia: BAC123456789" or "Ref: XXX" or "Comprobante: XXX"
   */
  private extractTransactionReference(text: string): string | null {
    const patterns = [
      /(?:referencia|reference|ref)[:\s]+([A-Z0-9-]+)/i,
      /(?:comprobante|voucher)[:\s]+([A-Z0-9-]+)/i,
      /(BAC[0-9]{9,})/i,
    ];

    return this.extractReference(text, patterns);
  }
}
