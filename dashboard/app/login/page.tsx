'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <form
        onSubmit={handleLogin}
        style={{
          background: '#fff',
          padding: 32,
          borderRadius: 12,
          boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
          width: 320,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <h1 style={{ margin: '0 0 8px', fontSize: 20 }}>알바 시급 정산</h1>
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={inputStyle}
        />
        {error && <p style={{ color: '#b00020', fontSize: 15, margin: 0 }}>{error}</p>}
        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </form>
    </main>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  border: '1px solid #ddd',
  borderRadius: 8,
  fontSize: 16,
}

const buttonStyle: React.CSSProperties = {
  padding: '10px 12px',
  border: 'none',
  borderRadius: 8,
  background: '#1a1a1a',
  color: '#fff',
  fontSize: 16,
  cursor: 'pointer',
}
