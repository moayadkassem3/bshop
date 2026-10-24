import type { Metadata } from 'next';
import { MyAppointments } from './MyAppointments';

export const metadata: Metadata = { title: 'Randevularım' };

export default function MyAppointmentsPage() {
  return (
    <div className="container narrow">
      <h1 style={{ margin: '28px 0 16px', fontSize: 28, letterSpacing: '-0.02em' }}>Randevularım</h1>
      <MyAppointments />
    </div>
  );
}
