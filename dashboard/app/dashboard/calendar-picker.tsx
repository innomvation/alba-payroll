'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type WeeklyTotal = { week_start: string; total: number }

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`
// 만원 단위, 소수 첫째 자리까지 (예: 126000 → "12.6만", 90000 → "9만")
const manWon = (n: number) => {
  const man = Math.round((n / 10000) * 10) / 10
  return `${man % 1 === 0 ? man : man.toFixed(1)}만`
}

// KST 기준 날짜 문자열 "YYYY-MM-DD"
function toKstDateStr(d: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d)
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// KST 달력일의 자정(00:00)에 해당하는 UTC 시각
function kstMidnightUtcIso(dateStr: string) {
  return new Date(new Date(dateStr + 'T00:00:00Z').getTime() - 9 * 3600 * 1000).toISOString()
}

// dateStr이 속한 주의 월요일 날짜 문자열
function mondayOf(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00Z')
  const dow = d.getUTCDay() // 0=일 ... 6=토
  const diff = dow === 0 ? -6 : 1 - dow
  return addDays(dateStr, diff)
}

export default function CalendarPicker({
  currentWeek,
  weeklyPaidTotals,
}: {
  currentWeek?: string
  weeklyPaidTotals: WeeklyTotal[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [viewMonth, setViewMonth] = useState(() => (currentWeek ?? toKstDateStr(new Date())).slice(0, 7))
  const [dailyExpected, setDailyExpected] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  const weeklyTotalOf = useMemo(() => {
    const m = new Map<string, number>()
    for (const w of weeklyPaidTotals) m.set(w.week_start, w.total)
    return m
  }, [weeklyPaidTotals])

  const [year, month] = viewMonth.split('-').map(Number)
  const monthStart = `${viewMonth}-01`
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const monthEnd = `${viewMonth}-${String(lastDay).padStart(2, '0')}`
  const gridStart = mondayOf(monthStart)
  const gridEndSunday = (() => {
    const d = new Date(monthEnd + 'T00:00:00Z')
    const dow = d.getUTCDay()
    return addDays(monthEnd, dow === 0 ? 0 : 7 - dow)
  })()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    const supabase = createClient()
    supabase
      .from('shift_pay')
      .select('clock_in, expected_pay')
      .gte('clock_in', kstMidnightUtcIso(gridStart))
      .lt('clock_in', kstMidnightUtcIso(addDays(gridEndSunday, 1)))
      .then(({ data }) => {
        if (cancelled) return
        const m = new Map<string, number>()
        for (const row of (data ?? []) as { clock_in: string; expected_pay: number }[]) {
          const dateStr = toKstDateStr(new Date(row.clock_in))
          m.set(dateStr, (m.get(dateStr) ?? 0) + Number(row.expected_pay))
        }
        setDailyExpected(m)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, gridStart, gridEndSunday])

  const monthPaidTotal = useMemo(() => {
    let sum = 0
    for (const w of weeklyPaidTotals) {
      if (w.week_start.slice(0, 7) === viewMonth) sum += w.total
    }
    return sum
  }, [weeklyPaidTotals, viewMonth])

  const weeks: string[][] = []
  {
    let d = gridStart
    while (d <= gridEndSunday) {
      const row: string[] = []
      for (let i = 0; i < 7; i++) {
        row.push(d)
        d = addDays(d, 1)
      }
      weeks.push(row)
    }
  }

  function goToWeek(weekStart: string) {
    setOpen(false)
    router.push(`/dashboard?week=${weekStart}`)
  }

  function shiftMonth(delta: number) {
    const d = new Date(`${viewMonth}-01T00:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() + delta)
    setViewMonth(d.toISOString().slice(0, 7))
  }

  return (
    <div ref={ref} className="relative">
      <button className="p-2" onClick={() => setOpen((v) => !v)}>
        <span className="material-symbols-outlined text-[#0052cc]">calendar_month</span>
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-[320px] rounded-xl border border-gray-100 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button className="p-1" onClick={() => shiftMonth(-1)}>
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            <div className="text-center">
              <p className="text-sm font-bold">
                {year}년 {month}월
              </p>
              <p className="text-xs font-bold text-[#0052cc]">{won(monthPaidTotal)}</p>
            </div>
            <button className="p-1" onClick={() => shiftMonth(1)}>
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-gray-400">
            {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          {weeks.map((row) => (
            <div
              key={row[0]}
              className="mt-1 cursor-pointer rounded-lg py-1 hover:bg-gray-50"
              onClick={() => goToWeek(row[0])}
            >
              <div className="grid grid-cols-7 gap-1">
                {row.map((dateStr) => {
                  const inMonth = dateStr.slice(0, 7) === viewMonth
                  const pay = dailyExpected.get(dateStr)
                  const isCurrentWeek = row[0] === currentWeek
                  return (
                    <div key={dateStr} className={`rounded p-1 text-center ${isCurrentWeek ? 'bg-[#e8ecfb]' : ''}`}>
                      <p className={`text-[11px] ${inMonth ? 'text-gray-700' : 'text-gray-300'}`}>
                        {Number(dateStr.slice(8, 10))}
                      </p>
                      {pay ? <p className="text-[9px] font-bold text-[#0052cc]">{manWon(pay)}</p> : null}
                    </div>
                  )
                })}
              </div>
              <p className="mt-0.5 text-right text-[10px] font-bold text-gray-400">
                주 {won(weeklyTotalOf.get(row[0]) ?? 0)}
              </p>
            </div>
          ))}
          {loading && <p className="mt-2 text-center text-[10px] text-gray-300">불러오는 중…</p>}
        </div>
      )}
    </div>
  )
}
