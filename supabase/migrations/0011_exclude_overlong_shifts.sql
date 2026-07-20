-- =====================================================================
-- 비정상적으로 긴 근무는 급여 계산에서 자동 제외
--   퇴근을 안 누르고 며칠 뒤 앱을 열 때 lateOutCard/기본값(현재시각)으로
--   그대로 제출하면 실제로 근무하지 않은 시간까지 근무로 잡혀 급여가
--   부풀려짐(예: 토요일 출근~일요일 오후에야 퇴근 처리 → 21시간).
--   한 근무가 12시간을 넘으면 실수로 간주해 shift_pay(급여계산용)에서
--   제외한다. 원본 출퇴근 시각은 shifts 뷰에 그대로 남아 사장이 화면에서
--   확인하고 worker/[id] 페이지에서 직접 고칠 수 있다.
-- =====================================================================
create or replace view shift_pay with (security_invoker = on) as
select
  s.*,
  worker_rate_at(s.worker_id, (s.clock_in at time zone 'Asia/Seoul')::date) as hourly_rate,
  round(
    s.hours * worker_rate_at(s.worker_id, (s.clock_in at time zone 'Asia/Seoul')::date)
  )::numeric(12,2) as expected_pay
from shifts s
where s.hours <= 12;
