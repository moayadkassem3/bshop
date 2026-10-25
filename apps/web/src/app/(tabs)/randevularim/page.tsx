import type { Metadata } from 'next';
import { MyAppointments } from './MyAppointments';

export const metadata: Metadata = { title: 'Randevularım' };

export default function MyAppointmentsPage() {
  return <MyAppointments />;
}
