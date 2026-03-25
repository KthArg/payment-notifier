import { google } from 'googleapis';
import { env } from './environment';
import { logger } from '../utils/logger';

/**
 * Configure OAuth2 client for Gmail API
 */
const oauth2Client = new google.auth.OAuth2(
  env.GMAIL_CLIENT_ID,
  env.GMAIL_CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob' // For installed apps
);

// Set refresh token
oauth2Client.setCredentials({
  refresh_token: env.GMAIL_REFRESH_TOKEN,
});

// Handle token refresh
oauth2Client.on('tokens', (tokens) => {
  if (tokens.refresh_token) {
    logger.info('New Gmail refresh token received');
    // In production, you might want to save this
  }
  if (tokens.access_token) {
    logger.debug('Gmail access token refreshed');
  }
});

/**
 * Gmail API client instance
 */
export const gmail = google.gmail({
  version: 'v1',
  auth: oauth2Client,
});

/**
 * Test Gmail API connection
 */
export async function testGmailConnection(): Promise<boolean> {
  try {
    const response = await gmail.users.getProfile({
      userId: 'me',
    });

    logger.info('✅ Gmail API connection successful', {
      emailAddress: response.data.emailAddress,
      messagesTotal: response.data.messagesTotal,
    });

    return true;
  } catch (error: any) {
    logger.error('❌ Gmail API connection failed:', {
      error: error.message,
      code: error.code,
    });
    return false;
  }
}

export { oauth2Client };
