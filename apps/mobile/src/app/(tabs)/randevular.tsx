import { BusinessAppointments } from '@/components/BusinessAppointments';
import { MyAppointments } from '@/components/MyAppointments';
import { useSession } from '@/lib/session';
import { SignInFirst } from './salonum';

/** Randevular: the salon's requests and calendar in business mode; the customer's own otherwise. */
export default function AppointmentsScreen() {
  const { me, business } = useSession();
  if (!me) return <SignInFirst />;
  return business ? <BusinessAppointments /> : <MyAppointments />;
}
