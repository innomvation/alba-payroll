-- =====================================================================
-- 월~목요일 오후 타임은 4시 출근이 기준. 4시 전에 미리 찍고 들어오는 건
-- 급여 계산에서 인정하지 않고 4시로 고정한다(금~일은 대상 아님).
-- clock_in/clock_out(원본 펀치 시각)은 그대로 유지, hours 계산에만 반영.
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
),
rounded as (
  select
    o.worker_id,
    o.id                                                             as clock_in_id,
    o.next_id                                                        as clock_out_id,
    o.ts                                                             as clock_in,
    o.next_ts                                                        as clock_out,
    -- 출근/퇴근 각각 가까운 15분(900초)으로 반올림
    to_timestamp(round(extract(epoch from o.ts) / 900.0) * 900.0)      as in_rounded,
    to_timestamp(round(extract(epoch from o.next_ts) / 900.0) * 900.0) as out_rounded
  from ordered o
  where o.type = 'in' and o.next_type = 'out'
)
select
  r.worker_id,
  r.clock_in_id,
  r.clock_out_id,
  r.clock_in,
  r.clock_out,
  extract(epoch from (
    r.out_rounded -
    case
      -- 월(1)~목(4) & 16:00 KST 이전 출근 → 16:00으로 고정
      when extract(dow from r.in_rounded at time zone 'Asia/Seoul') between 1 and 4
       and (r.in_rounded at time zone 'Asia/Seoul')::time < time '16:00'
      then ((r.in_rounded at time zone 'Asia/Seoul')::date + time '16:00') at time zone 'Asia/Seoul'
      else r.in_rounded
    end
  )) / 3600.0 as hours
from rounded r;
