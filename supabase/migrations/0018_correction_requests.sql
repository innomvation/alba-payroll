-- =====================================================================
-- 근무 기록 수정 "요청" — 알바가 직접 새 시각을 제안하고, 사장님이 승인해야
-- 실제 clock_events.ts가 바뀜(기존 needs_correction 플래그는 사장님이 먼저 지정한
-- 걸 알바가 스스로 확정하는 방식이라 반대 방향).
-- =====================================================================

create table correction_requests (
  id              uuid primary key default gen_random_uuid(),
  clock_event_id  uuid not null references clock_events(id) on delete cascade,
  worker_id       uuid not null references workers(id) on delete cascade,
  original_ts     timestamptz not null,
  requested_ts    timestamptz not null,
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);

alter table correction_requests enable row level security;

-- 관리자: 전권(승인/거절 처리)
create policy correction_requests_manager_all on correction_requests
  for all
  using (app_is_worker_manager(worker_id))
  with check (app_is_worker_manager(worker_id));

-- 알바 본인: 요청 생성 + 본인 요청 조회(수정/삭제는 못 함 — 제출 후 임의로 못 바꾸게)
create policy correction_requests_self_select on correction_requests
  for select using (app_is_worker_self(worker_id));

create policy correction_requests_self_insert on correction_requests
  for insert with check (app_is_worker_self(worker_id));
