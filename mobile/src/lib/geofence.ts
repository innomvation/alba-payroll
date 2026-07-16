import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { submitClockEvent } from './clock';
import { currentSsid, ssidEquals } from './wifi';
import { supabase } from './supabase';

export type Workplace = {
  id: string;
  lat: number;
  lng: number;
  radius_m: number;
  wifi_ssid: string | null;
};

const TASK = 'alba-geofence';
const TRACK_TASK = 'alba-shift-tracking';
// 백그라운드 태스크는 별도 JS 컨텍스트라 클로저를 못 씀 → 컨텍스트를 저장해두고 읽음.
const CTX_KEY = 'geofence_ctx';
const TRACK_CTX = 'shift_tracking_ctx';

type Ctx = { workerId: string; workplace: Workplace };

// 가게 WiFi에 연결돼 있는지 — WiFi 우선 판정의 핵심.
async function onStoreWifi(workplace: Workplace): Promise<boolean> {
  if (!workplace.wifi_ssid) return false;
  const ssid = await currentSsid();
  return ssidEquals(ssid, workplace.wifi_ssid);
}

// 근무지 진입(in)/이탈(out)을 출퇴근으로 기록.
// WiFi 우선: 가게 WiFi(iptime5G 등)에 붙어 있어야 진짜 출근.
//   지오펜스(100m)는 OS를 깨우는 거친 트리거일 뿐, 정밀 판정은 WiFi가 함.
//   → 100m 안 단순 통과/근처 집은 출근으로 안 잡힘(오인 방지).
// 앱이 꺼져 있어도 OS가 이 태스크를 호출함.
TaskManager.defineTask(TASK, async ({ data, error }) => {
  if (error) return;
  const { eventType, region } = data as {
    eventType: Location.GeofencingEventType;
    region: Location.LocationRegion;
  };

  const raw = await AsyncStorage.getItem(CTX_KEY);
  if (!raw) return;
  const { workerId, workplace }: Ctx = JSON.parse(raw);

  if (eventType === Location.GeofencingEventType.Enter) {
    // WiFi 우선: ssid 설정돼 있으면 가게 WiFi 연결돼야만 출근.
    //   아직 연결 전이면 무시 → 앱 켤 때 보정(reconcile)/포그라운드 리스너가 잡음.
    if (workplace.wifi_ssid && !(await onStoreWifi(workplace))) return;
    await submitClockEvent({
      worker_id: workerId,
      type: 'in',
      source: workplace.wifi_ssid ? 'wifi' : 'geo',
      ts: new Date().toISOString(),
      lat: region.latitude,
      lng: region.longitude,
    });
    // 출근 확정 → 퇴근 실시간 감지용 포그라운드 추적 시작
    await startShiftTracking(workerId, workplace);
  } else if (eventType === Location.GeofencingEventType.Exit) {
    // 아직 가게 WiFi에 붙어있으면 실제 퇴근 아님 → 무시 (이탈 오인 방지)
    if (await onStoreWifi(workplace)) return;
    await submitClockEvent({
      worker_id: workerId,
      type: 'out',
      source: workplace.wifi_ssid ? 'wifi' : 'geo',
      ts: new Date().toISOString(),
      lat: region.latitude,
      lng: region.longitude,
    });
    await stopShiftTracking();
  }
});

export async function startGeofencing(workerId: string, workplace: Workplace) {
  // 권한: 포그라운드 → 백그라운드 순서로 요청해야 OS가 허용
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') throw new Error('위치 권한이 필요합니다.');
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') throw new Error("백그라운드 위치 권한('항상 허용')이 필요합니다.");

  // 백그라운드 태스크가 읽을 컨텍스트 저장
  await AsyncStorage.setItem(CTX_KEY, JSON.stringify({ workerId, workplace }));

  // 이미 돌고 있으면 좌표/반경 갱신 위해 중지 후 재시작
  const started = await Location.hasStartedGeofencingAsync(TASK).catch(() => false);
  if (started) await Location.stopGeofencingAsync(TASK);

  await Location.startGeofencingAsync(TASK, [
    {
      identifier: workplace.id,
      latitude: workplace.lat,
      longitude: workplace.lng,
      radius: Math.max(workplace.radius_m, 100),
      notifyOnEnter: true,
      notifyOnExit: true,
    },
  ]);
}

export async function stopGeofencing() {
  const started = await Location.hasStartedGeofencingAsync(TASK).catch(() => false);
  if (started) await Location.stopGeofencingAsync(TASK);
  await AsyncStorage.removeItem(CTX_KEY);
  await stopShiftTracking();
}

// ===== 근무 중 실시간 퇴근 감지 (포그라운드 위치서비스) =====
// 출근~퇴근 사이에만 켜진다. 앱이 꺼져 있어도 주기적으로 위치를 받아,
// 가게를 벗어나면 그 시각으로 퇴근을 기록하고 스스로 꺼진다(상태바 알림도 사라짐).
//   퇴근 판정: 가게 WiFi 안 붙음 + GPS 반경 밖. (WiFi 순간 끊김만으로는 퇴근 안 함)
TaskManager.defineTask(TRACK_TASK, async ({ data, error }) => {
  if (error) return;
  const { locations } = (data ?? {}) as { locations?: Location.LocationObject[] };
  const loc = locations?.[locations.length - 1];
  if (!loc) return;

  const raw = await AsyncStorage.getItem(TRACK_CTX);
  if (!raw) return;
  const { workerId, workplace }: Ctx = JSON.parse(raw);

  // 아직 가게 WiFi에 붙어 있으면 근무 중 → 퇴근 아님
  if (await onStoreWifi(workplace)) return;
  // 아직 반경 안이면 근무 중
  const outside =
    distanceM(loc.coords.latitude, loc.coords.longitude, workplace.lat, workplace.lng) >
    Math.max(workplace.radius_m, 100);
  if (!outside) return;

  // 가게 벗어남 확정 → 그 위치 시각으로 퇴근 (이미 out이면 추적만 종료)
  if ((await lastEventType(workerId)) === 'in') {
    await submitClockEvent({
      worker_id: workerId,
      type: 'out',
      source: 'geo',
      ts: new Date(loc.timestamp).toISOString(),
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
    });
  }
  await stopShiftTracking();
});

