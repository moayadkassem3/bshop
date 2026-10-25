import type { Metadata } from 'next';
import { AppointmentsTab } from './AppointmentsTab';

export const metadata: Metadata = { title: 'Randevularım' };

export default function MyAppointmentsPage() {
  return <AppointmentsTab />;
}
