-- =====================================================================
-- 정산 로직 (MVP 2단계) — 주급 기준
--   주 시작: 월요일 (월~일). 변경하려면 date_trunc('week', ...) 부분만 조정.
--   정산식: 예상급여 = Σ(근무시간 × 그날 시급).  ※주휴수당 없음(사업장 정책)
--   모든 뷰 security_invoker=on → 조회자의 RLS 그대로 적용.
-- =====================================================================

-- ---------------------------------------------------------------------
-- weekly_expected : 알바생 × 주차별 예상급여 집계
--   근무는 '출근 시각(KST)'이 속한 주에 귀속.
-- ---------------------------------------------------------------------
create view weekly_expected with (security_invoker = on) as
select
  sp.worker_id,
  (date_trunc('week', (sp.clock_in at time zone 'Asia/Seoul')))::date as week_start,  -- 월요일
  round(sum(sp.hours), 2)                              as total_hours,
  (round(sum(sp.expected_pay) / 10) * 10)::numeric(12,2) as expected_pay,  -- 10원 단위 반올림
  count(*)                                             as shift_count
from shift_pay sp
group by
  sp.worker_id,
  (date_trunc('week', (sp.clock_in at time zone 'Asia/Seoul')))::date;

-- ---------------------------------------------------------------------
-- weekly_settlement : 예상급여 vs 실제 지급액(payouts) 비교 → 차액 산출
--   payout.period_start 가 해당 주의 월요일(week_start)과 일치한다고 가정(주급).
--   diff = 실제 - 예상  (양수=과지급, 음수=미지급/부족)
-- ---------------------------------------------------------------------
create view weekly_settlement with (security_invoker = on) as
select
  coalesce(we.worker_id, p.worker_id)        as worker_id,
  coalesce(we.week_start, p.period_start)     as week_start,
  we.total_hours,
  we.expected_pay,
  p.amount                                    as actual_pay,
  p.id                                        as payout_id,
  coalesce(p.amount, 0) - coalesce(we.expected_pay, 0) as diff,
  case
    when we.expected_pay is null            then 'no_expected'   -- 근무기록 없는데 지급만 있음
    when p.amount is null                   then 'unpaid'        -- 아직 미정산
    when round(p.amount) = round(we.expected_pay) then 'ok'      -- 일치
    when p.amount < we.expected_pay         then 'underpaid'     -- 미지급(시급 안 맞음 ← 핵심 목적)
    else                                          'overpaid'     -- 과지급
  end as status
from weekly_expected we
full outer join payouts p
  on  p.worker_id    = we.worker_id
  and p.period_start = we.week_start;
