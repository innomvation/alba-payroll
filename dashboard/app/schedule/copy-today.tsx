'use client'

import { useState } from 'react'
import type { Schedule, Worker } from './page'

function todayWeekdayKst() {
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
  return new Date(dateStr + 'T00:00:00Z').getUTCDay()
}

export default function CopyTodayButton({ workers, schedules }: { workers: Worker[]; schedules: Schedule[] }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    const nameOf = new Map(workers.map((w) => [w.id, w.name]))
    const weekday = todayWeekdayKst()
    const today = schedules
      .filter((s) => s.weekday === weekday)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
    const text = today
      .map((s) => {
        const [h, m] = s.start_time.split(':').map(Number)
        return `${nameOf.get(s.worker_id) ?? '?'} ${m === 0 ? `${h}시` : `${h}시${m}분`} 출근`
      })
      .join('\n')
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button onClick={copy} className="flex items-center gap-1 rounded-full bg-[#e0e2ec] px-3 py-1.5 text-xs font-bold text-[#0052cc]">
      <span className="material-symbols-outlined text-sm">{copied ? 'check' : 'content_copy'}</span>
      {copied ? '복사됨' : '오늘 출근 복사'}
    </button>
  )
}
