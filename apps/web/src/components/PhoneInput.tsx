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
      value={value}
      onChange={(e) => onChange(formatPhoneInput(e.target.value))}
    />
  );
}
