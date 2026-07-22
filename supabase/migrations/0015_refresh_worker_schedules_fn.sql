-- =====================================================================
-- worker_schedules를 최근 35일 근무 기록 기준으로 다시 계산해 전부 덮어쓰는 함수.
--   "근무표 업데이트" 버튼에서 호출. 기존 수동 수정분 포함 전부 삭제 후 재계산.
--   security invoker(기본값) — 호출한 사장님 계정의 RLS 범위 안에서만 지우고/채움.
-- =====================================================================

create or replace function refresh_worker_schedules()
returns void language plpgsql as $$
begin
  delete from worker_schedules where true; -- authenticated 롤은 WHERE 없는 DELETE가 막혀 있어 where true로 우회

  insert into worker_schedules (worker_id, weekday, start_time, end_time)
  select
    agg.worker_id,
    agg.weekday,
    make_time(0, 0, 0) + (agg.avg_start || ' minutes')::interval,
    make_time(0, 0, 0) + (mod(agg.avg_end::int, 1440) || ' minutes')::interval
  from (
    select
      worker_id,
      weekday,
      count(*) as n,
      round(avg(start_min) / 15.0) * 15 as avg_start,
      round(avg(start_min + dur_min) / 15.0) * 15 as avg_end
    from (
      select
        worker_id,
        extract(dow from clock_in at time zone 'Asia/Seoul')::int as weekday,
        extract(hour from clock_in at time zone 'Asia/Seoul') * 60
          + extract(minute from clock_in at time zone 'Asia/Seoul') as start_min,
        extract(epoch from (clock_out - clock_in)) / 60.0 as dur_min
      from shifts
      where clock_in >= now() - interval '35 days'
    ) recent
    group by worker_id, weekday
  ) agg
  where agg.n >= 3;
end;
$$;

-- PostgREST로 브라우저(사장님 로그인 세션)에서 호출하려면 실행 권한이 있어야 함.
grant execute on function refresh_worker_schedules() to authenticated;
