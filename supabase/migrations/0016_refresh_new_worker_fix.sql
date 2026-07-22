-- =====================================================================
-- 근무 기록이 3번 미만(신규 알바 등)이면 아예 안 보여주던 문제 수정.
--   n>=3: 안정적으로 평균값 사용(기존과 동일).
--   n<3(신규 알바 등): 평균 대신 "가장 최근 근무 1건"을 그대로 사용해서
--   3주씩 기다리지 않고 바로 근무표에 반영되게 한다.
-- =====================================================================

create or replace function refresh_worker_schedules()
returns void language plpgsql as $$
begin
  delete from worker_schedules where true;

  insert into worker_schedules (worker_id, weekday, start_time, end_time)
  select
    worker_id,
    weekday,
    make_time(0, 0, 0) + (round(chosen_start / 15.0) * 15 || ' minutes')::interval,
    make_time(0, 0, 0) + (mod((round(chosen_end / 15.0) * 15)::int, 1440) || ' minutes')::interval
  from (
    select
      worker_id,
      weekday,
      case
        when count(*) over (partition by worker_id, weekday) >= 3
          then avg(start_min) over (partition by worker_id, weekday)
        else first_value(start_min) over (partition by worker_id, weekday order by clock_in desc)
      end as chosen_start,
      case
        when count(*) over (partition by worker_id, weekday) >= 3
          then avg(start_min + dur_min) over (partition by worker_id, weekday)
        else first_value(start_min + dur_min) over (partition by worker_id, weekday order by clock_in desc)
      end as chosen_end,
      row_number() over (partition by worker_id, weekday order by clock_in desc) as rn
    from (
      select
        worker_id,
        clock_in,
        extract(dow from clock_in at time zone 'Asia/Seoul')::int as weekday,
        extract(hour from clock_in at time zone 'Asia/Seoul') * 60
          + extract(minute from clock_in at time zone 'Asia/Seoul') as start_min,
        extract(epoch from (clock_out - clock_in)) / 60.0 as dur_min
      from shifts
      where clock_in >= now() - interval '35 days'
    ) recent
  ) picked
  where rn = 1;
end;
$$;
