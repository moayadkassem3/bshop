import { router } from 'expo-router';
import { View } from 'react-native';
import { ExploreMap } from '@/components/ExploreMap';
import { SkeletonList } from '@/components/motion';
import { Alert } from '@/components/ui';
import { useBusinessShops } from '@/lib/business';
import { colors } from '@/lib/theme';

/**
 * Haritada gör (as the website's map in business mode): Keşfet centred on your
 * salon, its own card at the top of the sheet and the salons around it below.
 */
export default function SalonMapScreen() {
  const { shop, error } = useBusinessShops();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/salonum'));
  if (error) {
    return (
      <View style={{ flex: 1, padding: 16, paddingTop: 80, backgroundColor: colors.bg }}>
        <Alert text={error} />
      </View>
    );
  }
  if (!shop) {
    return (
      <View style={{ flex: 1, padding: 16, paddingTop: 80, backgroundColor: colors.bg }}>
        <SkeletonList rows={2} />
      </View>
    );
  }
  return <ExploreMap key={shop.id} home={shop} onBack={back} />;
}
