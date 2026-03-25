import { z } from 'zod';
import dotenv from 'dotenv';

// Load .env file
dotenv.config();

const envSchema = z.object({
  // Node Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000').transform(Number).pipe(z.number().positive()),

  // Database
  DATABASE_URL: z.string().url().or(z.string().startsWith('postgresql://')),

  // Encryption
  ENCRYPTION_KEY: z.string().length(64, 'ENCRYPTION_KEY must be 64 hex characters (32 bytes)'),

  // Redis
  REDIS_URL: z.string().url().or(z.string().startsWith('redis://')),

  // Gmail API
  GMAIL_CLIENT_ID: z.string().min(1, 'GMAIL_CLIENT_ID is required'),
  GMAIL_CLIENT_SECRET: z.string().min(1, 'GMAIL_CLIENT_SECRET is required'),
  GMAIL_REFRESH_TOKEN: z.string().min(1, 'GMAIL_REFRESH_TOKEN is required'),

  // WhatsApp Meta API
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1, 'WHATSAPP_PHONE_NUMBER_ID is required'),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().min(1, 'WHATSAPP_BUSINESS_ACCOUNT_ID is required'),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1, 'WHATSAPP_ACCESS_TOKEN is required'),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().min(1, 'WHATSAPP_WEBHOOK_VERIFY_TOKEN is required'),
  WHATSAPP_APP_SECRET: z.string().min(1, 'WHATSAPP_APP_SECRET is required'),
  WHATSAPP_API_VERSION: z.string().default('v21.0'),

  // Admin JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRY: z.string().default('24h'),
  ADMIN_PASSWORD_HASH: z.string().min(1, 'ADMIN_PASSWORD_HASH is required'),

  // Optional: Sentry
  SENTRY_DSN: z.string().url().optional(),

  // Optional: Resend
  RESEND_API_KEY: z.string().optional(),
  ADMIN_EMAIL: z.string().email().optional(),

  // CORS
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

export type Environment = z.infer<typeof envSchema>;

let env: Environment;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ Invalid environment variables:');
    error.issues.forEach((err) => {
      console.error(`  - ${err.path.join('.')}: ${err.message}`);
    });
    process.exit(1);
  }
  throw error;
}

export { env };
