import { BACParser } from '../../src/parsers/bac.parser';
import { BCRParser } from '../../src/parsers/bcr.parser';
import { BNParser } from '../../src/parsers/bn.parser';
import { ScotiabankParser } from '../../src/parsers/scotiabank.parser';
import { ParserFactory } from '../../src/parsers/parser-factory';
import { GmailEmail } from '../../src/parsers/base.parser';

function makeEmail(overrides: Partial<GmailEmail> & { bodyText?: string } = {}): GmailEmail {
  const { bodyText, ...rest } = overrides;
  return {
    id: 'test-email-id',
    threadId: 'thread-1',
    from: 'notificaciones@bac.cr',
    to: 'kennethjhoana@gmail.com',
    subject: 'Confirmación SINPE Móvil',
    body: {
      text: bodyText ?? 'Has recibido ₡50,000.00 de Juan Pérez (8765-4321)\nReferencia: BAC123456789\nFecha: 04/03/2024 14:32',
    },
    date: new Date('2024-03-04T14:32:00'),
    ...rest,
  };
}

// ─── BAC Parser ───────────────────────────────────────────────────────────────

describe('BACParser', () => {
  const parser = new BACParser();

  describe('canParse()', () => {
    it('returns true for valid BAC email', () => {
      expect(parser.canParse(makeEmail())).toBe(true);
    });

    it('returns false for non-BAC sender', () => {
      expect(parser.canParse(makeEmail({ from: 'alertas@bancobcr.com' }))).toBe(false);
    });

    it('returns false for unrelated subject', () => {
      expect(parser.canParse(makeEmail({ subject: 'Tu estado de cuenta' }))).toBe(false);
    });
  });

  describe('parse()', () => {
    it('parses amount correctly', () => {
      const result = parser.parse(makeEmail());
      expect(result?.amount).toBe(50000);
    });

    it('parses CRC currency', () => {
      const result = parser.parse(makeEmail());
      expect(result?.currency).toBe('CRC');
    });

    it('parses USD currency', () => {
      const result = parser.parse(makeEmail({
        bodyText: 'Has recibido $100.00 de Juan Pérez\nReferencia: BAC987654321',
      }));
      expect(result?.currency).toBe('USD');
    });

    it('parses reference number', () => {
      const result = parser.parse(makeEmail());
      expect(result?.transactionId).toBe('BAC123456789');
    });

    it('parses sender name', () => {
      const result = parser.parse(makeEmail());
      expect(result?.senderName).toBe('Juan Pérez');
    });

    it('returns null when amount is missing', () => {
      const result = parser.parse(makeEmail({
        bodyText: 'Referencia: BAC123456789',
      }));
      expect(result).toBeNull();
    });

    it('returns null when reference is missing', () => {
      const result = parser.parse(makeEmail({
        bodyText: 'Has recibido ₡50,000.00 de Juan Pérez',
      }));
      expect(result).toBeNull();
    });

    it('sets bankName to BAC', () => {
      const result = parser.parse(makeEmail());
      expect(result?.bankName).toBe('BAC');
    });
  });
});

// ─── BCR Parser ───────────────────────────────────────────────────────────────

describe('BCRParser', () => {
  const parser = new BCRParser();

  const bcrEmail = makeEmail({
    from: 'alertas@bancobcr.com',
    subject: 'Transferencia SINPE recibida',
    bodyText: 'Transferencia recibida\nMonto: ₡75,000.00\nDe: María González\nTeléfono: 8888-9999\nComprobante: BCR-2024-03-04-001',
  });

  it('recognizes BCR email', () => {
    expect(parser.canParse(bcrEmail)).toBe(true);
  });

  it('parses amount', () => {
    expect(parser.parse(bcrEmail)?.amount).toBe(75000);
  });

  it('parses reference', () => {
    expect(parser.parse(bcrEmail)?.transactionId).toBe('BCR-2024-03-04-001');
  });

  it('sets bankName to BCR', () => {
    expect(parser.parse(bcrEmail)?.bankName).toBe('BCR');
  });

  it('rejects non-BCR email', () => {
    expect(parser.canParse(makeEmail())).toBe(false);
  });
});

// ─── BN Parser ────────────────────────────────────────────────────────────────

describe('BNParser', () => {
  const parser = new BNParser();

  const bnEmail = makeEmail({
    from: 'sinpe@bncr.fi.cr',
    subject: 'SINPE Móvil recibido',
    bodyText: 'Estimado cliente:\nUsted recibió una transferencia SINPE Móvil\nMonto: ₡25,000.00\nNúmero de referencia: BN12345678901234\nFecha: 04/03/2024',
  });

  it('recognizes BN email', () => {
    expect(parser.canParse(bnEmail)).toBe(true);
  });

  it('parses amount', () => {
    expect(parser.parse(bnEmail)?.amount).toBe(25000);
  });

  it('parses BN reference', () => {
    expect(parser.parse(bnEmail)?.transactionId).toBe('BN12345678901234');
  });

  it('sets bankName to BN', () => {
    expect(parser.parse(bnEmail)?.bankName).toBe('BN');
  });
});

// ─── Scotiabank Parser ────────────────────────────────────────────────────────

describe('ScotiabankParser', () => {
  const parser = new ScotiabankParser();

  const scotiaEmail = makeEmail({
    from: 'alertas@scotiabankcr.com',
    subject: 'SINPE Móvil recibido',
    bodyText: 'Ha recibido una transferencia SINPE\nMonto: ₡30,000.00\nDe: Carlos López\nReferencia: SCO-12345678-ABC123\nFecha: 04/03/2024 10:15',
  });

  it('recognizes Scotiabank email', () => {
    expect(parser.canParse(scotiaEmail)).toBe(true);
  });

  it('parses amount', () => {
    expect(parser.parse(scotiaEmail)?.amount).toBe(30000);
  });

  it('parses Scotiabank reference', () => {
    expect(parser.parse(scotiaEmail)?.transactionId).toBe('SCO-12345678-ABC123');
  });

  it('sets bankName to Scotiabank', () => {
    expect(parser.parse(scotiaEmail)?.bankName).toBe('Scotiabank');
  });
});

// ─── ParserFactory ────────────────────────────────────────────────────────────

describe('ParserFactory', () => {
  const factory = new ParserFactory();

  it('auto-detects BAC email', () => {
    const result = factory.parse(makeEmail());
    expect(result?.bankName).toBe('BAC');
  });

  it('auto-detects BCR email', () => {
    const result = factory.parse(makeEmail({
      from: 'alertas@bancobcr.com',
      subject: 'Transferencia SINPE recibida',
      bodyText: 'Monto: ₡10,000.00\nComprobante: BCR-2024-01-01-001',
    }));
    expect(result?.bankName).toBe('BCR');
  });

  it('returns null for unrecognized email', () => {
    const result = factory.parse(makeEmail({
      from: 'noreply@randombank.com',
      subject: 'Newsletter',
      body: 'Check out our offers!',
    }));
    expect(result).toBeNull();
  });
});
