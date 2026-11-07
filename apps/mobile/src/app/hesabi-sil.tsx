import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { BackLink } from '@/components/BackLink';
import { Alert, Button, Card, Loading, Screen, Text } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

type Plan = {
  cancels: number;
  leaves: { shopId: string; name: string }[];
  handsOver: { shopId: string; name: string; to: string }[];
  closes: { shopId: string; name: string }[];
  blockers: { code: 'HAS_UPCOMING_WORK' | 'SHOP_HAS_APPOINTMENTS'; shopId: string; name: string; count: number }[];
};

/** Hesabı sil (as on the website): what will happen, then deletion after a confirmation. */
export default function DeleteAccountScreen() {
  const { signOut } = useSession();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Plan>('/me/deletion')
      .then(setPlan)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api('/me', { method: 'DELETE' });
      await signOut();
      router.replace('/profil');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const effects = [
    ...(plan && plan.cancels ? [`${plan.cancels} yaklaşan randevunuz iptal edilir; salona bildirilir.`] : []),
    ...(plan?.leaves.map((s) => `${s.name} ekibinden çıkarsınız.`) ?? []),
    ...(plan?.handsOver.map((s) => `${s.name} salonunun sahipliği ${s.to} kişisine geçer; salon açık kalır.`) ?? []),
    ...(plan?.closes.map((s) => `${s.name} kapanır: müşterilere görünmez ve ekibiniz de giremez.`) ?? []),
    'Adınız, telefon numaranız, favorileriniz, beğenileriniz ve bildirimleriniz silinir.',
    'Geçmiş randevularınız ve verdiğiniz puanlar salonlarda isimsiz kalır.',
  ];

  return (
    <Screen title="Hesabı sil" back={<BackLink label="Profil" />}>
      {error ? <Alert text={error} /> : null}
      {!plan && !error ? <Loading /> : null}
      {plan ? (
        <Card style={{ gap: 10 }}>
          <Text weight="semibold">Hesabınızı silerseniz:</Text>
          {effects.map((e) => (
            <Text key={e} size={14}>
              • {e}
            </Text>
          ))}
          {plan.blockers.length ? (
            <Alert
              text={plan.blockers
                .map((b) =>
                  b.code === 'SHOP_HAS_APPOINTMENTS'
                    ? `${b.name} kapanacağı için ${b.count} yaklaşan randevu iptal edilmeli.`
                    : `${b.name}: size atanmış ${b.count} yaklaşan randevu var. Bunları iptal edin veya başka personele aktarın.`,
                )
                .join('\n')}
            />
          ) : (
            <>
              <Text size={13} color={colors.muted}>
                Bu işlem geri alınamaz. Aynı numarayla daha sonra yeni bir hesap açabilirsiniz.
              </Text>
              <Pressable onPress={() => setAgreed(!agreed)} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }} accessibilityRole="checkbox" accessibilityState={{ checked: agreed }}>
                <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: agreed ? colors.danger : colors.line, backgroundColor: agreed ? colors.danger : colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                  {agreed ? <Text color={colors.white} size={14} weight="bold">✓</Text> : null}
                </View>
                <Text weight="semibold" style={{ flex: 1 }}>
                  Anladım, hesabım kalıcı olarak silinsin.
                </Text>
              </Pressable>
              <Button kind="danger" title="Hesabımı sil" onPress={remove} disabled={!agreed} busy={busy} />
            </>
          )}
        </Card>
      ) : null}
    </Screen>
  );
}
