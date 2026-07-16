-- =====================================================================
-- 알바 시급 정산 시스템 - 초기 스키마 (MVP 1단계)
-- 지오펜싱 기반 출퇴근 자동기록 → 근무시간 집계 → 예상/실제 급여 비교
--
-- 법적 근거: 위치정보법 + 개인정보보호법
--   - 명시적 동의: worker_consents 테이블로 버전/철회 관리
--   - 최소수집: clock_events.lat/lng/accuracy 는 nullable (WiFi 소스는 좌표 미수집)
--   - 접근통제: 모든 테이블 RLS — 사업장 소유자 또는 본인만 접근
-- =====================================================================

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- 공통 ENUM
-- ---------------------------------------------------------------------
create type clock_type   as enum ('in', 'out');
create type clock_source as enum ('geo', 'wifi', 'manual');

-- ---------------------------------------------------------------------
-- 공통 트리거: updated_at 자동 갱신
-- ---------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =====================================================================
-- 1) workplaces : 사업장(직장)
-- =====================================================================
create table workplaces (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name        text not null,
  lat         double precision not null,
  lng         double precision not null,
  radius_m    integer not null default 100 check (radius_m between 20 and 2000),
  wifi_ssid   text,                       -- 실내 정확도 보완용 (선택)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint lat_range check (lat between -90  and 90),
  constraint lng_range check (lng between -180 and 180)
);

create trigger trg_workplaces_updated
  before update on workplaces
  for each row execute function set_updated_at();

-- =====================================================================
-- 2) workers : 알바생
-- =====================================================================
create table workers (
  id            uuid primary key default gen_random_uuid(),
  workplace_id  uuid not null references workplaces (id) on delete cascade,
  user_id       uuid references auth.users (id) on delete set null,  -- 앱 로그인 계정(있으면 본인 접근 허용)
  name          text not null,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
  -- 시급은 worker_rate_history 로 분리 (최저임금 인상 등 변동 이력 관리)
);

create index workers_workplace_idx on workers (workplace_id);
create index workers_user_idx      on workers (user_id);

create trigger trg_workers_updated
  before update on workers
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- worker_rate_history : 시급 변동 이력 (시급의 진실의 원천)
--   effective_from(적용 시작일) 기준으로 그 날짜의 시급이 결정됨.
--   예) 2025-01-01 11,000원 → 2026-01-01 11,500원 으로 한 줄씩 추가.
--   과거 근무는 자동으로 과거 시급으로 정산됨.
-- ---------------------------------------------------------------------
create table worker_rate_history (
  id              uuid primary key default gen_random_uuid(),
  worker_id       uuid not null references workers (id) on delete cascade,
  hourly_rate     numeric(10,2) not null check (hourly_rate >= 0),
  effective_from  date not null,
  created_at      timestamptz not null default now(),
  unique (worker_id, effective_from)   -- 같은 날 중복 시급 금지
);

create index worker_rate_history_idx on worker_rate_history (worker_id, effective_from);

-- 특정 날짜에 적용되는 시급 조회 (그 날짜 이하 중 가장 최근 시급)
create or replace function worker_rate_at(p_worker_id uuid, p_on date)
returns numeric language sql stable as $$
  select hourly_rate
  from worker_rate_history
  where worker_id = p_worker_id and effective_from <= p_on
  order by effective_from desc
  limit 1;
$$;

-- =====================================================================
-- 3) worker_consents : 위치추적 동의 이력 (법적 필수)
--    동의는 버전 단위로 누적 기록, 철회는 revoked_at 으로 표시
-- =====================================================================
create table worker_consents (
  id              uuid primary key default gen_random_uuid(),
  worker_id       uuid not null references workers (id) on delete cascade,
  policy_version  text not null,                 -- 동의받은 약관 버전
  granted_at      timestamptz not null default now(),
  revoked_at      timestamptz,                   -- null = 유효
  created_at      timestamptz not null default now()
);

create index worker_consents_worker_idx on worker_consents (worker_id);

-- 현재 유효한 동의가 있는 알바생만 true
create or replace function worker_has_active_consent(p_worker_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from worker_consents
    where worker_id = p_worker_id and revoked_at is null
  );
$$;

-- =====================================================================
-- 4) clock_events : 출퇴근 원천 이벤트
--    위치 최소수집 — lat/lng/accuracy_m 는 nullable
-- =====================================================================
create table clock_events (
  id          uuid primary key default gen_random_uuid(),
  worker_id   uuid not null references workers (id) on delete cascade,
  type        clock_type   not null,
  ts          timestamptz  not null default now(),
  source      clock_source not null,
  lat         double precision,            -- geo 소스에서만 채움 (최소수집)
  lng         double precision,
  accuracy_m  numeric(6,1),                -- GPS 정확도(m), 신뢰도 판단용
  created_at  timestamptz not null default now()
);

-- 시간순 페어링/조회 최적화
create index clock_events_worker_ts_idx on clock_events (worker_id, ts);

-- =====================================================================
-- 5) payouts : 실제 지급액 (예상치와 비교용, 별도 테이블)
-- =====================================================================
create table payouts (
  id            uuid primary key default gen_random_uuid(),
  worker_id     uuid not null references workers (id) on delete cascade,
  period_start  date not null,
  period_end    date not null,
  amount        numeric(12,2) not null check (amount >= 0),
  paid_at       timestamptz,
  memo          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint payout_period_valid check (period_end >= period_start)
);

