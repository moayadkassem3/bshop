import { badRequest } from './errors.js';

// Normalises Turkish mobile numbers to E.164 (+905xxxxxxxxx).
// Other countries are accepted when already written in + form.
export function normalizePhone(input: string): string {
  const digits = input.replace(/[^\d+]/g, '');
  let e164: string;
  if (digits.startsWith('+')) e164 = digits;
  else if (digits.startsWith('90') && digits.length === 12) e164 = `+${digits}`;
  else if (digits.startsWith('0') && digits.length === 11) e164 = `+9${digits}`;
  else if (digits.length === 10 && digits.startsWith('5')) e164 = `+90${digits}`;
  else throw badRequest('INVALID_PHONE', 'Phone number is not valid');

  if (e164.startsWith('+90') ? !/^\+905\d{9}$/.test(e164) : !/^\+\d{8,15}$/.test(e164)) {
    throw badRequest('INVALID_PHONE', 'Phone number is not valid');
  }
  return e164;
}
