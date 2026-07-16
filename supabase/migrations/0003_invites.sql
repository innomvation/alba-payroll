-- =====================================================================
-- 초대코드 로그인 지원 (4단계 모바일 앱)
--   사장이 알바생별로 초대코드 발급 → 알바가 앱에 코드 입력 →
--   Edge Function(redeem-invite)이 익명 로그인 uid 를 workers.user_id 에 연결.
-- =====================================================================

create table worker_invites (
  id          uuid primary key default gen_random_uuid(),
  worker_id   uuid not null references workers (id) on delete cascade,
  code        text not null unique,                              -- 알바에게 줄 코드
  expires_at  timestamptz not null default (now() + interval '7 days'),
  used_at     timestamptz,                                       -- null = 미사용
  created_at  timestamptz not null default now()
);

-- 미사용 코드 조회 최적화
create index worker_invites_open_idx on worker_invites (code) where used_at is null;

alter table worker_invites enable row level security;

-- 관리자만 발급/조회. 코드 검증·사용처리는 Edge Function(service role)이 전담하므로
-- 알바생/익명 사용자에게는 직접 접근 권한을 주지 않음.
create policy invites_manager_all on worker_invites
  for all
  using (app_is_worker_manager(worker_id))
  with check (app_is_worker_manager(worker_id));
