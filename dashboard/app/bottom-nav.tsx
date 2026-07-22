'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  {
    href: '/manage',
    label: '관리',
    icon: 'storefront',
    isActive: (p: string) => p === '/manage' || (p.startsWith('/manage/') && !p.startsWith('/manage/workplace')),
  },
  { href: '/schedule', label: '근무표', icon: 'calendar_view_week', isActive: (p: string) => p === '/schedule' },
  { href: '/dashboard', label: '정산', icon: 'payments', isActive: (p: string) => p === '/dashboard' },
  {
    href: '/manage/workplace',
    label: '가게설정',
    icon: 'settings',
    isActive: (p: string) => p.startsWith('/manage/workplace'),
  },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-gray-100 bg-white py-3 px-2">
      {TABS.map((tab) => {
        const active = tab.isActive(pathname)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={
              active
                ? 'flex flex-col items-center gap-0.5 rounded-2xl bg-[#d9e2ff] px-6 py-1 text-[#0052cc]'
                : 'flex flex-col items-center gap-0.5 px-6 py-1 text-gray-400'
            }
          >
            <span className="material-symbols-outlined">{tab.icon}</span>
            <span className={active ? 'text-[10px] font-bold' : 'text-[10px]'}>{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
