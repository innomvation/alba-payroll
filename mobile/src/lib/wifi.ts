import NetInfo from '@react-native-community/netinfo';

// 기본값이 false라 SSID가 항상 null로 옴 → 켜야 WiFi 이름을 읽어옴.
// (안드로이드는 ACCESS_FINE_LOCATION 권한 + 위치서비스 ON 필요)
NetInfo.configure({ shouldFetchWiFiSSID: true });

// 안드로이드 WifiManager는 SSID를 따옴표로 감싸서 줄 때가 있음("iptime5G") → 제거.
export function normalizeSsid(raw?: string | null): string | null {
  if (!raw) return null;
  const s = raw.replace(/^"(.*)"$/, '$1').trim();
  return s && s !== '<unknown ssid>' ? s : null;
}

// 두 SSID가 같은지 (따옴표/공백/대소문자 무시).
export function ssidEquals(a?: string | null, b?: string | null): boolean {
  const na = normalizeSsid(a);
  const nb = normalizeSsid(b);
  return !!na && !!nb && na.toLowerCase() === nb.toLowerCase();
}

// 현재 연결된 WiFi SSID 반환 (없으면 null).
// 주의: SSID 조회는 위치 권한 + 위치서비스(GPS)가 켜져 있어야 OS가 값을 내어줌.
export async function currentSsid(): Promise<string | null> {
  const state = await NetInfo.fetch('wifi');
  const ssid = (state.details as { ssid?: string } | null)?.ssid;
  return normalizeSsid(ssid);
}
