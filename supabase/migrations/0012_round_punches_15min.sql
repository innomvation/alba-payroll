-- =====================================================================
-- 근무시간 계산 방식 변경: "전체 시간 내림" → "출근/퇴근 각각 15분 단위 반올림"
--   기존(0008): 퇴근-출근 전체 시간을 구한 뒤 15분 단위로 내림 → 항상 알바에게 불리.
--   변경: 출근·퇴근 시각을 각각 가장 가까운 15분으로 반올림한 뒤 그 차이로 계산.
--   clock_in/clock_out 컬럼(원본 펀치 시각)은 그대로 유지, hours 계산에만 반영.
--   뷰라서 과거 기록도 조회 시점에 새 규칙으로 재계산됨.
-- =====================================================================

create or replace view shifts with (security_invoker = on) as
with ordered as (
  select
    ce.worker_id,
    ce.id,
    ce.type,
    ce.ts,
    lead(ce.ts)   over w as next_ts,
    lead(ce.type) over w as next_type,
    lead(ce.id)   over w as next_id
  from clock_events ce
  window w as (partition by ce.worker_id order by ce.ts)
)
select
  o.worker_id,
  o.id                                                        as clock_in_id,
  o.next_id                                                   as clock_out_id,
  o.ts                                                        as clock_in,
  o.next_ts                                                   as clock_out,
  -- 출근/퇴근 각각 가까운 15분(900초)으로 반올림 후 차이 계산
  (
    round(extract(epoch from o.next_ts) / 900.0) * 900.0
    - round(extract(epoch from o.ts) / 900.0) * 900.0
  ) / 3600.0 as hours
from ordered o
where o.type = 'in' and o.next_type = 'out';
