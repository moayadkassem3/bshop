'use client';

import { formatPhoneInput } from '@/lib/phone';

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
};

/** Phone field that keeps the number in Turkish format (0534 657 51 00) and stops at 11 digits. */
export function PhoneInput({ id, value, onChange, placeholder = '05xx xxx xx xx', autoComplete = 'tel' }: Props) {
  return (
    <input
      id={id}
      className="input"
      type="tel"
      inputMode="numeric"
      autoComplete={autoComplete}
      placeholder={placeholder}
      // "0534 657 51 00" is 14 characters; the browser enforces this even before the page's code has loaded.
      maxLength={14}
      value={value}
      onChange={(e) => onChange(formatPhoneInput(e.target.value))}
      // A pasted "+90 534 657 51 00" is longer than maxLength; format all of it rather than let the browser cut it.
      onPaste={(e) => {
        e.preventDefault();
        onChange(formatPhoneInput(e.clipboardData.getData('text')));
      }}
    />
  );
}
