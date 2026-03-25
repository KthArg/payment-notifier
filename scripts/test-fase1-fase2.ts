/**
 * Test script for FASE 1 and FASE 2
 * Run with: npx ts-node scripts/test-fase1-fase2.ts
 */
import { env } from '../src/config/environment';
import { logger } from '../src/utils/logger';
import { encrypt, decrypt, hashValue, buildDedupHash } from '../src/utils/encryption';
import {
  normalizeCostaRicaPhone,
  maskPhoneNumber,
  isValidCostaRicaPhone,
  formatPhoneForDisplay,
} from '../src/utils/phone-formatter';
import { testDatabaseConnection, db } from '../src/config/database';
import { testRedisConnection } from '../src/config/redis';
import { parserFactory } from '../src/parsers/parser-factory';
import { safeParsedTransaction } from '../src/utils/validators';
import { GmailEmail } from '../src/parsers/base.parser';

// ─── Helpers ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err: any) {
    console.log(`  ❌ ${name} → ${err.message}`);
    failed++;
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

function assertEqual(a: any, b: any, msg?: string) {
  if (a !== b) throw new Error(`${msg || 'assertEqual'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function assertNotNull(v: any, msg?: string) {
  if (v === null || v === undefined) throw new Error(`${msg || 'assertNotNull'}: value is ${v}`);
}

// ─── Sample emails for parser tests ─────────────────────────────────────────

const BAC_EMAIL: GmailEmail = {
  id: 'bac-test-001',
  threadId: 'thread-001',
  from: 'notificaciones@bac.cr',
  to: 'test@gmail.com',
  subject: 'Confirmación SINPE Móvil',
  date: new Date('2024-03-04T14:32:00'),
  body: {
    text: `Has recibido ₡50,000.00 de Juan Pérez (8765-4321)
Referencia: BAC123456789
Fecha: 04/03/2024 14:32`,
  },
};

const BCR_EMAIL: GmailEmail = {
  id: 'bcr-test-001',
  threadId: 'thread-002',
  from: 'alertas@bancobcr.com',
  to: 'test@gmail.com',
  subject: 'Transferencia SINPE recibida',
  date: new Date('2024-03-04T10:00:00'),
  body: {
    text: `Transferencia recibida
Monto: ₡25,000.00
De: María González
Teléfono: 8888-9999
Comprobante: BCR-2024-03-04-001`,
  },
};

const BN_EMAIL: GmailEmail = {
  id: 'bn-test-001',
  threadId: 'thread-003',
  from: 'sinpe@bncr.fi.cr',
  to: 'test@gmail.com',
  subject: 'SINPE Móvil - Pago recibido',
  date: new Date('2024-03-04T09:15:00'),
  body: {
    text: `PAGO RECIBIDO
Colones: 75,000.00
Desde: Carlos Ramírez (6543-2109)
Ref: BN20240304091500
Hora: 04/03/2024 09:15`,
  },
};

const SCOTIABANK_EMAIL: GmailEmail = {
  id: 'sco-test-001',
  threadId: 'thread-004',
  from: 'notifica@scotiabankcr.com',
  to: 'test@gmail.com',
  subject: 'Alerta SINPE',
  date: new Date('2024-03-04T16:45:00'),
  body: {
    text: `Recibiste un pago SINPE:
₡30,000 de Ana López
Tel: +506 7777-8888
Código: SCO-20240304-XYZ`,
  },
};

const UNKNOWN_EMAIL: GmailEmail = {
  id: 'unk-test-001',
  threadId: 'thread-005',
  from: 'noreply@somebank.com',
  to: 'test@gmail.com',
  subject: 'Newsletter mensual',
  date: new Date(),
  body: { text: 'Contenido irrelevante' },
};

// ─── FASE 1 Tests ────────────────────────────────────────────────────────────

async function testFase1() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  FASE 1: Setup inicial y configuración');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // ── Environment Config ──
  console.log('  📋 Environment Config:');
  test('env.NODE_ENV is defined', () => assertNotNull(env.NODE_ENV, 'NODE_ENV'));
  test('env.PORT is a number', () => assert(typeof env.PORT === 'number', `PORT should be number, got ${typeof env.PORT}`));
  test('env.DATABASE_URL starts with postgresql://', () => assert(env.DATABASE_URL.startsWith('postgresql://'), 'Invalid DATABASE_URL'));
  test('env.REDIS_URL starts with redis', () => assert(env.REDIS_URL.startsWith('redis'), 'Invalid REDIS_URL'));
  test('env.ENCRYPTION_KEY is 64 chars', () => assertEqual(env.ENCRYPTION_KEY.length, 64, 'ENCRYPTION_KEY length'));
  test('env.JWT_SECRET min 32 chars', () => assert(env.JWT_SECRET.length >= 32, 'JWT_SECRET too short'));

  // ── Encryption ──
  console.log('\n  🔐 Encryption:');
  test('encrypt returns iv:tag:data format', () => {
    const enc = encrypt('test');
    const parts = enc.split(':');
    assertEqual(parts.length, 3, 'Encrypted parts count');
  });
  test('decrypt(encrypt(x)) === x', () => {
    const original = '+50612345678';
    assertEqual(decrypt(encrypt(original)), original, 'Round-trip');
  });
  test('encrypt produces different output each time', () => {
    const enc1 = encrypt('same');
    const enc2 = encrypt('same');
    assert(enc1 !== enc2, 'Should produce different IVs');
  });
  test('hashValue is deterministic', () => {
    assertEqual(hashValue('abc'), hashValue('abc'), 'Same input same hash');
  });
  test('hashValue differs for different inputs', () => {
    assert(hashValue('abc') !== hashValue('xyz'), 'Different inputs different hashes');
  });
  test('buildDedupHash is deterministic', () => {
    const d = new Date('2024-03-04T14:32:00Z');
    const h1 = buildDedupHash('TXN001', 'BAC', 50000, d);
    const h2 = buildDedupHash('TXN001', 'BAC', 50000, d);
    assertEqual(h1, h2, 'Dedup hash round-trip');
  });
  test('buildDedupHash differs for different transactions', () => {
    const d = new Date('2024-03-04T14:32:00Z');
    const h1 = buildDedupHash('TXN001', 'BAC', 50000, d);
    const h2 = buildDedupHash('TXN002', 'BAC', 50000, d);
    assert(h1 !== h2, 'Different txn same hash');
  });

  // ── Phone Formatter ──
  console.log('\n  📱 Phone Formatter:');
  test('normalizes 8765-4321 → +50687654321', () => {
    assertEqual(normalizeCostaRicaPhone('8765-4321'), '+50687654321');
  });
  test('normalizes 87654321 → +50687654321', () => {
    assertEqual(normalizeCostaRicaPhone('87654321'), '+50687654321');
  });
  test('normalizes +50687654321 → +50687654321 (idempotent)', () => {
    assertEqual(normalizeCostaRicaPhone('+50687654321'), '+50687654321');
  });
  test('maskPhoneNumber returns ****-XXXX format', () => {
    const masked = maskPhoneNumber('+50687654321');
    assert(masked.includes('****'), `Mask should contain ****: ${masked}`);
  });
  test('isValidCostaRicaPhone rejects invalid number', () => {
    assert(!isValidCostaRicaPhone('12345'), 'Short number should be invalid');
  });
  test('isValidCostaRicaPhone accepts valid number', () => {
    assert(isValidCostaRicaPhone('87654321'), '8-digit number should be valid');
  });
  test('formatPhoneForDisplay → XXXX-XXXX', () => {
    const display = formatPhoneForDisplay('87654321');
    assert(display.includes('-'), `Display should have dash: ${display}`);
    assertEqual(display, '8765-4321');
  });

  // ── Database ──
  console.log('\n  🗄️  Database:');
  const dbConnected = await testDatabaseConnection();
  test('database connection succeeds', () => assert(dbConnected, 'DB not connected'));
  if (dbConnected) {
    test('db.one returns expected row', async () => {
      const row = await db.one<{ val: number }>('SELECT 1 AS val');
      assertEqual(row.val, 1, 'SELECT 1');
    });
  }

  // ── Redis ──
  console.log('\n  🔴 Redis:');
  const redisConnected = await testRedisConnection();
  test('redis connection succeeds', () => assert(redisConnected, 'Redis not connected'));
}

// ─── FASE 2 Tests ────────────────────────────────────────────────────────────

async function testFase2() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  FASE 2: Parsers y Email Monitor');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // ── Parser Factory ──
  console.log('  🏭 Parser Factory:');
  test('factory has 4 parsers: BAC, BCR, BN, Scotiabank', () => {
    const banks = parserFactory.getAvailableBanks();
    assertEqual(banks.length, 4, 'Parser count');
    assert(banks.includes('BAC'), 'Has BAC');
    assert(banks.includes('BCR'), 'Has BCR');
    assert(banks.includes('BN'), 'Has BN');
    assert(banks.includes('Scotiabank'), 'Has Scotiabank');
  });
  test('getParser returns null for unknown email', () => {
    const parser = parserFactory.getParser(UNKNOWN_EMAIL);
    assert(parser === null, 'Should return null for unknown');
  });

  // ── BAC Parser ──
  console.log('\n  🏦 BAC Parser:');
  test('canParse returns true for BAC email', () => {
    const parser = parserFactory.getParser(BAC_EMAIL);
    assertNotNull(parser, 'No parser found');
    assertEqual(parser!.getBankName(), 'BAC', 'Wrong parser');
  });
  const bacTx = parserFactory.parse(BAC_EMAIL);
  test('BAC parse returns non-null transaction', () => assertNotNull(bacTx, 'BAC tx is null'));
  test('BAC amount = 50000', () => assertEqual(bacTx?.amount, 50000, 'BAC amount'));
  test('BAC currency = CRC', () => assertEqual(bacTx?.currency, 'CRC', 'BAC currency'));
  test('BAC bankName = BAC', () => assertEqual(bacTx?.bankName, 'BAC', 'BAC bankName'));
  test('BAC senderName contains "Juan Pérez"', () => {
    assert(bacTx?.senderName?.includes('Juan') ?? false, `senderName: ${bacTx?.senderName}`);
  });
  test('BAC transactionId extracted', () => assertNotNull(bacTx?.transactionId, 'BAC transactionId'));
  test('BAC date parsed correctly', () => assertNotNull(bacTx?.transactionDate, 'BAC date'));

  // ── BCR Parser ──
  console.log('\n  🏦 BCR Parser:');
  test('canParse returns true for BCR email', () => {
    const parser = parserFactory.getParser(BCR_EMAIL);
    assertNotNull(parser, 'No parser found');
    assertEqual(parser!.getBankName(), 'BCR', 'Wrong parser');
  });
  const bcrTx = parserFactory.parse(BCR_EMAIL);
  test('BCR parse returns non-null transaction', () => assertNotNull(bcrTx, 'BCR tx is null'));
  test('BCR amount = 25000', () => assertEqual(bcrTx?.amount, 25000, 'BCR amount'));
  test('BCR currency = CRC', () => assertEqual(bcrTx?.currency, 'CRC', 'BCR currency'));
  test('BCR senderName extracted', () => assertNotNull(bcrTx?.senderName, 'BCR senderName'));
  test('BCR transactionId extracted', () => assertNotNull(bcrTx?.transactionId, 'BCR transactionId'));

  // ── BN Parser ──
  console.log('\n  🏦 BN Parser:');
  test('canParse returns true for BN email', () => {
    const parser = parserFactory.getParser(BN_EMAIL);
    assertNotNull(parser, 'No parser found');
    assertEqual(parser!.getBankName(), 'BN', 'Wrong parser');
  });
  const bnTx = parserFactory.parse(BN_EMAIL);
  test('BN parse returns non-null transaction', () => assertNotNull(bnTx, 'BN tx is null'));
  test('BN amount = 75000', () => assertEqual(bnTx?.amount, 75000, 'BN amount'));
  test('BN senderName extracted', () => assertNotNull(bnTx?.senderName, 'BN senderName'));
  test('BN transactionId extracted', () => assertNotNull(bnTx?.transactionId, 'BN transactionId'));

  // ── Scotiabank Parser ──
  console.log('\n  🏦 Scotiabank Parser:');
  test('canParse returns true for Scotiabank email', () => {
    const parser = parserFactory.getParser(SCOTIABANK_EMAIL);
    assertNotNull(parser, 'No parser found');
    assertEqual(parser!.getBankName(), 'Scotiabank', 'Wrong parser');
  });
  const scoTx = parserFactory.parse(SCOTIABANK_EMAIL);
  test('Scotiabank parse returns non-null transaction', () => assertNotNull(scoTx, 'Scotiabank tx is null'));
  test('Scotiabank amount = 30000', () => assertEqual(scoTx?.amount, 30000, 'Scotiabank amount'));
  test('Scotiabank senderName extracted', () => assertNotNull(scoTx?.senderName, 'Scotiabank senderName'));
  test('Scotiabank transactionId extracted', () => assertNotNull(scoTx?.transactionId, 'Scotiabank transactionId'));

  // ── Validators ──
  console.log('\n  ✅ Validators:');
  test('valid transaction passes schema', () => {
    if (!bacTx) return;
    const result = safeParsedTransaction(bacTx);
    assert(result.success, `Validation failed: ${JSON.stringify(result.error?.issues)}`);
  });
  test('rejects transaction with negative amount', () => {
    const result = safeParsedTransaction({ ...bacTx, amount: -100 });
    assert(!result.success, 'Should reject negative amount');
  });
  test('rejects transaction with invalid currency', () => {
    const result = safeParsedTransaction({ ...bacTx, currency: 'EUR' });
    assert(!result.success, 'Should reject EUR currency');
  });
  test('rejects transaction with invalid bank', () => {
    const result = safeParsedTransaction({ ...bacTx, bankName: 'Davivienda_Fake' });
    assert(!result.success, 'Should reject unknown bank');
  });
  test('phone regex validates +50687654321', () => {
    const result = safeParsedTransaction({ ...bacTx, senderPhone: '+50687654321' });
    assert(result.success, `Should accept valid CR phone: ${JSON.stringify(result.error?.issues)}`);
  });
  test('phone regex rejects invalid format', () => {
    const result = safeParsedTransaction({ ...bacTx, senderPhone: '12345' });
    assert(!result.success, 'Should reject short phone');
  });
}

// ─── Summary ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║        SINPE Notifier - Test FASE 1 & FASE 2               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  await testFase1();
  await testFase2();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (failed > 0) process.exit(1);

  db.$pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n💥 Unexpected error:', err.message);
  process.exit(1);
});
