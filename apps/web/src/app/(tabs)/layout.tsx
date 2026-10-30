import { SubscriptionBanner } from '@/components/SubscriptionBanner';
import { TabBar } from '@/components/TabBar';
import styles from './tabs.module.css';

/** The four main screens share the fixed bottom navigation, as in the phone apps. */
export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className={styles.content}>
        <SubscriptionBanner />
        {children}
      </div>
      <TabBar />
    </>
  );
}
