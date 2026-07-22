-- =====================================================================
-- 근무표(worker_schedules)에 있는데 오늘 아직 출근(in)을 안 누른 알바를 찾아
-- 사장에게 푸시 알림. 기존 미퇴근 알림(open_shift_*_alerts)은 "마지막 이벤트가
-- in인데 마감 지남"을 보지만, 이번엔 오늘 in 이벤트가 아예 없는 걸 찾아야 해서
-- 반대 방향 함수가 필요함.
-- =====================================================================

create table no_checkin_alert_log (
  worker_id  uuid not null references workers(id) on delete cascade,
  alert_date date not null,
  created_at timestamptz not null default now(),
  primary key (worker_id, alert_date)
);

alter table no_checkin_alert_log enable row level security;
-- service-role(엣지함수)만 다루므로 별도 정책 없음(open_shift_alert_log와 동일 패턴)

create or replace function no_checkin_owner_alerts()
returns table(worker_id uuid, worker_name text, owner_id uuid, scheduled_start time)
language sql stable as $$
  select w.id, w.name, wp.owner_id, ws.start_time
  from worker_schedules ws
  join workers w on w.id = ws.worker_id and w.active
  join workplaces wp on wp.id = w.workplace_id
  where ws.weekday = extract(dow from now() at time zone 'Asia/Seoul')::int
    and (now() at time zone 'Asia/Seoul')::time >= ws.start_time + interval '15 minutes'
    and not exists (
      select 1 from clock_events ce
      where ce.worker_id = w.id and ce.type = 'in'
        and (ce.ts at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date
    )
    and not exists (
      select 1 from no_checkin_alert_log l
      where l.worker_id = w.id and l.alert_date = (now() at time zone 'Asia/Seoul')::date
    );
$$;
