import { Worker, Job } from 'bullmq';
import { env } from '../../config/environment';
import { logger } from '../../utils/logger';
import { TransactionRepository } from '../../database/repositories/transaction.repository';
import { UserRepository } from '../../database/repositories/user.repository';
import { NotificationLogRepository } from '../../database/repositories/notification-log.repository';
import { WhatsAppService } from '../../services/whatsapp.service';
import { QUEUE_NAME, TransactionJobData, TransactionJobResult, TransactionJobName } from '../transaction.queue';
import { maskPhoneNumber } from '../../utils/phone-formatter';

/**
 * Retry delays in milliseconds:
 *   attempt 0 → immediate
 *   attempt 1 → 1 minute
 *   attempt 2 → 5 minutes
 */
const RETRY_DELAYS_MS = [0, 60_000, 300_000];

const transactionRepo = new TransactionRepository();
const userRepo = new UserRepository();
const notificationLogRepo = new NotificationLogRepository();
const whatsappService = new WhatsAppService();

/** BullMQ connection options derived from REDIS_URL */
function getRedisConnection() {
  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: parseInt(url.port || '6379', 10),
    password: url.password || undefined,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null, // Required by BullMQ
  };
}

/**
 * Core processing logic for a single transaction job.
 *
 * Steps:
 * 1. Deduplication check
 * 2. Persist transaction to DB
 * 3. Resolve recipient user (if any)
 * 4. Send WhatsApp notification
 * 5. Log notification result
 * 6. Mark transaction as processed
 */
