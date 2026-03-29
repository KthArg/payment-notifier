import { BaseParser, GmailEmail } from './base.parser';
import { BACParser } from './bac.parser';
import { BCRParser } from './bcr.parser';
import { BNParser } from './bn.parser';
import { ScotiabankParser } from './scotiabank.parser';
import { ParsedTransaction } from '../types/transaction.types';
import { logger } from '../utils/logger';
// ⚠️  TEST ONLY — remove this import before deploying to production
import { TestBankParser } from './test.parser';

/**
 * Factory class to automatically select the correct parser for an email
 */
export class ParserFactory {
  private parsers: BaseParser[];

  constructor() {
    // Initialize all available parsers
    this.parsers = [
      new BACParser(),
      new BCRParser(),
      new BNParser(),
      new ScotiabankParser(),
      // ⚠️  TEST ONLY — remove before production
      new TestBankParser(),
    ];

    logger.info('Parser Factory initialized', {
      availableParsers: this.parsers.map(p => p.getBankName()),
    });
  }

  /**
   * Find the appropriate parser for an email
   * @param email - Email to parse
   * @returns The parser that can handle this email, or null if none found
   */
  getParser(email: GmailEmail): BaseParser | null {
    for (const parser of this.parsers) {
      if (parser.canParse(email)) {
        logger.debug('Found matching parser', {
          bank: parser.getBankName(),
          emailId: email.id,
          from: email.from,
          subject: email.subject,
        });
        return parser;
      }
    }

    logger.warn('No parser found for email', {
      emailId: email.id,
      from: email.from,
      subject: email.subject,
    });

    return null;
  }

  /**
   * Parse an email automatically
   * @param email - Email to parse
   * @returns Parsed transaction or null if unable to parse
   */
  parse(email: GmailEmail): ParsedTransaction | null {
    const parser = this.getParser(email);

    if (!parser) {
      logger.warn('Cannot parse email - no suitable parser found', {
        emailId: email.id,
        from: email.from,
        subject: email.subject,
      });
      return null;
    }

    try {
      const result = parser.parse(email);

      if (result) {
        logger.info('Successfully parsed email', {
          bank: parser.getBankName(),
          transactionId: result.transactionId,
          amount: result.amount,
        });
      } else {
        logger.warn('Parser returned null', {
          bank: parser.getBankName(),
          emailId: email.id,
        });
      }

      return result;
    } catch (error) {
      logger.error('Error during parsing', {
        bank: parser.getBankName(),
        emailId: email.id,
        error,
      });
      return null;
    }
  }

  /**
   * Register a new custom parser
   * @param parser - Parser instance to register
   */
  registerParser(parser: BaseParser): void {
    this.parsers.push(parser);
    logger.info('New parser registered', {
      bank: parser.getBankName(),
      totalParsers: this.parsers.length,
    });
  }

  /**
   * Get list of all available banks
   * @returns Array of bank names
   */
  getAvailableBanks(): string[] {
    return this.parsers.map(p => p.getBankName());
  }

  /**
   * Get parser by bank name
   * @param bankName - Name of the bank
   * @returns Parser instance or null if not found
   */
  getParserByBank(bankName: string): BaseParser | null {
    return this.parsers.find(p => p.getBankName() === bankName) || null;
  }
}

// Export singleton instance
export const parserFactory = new ParserFactory();
