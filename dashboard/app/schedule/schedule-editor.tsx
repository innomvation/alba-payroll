'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Schedule, Worker } from './page'

const WEEKDAYS = [
  { n: 1, label: '월' },
  { n: 2, label: '화' },
  { n: 3, label: '수' },
  { n: 4, label: '목' },
  { n: 5, label: '금' },
  { n: 6, label: '토' },
  { n: 0, label: '일' },
]

const fmtTime = (t: string) => t.slice(0, 5)

export default function ScheduleEditor({ workers, schedules }: { workers: Worker[]; schedules: Schedule[] }) {
  const router = useRouter()
  const nameOf = new Map(workers.map((w) => [w.id, w.name]))

  const [addWeekday, setAddWeekday] = useState<number | null>(null)
  const [addWorkerId, setAddWorkerId] = useState('')
  const [addStart, setAddStart] = useState('16:00')
  const [addEnd, setAddEnd] = useState('20:00')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')

  const [busy, setBusy] = useState(false)

  function startAdd(weekday: number) {
    setAddWeekday(weekday)
    setAddWorkerId(workers[0]?.id ?? '')
    setAddStart('16:00')
    setAddEnd('20:00')
  }

  async function saveAdd() {
    if (!addWorkerId || addWeekday === null) return
    setBusy(true)
    const supabase = createClient()
    await supabase
      .from('worker_schedules')
      .insert({ worker_id: addWorkerId, weekday: addWeekday, start_time: addStart, end_time: addEnd })
    setBusy(false)
    setAddWeekday(null)
    router.refresh()
  }

  function startEdit(s: Schedule) {
    setEditingId(s.id)
    setEditStart(fmtTime(s.start_time))
    setEditEnd(fmtTime(s.end_time))
  }

  async function saveEdit() {
    if (!editingId) return
    setBusy(true)
    const supabase = createClient()
    await supabase.from('worker_schedules').update({ start_time: editStart, end_time: editEnd }).eq('id', editingId)
    setBusy(false)
    setEditingId(null)
    router.refresh()
  }

  async function remove(id: string) {
    setBusy(true)
    const supabase = createClient()
    await supabase.from('worker_schedules').delete().eq('id', id)
    setBusy(false)
    router.refresh()
  }

  return (
    <section className="space-y-3">
      {WEEKDAYS.map(({ n, label }) => {
        const dayRows = schedules.filter((s) => s.weekday === n).sort((a, b) => a.start_time.localeCompare(b.start_time))
        return (
          <div key={n} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="mb-2 text-xs font-bold text-gray-500">{label}요일</p>

            {dayRows.length === 0 && addWeekday !== n && <p className="text-sm text-gray-300">근무자 없음</p>}

            <div className="space-y-2">
              {dayRows.map((s) => (
                <div key={s.id}>
                  {editingId === s.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold">{nameOf.get(s.worker_id) ?? '?'}</span>
                      <input type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)} className="rounded border border-gray-200 px-1.5 py-1 text-sm" />
                      <span className="text-gray-400">~</span>
                      <input type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} className="rounded border border-gray-200 px-1.5 py-1 text-sm" />
                      <button onClick={saveEdit} disabled={busy} className="rounded bg-[#0052cc] px-2 py-1 text-xs font-bold text-white">저장</button>
                      <button onClick={() => setEditingId(null)} disabled={busy} className="rounded border border-gray-200 px-2 py-1 text-xs">취소</button>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', columnGap: 10, alignItems: 'center' }}>
                      <span className="text-sm font-bold">{nameOf.get(s.worker_id) ?? '?'}</span>
                      <span className="text-sm text-gray-500">
                        {fmtTime(s.start_time)}~{fmtTime(s.end_time)}
                      </span>
                      <span className="flex gap-2">
                        <button onClick={() => startEdit(s)} className="material-symbols-outlined text-base text-gray-400">edit</button>
                        <button onClick={() => remove(s.id)} disabled={busy} className="material-symbols-outlined text-base text-[#ba1a1a]">delete</button>
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {addWeekday === n ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2">
                <select value={addWorkerId} onChange={(e) => setAddWorkerId(e.target.value)} className="rounded border border-gray-200 px-1.5 py-1 text-sm">
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
                <input type="time" value={addStart} onChange={(e) => setAddStart(e.target.value)} className="rounded border border-gray-200 px-1.5 py-1 text-sm" />
                <span className="text-gray-400">~</span>
                <input type="time" value={addEnd} onChange={(e) => setAddEnd(e.target.value)} className="rounded border border-gray-200 px-1.5 py-1 text-sm" />
                <button onClick={saveAdd} disabled={busy || !addWorkerId} className="rounded bg-[#0052cc] px-2 py-1 text-xs font-bold text-white">저장</button>
                <button onClick={() => setAddWeekday(null)} disabled={busy} className="rounded border border-gray-200 px-2 py-1 text-xs">취소</button>
              </div>
            ) : (
              <button onClick={() => startAdd(n)} className="mt-2 text-xs font-bold text-[#0052cc]">+ 추가</button>
            )}
          </div>
        )
      })}
    </section>
  )
}
