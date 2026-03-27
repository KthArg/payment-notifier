import cron from 'node-cron';
import { logger } from './utils/logger';
import { emailMonitorService } from './services/email-monitor.service';
import { parserFactory } from './parsers/parser-factory';
import { enqueueTransaction } from './queues/transaction.queue';
import { MemberRepository } from './database/repositories/member.repository';
import { MonthlyRecordRepository } from './database/repositories/monthly-record.repository';
import { WhatsAppService } from './services/whatsapp.service';
import { env } from './config/environment';

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

const memberRepo = new MemberRepository();
const monthlyRecordRepo = new MonthlyRecordRepository();
const whatsappService = new WhatsAppService();

// ── Monthly records generation ────────────────────────────────────────────────
// Runs at 00:05 on the 1st of every month
// Creates pending records for all active members and marks previous month as overdue
async function generateMonthlyRecords(): Promise<void> {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  // Mark previous month's pending records as overdue
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const overdue = await monthlyRecordRepo.markOverdue(prevMonth, prevYear);
  if (overdue > 0) {
    logger.info('Marked previous month records as overdue', { month: prevMonth, year: prevYear, count: overdue });
  }

  // Generate records for current month
  const created = await monthlyRecordRepo.generateForMonth(month, year);
  logger.info('Monthly records generated', { month, year, created });
}

// ── Payment reminders ─────────────────────────────────────────────────────────
// Runs daily at 09:00
// Sends WhatsApp reminders to members whose due date is today or in 3 days
async function sendPaymentReminders(): Promise<void> {
  const now = new Date();
  const today = now.getDate();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const MONTHS_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

  // Remind members whose due day is today or in 3 days
  const dueDays = [today, today + 3].filter(d => d >= 1 && d <= 28);

  for (const dueDay of dueDays) {
    const records = await monthlyRecordRepo.findPendingForReminder(dueDay, month, year);

    for (const record of records) {
      try {
        const formattedAmount = `₡${record.amountDue.toLocaleString('es-CR', { minimumFractionDigits: 2 })}`;
        const dueDateStr = `${dueDay} de ${MONTHS_ES[month - 1]}`;

        await whatsappService.sendNotification({
          phoneNumber: record.member.phoneNumber,
          templateName: 'payment_reminder',
          templateData: {
            memberName: record.member.fullName.split(' ')[0], // first name only
            amount: formattedAmount,
            businessName: env.BUSINESS_NAME,
            dueDate: dueDateStr,
          },
        });

        await monthlyRecordRepo.markReminderSent(record.id);

        logger.info('Payment reminder sent', {
          memberId: record.memberId,
          memberName: record.member.fullName,
          dueDay,
        });
      } catch (err: any) {
        logger.error('Failed to send payment reminder', {
          memberId: record.memberId,
          error: err.message,
        });
      }
    }
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

  // Generate monthly records on 1st of each month at 00:05
  cron.schedule('5 0 1 * *', () => {
    generateMonthlyRecords().catch(err => logger.error('Monthly generation failed', { error: err }));
  }, { timezone: 'America/Costa_Rica' });

  // Send payment reminders daily at 09:00
  cron.schedule('0 9 * * *', () => {
    sendPaymentReminders().catch(err => logger.error('Reminder job failed', { error: err }));
  }, { timezone: 'America/Costa_Rica' });

  logger.info('Cron jobs scheduled: monthly generation (1st 00:05) + daily reminders (09:00)');
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
