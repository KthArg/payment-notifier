import axios, { AxiosInstance } from 'axios';
import { env } from './environment';
import { logger } from '../utils/logger';

/**
 * WhatsApp Cloud API client configuration
 */
class WhatsAppClient {
  private client: AxiosInstance;
  private readonly baseURL: string;
  private readonly phoneNumberId: string;
  private readonly accessToken: string;

  constructor() {
    this.phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
    this.accessToken = env.WHATSAPP_ACCESS_TOKEN;
    this.baseURL = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}`;

    // Create axios instance
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 seconds
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('WhatsApp API request', {
          method: config.method?.toUpperCase(),
          url: config.url,
          data: config.data ? '***REDACTED***' : undefined,
        });
        return config;
      },
      (error) => {
        logger.error('WhatsApp API request error', { error: error.message });
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('WhatsApp API response', {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      (error) => {
        if (error.response) {
          logger.error('WhatsApp API error response', {
            status: error.response.status,
            data: error.response.data,
            url: error.config?.url,
          });
        } else {
          logger.error('WhatsApp API network error', {
            error: error.message,
          });
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Get the configured axios instance
   */
  getClient(): AxiosInstance {
    return this.client;
  }

  /**
   * Get phone number ID
   */
  getPhoneNumberId(): string {
    return this.phoneNumberId;
  }

  /**
   * Get base URL
   */
  getBaseURL(): string {
    return this.baseURL;
  }

  /**
   * Build the messages endpoint URL
   */
  getMessagesEndpoint(): string {
    return `${this.phoneNumberId}/messages`;
  }
}

// Export singleton instance
export const whatsappClient = new WhatsAppClient();

/**
 * Test WhatsApp API connection
 */
export async function testWhatsAppConnection(): Promise<boolean> {
  try {
    // Get phone number details to verify connection
    const response = await whatsappClient.getClient().get(`/${whatsappClient.getPhoneNumberId()}`);

    logger.info('✅ WhatsApp API connection successful', {
      phoneNumber: response.data.display_phone_number,
      verifiedName: response.data.verified_name,
      codeVerificationStatus: response.data.code_verification_status,
      qualityRating: response.data.quality_rating,
    });

    return true;
  } catch (error: any) {
    // Check if it's a configuration issue or actual error
    if (error.response?.status === 404 || error.response?.status === 400) {
      logger.error('❌ WhatsApp API connection failed - Invalid Phone Number ID:', {
        error: error.response?.data?.error?.message || error.message,
        phoneNumberId: whatsappClient.getPhoneNumberId(),
      });
    } else if (error.response?.status === 401 || error.response?.status === 403) {
      logger.error('❌ WhatsApp API connection failed - Invalid Access Token:', {
        error: error.response?.data?.error?.message || error.message,
      });
    } else {
      logger.error('❌ WhatsApp API connection failed:', {
        error: error.response?.data?.error?.message || error.message,
        code: error.response?.status || error.code,
      });
    }

    return false;
  }
}
