import { BaseParser, GmailEmail } from './base.parser';
import { ParsedTransaction } from '../types/transaction.types';
import { logger } from '../utils/logger';

/**
 * Parser for Scotiabank Costa Rica SINPE Móvil emails
 *
 * Email format example:
 * From: notifica@scotiabankcr.com
 * Subject: Alerta SINPE
 *
 * Body:
 * Recibiste un pago SINPE:
 * ₡50,000 de Ana López
 * Tel: +506 7777-8888
 * Código: SCO-20240304-XYZ
 */
export class ScotiabankParser extends BaseParser {
  private readonly VALID_SENDERS = [
    'notifica@scotiabankcr.com',
    'alertas@scotiabankcr.com',
    '@scotiabankcr.com',
    '@scotiabank.com',
  ];

  private readonly VALID_SUBJECTS = [
    'SINPE',
    'Alerta',
    'Pago',
    'Transferencia',
    'Recibiste',
  ];

  getBankName(): string {
    return 'Scotiabank';
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

      logger.debug('Parsing Scotiabank email', {
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
        logger.warn('Scotiabank parser: No amount found', { emailId: email.id });
        return null;
      }

      if (!reference) {
        logger.warn('Scotiabank parser: No reference found', { emailId: email.id });
        return null;
      }

      const transaction: ParsedTransaction = {
        transactionId: reference,
        amount,
        currency,
        senderName: senderName || undefined,
        senderPhone: senderPhone || undefined,
        transactionDate: date,
        bankName: 'Scotiabank',
        emailMessageId: email.id,
        rawEmailContent: content,
      };

      logger.info('Successfully parsed Scotiabank transaction', {
        transactionId: reference,
        amount,
      });

      return transaction;
    } catch (error) {
      logger.error('Error parsing Scotiabank email:', {
        error,
        emailId: email.id,
      });
      return null;
    }
  }

  /**
   * Extract sender name from Scotiabank email
   * Format: "₡50,000 de Ana López" or "De: XXX"
   */
  private extractSenderName(text: string): string | null {
    const patterns = [
      /(?:₡|colones|\$)\s*[\d,]+\.?\d*\s+de\s+([A-Za-zÁ-Źá-ź\s]+)/i,
      /(?:de|from):\s*([A-Za-zÁ-Źá-ź\s]+)/i,
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
   * Extract transaction reference from Scotiabank email
   * Format: "Código: SCO-20240304-XYZ" or "Referencia: XXX"
   */
  private extractTransactionReference(text: string): string | null {
    const patterns = [
      /(?:código|code)[:\s]+([A-Z0-9-]+)/i,
      /(?:referencia|reference|ref)[:\s]+([A-Z0-9-]+)/i,
      /(SCO-\d{8}-[A-Z0-9]+)/i,
      /(?:comprobante|voucher)[:\s]+([A-Z0-9-]+)/i,
    ];

    return this.extractReference(text, patterns);
  }
}
