-- =====================================================================
-- 근무 "추가" 요청 — 출근 버튼을 아예 못 눌러서 clock_events가 하나도 없는
-- 경우, 알바가 실제 근무한 출퇴근 시각을 통째로 제안하고 사장님이 승인하면
-- clock_events에 in/out 한 쌍이 새로 생김(correction_requests는 기존 이벤트
-- 수정용이라 이 경우엔 못 씀 — clock_event_id 자체가 없음).
-- =====================================================================

create table shift_requests (
  id            uuid primary key default gen_random_uuid(),
  worker_id     uuid not null references workers(id) on delete cascade,
  requested_in  timestamptz not null,
  requested_out timestamptz not null,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);

alter table shift_requests enable row level security;

create policy shift_requests_manager_all on shift_requests
  for all
  using (app_is_worker_manager(worker_id))
  with check (app_is_worker_manager(worker_id));

create policy shift_requests_self_select on shift_requests
  for select using (app_is_worker_self(worker_id));

create policy shift_requests_self_insert on shift_requests
  for insert with check (app_is_worker_self(worker_id));
