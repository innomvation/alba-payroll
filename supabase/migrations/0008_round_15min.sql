-- =====================================================================
-- 근무시간 15분 단위 절삭(내림)으로 변경
--   기존: 분 단위 반올림 → 변경: 15분 미만 자투리는 버림(14분→0분, 16분→15분)
--   shift_pay/weekly_expected/weekly_settlement는 이 뷰를 그대로 참조하므로
--   같이 자동 반영됨. 과거 기록도 조회 시점에 새 규칙으로 재계산됨(뷰라서).
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
  -- 15분 단위 절삭(내림)
  floor(extract(epoch from (o.next_ts - o.ts)) / 60.0 / 15.0) * 15.0 / 60.0 as hours
from ordered o
where o.type = 'in' and o.next_type = 'out';
