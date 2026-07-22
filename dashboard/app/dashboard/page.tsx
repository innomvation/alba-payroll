import { Fragment } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import PaidToggle from './paid-toggle'
import CopyAccountButton from './copy-account'
import PushSubscribe from './push-subscribe'
import BottomNav from '../bottom-nav'
import CalendarPicker from './calendar-picker'
import NoShowRow from './no-show-row'

export const dynamic = 'force-dynamic'

type Settlement = {
  worker_id: string
  week_start: string
  total_hours: number | null
  expected_pay: number | null
  payout_id: string | null
}

type Shift = {
  clock_in_id: string
  worker_id: string
  clock_in: string
  clock_out: string
  hours: number
}

type ClockEvt = {
  worker_id: string
  type: 'in' | 'out'
  ts: string
}

const round10 = (n: number | null) => (n == null ? null : Math.round(n / 10) * 10)
const won = (n: number | null) => (n == null ? '-' : `${Math.round(n).toLocaleString('ko-KR')}원`)
// 소수 시간 → "16H 44M"
const hm = (h: number | null) => {
  if (h == null) return '-'
  const m = Math.round(h * 60)
  return `${Math.floor(m / 60)}H ${m % 60}M`
}
// 소수 시간 → "6" / "4.25" (수기 메모 표기 스타일)
const fmtHours = (h: number) => String(Math.round(h * 100) / 100)

// KST 기준 날짜/시/분 추출
function kstParts(iso: string) {
  const d = new Date(iso)
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value])) as Record<string, string>
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) }
}

const weekdayKr = (dateStr: string) => {
  const d = new Date(dateStr + 'T00:00:00Z')
  return ['일', '월', '화', '수', '목', '금', '토'][d.getUTCDay()]
}

const dateLabel = (dateStr: string) => {
  const [, m, d] = dateStr.split('-')
  return `${Number(m)}/${Number(d)} ${weekdayKr(dateStr)}`
}

