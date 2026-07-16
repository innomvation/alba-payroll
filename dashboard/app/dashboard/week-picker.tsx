'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

export default function WeekPicker({ weeks, currentWeek }: { weeks: string[]; currentWeek?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button className="p-2" onClick={() => setOpen((v) => !v)}>
        <span className="material-symbols-outlined text-[#0052cc]">calendar_month</span>
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 max-h-72 w-44 overflow-y-auto rounded-xl border border-gray-100 bg-white py-2 shadow-lg">
          {weeks.map((w) => (
            <Link
              key={w}
              href={`/dashboard?week=${w}`}
              onClick={() => setOpen(false)}
              className={
                w === currentWeek
                  ? 'block px-4 py-2 text-sm font-bold text-[#0052cc]'
                  : 'block px-4 py-2 text-sm text-gray-600 hover:bg-gray-50'
              }
            >
              {w}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
