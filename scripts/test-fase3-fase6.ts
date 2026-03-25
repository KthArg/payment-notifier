/**
 * Test script for FASE 3 to FASE 6
 * Run with: npx ts-node scripts/test-fase3-fase6.ts
 *
 * Covers:
 *   FASE 3 - WhatsApp connection & service
 *   FASE 4 - Database repositories (Users, Transactions, NotificationLogs)
 *   FASE 5 - BullMQ queue (enqueue, stats, retry config)
 *   FASE 6 - REST API (auth, users, transactions, notifications, queue)
 */

import http from 'http';
import { db } from '../src/config/database';
import { testWhatsAppConnection } from '../src/config/whatsapp';
import { enqueueTransaction, getQueueStats, transactionQueue, closeQueue } from '../src/queues/transaction.queue';
import { UserRepository } from '../src/database/repositories/user.repository';
import { TransactionRepository } from '../src/database/repositories/transaction.repository';
import { NotificationLogRepository } from '../src/database/repositories/notification-log.repository';
import { createApp } from '../src/app';
import { ParsedTransaction } from '../src/types/transaction.types';

// ─── Test harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
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

// ─── HTTP helper ──────────────────────────────────────────────────────────────

const TEST_PORT = 3999;
const BASE_URL = `http://localhost:${TEST_PORT}`;

function httpRequest(opts: {
  method: string;
  path: string;
  body?: object;
  token?: string;
}): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const payload = opts.body ? JSON.stringify(opts.body) : undefined;
    const options: http.RequestOptions = {
      hostname: 'localhost',
      port: TEST_PORT,
      path: opts.path,
      method: opts.method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 0, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode || 0, body: data });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─── Dynamic test data (unique per run) ──────────────────────────────────────

const RUN_ID = Date.now();
// Use last 8 digits of timestamp as unique phone suffix (must start with 6,7,8)
const REPO_TEST_PHONE = `+5068${String(RUN_ID).slice(-7)}`;
const API_TEST_PHONE  = `+5067${String(RUN_ID).slice(-7)}`;

const SAMPLE_TX: ParsedTransaction = {
  transactionId: `TEST-${RUN_ID}`,
  bankName: 'BAC',
  amount: 50000,
  currency: 'CRC',
  senderName: 'Juan Pérez',
  senderPhone: '+50687654321',
  receiverName: 'Kenneth',
  receiverPhone: '+50688887777',
  transactionDate: new Date(),
  emailMessageId: 'test-email-001',
};

// ─── FASE 3: WhatsApp ─────────────────────────────────────────────────────────

async function testFase3() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  FASE 3: WhatsApp Cloud API');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('  📱 WhatsApp Connection:');
  await test('connects to WhatsApp API successfully', async () => {
    const connected = await testWhatsAppConnection();
    assert(connected, 'WhatsApp connection failed');
  });

  console.log('\n  📋 WhatsApp Service:');
  await test('WhatsApp service module loads without errors', async () => {
    const { WhatsAppService } = await import('../src/services/whatsapp.service');
    assertNotNull(WhatsAppService, 'WhatsApp service is null');
  });
  await test('WhatsAppService can be instantiated', async () => {
    const { WhatsAppService } = await import('../src/services/whatsapp.service');
    const svc = new WhatsAppService();
    assertNotNull(svc, 'WhatsApp service instance is null');
  });
}

// ─── FASE 4: Repositories ─────────────────────────────────────────────────────

