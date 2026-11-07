import { Redirect } from 'expo-router';
import { ExploreMap } from '@/components/ExploreMap';
import { useSession } from '@/lib/session';

/**
 * Keşfet (as on the website): the map of bookable salons with the list in a
 * draggable sheet. The salon-type filter starts from the gender given at
 * sign-up. Business mode starts on Salonum instead.
 */
export default function ExploreScreen() {
  const { me, business } = useSession();
  if (business) return <Redirect href="/salonum" />;
  return <ExploreMap initialAudience={me?.gender === 'female' ? 'women' : me?.gender === 'male' ? 'men' : 'all'} />;
}
