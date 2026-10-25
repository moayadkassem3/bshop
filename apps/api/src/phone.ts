import { badRequest } from './errors.js';

// Normalises Turkish mobile numbers to E.164 (+905xxxxxxxxx).
// Other countries are accepted when already written in + form.
export function normalizePhone(input: string): string {
  return normalize(input, /^\+905\d{9}$/);
}

/**
 * A salon's public phone may also be a landline (0216 ...) or an 0850 number;
 * sign-in, SMS and WhatsApp numbers stay mobile-only.
 */
export function normalizeShopPhone(input: string): string {
  return normalize(input, /^\+90(?:[2-5]\d{2}|850)\d{7}$/);
}

function normalize(input: string, turkish: RegExp): string {
  const digits = input.replace(/[^\d+]/g, '');
  let e164: string;
  if (digits.startsWith('+')) e164 = digits;
  else if (digits.startsWith('90') && digits.length === 12) e164 = `+${digits}`;
  else if (digits.startsWith('0') && digits.length === 11) e164 = `+9${digits}`;
  else if (digits.length === 10 && /^[2-58]/.test(digits)) e164 = `+90${digits}`;
  else throw badRequest('INVALID_PHONE', 'Phone number is not valid');

  if (e164.startsWith('+90') ? !turkish.test(e164) : !/^\+\d{8,15}$/.test(e164)) {
    throw badRequest('INVALID_PHONE', 'Phone number is not valid');
  }
  return e164;
}
