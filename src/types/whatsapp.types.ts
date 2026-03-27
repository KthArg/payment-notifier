/**
 * WhatsApp Cloud API Types
 */

/**
 * WhatsApp message template names
 */
export type TemplateName = 'sinpe_recibido' | 'sinpe_error' | 'sinpe_sin_telefono' | 'payment_reminder';

/**
 * Template parameter for WhatsApp messages
 */
export interface TemplateParameter {
  type: 'text';
  text: string;
}

/**
 * Template language specification
 */
export interface TemplateLanguage {
  code: string; // e.g., 'es' or 'es_MX'
}

/**
 * Template component for WhatsApp API
 */
export interface TemplateComponent {
  type: 'body';
  parameters: TemplateParameter[];
}

/**
 * Template object for WhatsApp API request
 */
export interface WhatsAppTemplate {
  name: TemplateName;
  language: TemplateLanguage;
  components: TemplateComponent[];
}

/**
 * WhatsApp send message request body
 */
export interface WhatsAppMessageRequest {
  messaging_product: 'whatsapp';
  recipient_type?: 'individual';
  to: string; // Phone number in format +50612345678
  type: 'template' | 'text';
  template?: WhatsAppTemplate;
  text?: {
    preview_url?: boolean;
    body: string;
  };
}

/**
 * WhatsApp API successful response
 */
export interface WhatsAppMessageResponse {
  messaging_product: 'whatsapp';
  contacts: {
    input: string;
    wa_id: string;
  }[];
  messages: {
    id: string; // WhatsApp message ID
  }[];
}

/**
 * WhatsApp API error response
 */
export interface WhatsAppErrorResponse {
  error: {
    message: string;
    type: string;
    code: number;
    error_data?: {
      details: string;
    };
    error_subcode?: number;
    fbtrace_id: string;
  };
}

/**
 * WhatsApp webhook message status
 */
export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed';

/**
 * WhatsApp webhook status update
 */
export interface WebhookStatusUpdate {
  id: string; // Message ID
  status: MessageStatus;
  timestamp: string;
  recipient_id: string;
  conversation?: {
    id: string;
    origin: {
      type: string;
    };
  };
  pricing?: {
    billable: boolean;
    pricing_model: string;
    category: string;
  };
  errors?: Array<{
    code: number;
    title: string;
    message?: string;
    error_data?: {
      details: string;
    };
  }>;
}

/**
 * WhatsApp webhook incoming message
 */
export interface WebhookMessage {
  from: string; // Sender phone number
  id: string; // Message ID
  timestamp: string;
  text?: {
    body: string;
  };
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'location' | 'contacts';
}

/**
 * WhatsApp webhook value object
 */
export interface WebhookValue {
  messaging_product: 'whatsapp';
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: Array<{
    profile: {
      name: string;
    };
    wa_id: string;
  }>;
  messages?: WebhookMessage[];
  statuses?: WebhookStatusUpdate[];
}

/**
 * WhatsApp webhook entry
 */
export interface WebhookEntry {
  id: string; // WhatsApp Business Account ID
  changes: Array<{
    value: WebhookValue;
    field: 'messages';
  }>;
}

/**
 * WhatsApp webhook payload (POST request body)
 */
export interface WebhookPayload {
  object: 'whatsapp_business_account';
  entry: WebhookEntry[];
}

/**
 * Data for SINPE received notification template
 */
export interface SinpeRecibidoTemplateData {
  recipientName: string; // {{1}}
  amount: string; // {{2}} - Formatted amount (e.g., "50,000.00")
  senderName: string; // {{3}}
  bankName: string; // {{4}}
  date: string; // {{5}} - Formatted date (e.g., "04/03/2024 14:32")
  reference: string; // {{6}}
}

/**
 * Data for SINPE error notification template
 */
export interface SinpeErrorTemplateData {
  emailFrom: string; // {{1}}
  date: string; // {{2}}
}

/**
 * Data for sinpe_sin_telefono template — sent to account owner when sender phone is missing.
 * Template body (to be created in Meta):
 *   "Recibiste un SINPE de *{{1}}* por *{{2}}* ({{3}}).
 *    No se encontró el teléfono del remitente.
 *    Regístralo aquí para notificarlo: {{4}}"
 */
export interface SinpeSinTelefonoTemplateData {
  senderName: string; // {{1}}
  amount: string;     // {{2}}
  bankName: string;   // {{3}}
}

/**
 * Data for payment_reminder template — sent to members before payment due date.
 * Template body (create in Meta):
 *   "Hola {{1}}, te recordamos que tu mensualidad de {{2}} en {{3}} vence el {{4}}.
 *    Por favor realiza tu pago via SINPE Móvil para evitar inconvenientes. 🙏"
 */
export interface PaymentReminderTemplateData {
  memberName: string;   // {{1}}
  amount: string;       // {{2}} formatted
  businessName: string; // {{3}}
  dueDate: string;      // {{4}} e.g. "1 de abril"
}

/**
 * Template data union type
 */
export type TemplateData = SinpeRecibidoTemplateData | SinpeErrorTemplateData | SinpeSinTelefonoTemplateData | PaymentReminderTemplateData;

/**
 * Send notification options
 */
export interface SendNotificationOptions {
  phoneNumber: string; // Recipient phone number (+50612345678)
  templateName: TemplateName;
  templateData: TemplateData;
}

/**
 * Delivery status result
 */
export interface DeliveryStatus {
  messageId: string;
  status: MessageStatus;
  timestamp: Date;
  error?: string;
}
