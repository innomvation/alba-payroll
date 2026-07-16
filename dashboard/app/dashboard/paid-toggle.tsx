'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// 지급 여부 체크. 체크 = 그 주 줘야 할 금액을 지급함(payouts 기록), 해제 = 미지급(기록 삭제).
export default function PaidToggle({
  workerId,
  weekStart,
  payoutId,
  expectedPay,
}: {
  workerId: string
  weekStart: string
  payoutId: string | null
  expectedPay: number | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const paid = !!payoutId

  async function toggle() {
    if (expectedPay == null) return
    setBusy(true)
    const supabase = createClient()
    if (paid) {
      await supabase.from('payouts').delete().eq('id', payoutId!)
    } else {
      const end = new Date(weekStart)
      end.setDate(end.getDate() + 6)
      await supabase.from('payouts').insert({
        worker_id: workerId,
        period_start: weekStart,
        period_end: end.toISOString().slice(0, 10),
        amount: expectedPay,
      })
    }
    setBusy(false)
    router.refresh()
  }

  if (expectedPay == null) return <span className="text-gray-400">-</span>

  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <span
        className={
          paid
            ? 'rounded bg-[#d4f4dd] px-2 py-1 text-xs font-bold text-[#0a7d33]'
            : 'rounded bg-[#ffdad6] px-2 py-1 text-xs font-bold text-[#ba1a1a]'
        }
      >
        {busy ? '처리 중…' : paid ? '지급완료' : '미지급'}
      </span>
      <input
        type="checkbox"
        checked={paid}
        onChange={toggle}
        disabled={busy}
        className="h-5 w-5 rounded border-gray-300"
      />
    </label>
  )
}
