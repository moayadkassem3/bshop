import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { api, ApiError, configureApi, errorMessage, WEB_URL } from '@/lib/api';
import { formatPhoneInput, phoneComplete } from '@/lib/phone';
import { useSession } from '@/lib/session';
import { colors, fonts, radius } from '@/lib/theme';
import type { Me } from '@/lib/types';
import { Icon, type IconName } from './Icon';
import { Alert, Button, Field, Text } from './ui';

type VerifyResult = { token: string; user: Me; needsProfile?: boolean; needsTerms?: boolean; hasBusiness?: boolean };

const openDoc = (key: string) => WebBrowser.openBrowserAsync(`${WEB_URL}/sozlesmeler/${key}`).catch(() => undefined);

/**
 * Sign-in with the phone only (same flow as the website): number, then the
 * 6-digit SMS code. People who work at a salon then choose business or
 * customer mode; a new customer creates their account once.
 */
export function SignIn() {
  const { signIn } = useSession();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [account, setAccount] = useState<VerifyResult | null>(null);
  const [choice, setChoice] = useState<VerifyResult | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ demoCode?: string } | undefined>('/auth/otp/request', { method: 'POST', body: { phone, portal: 'customer' } });
      // The test site sends no SMS: the code comes back and is filled in.
      if (res?.demoCode) {
        setDemoCode(res.demoCode);
        setCode(res.demoCode);
      }
      setCodeSent(true);
      setResendIn(res?.demoCode ? 10 : 30);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'OTP_TOO_SOON' && err.retryAfterSeconds) setResendIn(err.retryAfterSeconds);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<VerifyResult>('/auth/otp/verify', { method: 'POST', body: { phone, code, portal: 'customer' } });
      if (res.hasBusiness) {
        // People who work at a salon choose how to continue (as on the website); the session is kept once they do.
        configureApi({ token: res.token });
        setChoice(res);
        return;
      }
      if (res.needsProfile) {
        // The account step comes first; the session is kept only once it is done.
        configureApi({ token: res.token });
        setAccount(res);
        return;
      }
      await signIn(res.token, res.user, false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function choose(mode: 'business' | 'customer') {
    if (!choice) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'customer') {
        if (choice.needsProfile) return setAccount(choice);
        return await signIn(choice.token, choice.user, true);
      }
      const r = await api<{ token: string; user: Me }>('/me/switch', { method: 'POST', body: { to: 'business' } });
      await signIn(r.token, r.user, true);
      router.replace('/salonum');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (account) return <CreateAccount result={account} />;
  if (choice) return <ModeChoice onChoose={choose} busy={busy} error={error} />;
  return (
    <View style={{ gap: 14 }}>
      <Field
        label="Cep telefonu"
        value={formatPhoneInput(phone)}
        onChangeText={(v) => {
          setPhone(v);
          setCodeSent(false);
        }}
        keyboardType="phone-pad"
        autoComplete="tel"
        placeholder="05xx xxx xx xx"
        maxLength={14}
      />
      {!codeSent ? (
        <>
          <Button title="Doğrulama kodu gönder" onPress={sendCode} disabled={!phoneComplete(phone)} busy={busy} />
          <Text size={13} color={colors.muted}>
            Hesabınız yoksa kodu girdikten sonra birkaç bilgiyle oluşturulur. Kişisel verileriniz{' '}
            <Text size={13} color={colors.primary} weight="semibold">
              KVKK Aydınlatma Metni
            </Text>{' '}
            kapsamında işlenir.
          </Text>
          <Pressable onPress={() => openDoc('kvkk-aydinlatma')}>
            <Text size={13} weight="semibold" color={colors.primary}>
              Aydınlatma metnini oku ›
            </Text>
          </Pressable>
        </>
      ) : (
        <>
          {demoCode ? <Alert tone="info" text={`Test sürümü: SMS gönderilmez. Kodunuz ${demoCode} ve aşağıya yazıldı.`} /> : null}
          <Field
            label="SMS ile gelen 6 haneli kod"
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            autoComplete="sms-otp"
            textContentType="oneTimeCode"
            maxLength={6}
            style={styles.code}
          />
          <Button title="Doğrula" onPress={verify} disabled={code.length !== 6} busy={busy} />
          <Button kind="ghost" title={resendIn > 0 ? `Yeni kod: ${resendIn} sn` : 'Kodu tekrar gönder'} onPress={sendCode} disabled={busy || resendIn > 0} />
        </>
      )}
      {error ? <Alert text={error} /> : null}
    </View>
  );
}

