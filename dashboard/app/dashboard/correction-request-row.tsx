'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Entry = {
  id: string
  clockEventId: string
  name: string
  type: 'in' | 'out'
  originalTs: string
  requestedTs: string
}

function fmt(iso: string) {
  const d = new Date(iso)
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)
  const g = (t: string) => p.find((x) => x.type === t)!.value
  return `${Number(g('month'))}/${Number(g('day'))} ${g('hour')}:${g('minute')}`
}

export default function CorrectionRequestRow({ entry }: { entry: Entry }) {
  const router = useRouter()
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)

  async function approve() {
    setBusy('approve')
    const supabase = createClient()
    await supabase.from('clock_events').update({ ts: entry.requestedTs }).eq('id', entry.clockEventId)
    await supabase
      .from('correction_requests')
      .update({ status: 'approved', resolved_at: new Date().toISOString() })
      .eq('id', entry.id)
    setBusy(null)
    router.refresh()
  }

  async function reject() {
    setBusy('reject')
    const supabase = createClient()
    await supabase
      .from('correction_requests')
      .update({ status: 'rejected', resolved_at: new Date().toISOString() })
      .eq('id', entry.id)
    setBusy(null)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-[#e0e2ec] p-4">
      <p className="text-sm font-bold text-[#333]">
        {entry.name} 님 {entry.type === 'in' ? '출근' : '퇴근'} 시각 수정 요청
      </p>
      <p className="text-sm text-gray-600">
        {fmt(entry.originalTs)} <span className="mx-1 text-gray-400">→</span>{' '}
        <span className="font-bold text-[#0052cc]">{fmt(entry.requestedTs)}</span>
      </p>
      <div className="flex gap-2">
        <button onClick={approve} disabled={busy !== null} className="rounded bg-[#0052cc] px-3 py-1.5 text-xs font-bold text-white">
          {busy === 'approve' ? '적용 중…' : '적용'}
        </button>
        <button onClick={reject} disabled={busy !== null} className="rounded border border-gray-300 px-3 py-1.5 text-xs font-bold text-gray-600">
          {busy === 'reject' ? '처리 중…' : '거절'}
        </button>
      </div>
    </div>
  )
}