// 근무 시작 시: 포그라운드 위치서비스 ON (근무 중에만 → 배터리·알림 최소화)
export async function startShiftTracking(workerId: string, workplace: Workplace) {
  await AsyncStorage.setItem(TRACK_CTX, JSON.stringify({ workerId, workplace }));
  const started = await Location.hasStartedLocationUpdatesAsync(TRACK_TASK).catch(() => false);
  if (started) return; // 이미 추적 중
  await Location.startLocationUpdatesAsync(TRACK_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 60000, // 1분마다
    distanceInterval: 50, // 또는 50m 이동 시
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: false,
    foregroundService: {
      notificationTitle: '가포 알바 — 근무 중',
      notificationBody: '퇴근하면 자동으로 기록돼요. (근무 중에만 위치 확인)',
      notificationColor: '#1c2630',
    },
  });
}

// 퇴근/로그아웃 시: 위치서비스 OFF (상태바 알림 사라짐)
export async function stopShiftTracking() {
  const started = await Location.hasStartedLocationUpdatesAsync(TRACK_TASK).catch(() => false);
  if (started) await Location.stopLocationUpdatesAsync(TRACK_TASK);
  await AsyncStorage.removeItem(TRACK_CTX);
}

// 두 좌표 사이 거리(m) — 하버사인
function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function lastEventType(workerId: string): Promise<'in' | 'out' | null> {
  const { data } = await supabase
    .from('clock_events')
    .select('type')
    .eq('worker_id', workerId)
    .order('ts', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.type as 'in' | 'out' | undefined) ?? null;
}

// 앱 진입 시 보정: 이미 근무지 안에 있는 채로 앱을 켜면 출근이 안 찍힐 수 있음 → 현재 상태 확인.
//  - 근무지 안이면: 출근 누락 보정 + 실시간 퇴근 감지용 포그라운드 추적 (재)시작.
//  - 퇴근은 실시간 추적(startShiftTracking)이 담당 → 여기서 시각 틀린 자동퇴근은 안 함.
export async function reconcilePresence(workerId: string, workplace: Workplace) {
  const onWifi = workplace.wifi_ssid ? await onStoreWifi(workplace) : false;

  // GPS로 반경 안/밖 판정. 권한 없거나 위치 못 얻으면 null = 모름.
  let gpsInside: boolean | null = null;
  const perm = await Location.getForegroundPermissionsAsync();
  if (perm.status === 'granted') {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    }).catch(() => null);
    if (pos) {
      gpsInside =
        distanceM(pos.coords.latitude, pos.coords.longitude, workplace.lat, workplace.lng) <=
        Math.max(workplace.radius_m, 100);
    }
  }

  const last = await lastEventType(workerId);

  // 근무지 안(확정): 출근 누락 보정 + 퇴근 실시간 감지용 추적 (재)시작
  if (onWifi || gpsInside === true) {
    if (last !== 'in') {
      await submitClockEvent({
        worker_id: workerId,
        type: 'in',
        source: onWifi ? 'wifi' : 'geo',
        ts: new Date().toISOString(),
      });
    }
    await startShiftTracking(workerId, workplace);
    return;
  }

  // 근무지 밖(확정): 퇴근은 실시간 추적이 담당하므로 시각 틀린 자동퇴근 안 함.
  //   (퇴근을 놓쳤다면 대시보드 '퇴근 누락' 보정으로 처리) 떠 있던 추적은 정리.
  if (gpsInside === false) await stopShiftTracking();
  // gpsInside === null(위치 모름): 추적 상태 그대로 둠
}

// 앱이 켜져 있는 동안 WiFi 변화를 실시간 감지 → 정밀 출퇴근.
// 가게 WiFi에 붙는 순간 출근. (WiFi 끊김으로 인한 퇴근은 순간 끊김 오인이 잦아
//  여기선 처리 안 하고, 퇴근은 지오펜스 이탈로 잡음.)
// 반환값을 호출해 구독 해제.
export function watchStoreWifi(
  workerId: string,
  workplace: Workplace,
  onChange?: () => void,
) {
  if (!workplace.wifi_ssid) return () => {};
  const target = workplace.wifi_ssid;
  return NetInfo.addEventListener(async (state) => {
    const ssid =
      state.type === 'wifi'
        ? (state.details as { ssid?: string } | null)?.ssid ?? null
        : null;
    if (!ssidEquals(ssid, target)) return;
    if ((await lastEventType(workerId)) === 'in') return;
    await submitClockEvent({
      worker_id: workerId,
      type: 'in',
      source: 'wifi',
      ts: new Date().toISOString(),
    });
    await startShiftTracking(workerId, workplace);
    onChange?.();
  });
}
