/**
 * Turkish phone numbers as people type them (v1.7): 11 digits with the leading
 * 0, shown as 0534 657 51 00. "+90 534…", "90534…" and "534…" become "0534…".
 */
export function phoneDigits(input: string): string {
  let d = input.replace(/\D/g, '');
  if (d.startsWith('90') && d.length > 11) d = d.slice(2);
  if (d && !d.startsWith('0')) d = `0${d}`;
  // No Turkish number starts with 09: "090…" is the country code typed digit by digit.
  if (d.startsWith('090')) d = `0${d.slice(3)}`;
  return d.slice(0, 11);
}

export function formatPhoneInput(input: string): string {
  const d = phoneDigits(input);
  return [d.slice(0, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)].filter(Boolean).join(' ');
}

/** A complete number: a mobile (05…), or for a salon's own line also a landline (02–04…) or 0850. */
export function phoneComplete(input: string, kind: 'mobile' | 'any' = 'mobile'): boolean {
  const d = phoneDigits(input);
  if (d.length !== 11) return false;
  return kind === 'mobile' ? d.startsWith('05') : /^0([2-5]|850)/.test(d);
}
