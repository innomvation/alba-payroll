-- =====================================================================
-- 근무표(worker_schedules): 알바별 요일 반복 근무 시간.
--   최초엔 최근 35일(7일x5주) 근무 기록으로 추론해 채우고, 이후로는
--   사장이 /schedule 화면에서 수동으로 추가·수정·삭제해서 관리한다.
--   end_time < start_time이면 자정을 넘는 근무(예: 22:00~02:00)를 뜻함.
-- =====================================================================

create table worker_schedules (
  id         uuid primary key default gen_random_uuid(),
  worker_id  uuid not null references workers(id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6), -- 0=일 ... 6=토 (extract(dow)와 동일)
  start_time time not null,
  end_time   time not null,
  created_at timestamptz not null default now()
);

alter table worker_schedules enable row level security;

create policy worker_schedules_manager_all on worker_schedules
  for all
  using (app_is_worker_manager(worker_id))
  with check (app_is_worker_manager(worker_id));

create policy worker_schedules_self_select on worker_schedules
  for select using (app_is_worker_self(worker_id));

-- 최근 35일 근무 기록에서 알바x요일 조합이 5번 중 3번 이상 나오면 근무표로 시드.
-- 이 INSERT는 최초 배포 시 1회만 실행되는 데이터 마이그레이션.
with recent as (
  select
    worker_id,
    extract(dow from clock_in at time zone 'Asia/Seoul')::int as weekday,
    extract(hour from clock_in at time zone 'Asia/Seoul') * 60
      + extract(minute from clock_in at time zone 'Asia/Seoul')          as start_min,
    extract(epoch from (clock_out - clock_in)) / 60.0                    as dur_min
  from shifts
  where clock_in >= now() - interval '35 days'
),
agg as (
  select
    worker_id,
    weekday,
    count(*)                              as n,
    round(avg(start_min) / 15.0) * 15      as avg_start,
    round(avg(start_min + dur_min) / 15.0) * 15 as avg_end
  from recent
  group by worker_id, weekday
)
insert into worker_schedules (worker_id, weekday, start_time, end_time)
select
  worker_id,
  weekday,
  make_time(0, 0, 0) + (avg_start || ' minutes')::interval,
  make_time(0, 0, 0) + (mod(avg_end::int, 1440) || ' minutes')::interval
from agg
where n >= 3;
