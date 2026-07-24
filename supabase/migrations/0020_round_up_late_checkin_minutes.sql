-- =====================================================================
-- 출근 반올림 규칙 변경: 분(分)이 40~59분이면 다음 정시로 올림(예: 40분→+20분,
-- 50분→+10분). 그 외(0~39분)는 기존처럼 가까운 15분 반올림 유지. 퇴근(out)과
-- 월~목 16시 고정 로직은 0013과 동일하게 유지.
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
    -- 출근: 40~59분이면 다음 정시로 올림, 그 외엔 가까운 15분 반올림
    case
      when extract(minute from o.ts at time zone 'Asia/Seoul') >= 40
        then (date_trunc('hour', o.ts at time zone 'Asia/Seoul') + interval '1 hour') at time zone 'Asia/Seoul'
      else to_timestamp(round(extract(epoch from o.ts) / 900.0) * 900.0)
    end as in_rounded,
    -- 퇴근: 기존과 동일하게 가까운 15분(900초) 반올림
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
