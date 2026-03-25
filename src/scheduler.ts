import { logger } from './utils/logger';
import { emailMonitorService } from './services/email-monitor.service';
import { parserFactory } from './parsers/parser-factory';
import { enqueueTransaction } from './queues/transaction.queue';

/**
 * Email polling scheduler
 *
 * Polls Gmail every POLL_INTERVAL_MS for new SINPE emails,
 * parses them, and enqueues each one for processing.
 */

const POLL_INTERVAL_MS = 30_000; // 30 seconds

let pollTimer: ReturnType<typeof setInterval> | null = null;
let isPolling = false;

/**
 * Single polling cycle: fetch → parse → enqueue
 */
async function pollEmails(): Promise<void> {
  if (isPolling) {
    logger.debug('Poll cycle skipped — previous cycle still running');
    return;
  }

  isPolling = true;

  try {
    logger.debug('Starting email poll cycle');

    const emails = await emailMonitorService.fetchNewEmails();

    if (emails.length === 0) {
      logger.debug('No new SINPE emails in this cycle');
      return;
    }

    let enqueued = 0;
    let skipped = 0;

    for (const email of emails) {
      const parsed = parserFactory.parse(email);

      if (!parsed) {
        // No parser matched — mark as read so we don't reprocess
        await emailMonitorService.markAsRead(email.id);
        skipped++;
        continue;
      }

      try {
        await enqueueTransaction({ parsedTransaction: parsed });
        // Mark as read immediately after enqueueing to avoid duplicate processing
        await emailMonitorService.markAsRead(email.id);
        enqueued++;
      } catch (enqueueErr) {
        logger.error('Failed to enqueue transaction', {
          emailId: email.id,
          transactionId: parsed.transactionId,
          error: enqueueErr,
        });
        // Don't mark as read — retry on next poll cycle
      }
    }

    logger.info('Poll cycle complete', {
      total: emails.length,
      enqueued,
      skipped,
    });
  } catch (err: any) {
    logger.error('Email poll cycle failed', { error: err.message });
  } finally {
    isPolling = false;
  }
}

/**
 * Start the email polling scheduler.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function startScheduler(): void {
  if (pollTimer) {
    logger.warn('Scheduler already running');
    return;
  }

  logger.info(`Starting email poll scheduler (interval: ${POLL_INTERVAL_MS / 1000}s)`);

  // Run immediately on start, then on interval
  pollEmails().catch(err => logger.error('Initial poll failed', { error: err }));

  pollTimer = setInterval(() => {
    pollEmails().catch(err => logger.error('Scheduled poll failed', { error: err }));
  }, POLL_INTERVAL_MS);

  // Prevent the interval from keeping the process alive if everything else exits
  pollTimer.unref?.();
}

/**
 * Stop the email polling scheduler gracefully.
 */
export function stopScheduler(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    logger.info('Email poll scheduler stopped');
  }
}
