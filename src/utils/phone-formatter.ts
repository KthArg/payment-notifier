/**
 * Normalizes Costa Rica phone numbers to international format +506XXXXXXXX
 */
export function normalizeCostaRicaPhone(phone: string): string {
  if (!phone) {
    throw new Error('Phone number cannot be empty');
  }

  // Remove all non-digit characters except +
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');

  // Remove + prefix if exists
  cleaned = cleaned.replace(/^\+/, '');

  // Remove 506 country code if exists
  cleaned = cleaned.replace(/^506/, '');

  // Validate that we have exactly 8 digits
  if (!/^\d{8}$/.test(cleaned)) {
    throw new Error(
      `Invalid Costa Rica phone number: ${phone}. Expected 8 digits, got ${cleaned.length}`
    );
  }

  // Return in international format
  return `+506${cleaned}`;
}

/**
 * Formats a phone number for display (8765-4321)
 */
export function formatPhoneForDisplay(phone: string): string {
  const normalized = normalizeCostaRicaPhone(phone);
  const digits = normalized.substring(4); // Remove +506

  return `${digits.substring(0, 4)}-${digits.substring(4)}`;
}

/**
 * Masks a phone number for logging (****-4321)
 */
export function maskPhoneNumber(phone: string): string {
  try {
    const normalized = normalizeCostaRicaPhone(phone);
    const digits = normalized.substring(4); // Remove +506

    return `+506****${digits.substring(4)}`;
  } catch {
    return '****-****';
  }
}

/**
 * Validates if a string is a valid Costa Rica phone number
 */
export function isValidCostaRicaPhone(phone: string): boolean {
  try {
    normalizeCostaRicaPhone(phone);
    return true;
  } catch {
    return false;
  }
}
