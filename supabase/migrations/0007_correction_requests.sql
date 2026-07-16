-- =====================================================================
-- 0007: 출퇴근 시각 수정 요청
--   배경: 사장이 대시보드에서 잘못된 출퇴근 기록을 알바생 본인이 고치게
--         위임하고 싶을 때 사용. 관리자가 특정 기록에 "수정 요청" 표시를
--         남기면, 알바생은 자기 punch PWA에서 그 기록만 시각을 고칠 수 있다.
--   범위: 알바생은 needs_correction = true 로 표시된 자기 기록만 수정 가능
--         (평소엔 본인 기록을 마음대로 못 고침 — 관리자 요청이 있을 때만 허용).
-- =====================================================================

alter table clock_events
  add column needs_correction boolean not null default false;

create policy clock_self_update_requested on clock_events
  for update
  using (app_is_worker_self(worker_id) and needs_correction = true)
  with check (app_is_worker_self(worker_id));
