import { BaseParser, GmailEmail } from './base.parser';
import { ParsedTransaction } from '../types/transaction.types';
import { logger } from '../utils/logger';

/**
 * Parser for Banco Nacional (BN) SINPE Móvil emails
 *
 * Email format example:
 * From: sinpe@bncr.fi.cr
 * Subject: SINPE Móvil - Pago recibido
 *
 * Body:
 * PAGO RECIBIDO
 * Colones: 50,000.00
 * Desde: Carlos Ramírez (6543-2109)
 * Ref: BN20240304143210
 * Hora: 04/03/2024 2:32 PM
 */
export class BNParser extends BaseParser {
  private readonly VALID_SENDERS = [
    'sinpe@bncr.fi.cr',
    'notificaciones@bncr.fi.cr',
    '@bncr.fi.cr',
    '@bn.cr',
  ];

  private readonly VALID_SUBJECTS = [
    'SINPE',
    'Pago recibido',
    'Transferencia',
    'Recibiste',
  ];

  getBankName(): string {
    return 'BN';
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

      logger.debug('Parsing BN email', {
        emailId: email.id,
        subject: email.subject,
      });

      // Extract transaction data
      const amount = this.extractBNAmount(content);
      const senderName = this.extractSenderName(content);
      const senderPhone = this.extractPhone(content);
      const reference = this.extractTransactionReference(content);
      const date = this.extractDate(content) || email.date;
      const currency = this.detectCurrency(content);

      // Validate required fields
      if (!amount) {
        logger.warn('BN parser: No amount found', { emailId: email.id });
        return null;
      }

      if (!reference) {
        logger.warn('BN parser: No reference found', { emailId: email.id });
        return null;
      }

      const transaction: ParsedTransaction = {
        transactionId: reference,
        amount,
        currency,
        senderName: senderName || undefined,
        senderPhone: senderPhone || undefined,
        transactionDate: date,
        bankName: 'BN',
        emailMessageId: email.id,
        rawEmailContent: content,
      };

      logger.info('Successfully parsed BN transaction', {
        transactionId: reference,
        amount,
      });

      return transaction;
    } catch (error) {
      logger.error('Error parsing BN email:', {
        error,
        emailId: email.id,
      });
      return null;
    }
  }

  /**
   * Extract amount from BN email
   * Format: "Colones: 50,000.00" or "Dólares: 100.00"
   */
  private extractBNAmount(text: string): number | null {
    // Try specific BN patterns first
    const colonesMatch = text.match(/colones:\s*([\d,]+\.?\d*)/i);
    if (colonesMatch) {
      return parseFloat(colonesMatch[1].replace(/,/g, ''));
    }

    const dolaresMatch = text.match(/(?:dólares|dolares|usd):\s*([\d,]+\.?\d*)/i);
    if (dolaresMatch) {
      return parseFloat(dolaresMatch[1].replace(/,/g, ''));
    }

    // Fallback to base method
    return this.extractAmount(text);
  }

  /**
   * Extract sender name from BN email
   * Format: "Desde: Carlos Ramírez (6543-2109)" or "De: XXX"
   */
  private extractSenderName(text: string): string | null {
    const patterns = [
      /desde:\s*([A-Za-zÁ-Źá-ź\s]+)\s*\(/i,
      /(?:de|from):\s*([A-Za-zÁ-Źá-ź\s]+)/i,
      /remitente:\s*([A-Za-zÁ-Źá-ź\s]+)/i,
    ];

    for (const pattern of patterns) {
      const name = this.extractName(text, pattern);
      if (name) return name;
    }

    return null;
  }

  /**
   * Extract transaction reference from BN email
   * Format: "Ref: BN20240304143210" or "Referencia: XXX"
   */
  private extractTransactionReference(text: string): string | null {
    const patterns = [
      /(?:ref|referencia)[:\s]+([A-Z0-9]+)/i,
      /(BN\d{14})/i,
      /(?:comprobante|código)[:\s]+([A-Z0-9-]+)/i,
    ];

    return this.extractReference(text, patterns);
  }
}
