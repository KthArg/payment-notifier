import { ParsedTransaction } from '../types/transaction.types';
import { normalizeCostaRicaPhone } from '../utils/phone-formatter';
import { logger } from '../utils/logger';

/**
 * Email structure from Gmail API
 */
export interface GmailEmail {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: Date;
  body: {
    text?: string;
    html?: string;
  };
  raw?: string;
}

/**
 * Base abstract class for all bank parsers
 * Each bank must implement their own parsing logic
 */
export abstract class BaseParser {
  /**
   * Check if this parser can handle the given email
   * @param email - Email to check
   * @returns true if this parser can parse the email
   */
  abstract canParse(email: GmailEmail): boolean;

  /**
   * Parse the email and extract transaction data
   * @param email - Email to parse
   * @returns Parsed transaction or null if parsing fails
   */
  abstract parse(email: GmailEmail): ParsedTransaction | null;

  /**
   * Get the bank name for this parser
   */
  abstract getBankName(): string;

  /**
   * Helper: Extract amount from text (supports ₡ and $ symbols)
   * Examples: "₡50,000.00" -> 50000, "$100.50" -> 100.50
   */
  protected extractAmount(text: string): number | null {
    try {
      // Try colones first (₡)
      const colonesMatch = text.match(/₡\s*([\d,]+\.?\d*)/);
      if (colonesMatch) {
        return parseFloat(colonesMatch[1].replace(/,/g, ''));
      }

      // Try dollars ($)
      const dollarMatch = text.match(/\$\s*([\d,]+\.?\d*)/);
      if (dollarMatch) {
        return parseFloat(dollarMatch[1].replace(/,/g, ''));
      }

      // Try plain numbers
      const plainMatch = text.match(/(?:monto|amount)[:\s]+([\d,]+\.?\d*)/i);
      if (plainMatch) {
        return parseFloat(plainMatch[1].replace(/,/g, ''));
      }

      return null;
    } catch (error) {
      logger.error('Error extracting amount:', error);
      return null;
    }
  }

  /**
   * Helper: Extract phone number from text
   * Formats: "8765-4321", "8765 4321", "+506 8765 4321", "(506) 8765-4321"
   */
  protected extractPhone(text: string): string | null {
    try {
      // Pattern for Costa Rica phone numbers
      const patterns = [
        /(?:\+?506)?[\s-]?(\d{4})[\s-]?(\d{4})/,
        /\(506\)[\s-]?(\d{4})[\s-]?(\d{4})/,
        /(\d{4})[\s-](\d{4})/,
      ];

      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          const phone = match[1] + match[2];
          return normalizeCostaRicaPhone(phone);
        }
      }

      return null;
    } catch (error) {
      logger.debug('Error extracting phone:', error);
      return null;
    }
  }

  /**
   * Helper: Extract date from text
   * Formats: "04/03/2024 14:32", "2024-03-04 14:32:00"
   */
  protected extractDate(text: string): Date | null {
    try {
      // Format: DD/MM/YYYY HH:MM
      const ddmmyyyyMatch = text.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
      if (ddmmyyyyMatch) {
        const [, day, month, year, hour, minute] = ddmmyyyyMatch;
        return new Date(
          parseInt(year),
          parseInt(month) - 1,
          parseInt(day),
          parseInt(hour),
          parseInt(minute)
        );
      }

      // Format: YYYY-MM-DD HH:MM:SS
      const iso8601Match = text.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
      if (iso8601Match) {
        return new Date(iso8601Match[0]);
      }

      // Fallback to email date
      return null;
    } catch (error) {
      logger.debug('Error extracting date:', error);
      return null;
    }
  }

  /**
   * Helper: Extract reference/transaction ID from text
   */
  protected extractReference(text: string, patterns: RegExp[]): string | null {
    try {
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          return match[1].trim();
        }
      }
      return null;
    } catch (error) {
      logger.debug('Error extracting reference:', error);
      return null;
    }
  }

  /**
   * Helper: Extract name from text
   */
  protected extractName(text: string, pattern: RegExp): string | null {
    try {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
      return null;
    } catch (error) {
      logger.debug('Error extracting name:', error);
      return null;
    }
  }

  /**
   * Helper: Clean HTML tags from text
   */
  protected stripHtml(html: string): string {
    return html
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Helper: Get email content (prefer text, fallback to HTML)
   */
  protected getEmailContent(email: GmailEmail): string {
    if (email.body.text) {
      return email.body.text;
    }
    if (email.body.html) {
      return this.stripHtml(email.body.html);
    }
    return '';
  }

  /**
   * Helper: Detect currency from text
   */
  protected detectCurrency(text: string): 'CRC' | 'USD' {
    if (text.includes('₡') || text.toLowerCase().includes('colones')) {
      return 'CRC';
    }
    if (text.includes('$') || text.toLowerCase().includes('dolares') || text.toLowerCase().includes('usd')) {
      return 'USD';
    }
    // Default to CRC for Costa Rica
    return 'CRC';
  }
}
