/** Turkish mobile numbers as people type them (same rules as the website's lib/phone.ts). */
export function phoneDigits(input: string): string {
  let d = input.replace(/\D/g, '');
  if (d.startsWith('90') && d.length > 11) d = d.slice(2);
  if (d && !d.startsWith('0')) d = `0${d}`;
  if (d.startsWith('090')) d = `0${d.slice(3)}`;
  return d.slice(0, 11);
}

/** "0534 657 51 00" */
export function formatPhoneInput(input: string): string {
  const d = phoneDigits(input);
  return [d.slice(0, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)].filter(Boolean).join(' ');
}

export function phoneComplete(input: string): boolean {
  const d = phoneDigits(input);
  return d.length === 11 && d.startsWith('05');
}

/** "+905346575100" → "0534 657 51 00" */
export function formatPhone(e164: string): string {
  return formatPhoneInput(e164.replace(/^\+90/, '0'));
}
