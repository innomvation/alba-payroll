'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function RefreshScheduleButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function refresh() {
    if (!window.confirm('최근 35일 근무 기록으로 근무표를 다시 계산할까요? 지금까지 수동으로 고친 내용은 덮어씌워져요.')) return
    setBusy(true)
    const supabase = createClient()
    await supabase.rpc('refresh_worker_schedules')
    setBusy(false)
    router.refresh()
  }

  return (
    <button
      onClick={refresh}
      disabled={busy}
      className="flex items-center gap-1 rounded-full bg-[#e0e2ec] px-3 py-1.5 text-xs font-bold text-[#0052cc]"
    >
      <span className="material-symbols-outlined text-sm">sync</span>
      {busy ? '업데이트 중…' : '출퇴근 업데이트'}
    </button>
  )
}
