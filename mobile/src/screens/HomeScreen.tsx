import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert,
  ScrollView,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import {
  startGeofencing,
  stopGeofencing,
  reconcilePresence,
  watchStoreWifi,
  Workplace,
} from '../lib/geofence';
import { flushQueue } from '../lib/clock';
import { currentSsid, ssidEquals } from '../lib/wifi';

type Worker = { id: string; name: string; workplace_id: string };
type Ev = { type: 'in' | 'out'; ts: string };

const fmtTime = (ts: string) =>
  new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

// 일회성 리뷰 팝업 (한 번 닫으면 다시 안 뜸)
const REVIEW_POPUP_KEY = 'review_popup_v1_shown';

export default function HomeScreen({
  worker,
  onLogout,
}: {
  worker: Worker;
  onLogout: () => void;
}) {
  const [status, setStatus] = useState<'근무중' | '퇴근' | '-'>('-');
  const [weekHours, setWeekHours] = useState(0);
  const [todayEvents, setTodayEvents] = useState<Ev[]>([]);
  const [bgGranted, setBgGranted] = useState<boolean | null>(null);
  const [detectedSsid, setDetectedSsid] = useState<string | null>(null);
  const [storeSsid, setStoreSsid] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(REVIEW_POPUP_KEY).then((v) => {
      if (!v) setShowReview(true);
    });
  }, []);

  async function closeReview() {
    setShowReview(false);
    await AsyncStorage.setItem(REVIEW_POPUP_KEY, '1');
  }

  const refresh = useCallback(async () => {
    setDetectedSsid(await currentSsid());
    const { data: last } = await supabase
      .from('clock_events')
      .select('type')
      .eq('worker_id', worker.id)
      .order('ts', { ascending: false })
      .limit(1)
      .maybeSingle();
    setStatus(last?.type === 'in' ? '근무중' : last?.type === 'out' ? '퇴근' : '-');

    const { data: rows } = await supabase
      .from('weekly_expected')
      .select('total_hours, week_start')
      .eq('worker_id', worker.id)
      .order('week_start', { ascending: false })
      .limit(1);
    setWeekHours(rows?.[0]?.total_hours ?? 0);

    // 오늘 0시 이후 출퇴근 기록
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { data: evs } = await supabase
      .from('clock_events')
      .select('type, ts')
      .eq('worker_id', worker.id)
      .gte('ts', start.toISOString())
      .order('ts', { ascending: true });
    setTodayEvents((evs ?? []) as Ev[]);

    // 백그라운드 위치 권한 상태
    const bg = await Location.getBackgroundPermissionsAsync().catch(() => null);
    setBgGranted(bg ? bg.status === 'granted' : null);
  }, [worker.id]);

  useEffect(() => {
    let unwatch = () => {};
    (async () => {
      await flushQueue();
      const { data: wp } = await supabase
        .from('workplaces')
        .select('id, lat, lng, radius_m, wifi_ssid')
        .eq('id', worker.workplace_id)
        .single();
      if (wp) {
        setStoreSsid((wp as Workplace).wifi_ssid);
        await startGeofencing(worker.id, wp as Workplace);
        // 이미 근무지 안에서 앱을 켠 경우 자동 출근 보정
        await reconcilePresence(worker.id, wp as Workplace);
        // 앱이 열려 있는 동안 가게 WiFi 연결을 실시간 감지 → 즉시 출근 + 화면 갱신
        unwatch = watchStoreWifi(worker.id, wp as Workplace, refresh);
      }
      await refresh();
    })();
    return () => unwatch();
  }, [worker, refresh]);

  function stopAndLogout() {
    Alert.alert(
      '위치추적 중단',
      '자동 출퇴근 기록을 중단하고 로그아웃합니다.\n다시 시작하려면 사장님께 초대코드를 새로 받아야 해요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '중단하고 로그아웃',
          style: 'destructive',
          onPress: async () => {
            await stopGeofencing();
            await supabase
              .from('worker_consents')
              .update({ revoked_at: new Date().toISOString() })
              .eq('worker_id', worker.id)
              .is('revoked_at', null);
            await supabase.auth.signOut();
            onLogout();
          },
        },
      ],
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Modal visible={showReview} transparent animationType="fade" onRequestClose={closeReview}>
        <View style={styles.reviewBackdrop}>
          <View style={styles.reviewCard}>
            <Text style={styles.reviewTitle}>리뷰</Text>
            <Text style={styles.reviewStars}>★★★★★ 5/5</Text>
            <Text style={styles.reviewAuthor}>**훈</Text>
            <Text style={styles.reviewBody}>
              알바생 입장에서도 시간 체크하기 용이하구 나중에 사장님께선 편하게 시간 관리를 할 수
              있게 되서 좋을거 같아염 &gt;.*
            </Text>
            <TouchableOpacity style={styles.button} onPress={closeReview}>
              <Text style={styles.buttonText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Text style={styles.hello}>{worker.name} 님</Text>

      {bgGranted === false && (
        <TouchableOpacity style={styles.warnBox} onPress={() => Linking.openSettings()}>
          <Text style={styles.warnText}>
            ⚠️ 위치 권한이 &apos;항상 허용&apos;이 아니에요. 이대로면 앱을 닫았을 때 출퇴근이
            기록되지 않아요. 눌러서 설정 열기 →
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.card}>
        <Text style={styles.label}>현재 상태</Text>
        <Text style={[styles.status, status === '근무중' && styles.working]}>{status}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>이번 주 누적 근무</Text>
        <Text style={styles.hours}>{weekHours}시간</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>오늘 기록</Text>
        {todayEvents.length === 0 ? (
          <Text style={styles.muted}>아직 기록이 없어요.</Text>
        ) : (
          todayEvents.map((e, i) => (
            <Text key={i} style={styles.evRow}>
              {e.type === 'in' ? '🟢 출근' : '🔴 퇴근'}  ·  {fmtTime(e.ts)}
            </Text>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>WiFi 인식 상태</Text>
        <Text style={styles.evRow}>지금 연결된 WiFi: {detectedSsid ?? '(못 읽음 / 없음)'}</Text>
        <Text style={styles.evRow}>설정된 가게 WiFi: {storeSsid ?? '(미설정)'}</Text>
        <Text
          style={[
            styles.evRow,
            { fontWeight: '700' },
            ssidEquals(detectedSsid, storeSsid) ? styles.working : { color: '#b00020' },
          ]}
        >
          {ssidEquals(detectedSsid, storeSsid)
            ? '✅ 일치 — 출근 인식됨'
            : detectedSsid
              ? '❌ 이름이 안 맞음'
              : '❌ WiFi 못 읽음 (위치/GPS 켜짐 확인)'}
        </Text>
      </View>

      <Text style={styles.note}>
        가게 WiFi에 연결되면 자동으로 출근 기록됩니다. 출근 시 가게 WiFi 연결을 켜두세요. 화면을
        닫아도 동작합니다.
      </Text>

      <View style={styles.batteryBox}>
        <Text style={styles.batteryText}>
          🔋 근무 중에는 퇴근을 정확히 잡으려고 위치를 주기적으로 확인하고 상태바에 &apos;근무 중&apos;
          알림이 떠요. 퇴근하면 자동으로 꺼집니다. 근무시간 외에는 추적하지 않아요. (위치 &apos;항상
          허용&apos; + GPS 켜짐 + 배터리 최적화 &apos;제한 없음&apos; 필요 · 폰을 재시작하면 앱을 한 번
          열어주세요.)
        </Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={refresh}>
        <Text style={styles.buttonText}>새로고침</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={stopAndLogout}>
        <Text style={styles.logout}>위치추적 중단 / 로그아웃</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f7f8' },
  content: { padding: 24, gap: 16, paddingBottom: 40 },
  hello: { fontSize: 22, fontWeight: '700', marginTop: 40 },
  warnBox: { backgroundColor: '#fde8ea', borderRadius: 10, padding: 14 },
  warnText: { fontSize: 13, color: '#b00020', lineHeight: 19, fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 20, gap: 8 },
  label: { fontSize: 13, color: '#888' },
  status: { fontSize: 28, fontWeight: '700', color: '#666' },
  working: { color: '#0a7d33' },
  hours: { fontSize: 28, fontWeight: '700' },
  muted: { fontSize: 14, color: '#aaa' },
  evRow: { fontSize: 15, color: '#333' },
  note: { fontSize: 13, color: '#888', lineHeight: 20 },
  batteryBox: { backgroundColor: '#eef6ee', borderRadius: 10, padding: 14 },
  batteryText: { fontSize: 12.5, color: '#3a5a3a', lineHeight: 19 },
  button: { backgroundColor: '#1a1a1a', borderRadius: 8, padding: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  logout: { fontSize: 13, color: '#b00020', textAlign: 'center', padding: 8, marginTop: 4 },
  reviewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 28,
  },
  reviewCard: { backgroundColor: '#fff', borderRadius: 14, padding: 24, gap: 10 },
  reviewTitle: { fontSize: 18, fontWeight: '700' },
  reviewStars: { fontSize: 16, color: '#f5a623', fontWeight: '700' },
  reviewAuthor: { fontSize: 13, color: '#888' },
  reviewBody: { fontSize: 15, color: '#333', lineHeight: 22 },
});
