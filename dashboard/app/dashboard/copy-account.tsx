'use client'

import { useState } from 'react'

// 정산 보드에서 알바 계좌번호를 바로 복사하는 버튼.
export default function CopyAccountButton({
  account,
  bank,
}: {
  account: string | null
  bank: string | null
}) {
  const [copied, setCopied] = useState(false)

  if (!account) return <span className="text-gray-400">-</span>
  const value = account

  async function copy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      onClick={copy}
      title={`${bank ?? ''} ${value}`}
      className={
        copied
          ? 'flex w-full items-center justify-center gap-2 rounded-xl bg-[#d4f4dd] py-3 font-bold text-[#0a7d33]'
          : 'flex w-full items-center justify-center gap-2 rounded-xl bg-[#e0e2ec] py-3 font-bold text-[#0052cc]'
      }
    >
      <span className="material-symbols-outlined text-sm">{copied ? 'check' : 'content_copy'}</span>
      {copied ? '복사됨' : bank ? `${bank} 복사` : '계좌 복사'}
    </button>
  )
}