/** "Hesabını oluştur": once, for a new customer (or one with details missing). */
function CreateAccount({ result }: { result: VerifyResult }) {
  const { signIn } = useSession();
  const me = result.user;
  const isNew = !me.first_name && !me.last_name;
  const [firstName, setFirstName] = useState(me.first_name ?? '');
  const [lastName, setLastName] = useState(me.last_name ?? '');
  const [gender, setGender] = useState<'male' | 'female' | null>(me.gender ?? null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptMarketing, setAcceptMarketing] = useState(false);
  const [versions, setVersions] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ key: string; version: string }[]>('/public/legal')
      .then((docs) => setVersions(Object.fromEntries(docs.map((d) => [d.key, d.version]))))
      .catch(() => undefined);
  }, []);

  const ok = Boolean(firstName.trim() && lastName.trim() && gender && (!result.needsTerms || acceptTerms) && versions['kullanici-sozlesmesi']);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const updated = await api<Me>('/me', { method: 'PATCH', body: { firstName: firstName.trim(), lastName: lastName.trim(), gender } });
      const consents = [
        ...(result.needsTerms ? [{ key: 'kullanici-sozlesmesi', version: versions['kullanici-sozlesmesi'] }] : []),
        ...(acceptMarketing ? [{ key: 'ticari-ileti-izni', version: versions['ticari-ileti-izni'] }] : []),
      ];
      if (consents.length) await api('/me/consents', { method: 'POST', body: consents });
      await signIn(result.token, { ...me, ...updated }, Boolean(result.hasBusiness));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 4 }}>
        <Text size={20} weight="bold">
          {isNew ? 'Hesabını oluştur' : 'Bilgilerini tamamla'}
        </Text>
        <Text color={colors.muted}>{isNew ? 'Bu numarayla ilk kez giriş yapıyorsun. Bir kereye mahsus birkaç bilgi:' : 'Devam etmeden önce eksik bilgilerini tamamla.'}</Text>
      </View>
      <Field label="Ad" value={firstName} onChangeText={setFirstName} autoComplete="given-name" />
      <Field label="Soyad" value={lastName} onChangeText={setLastName} autoComplete="family-name" />
      <GenderChoice value={gender} onChange={setGender} />
      {result.needsTerms ? (
        <Check on={acceptTerms} onPress={() => setAcceptTerms(!acceptTerms)}>
          <Text size={14}>
            <Text size={14} weight="semibold" color={colors.primary}>
              Kullanıcı Sözleşmesi
            </Text>
            ’ni okudum ve kabul ediyorum.
          </Text>
        </Check>
      ) : null}
      {result.needsTerms ? (
        <Pressable onPress={() => openDoc('kullanici-sozlesmesi')}>
          <Text size={13} weight="semibold" color={colors.primary}>
            Sözleşmeyi oku ›
          </Text>
        </Pressable>
      ) : null}
      <Check on={acceptMarketing} onPress={() => setAcceptMarketing(!acceptMarketing)}>
        <Text size={14}>Kampanya ve yeniliklerden SMS/e-posta ile haberdar olmak istiyorum (isteğe bağlı).</Text>
      </Check>
      <Button title={isNew ? 'Hesabı oluştur' : 'Devam'} onPress={save} disabled={!ok} busy={busy} />
      {error ? <Alert text={error} /> : null}
    </View>
  );
}

/** "Nasıl devam etmek istersin?": for numbers on a salon's team, right after the code. */
function ModeChoice({ onChoose, busy, error }: { onChoose: (mode: 'business' | 'customer') => void; busy: boolean; error: string | null }) {
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 4 }}>
        <Text size={20} weight="bold">
          Nasıl devam etmek istersin?
        </Text>
        <Text color={colors.muted}>Bu numara bir salonun ekibinde kayıtlı. İstediğin zaman Profil’den değiştirebilirsin.</Text>
      </View>
      <ChoiceCard icon="salonum" title="İşletme olarak" text="Salonum, talepler ve takvim" primary onPress={() => onChoose('business')} disabled={busy} />
      <ChoiceCard icon="profil" title="Müşteri olarak" text="Kuaför bul, randevu al" onPress={() => onChoose('customer')} disabled={busy} />
      {error ? <Alert text={error} /> : null}
    </View>
  );
}

function ChoiceCard(props: { icon: IconName; title: string; text: string; primary?: boolean; onPress: () => void; disabled?: boolean }) {
  const fg = props.primary ? colors.white : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [styles.choice, props.primary && styles.choicePrimary, pressed && { transform: [{ scale: 0.98 }] }, props.disabled && { opacity: 0.6 }]}
    >
      <View style={[styles.choiceIcon, { backgroundColor: props.primary ? colors.white : colors.ink }]}>
        <Icon name={props.icon} size={24} color={props.primary ? colors.primary : colors.white} />
      </View>
      <View style={{ flex: 1 }}>
        <Text size={18} weight="heavy" color={fg}>
          {props.title}
        </Text>
        <Text size={14} color={props.primary ? '#dbe4ff' : colors.muted}>
          {props.text}
        </Text>
      </View>
      <Icon name="chevron" size={20} color={fg} />
    </Pressable>
  );
}

export function GenderChoice(props: { value: 'male' | 'female' | null; onChange: (v: 'male' | 'female') => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Text size={14} weight="semibold" color={colors.ink2}>
        Cinsiyet
      </Text>
      <View style={{ flexDirection: 'row', gap: 10 }} accessibilityRole="radiogroup">
        {(['male', 'female'] as const).map((g) => {
          const on = props.value === g;
          return (
            <Pressable key={g} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => props.onChange(g)} style={[styles.gender, on && styles.genderOn]}>
              <Text weight="bold" color={on ? colors.primary : colors.ink}>
                {g === 'male' ? 'Erkek' : 'Kadın'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Check(props: { on: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: props.on }} onPress={props.onPress} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <View style={[styles.box, props.on && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
        {props.on ? (
          <Text color={colors.white} size={14} weight="bold">
            ✓
          </Text>
        ) : null}
      </View>
      <View style={{ flex: 1 }}>{props.children}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  code: { fontFamily: fonts.bold, fontSize: 22, letterSpacing: 6 },
  gender: { flex: 1, minHeight: 48, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  genderOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  choicePrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
});
