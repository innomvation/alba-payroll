-- =====================================================================
-- 0005) 알바(앱 로그인)가 '자기 가게'를 읽을 수 있게 하는 정책
--   - 앱은 worker.workplace_id 로 workplaces 를 조회해 좌표/반경/WiFi 를 읽어야 함
--   - 0001 에는 workplaces 에 소유자(owner) 정책만 있어 알바가 못 읽었음
--   - 주의: workers 를 직접 참조하는 단순 정책은 workers 의 RLS(→ workplaces 참조)와
--     맞물려 무한 재귀("infinite recursion detected in policy")를 일으킴.
--     → security definer 헬퍼로 RLS 를 우회해 재귀를 끊는다 (0001 의 app_is_worker_* 와 동일 패턴).
-- =====================================================================

drop policy if exists workplaces_worker_select on workplaces;

create or replace function app_is_workplace_worker(p_workplace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workers
    where workplace_id = p_workplace_id and user_id = auth.uid()
  );
$$;

create policy workplaces_worker_select on workplaces
  for select using (app_is_workplace_worker(id));
