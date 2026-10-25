import type { Metadata } from 'next';
import { RegisterWizard } from '@/components/register/RegisterWizard';

export const metadata: Metadata = { title: 'İşletme kaydı' };

export default function RegisterPage() {
  return <RegisterWizard />;
}