async function testFase4() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  FASE 4: Database Repositories');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const userRepo = new UserRepository();
  const transactionRepo = new TransactionRepository();
  const notificationLogRepo = new NotificationLogRepository();

  let createdUserId: string | null = null;
  let createdTransactionId: string | null = null;

  // ── User Repository ──
  console.log('  👤 UserRepository:');

  await test('create user with phone number', async () => {
    const user = await userRepo.create({
      phoneNumber: REPO_TEST_PHONE,
      fullName: 'Test User FASE7',
      email: 'test-fase7@example.com',
    });
    assertNotNull(user, 'create returned null');
    assertNotNull(user!.id, 'User id missing');
    assertEqual(user!.fullName, 'Test User FASE7', 'fullName mismatch');
    createdUserId = user!.id;
  });

  await test('findById returns created user', async () => {
    if (!createdUserId) throw new Error('No user created yet');
    const user = await userRepo.findById(createdUserId);
    assertNotNull(user, 'User not found by id');
    assertEqual(user!.id, createdUserId, 'ID mismatch');
  });

  await test('findByPhone returns created user', async () => {
    const user = await userRepo.findByPhone(REPO_TEST_PHONE);
    assertNotNull(user, 'User not found by phone');
  });

  await test('findAllActive returns array', async () => {
    const users = await userRepo.findAllActive();
    assert(Array.isArray(users), 'findAllActive should return array');
  });

  await test('update user fullName', async () => {
    if (!createdUserId) throw new Error('No user created yet');
    const updated = await userRepo.update(createdUserId, { fullName: 'Updated FASE7' });
    assertNotNull(updated, 'Update returned null');
    assertEqual(updated!.fullName, 'Updated FASE7', 'fullName not updated');
  });

  await test('count returns a number', async () => {
    const count = await userRepo.count();
    assert(typeof count === 'number', `count should be number, got ${typeof count}`);
    assert(count >= 1, 'count should be >= 1');
  });

  await test('duplicate phone returns null', async () => {
    const result = await userRepo.create({ phoneNumber: REPO_TEST_PHONE });
    assert(result === null, 'Should return null for duplicate phone');
  });

  // ── Transaction Repository ──
  console.log('\n  💳 TransactionRepository:');

  await test('isDuplicate returns false for new transaction', async () => {
    const isDup = await transactionRepo.isDuplicate(SAMPLE_TX);
    assert(!isDup, 'Should not be a duplicate');
  });

  await test('create transaction', async () => {
    const tx = await transactionRepo.create(SAMPLE_TX, createdUserId || undefined);
    assertNotNull(tx, 'create returned null');
    assertNotNull(tx!.id, 'Transaction id missing');
    assertEqual(tx!.bankName, 'BAC', 'bankName mismatch');
    createdTransactionId = tx!.id;
  });

  await test('isDuplicate returns true for same transaction', async () => {
    const isDup = await transactionRepo.isDuplicate(SAMPLE_TX);
    assert(isDup, 'Should be a duplicate now');
  });

  await test('findPending returns array', async () => {
    const pending = await transactionRepo.findPending();
    assert(Array.isArray(pending), 'findPending should return array');
  });

  await test('findByUserId returns array', async () => {
    if (!createdUserId) throw new Error('No user created yet');
    const txs = await transactionRepo.findByUserId(createdUserId);
    assert(Array.isArray(txs), 'findByUserId should return array');
  });

  await test('countByDateRange returns number', async () => {
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const to = new Date();
    const count = await transactionRepo.countByDateRange(from, to);
    assert(typeof count === 'number', `Should return number, got ${typeof count}`);
  });

  await test('updateStatus to processed', async () => {
    if (!createdTransactionId) throw new Error('No transaction created yet');
    await transactionRepo.updateStatus(createdTransactionId, 'processed');
  });

  // ── NotificationLog Repository ──
  console.log('\n  🔔 NotificationLogRepository:');

  let createdLogId: string | null = null;

  await test('create notification log', async () => {
    if (!createdTransactionId) throw new Error('No transaction created yet');
    const log = await notificationLogRepo.create({
      transactionId: createdTransactionId,
      userId: createdUserId || undefined,
      phoneNumber: REPO_TEST_PHONE,
      templateName: 'sinpe_recibido',
    });
    assertNotNull(log, 'create returned null');
    assertNotNull(log!.id, 'Log id missing');
    assertEqual(log!.status, 'pending', 'Initial status should be pending');
    createdLogId = log!.id;
  });

  await test('findByTransactionId returns array', async () => {
    if (!createdTransactionId) throw new Error('No transaction created yet');
    const logs = await notificationLogRepo.findByTransactionId(createdTransactionId);
    assert(Array.isArray(logs), 'Should return array');
    assert(logs.length >= 1, 'Should have at least one log');
  });

  await test('updateDeliveryStatus to sent', async () => {
    if (!createdLogId) throw new Error('No log created yet');
    await notificationLogRepo.updateDeliveryStatus(createdLogId, 'sent', new Date());
  });

  await test('findRetryable returns array', async () => {
    const retryable = await notificationLogRepo.findRetryable();
    assert(Array.isArray(retryable), 'findRetryable should return array');
  });

  await test('incrementRetry increments retry_count', async () => {
    if (!createdLogId) throw new Error('No log created yet');
    await notificationLogRepo.incrementRetry(createdLogId, 'Test error message');
  });

  // ── Cleanup ──
  console.log('\n  🧹 Cleanup:');

  await test('deactivate test user', async () => {
    if (!createdUserId) throw new Error('No user created yet');
    await userRepo.deactivate(createdUserId);
  });

  await test('deactivated user not in findAllActive', async () => {
    if (!createdUserId) throw new Error('No user created yet');
    const users = await userRepo.findAllActive();
    const found = users.find(u => u.id === createdUserId);
    assert(!found, 'Deactivated user should not appear in findAllActive');
  });
}

