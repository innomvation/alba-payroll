'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

// 페이지 이동(force-dynamic이라 서버에서 매번 새로 조회) 중임을 보여주는 링크
export default function NavLink({
  href,
  children,
  style,
}: {
  href: string
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault()
        startTransition(() => {
          router.push(href)
        })
      }}
      style={{ ...style, opacity: isPending ? 0.5 : 1, pointerEvents: isPending ? 'none' : 'auto' }}
    >
      {isPending ? '이동 중…' : children}
    </a>
  )
}
