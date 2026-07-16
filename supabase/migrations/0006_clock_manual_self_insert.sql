-- =====================================================================
-- 0006: 웹(PWA) 수동 출퇴근 허용
--   배경: iOS는 무료로 네이티브 백그라운드 위치추적이 불가($99 벽) →
--         아이폰 알바생은 사파리 PWA에서 [출근]/[퇴근] 버튼으로 직접 기록.
--   문제: 0001 의 clock_self_insert 정책은 본인 입력을 source geo/wifi 로만 허용하고
--         위치추적 동의(worker_has_active_consent)를 요구함 → manual 입력이 막힘.
--   해결: PWA 는 위치를 전혀 수집하지 않으므로(lat/lng 미기록) 위치추적 동의 없이
--         source='manual' 본인 자가입력을 허용하는 정책을 추가한다.
--         (permissive 정책이라 기존 geo/wifi+동의 경로는 그대로 유지됨)
-- =====================================================================
create policy clock_self_insert_manual on clock_events
  for insert
  with check (
    app_is_worker_self(worker_id)
    and source = 'manual'
  );
