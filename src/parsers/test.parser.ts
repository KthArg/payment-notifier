// ⚠️  TEST ONLY — REMOVE BEFORE PRODUCTION
// Simulates a bank email sent from arayakenneth513@gmail.com
import { BaseParser, GmailEmail } from './base.parser';
import { ParsedTransaction } from '../types/transaction.types';
import { logger } from '../utils/logger';

export class TestBankParser extends BaseParser {
  private readonly TEST_SENDER = 'arayakenneth513@gmail.com';

  getBankName(): string {
    return 'TestBank';
  }

  canParse(email: GmailEmail): boolean {
    return email.from.toLowerCase().includes(this.TEST_SENDER);
  }

  parse(email: GmailEmail): ParsedTransaction | null {
    try {
      const content = this.getEmailContent(email);

      const amount    = this.extractAmount(content);
      const senderName  = this.extractName(content, /De:\s*([A-Za-zÁ-Źá-ź\s]+?)(?:\n|Teléfono|$)/i);
      const senderPhone = this.extractPhone(content);
      const reference   = this.extractReference(content, [/(?:Comprobante|Ref)[:\s]+([A-Z0-9-]+)/i]);
      const date        = this.extractDate(content) || email.date;
      const currency    = this.detectCurrency(content);

      if (!amount || !reference) {
        logger.warn('TestBank parser: missing required fields', { emailId: email.id });
        return null;
      }

      logger.info('TestBank: parsed test transaction', { reference, amount });

      return {
        transactionId: reference,
        amount,
        currency,
        senderName:  senderName  ?? undefined,
        senderPhone: senderPhone ?? undefined,
        transactionDate: date,
        bankName: 'TestBank',
        emailMessageId: email.id,
        rawEmailContent: content,
      };
    } catch (error) {
      logger.error('TestBank parser error', { error, emailId: email.id });
      return null;
    }
  }
}
