import type { Metadata } from 'next';
import { WorkingHours } from './WorkingHours';

export const metadata: Metadata = { title: 'Çalışma saatleri' };

export default function WorkingHoursPage() {
  return <WorkingHours />;
}
