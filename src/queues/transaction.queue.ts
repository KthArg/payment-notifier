import { Queue, QueueEvents } from 'bullmq';
import { env } from '../config/environment';
import { logger } from '../utils/logger';
import { ParsedTransaction } from '../types/transaction.types';

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
 * Job data stored in the transaction queue
 */
export interface TransactionJobData {
  parsedTransaction: ParsedTransaction;
  /** Phone number to notify (recipient/user) */
  notifyPhone?: string;
  /** Database transaction ID (assigned after DB insert) */
  dbTransactionId?: string;
  /** Number of attempts made (tracked manually for logging) */
  attemptNumber?: number;
}

/**
 * Job result returned by the worker
 */
export interface TransactionJobResult {
  success: boolean;
  transactionId: string;
  whatsappMessageId?: string;
  error?: string;
}

export const QUEUE_NAME = 'transactions';
export type TransactionJobName = 'process-transaction';

/**
 * BullMQ Queue for processing SINPE transactions.
 *
 * Retry strategy: 3 attempts with exponential backoff
 *   - Attempt 1: immediate
 *   - Attempt 2: 1 minute delay
 *   - Attempt 3: 5 minutes delay
 *   After 3 failures the job moves to the failed set (dead letter).
 */
export const transactionQueue = new Queue<TransactionJobData, TransactionJobResult, TransactionJobName>(
  QUEUE_NAME,
  {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'custom', // handled by worker via getRetryDelay
      },
      removeOnComplete: {
        age: 60 * 60 * 24 * 7, // keep completed jobs for 7 days
        count: 1000,
      },
      removeOnFail: {
        age: 60 * 60 * 24 * 30, // keep failed jobs for 30 days
        count: 500,
      },
    },
  }
);

/**
 * Queue event listener for monitoring and logging
 */
export const transactionQueueEvents = new QueueEvents(QUEUE_NAME, {
  connection: getRedisConnection(),
});

transactionQueueEvents.on('completed', ({ jobId, returnvalue }) => {
  const result = returnvalue as unknown as TransactionJobResult;
  logger.info('Transaction job completed', {
    jobId,
    transactionId: result?.transactionId,
    whatsappMessageId: result?.whatsappMessageId,
  });
});

transactionQueueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error('Transaction job failed permanently', {
    jobId,
    reason: failedReason,
  });
});

transactionQueueEvents.on('stalled', ({ jobId }) => {
  logger.warn('Transaction job stalled (worker may have crashed)', { jobId });
});

/**
 * Add a parsed transaction to the queue for processing.
 */
export async function enqueueTransaction(
  data: TransactionJobData,
  opts?: { priority?: number }
): Promise<string> {
  const job = await transactionQueue.add('process-transaction', data, {
    priority: opts?.priority,
  });
  logger.debug('Transaction enqueued', {
    jobId: job.id,
    transactionId: data.parsedTransaction.transactionId,
    bank: data.parsedTransaction.bankName,
  });
  return job.id!;
}

/**
 * Get queue statistics
 */
export async function getQueueStats() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    transactionQueue.getWaitingCount(),
    transactionQueue.getActiveCount(),
    transactionQueue.getCompletedCount(),
    transactionQueue.getFailedCount(),
    transactionQueue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}

/**
 * Gracefully close the queue connection
 */
export async function closeQueue(): Promise<void> {
  await transactionQueueEvents.close();
  await transactionQueue.close();
  logger.info('Transaction queue closed');
}
