-- =====================================================================
-- 마감시간 지났는데 퇴근 안 한 알바 웹푸시 알림
--   - push_subscriptions: 알바/사장 공용(둘 다 auth.users). 본인 것만 CRUD.
--   - open_shift_alert_log: 같은 근무(clock_in 이벤트)당 알림 1회만 보내기 위한 중복방지.
--   - open_shift_alerts(): 마감시간(월~금 02:00, 토·일 03:00 KST) 지난 미퇴근 근무 조회.
--   - pg_cron + pg_net: 15분마다 send-open-shift-alerts Edge Function 호출.
-- =====================================================================

create table push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth_key    text not null,
  created_at  timestamptz not null default now()
);

create index push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

create policy push_subscriptions_self_all on push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 근무(출근 이벤트)당 알림 1회 제한용 로그. service role 전용(RLS enable, 정책 없음 = 아무도 접근 불가).
create table open_shift_alert_log (
  clock_in_event_id  uuid primary key references clock_events (id) on delete cascade,
  alerted_at          timestamptz not null default now()
);

alter table open_shift_alert_log enable row level security;

-- 마감시간(월~금 02:00, 토·일 03:00 KST) 지났는데 아직 퇴근 안 한 근무 조회
create or replace function open_shift_alerts()
returns table (
  clock_in_event_id uuid,
  worker_id         uuid,
  worker_name       text,
  worker_auth_id    uuid,
  workplace_id      uuid,
  owner_id          uuid,
  clock_in          timestamptz
)
language sql
stable
as $$
  select
    last.id,
    w.id,
    w.name,
    w.user_id,
    w.workplace_id,
    wp.owner_id,
    last.ts
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
      case
        when extract(dow from (last.ts at time zone 'Asia/Seoul')) in (0, 6)
        then date_trunc('day', (last.ts at time zone 'Asia/Seoul')) + interval '1 day' + interval '3 hours'
        else date_trunc('day', (last.ts at time zone 'Asia/Seoul')) + interval '1 day' + interval '2 hours'
      end at time zone 'Asia/Seoul'
    )
    and not exists (
      select 1 from open_shift_alert_log l where l.clock_in_event_id = last.id
    );
$$;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'open-shift-alerts',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://nnlfcnufckzcwccezkxt.supabase.co/functions/v1/send-open-shift-alerts',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
