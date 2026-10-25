import type { Metadata } from 'next';
import { MyAppointments } from './MyAppointments';

export const metadata: Metadata = { title: 'Randevularım' };

export default function MyAppointmentsPage() {
  return (
    <>
      <header className="page-header">
        <div className="container narrow">
          <h1>Randevular</h1>
        </div>
      </header>
      <div className="container narrow" style={{ paddingTop: 16 }}>
        <MyAppointments />
      </div>
    </>
  );
}