// ─── FASE 5: Queue ────────────────────────────────────────────────────────────

async function testFase5() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  FASE 5: BullMQ Queue');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('  📬 Queue Operations:');

  let jobId: string | null = null;

  await test('enqueueTransaction returns a job ID', async () => {
    jobId = await enqueueTransaction({ parsedTransaction: SAMPLE_TX });
    assertNotNull(jobId, 'Job ID missing');
    assert(typeof jobId === 'string', 'Job ID should be a string');
  });

  await test('getQueueStats returns expected shape', async () => {
    const stats = await getQueueStats();
    assert(typeof stats.waiting === 'number', 'waiting should be number');
    assert(typeof stats.active === 'number', 'active should be number');
    assert(typeof stats.completed === 'number', 'completed should be number');
    assert(typeof stats.failed === 'number', 'failed should be number');
    assert(typeof stats.delayed === 'number', 'delayed should be number');
  });

  await test('enqueued job exists in queue', async () => {
    if (!jobId) throw new Error('No job enqueued');
    const job = await transactionQueue.getJob(jobId);
    assertNotNull(job, 'Job not found in queue');
    assertEqual(job!.name, 'process-transaction', 'Wrong job name');
  });

  await test('queue has correct retry config (3 attempts)', async () => {
    const opts = transactionQueue.defaultJobOptions;
    assertEqual(opts.attempts, 3, 'Should have 3 retry attempts');
  });

  await test('queue keeps completed jobs for 7 days', async () => {
    const opts = transactionQueue.defaultJobOptions as any;
    assertEqual(opts.removeOnComplete?.age, 60 * 60 * 24 * 7, 'Completed job retention mismatch');
  });

  await test('queue keeps failed jobs for 30 days', async () => {
    const opts = transactionQueue.defaultJobOptions as any;
    assertEqual(opts.removeOnFail?.age, 60 * 60 * 24 * 30, 'Failed job retention mismatch');
  });

  // Clean up test job
  if (jobId) {
    const job = await transactionQueue.getJob(jobId);
    await job?.remove();
  }
}

// ─── FASE 6: REST API ─────────────────────────────────────────────────────────

