-- =====================================================================
-- 미퇴근 알림 시점 분리
--   - 알바 본인: 마감시간 + 30분 (월~금 02:30, 토·일 03:30 KST)
--   - 사장: 영업 끝난 날짜 오전 11시(요일 무관, 항상 출근일+1일 11:00 KST)
--   기존 open_shift_alerts() 하나로 처리하던 걸 대상별로 분리하고,
--   open_shift_alert_log 에 target 컬럼 추가해 알바/사장 알림을 각자 1회씩 관리.
-- =====================================================================

alter table open_shift_alert_log
  add column target text not null default 'worker' check (target in ('worker', 'owner'));

alter table open_shift_alert_log drop constraint open_shift_alert_log_pkey;
alter table open_shift_alert_log add primary key (clock_in_event_id, target);

drop function if exists open_shift_alerts();

create or replace function open_shift_worker_alerts()
returns table (
  clock_in_event_id uuid,
  worker_id         uuid,
  worker_name       text,
  worker_auth_id    uuid,
  clock_in          timestamptz
)
language sql
stable
as $$
  select
    last.id, w.id, w.name, w.user_id, last.ts
  from workers w
  join lateral (
    select ce.id, ce.type, ce.ts
    from clock_events ce
    where ce.worker_id = w.id
    order by ce.ts desc
    limit 1
  ) last on true
  where w.active
    and last.type = 'in'
    and now() > (
      case
        when extract(dow from (last.ts at time zone 'Asia/Seoul')) in (0, 6)
        then date_trunc('day', (last.ts at time zone 'Asia/Seoul')) + interval '1 day' + interval '3 hours 30 minutes'
        else date_trunc('day', (last.ts at time zone 'Asia/Seoul')) + interval '1 day' + interval '2 hours 30 minutes'
      end at time zone 'Asia/Seoul'
    )
    and not exists (
      select 1 from open_shift_alert_log l
      where l.clock_in_event_id = last.id and l.target = 'worker'
    );
$$;

create or replace function open_shift_owner_alerts()
returns table (
  clock_in_event_id uuid,
  worker_id         uuid,
  worker_name       text,
  owner_id          uuid,
  clock_in          timestamptz
)
language sql
stable
as $$
  select
    last.id, w.id, w.name, wp.owner_id, last.ts
  from workers w
  join workplaces wp on wp.id = w.workplace_id
  join lateral (
    select ce.id, ce.type, ce.ts
    from clock_events ce
    where ce.worker_id = w.id
    order by ce.ts desc
    limit 1
  ) last on true
  where w.active
    and last.type = 'in'
    and now() > (
      (date_trunc('day', (last.ts at time zone 'Asia/Seoul')) + interval '1 day' + interval '11 hours')
      at time zone 'Asia/Seoul'
    )
    and not exists (
      select 1 from open_shift_alert_log l
      where l.clock_in_event_id = last.id and l.target = 'owner'
    );
$$;
