'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Worker = { id: string; name: string }
type Entry = { worker_id: string; name: string; defaultTime: string }

function todayKstDateStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
}

export default function NoShowRow({ entry, workers }: { entry: Entry; workers: Worker[] }) {
  const router = useRouter()
  const [workerId, setWorkerId] = useState(entry.worker_id)
  const [time, setTime] = useState(entry.defaultTime)
  const [busy, setBusy] = useState(false)

  async function checkIn() {
    setBusy(true)
    const supabase = createClient()
    const ts = new Date(`${todayKstDateStr()}T${time}:00+09:00`).toISOString()
    await supabase.from('clock_events').insert({ worker_id: workerId, type: 'in', source: 'manual', ts })
    setBusy(false)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-[#fff3cd] p-4">
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-[#8a6d00]">person_alert</span>
        <p className="text-sm font-bold text-[#5c4700]">{entry.name} 님 출근이 안 되어 있는데 출근 처리 하시겠습니까?</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={workerId} onChange={(e) => setWorkerId(e.target.value)} className="rounded border border-gray-200 px-1.5 py-1 text-sm">
          {workers.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="rounded border border-gray-200 px-1.5 py-1 text-sm" />
        <button onClick={checkIn} disabled={busy} className="rounded bg-[#0052cc] px-3 py-1.5 text-xs font-bold text-white">
          {busy ? '처리 중…' : '출근 처리'}
        </button>
      </div>
    </div>
  )
}
