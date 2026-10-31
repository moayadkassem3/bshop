import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as Speech from 'expo-speech';
import { FullScreenAlert, type Diagnostics, type LaunchAlert } from './modules/full-screen-alert';

// Milestone 0: measures how prominent a new-appointment alert can be on a real
// phone. Local notifications stand in for server push; sound, lock-screen,
// heads-up and action-button behaviour are the same for both.

const SOUND = 'randevu_alert.wav';
const CHANNEL_NORMAL = 'randevu-alarm-normal-v1';
const CHANNEL_ALARM = 'randevu-alarm-alarmsesi-v1';
const CATEGORY_REQUEST = 'randevu-talebi';
const ACTION_CONFIRM = 'onayla';
const ACTION_DECLINE = 'reddet';

type Kind = 'request' | 'reminder' | 'confirmed';

type AlertData = {
  kind: Kind;
  customer: string;
  services: string;
  time: string;
  scheduledFor: number;
};

type LogEntry = { at: number; text: string };

const SAMPLE = {
  customer: 'Ahmet Yılmaz',
  services: 'Saç Kesimi + Sakal Tıraşı (50 dk, ₺750)',
  time: 'Bugün 18:45',
};

const TITLES: Record<Kind, string> = {
  request: 'Yeni randevu talebi',
  reminder: 'Hatırlatma: talep yanıt bekliyor',
  confirmed: 'Yeni randevu (onaylandı)',
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

async function setUpNotifications() {
  if (Platform.OS === 'android') {
    const common = {
      importance: Notifications.AndroidImportance.MAX,
      sound: SOUND,
      vibrationPattern: [0, 600, 300, 600, 300, 600],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
      enableVibrate: true,
    };
    await Notifications.setNotificationChannelAsync(CHANNEL_NORMAL, {
      ...common,
      name: 'Randevu alarmı (bildirim sesi)',
      audioAttributes: { usage: Notifications.AndroidAudioUsage.NOTIFICATION_RINGTONE },
    });
    await Notifications.setNotificationChannelAsync(CHANNEL_ALARM, {
      ...common,
      name: 'Randevu alarmı (alarm sesi)',
      audioAttributes: { usage: Notifications.AndroidAudioUsage.ALARM },
    });
  }
  await Notifications.setNotificationCategoryAsync(CATEGORY_REQUEST, [
    { identifier: ACTION_CONFIRM, buttonTitle: 'Onayla', options: { opensAppToForeground: true } },
    {
      identifier: ACTION_DECLINE,
      buttonTitle: 'Reddet',
      options: { opensAppToForeground: true, isDestructive: true },
    },
  ]);
}

function speechText(data: AlertData) {
  const prefix = data.kind === 'confirmed' ? 'Yeni onaylı randevu.' : 'Yeni randevu talebi.';
  return `${prefix} ${data.customer}. ${data.services}. ${data.time}.`;
}

function yesNo(value: boolean) {
  return value ? 'açık' : 'kapalı';
}

function clock(ms: number) {
  return new Date(ms).toLocaleTimeString('tr-TR');
}

export default function App() {
  const [permission, setPermission] = useState('kontrol ediliyor…');
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const activeNotificationId = useRef<number | null>(null);
  const handledAlerts = useRef(new Set<number>());
  const [useAlarmSound, setUseAlarmSound] = useState(false);
  const [speak, setSpeak] = useState(true);
  const [active, setActive] = useState<AlertData | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const speakRef = useRef(speak);
  speakRef.current = speak;

  const addLog = useCallback((text: string) => {
    setLog((prev) => [{ at: Date.now(), text }, ...prev].slice(0, 30));
  }, []);

  const sayAloud = useCallback(
    (text: string) =>
      Speech.speak(text, {
        language: 'tr-TR',
        onStart: () => addLog('Sesli okuma başladı'),
        onDone: () => addLog('Sesli okuma bitti'),
        onError: (e) => addLog(`Sesli okuma hatası: ${e.message}`),
      }),
    [addLog],
  );

  const show = useCallback(
    (data: AlertData) => {
      setActive(data);
      if (speakRef.current) sayAloud(speechText(data));
    },
    [sayAloud],
  );

  // A full-screen alert (or one of its buttons) opened the app.
  const handleNativeAlert = useCallback(
    (alert: LaunchAlert) => {
      const data = JSON.parse(alert.payload) as AlertData;
      const delay = ((Date.now() - data.scheduledFor) / 1000).toFixed(1);
      if (alert.action) {
        addLog(`Tam ekran bildirimi: ${alert.action === 'onayla' ? 'Onayla' : 'Reddet'} düğmesi`);
        FullScreenAlert?.dismiss(alert.notificationId);
        return;
      }
      // Build 3 may open the app twice for one alert (full-screen request and direct open).
      if (handledAlerts.current.has(alert.notificationId)) return;
      handledAlerts.current.add(alert.notificationId);
      addLog(`Tam ekran açıldı (gecikme ${delay} sn)`);
      activeNotificationId.current = alert.notificationId;
      show(data);
    },
    [addLog, show],
  );

  // Phone details, permissions, and what the native side recorded while the app was closed.
  const refreshDiagnostics = useCallback(() => {
    if (!FullScreenAlert) return;
    setDiagnostics(FullScreenAlert.diagnostics(CHANNEL_NORMAL));
    for (const entry of FullScreenAlert.takeNativeLog()) addLog(`[telefon] ${entry}`);
  }, [addLog]);

  const refreshPermission = useCallback(async () => {
    const status = await Notifications.getPermissionsAsync();
    setPermission(status.granted ? 'izin verildi' : `izin yok (${status.status})`);
    return status.granted;
  }, []);

  useEffect(() => {
    setUpNotifications().catch((e) => addLog(`Kurulum hatası: ${String(e)}`));
    refreshPermission();
    refreshDiagnostics();
    const launch = FullScreenAlert?.takeLaunchAlert();
    if (launch) handleNativeAlert(launch);
    const nativeAlerts = FullScreenAlert?.addListener('onAlert', handleNativeAlert);
    // Re-check permissions when coming back from settings or from the lock screen.
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshDiagnostics();
    });

    const received = Notifications.addNotificationReceivedListener((n) => {
      const data = n.request.content.data as AlertData;
      const delay = ((Date.now() - data.scheduledFor) / 1000).toFixed(1);
      addLog(`Uygulama açıkken geldi: ${TITLES[data.kind]} (gecikme ${delay} sn)`);
      show(data);
    });

    const response = Notifications.addNotificationResponseReceivedListener((r) => {
      const data = r.notification.request.content.data as AlertData;
      const action =
        r.actionIdentifier === ACTION_CONFIRM
          ? 'Onayla düğmesi'
          : r.actionIdentifier === ACTION_DECLINE
            ? 'Reddet düğmesi'
            : 'bildirime dokunuldu';
      addLog(`${TITLES[data.kind]}: ${action}`);
      Notifications.dismissNotificationAsync(r.notification.request.identifier);
      if (r.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) show(data);
    });

    return () => {
      received.remove();
      response.remove();
      nativeAlerts?.remove();
      appState.remove();
    };
  }, [addLog, refreshPermission, refreshDiagnostics, show, handleNativeAlert]);

  async function ensurePermission() {
    let granted = await refreshPermission();
    if (!granted) {
      await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: true, allowBadge: false },
      });
      granted = await refreshPermission();
      if (!granted) addLog('Bildirim izni verilmedi. Ayarlardan izin verin.');
    }
    return granted;
  }

  async function scheduleFullScreen(seconds: number) {
    if (!FullScreenAlert || !(await ensurePermission())) return;
    const data: AlertData = { kind: 'request', ...SAMPLE, scheduledFor: Date.now() + seconds * 1000 };
    FullScreenAlert.schedule(
      seconds,
      useAlarmSound ? CHANNEL_ALARM : CHANNEL_NORMAL,
      TITLES.request,
      `${SAMPLE.customer} · ${SAMPLE.services} · ${SAMPLE.time}`,
      JSON.stringify(data),
      true,
    );
    addLog(`Tam ekran talep ${seconds} sn sonra gelecek (${clock(data.scheduledFor)}). Telefonu kilitleyin.`);
  }

  async function testSpeech() {
    const voices = await Speech.getAvailableVoicesAsync();
    const turkish = voices.filter((v) => v.language.toLowerCase().startsWith('tr'));
    addLog(`Türkçe ses: ${turkish.length} (toplam ${voices.length})`);
    sayAloud(speechText({ kind: 'request', ...SAMPLE, scheduledFor: Date.now() }));
  }

  async function schedule(kind: Kind, seconds: number) {
    if (!(await ensurePermission())) return;
    const data: AlertData = { kind, ...SAMPLE, scheduledFor: Date.now() + seconds * 1000 };
    const channelId = useAlarmSound ? CHANNEL_ALARM : CHANNEL_NORMAL;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: TITLES[kind],
        body: `${SAMPLE.customer} · ${SAMPLE.services} · ${SAMPLE.time}`,
        data,
        sound: SOUND,
        priority: Notifications.AndroidNotificationPriority.MAX,
        interruptionLevel: 'timeSensitive',
        categoryIdentifier: kind === 'confirmed' ? undefined : CATEGORY_REQUEST,
        sticky: kind !== 'confirmed',
        autoDismiss: kind === 'confirmed',
      },
      // A 1-second trigger instead of null so Android uses the chosen channel.
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(seconds, 1),
        channelId,
      },
    });
    addLog(
      seconds === 0
        ? `${TITLES[kind]} hemen gönderildi`
        : `${TITLES[kind]} ${seconds} sn sonra gelecek (${clock(data.scheduledFor)}). Telefonu kilitleyin.`,
    );
  }

  function respond(label: string) {
    if (active) addLog(`Tam ekran görünüm: ${label}`);
    Speech.stop();
    // Answering stops the repeating ring of a full-screen alert.
    if (activeNotificationId.current !== null) FullScreenAlert?.dismiss(activeNotificationId.current);
    activeNotificationId.current = null;
    setActive(null);
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Randevu Alarm Testi</Text>
        <Text style={styles.muted}>Bildirim izni: {permission}</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Ayarlar</Text>
          {Platform.OS === 'android' && (
            <Row label="Sessiz modda da çal (alarm sesi)" value={useAlarmSound} onChange={setUseAlarmSound} />
          )}
          <Row label="Ayrıntıları sesli oku" value={speak} onChange={setSpeak} />
          <Button label="Sesli okumayı şimdi dene" onPress={testSpeech} />
        </View>

        {FullScreenAlert && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Tam ekran alarm (test 3)</Text>
            {diagnostics && (
              <>
                <Text style={styles.muted}>
                  Telefon: {diagnostics.manufacturer} {diagnostics.model} · Android {diagnostics.androidVersion} (API{' '}
                  {diagnostics.sdk})
                </Text>
                <Text style={styles.muted}>
                  Bildirimler: {yesNo(diagnostics.notificationsEnabled)} · Kanal önemi:{' '}
                  {diagnostics.channelImportance ?? '-'}
                </Text>
                <Text style={styles.muted}>Tam ekran izni: {yesNo(diagnostics.canUseFullScreenIntent)}</Text>
                <Text style={styles.muted}>Diğer uygulamaların üzerinde göster: {yesNo(diagnostics.canDrawOverlays)}</Text>
                <Text style={styles.muted}>Tam zamanlı alarm: {yesNo(diagnostics.canScheduleExactAlarms)}</Text>
              </>
            )}
            {diagnostics?.canUseFullScreenIntent === false && (
              <Button label="Tam ekran iznini aç" onPress={() => FullScreenAlert?.openFullScreenSettings()} primary />
            )}
            {diagnostics?.canDrawOverlays === false && (
              <Button
                label="Üzerinde gösterme iznini aç"
                onPress={() => FullScreenAlert?.openOverlaySettings()}
              />
            )}
            <Button
              label="Uygulama izinlerini aç (kilit ekranında göster)"
              onPress={() => FullScreenAlert?.openAppPermissions()}
            />
            <Text style={styles.muted}>
              Düğmeye basın ve telefonu kilitleyin. Ekran açılmalı, ses yanıt verene kadar tekrar etmeli ve
              ayrıntılar sesli okunmalı.
            </Text>
            <Button label="Tam ekran talep · 10 sn sonra" onPress={() => scheduleFullScreen(10)} primary />
            <Button label="Tam ekran talep · 60 sn sonra" onPress={() => scheduleFullScreen(60)} />
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Test bildirimleri</Text>
          <Text style={styles.muted}>
            Düğmeye basın, ardından telefonu kilitleyin veya başka bir uygulamaya geçin.
          </Text>
          <Button label="Yeni talep · 10 sn sonra" onPress={() => schedule('request', 10)} primary />
          <Button label="Hatırlatma · 10 sn sonra" onPress={() => schedule('reminder', 10)} />
          <Button label="Onaylı randevu · 10 sn sonra" onPress={() => schedule('confirmed', 10)} />
          <Button label="Yeni talep · 60 sn sonra" onPress={() => schedule('request', 60)} />
          <Button label="Yeni talep · hemen" onPress={() => schedule('request', 0)} />
          <Button label="Tam ekran görünümü dene" onPress={() => show({ kind: 'request', ...SAMPLE, scheduledFor: Date.now() })} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Kontrol listesi</Text>
          {[
            'Tam ekran talep: kilitliyken ekran açıldı ve tam ekran görünüm geldi mi?',
            'Tam ekran talep: ayrıntılar sesli okundu mu?',
            'Tam ekran talep: ses yanıt verene kadar tekrar etti mi?',
            'Sessiz modda, "Sessiz modda da çal" açıkken ses çaldı mı?',
            'Rahatsız Etmeyin açıkken bildirim geldi mi?',
            'Bildirimde Onayla / Reddet düğmeleri göründü mü?',
            'Uygulama tamamen kapalıyken (son uygulamalardan kaydırın) bildirim geldi mi?',
            'Bildirim kendiliğinden kayboldu mu, yoksa yanıt verilene kadar kaldı mı?',
          ].map((q) => (
            <Text key={q} style={styles.check}>• {q}</Text>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Olay günlüğü</Text>
          {log.length === 0 && <Text style={styles.muted}>Henüz olay yok.</Text>}
          {log.map((e) => (
            <Text key={e.at + e.text} style={styles.log}>
              {clock(e.at)} · {e.text}
            </Text>
          ))}
        </View>
      </ScrollView>

      <Modal visible={active !== null} animationType="slide" onRequestClose={() => respond('kapatıldı')}>
        {active && (
          <View style={styles.full}>
            <Text style={styles.fullKicker}>{TITLES[active.kind]}</Text>
            <Text style={styles.fullTime}>{active.time}</Text>
            <Text style={styles.fullName}>{active.customer}</Text>
            <Text style={styles.fullServices}>{active.services}</Text>
            {active.kind === 'confirmed' ? (
              <Button label="Tamam" onPress={() => respond('Tamam')} primary />
            ) : (
              <View style={styles.fullActions}>
                <Button label="Reddet" onPress={() => respond('Reddet')} />
                <Button label="Onayla" onPress={() => respond('Onayla')} primary />
              </View>
            )}
          </View>
        )}
      </Modal>
    </View>
  );
}

function Row(props: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{props.label}</Text>
      <Switch value={props.value} onValueChange={props.onChange} />
    </View>
  );
}

function Button(props: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.button,
        props.primary && styles.buttonPrimary,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.buttonText, props.primary && styles.buttonTextPrimary]}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f4f4fb' },
  content: { padding: 16, paddingTop: 56, gap: 12 },
  title: { fontSize: 26, fontWeight: '700', color: '#1b1640' },
  muted: { color: '#5d5b72', fontSize: 14 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#1b1640' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { fontSize: 15, color: '#1b1640', flexShrink: 1 },
  button: {
    borderWidth: 1.5,
    borderColor: '#4f46e5',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    flexGrow: 1,
  },
  buttonPrimary: { backgroundColor: '#4f46e5' },
  buttonText: { color: '#4f46e5', fontSize: 16, fontWeight: '600' },
  buttonTextPrimary: { color: '#fff' },
  check: { color: '#1b1640', fontSize: 14 },
  log: { color: '#3b3950', fontSize: 13 },
  full: { flex: 1, backgroundColor: '#1b1640', padding: 24, justifyContent: 'center', gap: 16 },
  fullKicker: { color: '#c7c3ff', fontSize: 18, fontWeight: '600' },
  fullTime: { color: '#fff', fontSize: 56, fontWeight: '800' },
  fullName: { color: '#fff', fontSize: 28, fontWeight: '700' },
  fullServices: { color: '#e4e2ff', fontSize: 18, marginBottom: 24 },
  fullActions: { flexDirection: 'row', gap: 12 },
});
