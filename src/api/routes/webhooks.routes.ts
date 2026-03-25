import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { env } from '../../config/environment';
import { logger } from '../../utils/logger';
import { WebhookPayload, WebhookStatusUpdate } from '../../types/whatsapp.types';

const router = Router();

/**
 * Verify webhook signature (HMAC SHA-256)
 * @param payload - Request body as string
 * @param signature - X-Hub-Signature-256 header
 * @returns True if valid
 */
function verifyWebhookSignature(payload: string, signature: string | undefined): boolean {
  if (!signature) {
    logger.warn('Missing webhook signature');
    return false;
  }

  try {
    // Signature format: "sha256=<hash>"
    const signatureHash = signature.replace('sha256=', '');

    // Calculate expected signature
    const expectedSignature = crypto
      .createHmac('sha256', env.WHATSAPP_APP_SECRET)
      .update(payload)
      .digest('hex');

    // Compare signatures (timing-safe comparison)
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signatureHash),
      Buffer.from(expectedSignature)
    );

    if (!isValid) {
      logger.warn('Invalid webhook signature');
    }

    return isValid;
  } catch (error) {
    logger.error('Error verifying webhook signature', { error });
    return false;
  }
}

/**
 * GET /api/webhooks/whatsapp
 * Webhook verification endpoint (Meta requirement)
 */
router.get('/whatsapp', (req: Request, res: Response): void => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  logger.debug('WhatsApp webhook verification request', {
    mode,
    token: token ? '***' : undefined,
    challenge: challenge ? '***' : undefined,
  });

  // Check if mode and token are correct
  if (mode === 'subscribe' && token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    logger.info('✅ WhatsApp webhook verified successfully');
    // Respond with challenge token
    res.status(200).send(challenge);
  } else {
    logger.warn('❌ WhatsApp webhook verification failed', {
      expectedToken: '***',
      receivedMode: mode,
    });
    res.sendStatus(403);
  }
});

/**
 * POST /api/webhooks/whatsapp
 * Webhook endpoint for incoming messages and status updates
 */
router.post('/whatsapp', async (req: Request, res: Response) => {
  try {
    // Verify signature (security)
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const rawBody = JSON.stringify(req.body);

    // In production, always verify signature
    if (env.NODE_ENV === 'production') {
      if (!verifyWebhookSignature(rawBody, signature)) {
        logger.warn('Invalid webhook signature, rejecting request');
        return res.sendStatus(403);
      }
    }

    const payload = req.body as WebhookPayload;

    logger.debug('WhatsApp webhook received', {
      object: payload.object,
      entriesCount: payload.entry?.length || 0,
    });

    // Validate payload structure
    if (payload.object !== 'whatsapp_business_account') {
      logger.warn('Invalid webhook object type', { object: payload.object });
      return res.sendStatus(400);
    }

    // Process each entry
    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        if (change.field === 'messages') {
          await processWebhookChange(change.value);
        }
      }
    }

    // Always respond with 200 OK quickly
    res.sendStatus(200);
  } catch (error: any) {
    logger.error('Error processing WhatsApp webhook', {
      error: error.message,
      stack: error.stack,
    });
    // Still respond with 200 to prevent retries
    res.sendStatus(200);
  }
});

/**
 * Process a webhook change (message or status)
 */
async function processWebhookChange(value: any): Promise<void> {
  try {
    // Process status updates
    if (value.statuses && Array.isArray(value.statuses)) {
      for (const status of value.statuses) {
        await processStatusUpdate(status);
      }
    }

    // Process incoming messages
    if (value.messages && Array.isArray(value.messages)) {
      for (const message of value.messages) {
        await processIncomingMessage(message);
      }
    }
  } catch (error: any) {
    logger.error('Error processing webhook change', { error: error.message });
  }
}

/**
 * Process a message status update
 */
async function processStatusUpdate(status: WebhookStatusUpdate): Promise<void> {
  try {
    const { id, status: messageStatus, timestamp, recipient_id, errors } = status;

    logger.info('WhatsApp message status update', {
      messageId: id,
      status: messageStatus,
      timestamp,
      recipientId: recipient_id,
      hasErrors: errors && errors.length > 0,
    });

    // Log errors if present
    if (errors && errors.length > 0) {
      for (const error of errors) {
        logger.error('WhatsApp message delivery error', {
          messageId: id,
          errorCode: error.code,
          errorTitle: error.title,
          errorMessage: error.message,
          errorDetails: error.error_data?.details,
        });
      }
    }

    // TODO: Update notification_logs table in database
    // This will be implemented in FASE 4 when we have the repositories
    // await notificationRepository.updateStatus(id, messageStatus, new Date(timestamp), errors);

  } catch (error: any) {
    logger.error('Error processing status update', {
      error: error.message,
      messageId: status.id,
    });
  }
}

/**
 * Process an incoming message (user reply)
 */
async function processIncomingMessage(message: any): Promise<void> {
  try {
    const { from, id, timestamp, text, type } = message;

    logger.info('WhatsApp incoming message', {
      from,
      messageId: id,
      timestamp,
      type,
      text: text?.body,
    });

    // For now, just log incoming messages
    // In the future, we could implement commands like "STOP" to unsubscribe

    // TODO: Handle user commands (e.g., "STOP", "AYUDA")
    // if (text?.body?.toLowerCase() === 'stop') {
    //   await userRepository.updateNotificationPreferences(from, { enabled: false });
    // }

  } catch (error: any) {
    logger.error('Error processing incoming message', {
      error: error.message,
      messageId: message.id,
    });
  }
}

export default router;