async function testFase6(server: http.Server) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  FASE 6: REST API');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let token: string | null = null;
  let createdUserId: string | null = null;

  // ── Health ──
  console.log('  ❤️  Health:');

  await test('GET /health returns 200', async () => {
    const res = await httpRequest({ method: 'GET', path: '/health' });
    assertEqual(res.status, 200, 'Health status');
    assertEqual(res.body.status, 'ok', 'Health body status');
  });

  // ── Auth ──
  console.log('\n  🔐 Auth:');

  await test('POST /api/auth/login with wrong password returns 401', async () => {
    const res = await httpRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { password: 'wrongpassword' },
    });
    assertEqual(res.status, 401, 'Should return 401');
  });

  await test('POST /api/auth/login without password returns 400', async () => {
    const res = await httpRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: {},
    });
    assertEqual(res.status, 400, 'Should return 400');
  });

  await test('POST /api/auth/login with correct password returns token', async () => {
    const res = await httpRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { password: 'admin1234' },
    });
    assertEqual(res.status, 200, `Login failed with status ${res.status}`);
    assertNotNull(res.body.token, 'Token missing from response');
    token = res.body.token;
  });

  // ── Protected routes without token ──
  console.log('\n  🚫 Auth protection:');

  await test('GET /api/users without token returns 401', async () => {
    const res = await httpRequest({ method: 'GET', path: '/api/users' });
    assertEqual(res.status, 401, 'Should block unauthenticated');
  });

  await test('GET /api/transactions/pending without token returns 401', async () => {
    const res = await httpRequest({ method: 'GET', path: '/api/transactions/pending' });
    assertEqual(res.status, 401, 'Should block unauthenticated');
  });

  await test('GET /api/queue/stats without token returns 401', async () => {
    const res = await httpRequest({ method: 'GET', path: '/api/queue/stats' });
    assertEqual(res.status, 401, 'Should block unauthenticated');
  });

  // ── Users ──
  console.log('\n  👤 Users API:');

  await test('GET /api/users with token returns 200', async () => {
    if (!token) throw new Error('No auth token');
    const res = await httpRequest({ method: 'GET', path: '/api/users', token });
    assertEqual(res.status, 200, 'GET /api/users failed');
    assert(Array.isArray(res.body.data), 'data should be array');
  });

  await test('POST /api/users without phoneNumber returns 400', async () => {
    if (!token) throw new Error('No auth token');
    const res = await httpRequest({ method: 'POST', path: '/api/users', body: {}, token });
    assertEqual(res.status, 400, 'Should return 400');
  });

  await test('POST /api/users creates user', async () => {
    if (!token) throw new Error('No auth token');
    const res = await httpRequest({
      method: 'POST',
      path: '/api/users',
      body: { phoneNumber: API_TEST_PHONE, fullName: 'API Test User' },
      token,
    });
    assertEqual(res.status, 201, `Create user failed: ${JSON.stringify(res.body)}`);
    assertNotNull(res.body.data?.id, 'User id missing');
    createdUserId = res.body.data.id;
  });

  await test('POST /api/users duplicate phone returns 409', async () => {
    if (!token) throw new Error('No auth token');
    const res = await httpRequest({
      method: 'POST',
      path: '/api/users',
      body: { phoneNumber: API_TEST_PHONE },
      token,
    });
    assertEqual(res.status, 409, 'Should return 409 for duplicate');
  });

  await test('GET /api/users/:id returns user', async () => {
    if (!token || !createdUserId) throw new Error('No auth token or user');
    const res = await httpRequest({ method: 'GET', path: `/api/users/${createdUserId}`, token });
    assertEqual(res.status, 200, 'GET user by id failed');
    assertEqual(res.body.data?.id, createdUserId, 'ID mismatch');
  });

  await test('GET /api/users/:id with invalid id returns 404', async () => {
    if (!token) throw new Error('No auth token');
    const res = await httpRequest({ method: 'GET', path: '/api/users/00000000-0000-0000-0000-000000000000', token });
    assertEqual(res.status, 404, 'Should return 404 for unknown id');
  });

  await test('PUT /api/users/:id updates user', async () => {
    if (!token || !createdUserId) throw new Error('No auth token or user');
    const res = await httpRequest({
      method: 'PUT',
      path: `/api/users/${createdUserId}`,
      body: { fullName: 'Updated API User' },
      token,
    });
    assertEqual(res.status, 200, 'PUT user failed');
    assertEqual(res.body.data?.fullName, 'Updated API User', 'fullName not updated');
  });

  await test('DELETE /api/users/:id returns 204', async () => {
    if (!token || !createdUserId) throw new Error('No auth token or user');
    const res = await httpRequest({ method: 'DELETE', path: `/api/users/${createdUserId}`, token });
    assertEqual(res.status, 204, 'DELETE user failed');
  });

  // ── Transactions ──
  console.log('\n  💳 Transactions API:');

  await test('GET /api/transactions/pending returns 200', async () => {
    if (!token) throw new Error('No auth token');
    const res = await httpRequest({ method: 'GET', path: '/api/transactions/pending', token });
    assertEqual(res.status, 200, 'GET pending failed');
    assert(Array.isArray(res.body.data), 'data should be array');
  });

  await test('GET /api/transactions/stats returns 200', async () => {
    if (!token) throw new Error('No auth token');
    const res = await httpRequest({ method: 'GET', path: '/api/transactions/stats', token });
    assertEqual(res.status, 200, 'GET stats failed');
    assert(typeof res.body.data?.count === 'number', 'count should be number');
  });

  await test('GET /api/transactions/stats with invalid date returns 400', async () => {
    if (!token) throw new Error('No auth token');
    const res = await httpRequest({ method: 'GET', path: '/api/transactions/stats?from=notadate', token });
    assertEqual(res.status, 400, 'Should return 400 for invalid date');
  });

  await test('GET /api/transactions/user/:userId returns 200', async () => {
    if (!token) throw new Error('No auth token');
    const res = await httpRequest({
      method: 'GET',
      path: '/api/transactions/user/00000000-0000-0000-0000-000000000000',
      token,
    });
    assertEqual(res.status, 200, 'GET user transactions failed');
    assert(Array.isArray(res.body.data), 'data should be array');
  });

  // ── Notifications ──
  console.log('\n  🔔 Notifications API:');

  await test('GET /api/notifications/retryable returns 200', async () => {
    if (!token) throw new Error('No auth token');
    const res = await httpRequest({ method: 'GET', path: '/api/notifications/retryable', token });
    assertEqual(res.status, 200, 'GET retryable failed');
    assert(Array.isArray(res.body.data), 'data should be array');
  });

  await test('PATCH /api/notifications/:id/status with invalid status returns 400', async () => {
    if (!token) throw new Error('No auth token');
    const res = await httpRequest({
      method: 'PATCH',
      path: '/api/notifications/some-id/status',
      body: { status: 'invalid_status' },
      token,
    });
    assertEqual(res.status, 400, 'Should return 400 for invalid status');
  });

  await test('PATCH /api/notifications/:id/status with unknown id returns 404', async () => {
    if (!token) throw new Error('No auth token');
    const res = await httpRequest({
      method: 'PATCH',
      path: '/api/notifications/00000000-0000-0000-0000-000000000000/status',
      body: { status: 'sent' },
      token,
    });
    assertEqual(res.status, 404, 'Should return 404 for unknown id');
  });

  // ── Queue ──
  console.log('\n  📬 Queue API:');

  await test('GET /api/queue/stats returns 200 with shape', async () => {
    if (!token) throw new Error('No auth token');
    const res = await httpRequest({ method: 'GET', path: '/api/queue/stats', token });
    assertEqual(res.status, 200, 'GET queue stats failed');
    const d = res.body.data;
    assert(typeof d.waiting === 'number', 'waiting missing');
    assert(typeof d.active === 'number', 'active missing');
    assert(typeof d.completed === 'number', 'completed missing');
    assert(typeof d.failed === 'number', 'failed missing');
  });

  await test('DELETE /api/queue/failed returns 200', async () => {
    if (!token) throw new Error('No auth token');
    const res = await httpRequest({ method: 'DELETE', path: '/api/queue/failed', token });
    assertEqual(res.status, 200, 'DELETE queue/failed failed');
  });

  // ── Webhook ──
  console.log('\n  🪝 Webhook:');

  await test('GET /api/webhooks/whatsapp returns 403 without correct token', async () => {
    const res = await httpRequest({
      method: 'GET',
      path: '/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc',
    });
    assertEqual(res.status, 403, 'Should reject invalid verify token');
  });

  await test('GET /api/webhooks/whatsapp returns challenge with correct token', async () => {
    const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'payment-notifier-2026-miluna';
    const res = await httpRequest({
      method: 'GET',
      path: `/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=test123`,
    });
    assertEqual(res.status, 200, 'Should accept valid verify token');
  });

  // ── 404 ──
  console.log('\n  🔍 404 handler:');

  await test('GET /unknown-route returns 404', async () => {
    const res = await httpRequest({ method: 'GET', path: '/this-does-not-exist' });
    assertEqual(res.status, 404, 'Should return 404');
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║     SINPE Notifier - Test FASE 3, 4, 5 & 6                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // Start test server
  const app = createApp();
  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(TEST_PORT, () => resolve(s));
  });

  try {
    await testFase3();
    await testFase4();
    await testFase5();
    await testFase6(server);
  } finally {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    server.close();
    await closeQueue();
    db.$pool.end();

    if (failed > 0) process.exit(1);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('\n💥 Unexpected error:', err.message);
  process.exit(1);
});