create index payouts_worker_period_idx on payouts (worker_id, period_start, period_end);

create trigger trg_payouts_updated
  before update on payouts
  for each row execute function set_updated_at();

-- =====================================================================
-- 파생 뷰: shifts (in → out 페어링)
--   security_invoker=on → 조회자의 RLS가 그대로 적용됨
--   페어링 규칙(MVP): worker별 시간순으로 'in' 바로 다음 이벤트가 'out'이면 1근무.
--   비정상(in-in, out 누락 등)은 페어에서 제외 → 2단계 정산에서 예외처리.
-- =====================================================================
create view shifts with (security_invoker = on) as
with ordered as (
  select
    ce.worker_id,
    ce.id,
    ce.type,
    ce.ts,
    lead(ce.ts)   over w as next_ts,
    lead(ce.type) over w as next_type,
    lead(ce.id)   over w as next_id
  from clock_events ce
  window w as (partition by ce.worker_id order by ce.ts)
)
select
  o.worker_id,
  o.id                                                        as clock_in_id,
  o.next_id                                                   as clock_out_id,
  o.ts                                                        as clock_in,
  o.next_ts                                                   as clock_out,
  -- 일한 시간을 '분 단위 반올림'(30초↑ 올림) 후 시간으로 환산
  round(extract(epoch from (o.next_ts - o.ts)) / 60.0) / 60.0 as hours
from ordered o
where o.type = 'in' and o.next_type = 'out';

-- 근무별 예상급여 (그 근무일에 적용되던 시급 × 시간)
--   출근 시각을 한국시간(KST) 날짜로 환산해 해당일 시급을 적용.
create view shift_pay with (security_invoker = on) as
select
  s.*,
  worker_rate_at(s.worker_id, (s.clock_in at time zone 'Asia/Seoul')::date) as hourly_rate,
  round(
    s.hours * worker_rate_at(s.worker_id, (s.clock_in at time zone 'Asia/Seoul')::date)
  )::numeric(12,2) as expected_pay
from shifts s;

-- =====================================================================
-- RLS 정책
--   - 관리자(사업장 owner): 자기 사업장 데이터 전체 권한
--   - 알바생(user_id 연결): 본인 데이터 조회 + 본인 출퇴근/동의 기록 입력
-- =====================================================================

-- 권한 헬퍼 (security definer: 정책 내 재귀 RLS 평가 회피)
create or replace function app_is_worker_manager(p_worker_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from workers wk
    join workplaces wp on wp.id = wk.workplace_id
    where wk.id = p_worker_id and wp.owner_id = auth.uid()
  );
$$;

create or replace function app_is_worker_self(p_worker_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workers
    where id = p_worker_id and user_id = auth.uid()
  );
$$;

alter table workplaces          enable row level security;
alter table workers             enable row level security;
alter table worker_rate_history enable row level security;
alter table worker_consents     enable row level security;
alter table clock_events        enable row level security;
alter table payouts             enable row level security;

-- workplaces: 소유자 전권
create policy workplaces_owner_all on workplaces
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- workers: 관리자 전권 / 본인 조회
create policy workers_manager_all on workers
  for all
  using (exists (select 1 from workplaces wp
                 where wp.id = workers.workplace_id and wp.owner_id = auth.uid()))
  with check (exists (select 1 from workplaces wp
                      where wp.id = workers.workplace_id and wp.owner_id = auth.uid()));

create policy workers_self_select on workers
  for select using (user_id = auth.uid());

-- worker_rate_history: 관리자 전권 / 본인 조회(내 시급 확인)
create policy rate_history_manager_all on worker_rate_history
  for all
  using (app_is_worker_manager(worker_id))
  with check (app_is_worker_manager(worker_id));

create policy rate_history_self_select on worker_rate_history
  for select using (app_is_worker_self(worker_id));

-- worker_consents: 관리자 전권 / 본인 조회·입력·철회
create policy consents_manager_all on worker_consents
  for all
  using (app_is_worker_manager(worker_id))
  with check (app_is_worker_manager(worker_id));

create policy consents_self_select on worker_consents
  for select using (app_is_worker_self(worker_id));

create policy consents_self_insert on worker_consents
  for insert with check (app_is_worker_self(worker_id));

create policy consents_self_update on worker_consents   -- 본인 철회(revoked_at)
  for update using (app_is_worker_self(worker_id))
  with check (app_is_worker_self(worker_id));

-- clock_events: 관리자 전권 / 본인 조회 / 본인 입력(유효 동의 필수)
create policy clock_manager_all on clock_events
  for all
  using (app_is_worker_manager(worker_id))
  with check (app_is_worker_manager(worker_id));

create policy clock_self_select on clock_events
  for select using (app_is_worker_self(worker_id));

create policy clock_self_insert on clock_events
  for insert
  with check (
    app_is_worker_self(worker_id)
    and source <> 'manual'                         -- 본인 앱 입력은 geo/wifi 만
    and worker_has_active_consent(worker_id)       -- 유효 동의 없으면 기록 차단
  );

-- payouts: 관리자만 (실제 지급액 관리는 사장 전용)
create policy payouts_manager_all on payouts
  for all
  using (app_is_worker_manager(worker_id))
  with check (app_is_worker_manager(worker_id));
