import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { api, ApiError, configureApi, errorMessage, WEB_URL } from '@/lib/api';
import { formatPhoneInput, phoneComplete } from '@/lib/phone';
import { lastMode, useSession } from '@/lib/session';
import { colors, fonts, radius, themed } from '@/lib/theme';
import type { Me } from '@/lib/types';
import { Alert, Button, Field, Text } from './ui';

type VerifyResult = { token: string; user: Me; needsProfile?: boolean; needsTerms?: boolean; hasBusiness?: boolean };

const openDoc = (key: string) => WebBrowser.openBrowserAsync(`${WEB_URL}/sozlesmeler/${key}`).catch(() => undefined);

/**
 * Sign-in with the phone only (same flow as the website): number, then the
 * 6-digit SMS code. People who work at a salon continue in business mode; a
 * new customer creates their account once.
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
      // One sign-in for everyone (as on the website): people who work at a salon go straight to
      // business mode, unless they last used the app as a customer; Profil switches either way.
      if (res.hasBusiness && (await lastMode()) !== 'customer') {
        configureApi({ token: res.token });
        const r = await api<{ token: string; user: Me }>('/me/switch', { method: 'POST', body: { to: 'business' } });
        await signIn(r.token, r.user, true);
        router.replace('/salonum');
        return;
      }
      if (res.needsProfile) {
        // The account step comes first; the session is kept only once it is done.
        configureApi({ token: res.token });
        setAccount(res);
        return;
      }
      await signIn(res.token, res.user, Boolean(res.hasBusiness));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (account) return <CreateAccount result={account} />;
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

/** `locked`: shown greyed out and cannot be changed (Profil, once it is set; founder, 13 November 2026). */
export function GenderChoice(props: { value: 'male' | 'female' | null; onChange: (v: 'male' | 'female') => void; locked?: boolean }) {
  return (
    <View style={{ gap: 6 }}>
      <Text size={14} weight="semibold" color={colors.ink2}>
        Cinsiyet
      </Text>
      <View style={{ flexDirection: 'row', gap: 10 }} accessibilityRole="radiogroup">
        {(['male', 'female'] as const).map((g) => {
          const on = props.value === g;
          return (
            <Pressable
              key={g}
              disabled={props.locked}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled: props.locked }}
              onPress={() => props.onChange(g)}
              style={[styles.gender, on && styles.genderOn, props.locked && { backgroundColor: colors.bg }, props.locked && on && { borderColor: colors.muted, backgroundColor: colors.line }]}
            >
              <Text weight="bold" color={props.locked ? (on ? colors.ink : colors.muted) : on ? colors.primary : colors.ink}>
                {g === 'male' ? 'Erkek' : 'Kadın'}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {props.locked ? (
        <Text size={13} color={colors.muted}>
          Cinsiyet kayıttan sonra değiştirilemez.
        </Text>
      ) : null}
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

const styles = themed(() =>
  StyleSheet.create({
    code: { fontFamily: fonts.bold, fontSize: 22, letterSpacing: 6 },
    gender: { flex: 1, minHeight: 48, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
    genderOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  }),
);