async function processTransaction(
  job: Job<TransactionJobData, TransactionJobResult, TransactionJobName>
): Promise<TransactionJobResult> {
  const { parsedTransaction, notifyPhone } = job.data;
  const { transactionId, bankName, amount, currency } = parsedTransaction;

  logger.info('Processing transaction job', {
    jobId: job.id,
    transactionId,
    bank: bankName,
    attempt: job.attemptsMade + 1,
  });

  // ── Step 1: Deduplication ────────────────────────────────────────────────
  const isDuplicate = await transactionRepo.isDuplicate(parsedTransaction);
  if (isDuplicate) {
    logger.warn('Duplicate transaction detected — skipping', { transactionId, bankName });
    return { success: true, transactionId, error: 'duplicate' };
  }

  // ── Step 2: Persist to DB ────────────────────────────────────────────────
  let dbTransaction = await transactionRepo.create(parsedTransaction).catch((err: any) => {
    if (err?.code === '23505') {
      // Race condition: already inserted by another worker
      logger.warn('Race condition: transaction already inserted', { transactionId });
      return null; // signal duplicate
    }
    throw err; // re-throw for BullMQ retry
  });

  if (!dbTransaction) {
    return { success: true, transactionId, error: 'duplicate_race' };
  }

  logger.debug('Transaction persisted', { dbId: dbTransaction.id, transactionId });

  // ── Step 3: Resolve recipient ────────────────────────────────────────────
  const recipientPhone = notifyPhone ?? parsedTransaction.receiverPhone;

  if (!recipientPhone) {
    await transactionRepo.updateStatus(dbTransaction.id, 'processed');
    logger.warn('No recipient phone — transaction saved without WhatsApp notification', {
      transactionId,
    });
    return { success: true, transactionId };
  }

  // Try to find user in DB for user_id linkage
  const user = await userRepo.findByPhone(recipientPhone).catch(() => null);
  if (user && !dbTransaction.userId) {
    await transactionRepo.linkToUser(dbTransaction.id, user.id).catch(() => {});
    dbTransaction = { ...dbTransaction, userId: user.id };
  }

  // ── Step 4: Send WhatsApp notification ───────────────────────────────────
  let whatsappMessageId: string | null = null;
  let notificationError: string | undefined;

  // Format amount: e.g. 50000 → "50,000.00"
  const formattedAmount = amount.toLocaleString('es-CR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // Format date: e.g. "04/03/2024 14:32"
  const txDate = parsedTransaction.transactionDate;
  const formattedDate = txDate.toLocaleDateString('es-CR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }) + ' ' + txDate.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });

  try {
    whatsappMessageId = await whatsappService.sendNotification({
      phoneNumber: recipientPhone,
      templateName: 'sinpe_recibido',
      templateData: {
        recipientName: user?.fullName ?? 'Cliente',
        amount: `${currency === 'CRC' ? '₡' : '$'}${formattedAmount}`,
        senderName: parsedTransaction.senderName ?? 'Desconocido',
        bankName,
        date: formattedDate,
        reference: transactionId,
      },
    });
  } catch (err: any) {
    notificationError = err?.message ?? String(err);
    logger.error('WhatsApp send failed', {
      transactionId,
      phone: maskPhoneNumber(recipientPhone),
      error: notificationError,
    });
  }

  // ── Step 5: Log notification ─────────────────────────────────────────────
  try {
    await notificationLogRepo.create({
      transactionId: dbTransaction.id,
      userId: dbTransaction.userId,
      whatsappMessageId: whatsappMessageId ?? undefined,
      phoneNumber: recipientPhone,
      templateName: 'sinpe_recibido',
    });
  } catch (logErr) {
    logger.error('Failed to create notification log', { transactionId, error: logErr });
  }

  // ── Step 6: Update transaction status ────────────────────────────────────
  const finalStatus = whatsappMessageId ? 'processed' : 'failed';
  await transactionRepo.updateStatus(dbTransaction.id, finalStatus);

  if (!whatsappMessageId) {
    throw new Error(`WhatsApp notification failed: ${notificationError}`);
  }

  logger.info('Transaction processed successfully', {
    jobId: job.id,
    transactionId,
    whatsappMessageId,
    phone: maskPhoneNumber(recipientPhone),
  });

  return { success: true, transactionId, whatsappMessageId };
}

/**
 * Custom retry delay: BullMQ calls this with the number of attempts already made.
 */
function getRetryDelay(attemptsMade: number): number {
  const delay = RETRY_DELAYS_MS[attemptsMade] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]!;
  logger.debug(`Retry delay for attempt ${attemptsMade}: ${delay}ms`);
  return delay;
}

/**
 * BullMQ Worker — processes jobs from the transactions queue.
 */
export function createTransactionWorker(): Worker<TransactionJobData, TransactionJobResult, TransactionJobName> {
  const worker = new Worker<TransactionJobData, TransactionJobResult, TransactionJobName>(
    QUEUE_NAME,
    processTransaction,
    {
      connection: getRedisConnection(),
      concurrency: 3,
      stalledInterval: 300_000, // check stalled jobs every 5 min (default: 30s)
      limiter: {
        max: 10,
        duration: 1000,
      },
      settings: {
        backoffStrategy: getRetryDelay,
      },
    }
  );

  worker.on('completed', (job, result) => {
    logger.info('Worker: job completed', {
      jobId: job.id,
      transactionId: result.transactionId,
    });
  });

  worker.on('failed', (job, err) => {
    const attemptsLeft = (job?.opts.attempts ?? 1) - (job?.attemptsMade ?? 0);
    if (attemptsLeft > 0) {
      logger.warn('Worker: job failed, will retry', {
        jobId: job?.id,
        attemptsLeft,
        error: err.message,
      });
    } else {
      logger.error('Worker: job permanently failed (dead letter)', {
        jobId: job?.id,
        error: err.message,
      });
    }
  });

  worker.on('error', (err) => {
    logger.error('Worker error (connection/internal)', { error: err.message });
  });

  worker.on('stalled', (jobId) => {
    logger.warn('Worker: job stalled', { jobId });
  });

  logger.info('Transaction worker started', { concurrency: 3 });
  return worker;
}

/**
 * Gracefully shut down the worker (drains in-flight jobs).
 */
export async function closeWorker(
  worker: Worker<TransactionJobData, TransactionJobResult, TransactionJobName>
): Promise<void> {
  await worker.close();
  logger.info('Transaction worker closed');
}
