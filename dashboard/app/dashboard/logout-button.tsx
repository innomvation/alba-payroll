'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LogoutButton() {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loggingOut}
      style={{
        padding: '6px 12px',
        border: '1px solid #ddd',
        borderRadius: 8,
        background: '#fff',
        fontSize: 15,
        cursor: 'pointer',
      }}
    >
      {loggingOut ? '로그아웃 중…' : '로그아웃'}
    </button>
  )
}
