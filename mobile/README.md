# 알바 출퇴근 앱 (React Native / Expo)

지오펜싱으로 근무지 출입을 자동 기록하는 알바생용 앱. iOS + Android.

## 화면 흐름
1. **초대코드** — 사장이 발급한 코드 입력 → 익명 로그인 + 워커 연결(`redeem-invite`)
2. **위치추적 동의** — 약관 동의 → `worker_consents` 기록 (법적 필수)
3. **홈** — 현재 상태/이번 주 누적시간 표시 + 백그라운드 지오펜싱 시작

## 설치 & 실행
```bash
cd mobile
npm install
cp .env.example .env        # EXPO_PUBLIC_SUPABASE_URL / ANON_KEY 입력
npx expo prebuild           # 네이티브 프로젝트 생성 (background-geolocation 때문에 필수)
npx expo run:android        # 또는 run:ios
```
> ⚠️ **Expo Go로는 안 됩니다.** `react-native-background-geolocation`이 네이티브 모듈이라
> dev-client(prebuild 후 빌드)로 실행해야 합니다.

## 선행 조건 (중요)
1. **Supabase 마이그레이션 적용**: `0001`, `0002`, `0003_invites.sql`
2. **Edge Function 배포**: `supabase functions deploy redeem-invite`
3. **익명 로그인 켜기**: Supabase 대시보드 → Authentication → Sign In/Providers →
   **Anonymous sign-ins 활성화** (안 켜면 초대코드 단계에서 실패)
4. **BG-Geolocation 라이선스**: 디버그 빌드는 무료. 릴리스(스토어) 빌드는
   transistorsoft 라이선스 키를 `app.json`의 플러그인 `license`에 넣어야 함.

## 사장이 초대코드 발급하는 법 (임시)
아직 대시보드에 발급 버튼은 없음. 당장은 SQL로:
```sql
insert into worker_invites (worker_id, code)
values ('<worker_id>', 'ABC123');   -- 이 코드를 알바에게 전달
```
(다음 작업으로 대시보드에 "초대코드 생성" 버튼 추가 가능)

## 위치/법적 준수
- 동의(`worker_consents`) 없으면 출퇴근 기록이 RLS에서 차단됨
- 근무지 반경 진입/이탈 시점에만 좌표 수집 (상시추적 X)
- 직장 WiFi(SSID)에 붙어 있으면 이탈 이벤트 무시 → 실내에서 퇴근 오인 방지