function addDaysStr(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// KST 달력일의 자정(00:00)에 해당하는 UTC 시각
function kstMidnightUtcIso(dateStr: string) {
  return new Date(new Date(dateStr + 'T00:00:00Z').getTime() - 9 * 3600 * 1000).toISOString()
}

// 출근일이 속한 날의 가게 마감 시각(다음날 새벽) — 월~금 02:00 KST, 토·일 03:00 KST
function closingDeadline(clockInIso: string) {
  const start = kstParts(clockInIso)
  const d = new Date(start.date + 'T00:00:00Z')
  const dow = d.getUTCDay() // 0=일 ... 6=토 (KST 달력일 기준)
  const closeHourKst = dow === 0 || dow === 6 ? 3 : 2
  const deadline = new Date(d)
  deadline.setUTCDate(deadline.getUTCDate() + 1)
  deadline.setUTCHours(closeHourKst - 9, 0, 0, 0) // KST → UTC (음수는 자동으로 전날로 굴러감)
  return deadline
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const { week: weekParam } = await searchParams
  const supabase = await createClient()

  // clock_events는 "가장 최근 이벤트"만 필요하므로 최근 3일로 범위 제한(전체 이력 스캔 방지 — 속도 개선)
  const recentCutoffIso = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString()

  function fetchShifts(week: string) {
    return supabase
      .from('shifts')
      .select('clock_in_id, worker_id, clock_in, clock_out, hours')
      .gte('clock_in', kstMidnightUtcIso(week))
      .lt('clock_in', kstMidnightUtcIso(addDaysStr(week, 7)))
      .order('clock_in', { ascending: true })
  }

  const now = new Date()
  // 오늘(KST) 요일 — 근무표 대비 "오늘 근무 예정인데 출근 안 한 사람" 판단용
  const todayKst = kstParts(now.toISOString()).date
  const todayWeekday = new Date(todayKst + 'T00:00:00Z').getUTCDay()

  // ◀▶로 이동할 땐 week가 URL에 이미 있으니, 다른 쿼리들과 병렬로 바로 shifts도 같이 조회(왕복 한 번 줄임).
  // 최초 진입(week 없음)만 settlement 조회 후 "가장 최근 주"를 알아내야 해서 순차로 감.
  const [{ data: rows }, { data: workers }, { data: clockRows }, { data: todaySchedules }, prefetchedShifts] =
    await Promise.all([
      supabase.from('weekly_settlement').select('*').order('week_start', { ascending: false }),
      supabase.from('workers').select('id, name, account_number, bank_name, active'),
      supabase
        .from('clock_events')
        .select('worker_id, type, ts')
        .gte('ts', recentCutoffIso)
        .order('ts', { ascending: true }),
      supabase.from('worker_schedules').select('worker_id, start_time').eq('weekday', todayWeekday),
      weekParam ? fetchShifts(weekParam) : Promise.resolve(null),
    ])

  const nameOf = new Map((workers ?? []).map((w) => [w.id, w.name]))
  const acctOf = new Map(
    (workers ?? []).map((w) => [w.id, { account_number: w.account_number, bank_name: w.bank_name }]),
  )
  const settlements = (rows ?? []) as Settlement[]
  const unpaidCount = settlements.filter((r) => r.expected_pay != null && r.payout_id == null).length

  // 알바별 가장 최근 출퇴근 이벤트(ts 오름차순으로 채워서 마지막 값이 최신)
  const lastEventOf = new Map<string, ClockEvt>()
  // 알바별 최근 이벤트 전체(ts 오름차순) — 중간에 퇴근이 빠진 경우(출근 다음이 또 출근) 감지용
  const eventsByWorker = new Map<string, ClockEvt[]>()
  for (const e of (clockRows ?? []) as ClockEvt[]) {
    lastEventOf.set(e.worker_id, e)
    if (!eventsByWorker.has(e.worker_id)) eventsByWorker.set(e.worker_id, [])
    eventsByWorker.get(e.worker_id)!.push(e)
  }
  const openAlerts = (workers ?? [])
    .filter((w) => w.active)
    .map((w) => {
      const events = eventsByWorker.get(w.id) ?? []
      const last = events[events.length - 1]
      // 지금 출근 상태로 마감시간이 지남 (기존 검사)
      const isOpenLate = !!last && last.type === 'in' && now >= closingDeadline(last.ts)
      // 과거 어느 지점에서 출근 다음이 또 출근이면, 그 뒤에 정상적으로 퇴근을 눌러 "최근 이벤트"만 보면
      // 문제없어 보여도 중간에 퇴근 기록이 통째로 빠진 것 — worker/[id] 페이지의 missingOut 감지와 동일한 로직
      const hasGap = events.some((e, i) => e.type === 'in' && events[i + 1]?.type === 'in')
      if (!isOpenLate && !hasGap) return null
      return { name: w.name }
    })
    .filter((v): v is { name: string } => v !== null)

  // 지금 출근 상태인 알바 전부(마감시간 지났는지와 무관) — 너무 오래 근무중이면(예: 퇴근 깜빡함) 한눈에 보이게
  const workingNow = (workers ?? [])
    .filter((w) => w.active)
    .map((w) => {
      const last = lastEventOf.get(w.id)
      if (!last || last.type !== 'in') return null
      const hours = (now.getTime() - new Date(last.ts).getTime()) / 3600000
      return { name: w.name, clockIn: last.ts, hours }
    })
    .filter((v): v is { name: string; clockIn: string; hours: number } => v !== null)
    .sort((a, b) => b.hours - a.hours)

  const activeWorkerIds = new Set((workers ?? []).filter((w) => w.active).map((w) => w.id))
  const activeWorkers = (workers ?? []).filter((w) => w.active).map((w) => ({ id: w.id, name: w.name }))

  // 오늘 근무표엔 있는데 아직 출근(in) 기록이 없는 사람 — 예정시각+15분 지난 경우만
  const noShowToday = ((todaySchedules ?? []) as { worker_id: string; start_time: string }[])
    .filter((s) => activeWorkerIds.has(s.worker_id))
    .map((s) => {
      const [h, m] = s.start_time.split(':').map(Number)
      const deadline = new Date(todayKst + 'T00:00:00Z')
      deadline.setUTCHours(h - 9, m + 15, 0, 0) // KST → UTC, +15분 여유
      if (now < deadline) return null
      const hasInToday = (eventsByWorker.get(s.worker_id) ?? []).some(
        (e) => e.type === 'in' && kstParts(e.ts).date === todayKst,
      )
      if (hasInToday) return null
      return { worker_id: s.worker_id, name: nameOf.get(s.worker_id) ?? '?', defaultTime: s.start_time.slice(0, 5) }
    })
    .filter((v): v is { worker_id: string; name: string; defaultTime: string } => v !== null)

  // 주 → 알바별 주간 합계(지급 체크용) 목록. weekly_settlement는 shifts가 있는 주마다 항상 행이 생기므로
  // 이걸로 주차 목록(allWeeks)을 결정하면 shifts 테이블 전체를 안 긁어도 됨.
  const settlementByWeek = new Map<string, Settlement[]>()
  for (const r of settlements) {
    if (!settlementByWeek.has(r.week_start)) settlementByWeek.set(r.week_start, [])
    settlementByWeek.get(r.week_start)!.push(r)
  }

  // 최신 주가 맨 앞(index 0)
  const allWeeks = Array.from(settlementByWeek.keys()).sort((a, b) => b.localeCompare(a))

  // 캘린더에서 어느 주를 봐도(과거·미래 상관없이) 지급액을 보여줄 수 있게 전체 주차 합계를 미리 계산
  const weeklyPaidTotals = allWeeks.map((w) => ({
    week_start: w,
    total: (settlementByWeek.get(w) ?? [])
      .filter((r) => r.payout_id != null)
      .reduce((sum, r) => sum + (round10(r.expected_pay) ?? 0), 0),
  }))

  const requestedIndex = weekParam ? allWeeks.indexOf(weekParam) : 0
  const currentIndex = requestedIndex === -1 ? 0 : requestedIndex
  const currentWeek = allWeeks[currentIndex] as string | undefined
  const olderWeek = allWeeks[currentIndex + 1]
  const newerWeek = allWeeks[currentIndex - 1]

  // 현재 보고 있는 주의 근무만 조회(주 전체 이력이 아니라 딱 이 7일치만)
  // weekParam이 currentWeek와 일치하면 위에서 이미 병렬로 받아둔 걸 그대로 씀(왕복 절약)
  const dateGroup = new Map<string, Shift[]>()
  if (currentWeek) {
    const { data: shiftRows } =
      weekParam === currentWeek && prefetchedShifts ? prefetchedShifts : await fetchShifts(currentWeek)
    for (const s of (shiftRows ?? []) as Shift[]) {
      const start = kstParts(s.clock_in)
      if (!dateGroup.has(start.date)) dateGroup.set(start.date, [])
      dateGroup.get(start.date)!.push(s)
    }
  }
  // 월요일이 위로 오게 오름차순
  const dates = Array.from(dateGroup.keys()).sort((a, b) => a.localeCompare(b))
  const weekSettlements = currentWeek ? settlementByWeek.get(currentWeek) ?? [] : []

  // 지급 완료(payout_id 있음)된 건들의 합 — "얼마나 줬는지"라 미지급분은 제외
  const currentMonth = currentWeek?.slice(0, 7) // "YYYY-MM" (주는 week_start=월요일이 속한 달로 귀속)
  const weekPaidTotal = weekSettlements
    .filter((r) => r.payout_id != null)
    .reduce((sum, r) => sum + (round10(r.expected_pay) ?? 0), 0)
  const monthPaidTotal = currentMonth
    ? settlements
        .filter((r) => r.week_start.slice(0, 7) === currentMonth && r.payout_id != null)
        .reduce((sum, r) => sum + (round10(r.expected_pay) ?? 0), 0)
    : 0

  return (
    <>
      <header className="fixed top-0 z-50 flex h-16 w-full items-center justify-center border-b border-gray-100 bg-white px-4">
        <h1 className="text-xl font-bold text-[#0052cc]">주급 정산</h1>
        <div className="absolute right-4 top-1/2 -translate-y-1/2">
          <CalendarPicker currentWeek={currentWeek} weeklyPaidTotals={weeklyPaidTotals} />
        </div>
      </header>

      <main className="mx-auto max-w-[min(720px,94vw)] space-y-4 px-4 pb-24 pt-20">
        {unpaidCount > 0 && (
          <div className="flex items-center gap-3 rounded-lg bg-[#ffdad6] p-4">
            <span className="material-symbols-outlined text-[#ba1a1a]">warning</span>
            <p className="text-sm font-bold text-[#410002]">아직 안 준(미지급) {unpaidCount}건이 있습니다.</p>
          </div>
        )}

        <PushSubscribe />

        {openAlerts.length > 0 && (
          <div className="flex items-center gap-3 rounded-lg bg-[#ffedd6] p-4">
            <span className="material-symbols-outlined text-[#8a5a00]">schedule</span>
            <p className="text-sm font-bold text-[#8a5a00]">
              퇴근 기록을 확인해야 하는 알바가 있어요: {openAlerts.map((a) => a.name).join(', ')}
            </p>
          </div>
        )}

        {noShowToday.map((n) => (
          <NoShowRow key={n.worker_id} entry={n} workers={activeWorkers} />
        ))}

        {workingNow.length > 0 && (
          <section className="space-y-2 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-gray-500">🟢 지금 근무중</h2>
            {workingNow.map((w) => {
              const { date, hour, minute } = kstParts(w.clockIn)
              const timeLabel = minute === 0 ? `${hour}시` : `${hour}시${minute}분`
              const tooLong = w.hours > 12
              return (
                <div key={w.name} className="flex items-center justify-between text-sm">
                  <span className="font-bold">{w.name}</span>
                  <span className={tooLong ? 'font-bold text-[#ba1a1a]' : 'text-gray-500'}>
                    {dateLabel(date)} {timeLabel} 출근{tooLong ? ` · ${Math.floor(w.hours)}시간째!` : ''}
                  </span>
                </div>
              )
            })}
          </section>
        )}

        {allWeeks.length === 0 && <p className="py-6 text-center text-gray-400">정산 데이터가 없습니다.</p>}

        {currentWeek && (
          <>
            <div className="flex items-center justify-between rounded-xl bg-[#e0e2ec] p-4">
              {olderWeek ? (
                <Link href={`/dashboard?week=${olderWeek}`} className="p-1">
                  <span className="material-symbols-outlined">chevron_left</span>
                </Link>
              ) : (
                <span className="material-symbols-outlined p-1 text-gray-300">chevron_left</span>
              )}
              <span className="font-bold">{currentWeek} 주</span>
              {newerWeek ? (
                <Link href={`/dashboard?week=${newerWeek}`} className="p-1">
                  <span className="material-symbols-outlined">chevron_right</span>
                </Link>
              ) : (
                <span className="material-symbols-outlined p-1 text-gray-300">chevron_right</span>
              )}
            </div>

            {/* 지급 총액 요약 */}
            <section className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <p className="text-xs font-bold text-gray-500">이번 주 지급액</p>
                <p className="mt-1 text-xl font-black text-[#0052cc]">{won(weekPaidTotal)}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <p className="text-xs font-bold text-gray-500">{Number(currentMonth!.split('-')[1])}월 지급액</p>
                <p className="mt-1 text-xl font-black text-[#0052cc]">{won(monthPaidTotal)}</p>
              </div>
            </section>

            {/* 날짜별 근무 내역 (수기 메모 스타일) */}
            {dates.length > 0 && (
              <section className="space-y-4 border-b border-gray-200 py-2">
                {dates.map((date, i) => {
                  const dayShifts = [...dateGroup.get(date)!].sort((a, b) => a.clock_in.localeCompare(b.clock_in))
                  return (
                    <div key={date} className={i > 0 ? 'border-t border-gray-100 pt-3' : undefined}>
                      <p className="mb-1.5 text-xs font-bold text-gray-500">{dateLabel(date)}</p>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'auto 1fr auto',
                          columnGap: 14,
                          rowGap: 8,
                          alignItems: 'baseline',
                        }}
                      >
                        {dayShifts.map((s) => {
                          const start = kstParts(s.clock_in)
                          const end = kstParts(s.clock_out)
                          const startLabel = start.minute === 0 ? `${start.hour}시` : `${start.hour}시${start.minute}분`
                          const endLabel = end.minute === 0 ? `${end.hour}시` : `${end.hour}시${end.minute}분`
                          return (
                            <Fragment key={s.clock_in_id}>
                              <span className="text-sm font-bold">{nameOf.get(s.worker_id) ?? '?'}</span>
                              <span className="text-sm text-gray-400">
                                {startLabel}~{endLabel}
                              </span>
                              <span className="text-right text-sm font-bold text-[#0052cc]">{fmtHours(s.hours)}</span>
                            </Fragment>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </section>
            )}

            {/* 알바별 주간 합계 + 지급 체크 */}
            <section className="space-y-4">
              <h2 className="pt-2 text-lg font-bold text-[#0052cc]">개별 정산 현황</h2>
              {weekSettlements.map((r, i) => {
                const pay = round10(r.expected_pay)
                const acct = acctOf.get(r.worker_id)
                return (
                  <div
                    key={`${r.worker_id}-${r.week_start}-${i}`}
                    className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between">
                      <h3 className="text-lg font-bold">{nameOf.get(r.worker_id) ?? r.worker_id.slice(0, 8)}</h3>
                      <PaidToggle
                        workerId={r.worker_id}
                        weekStart={r.week_start}
                        payoutId={r.payout_id}
                        expectedPay={pay}
                      />
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm text-gray-500">
                        근무 시간 <span className="ml-2 font-bold text-black">{hm(r.total_hours)}</span>
                      </p>
                      <p className="text-sm text-gray-500">총 금액</p>
                      <p className="text-right text-2xl font-black text-[#0052cc]">{won(pay)}</p>
                    </div>

                    <CopyAccountButton account={acct?.account_number ?? null} bank={acct?.bank_name ?? null} />
                  </div>
                )
              })}
            </section>
          </>
        )}
      </main>

      <BottomNav />
    </>
  )
}
