'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export default function PushSubscribe() {
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [supported, setSupported] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setSupported(false)
      return
    }
    navigator.serviceWorker.register('/sw.js').then(async (reg) => {
      const sub = await reg.pushManager.getSubscription()
      setSubscribed(!!sub)
    })
  }, [])

  async function toggle() {
    setMsg(null)
    setBusy(true)
    const reg = await navigator.serviceWorker.ready
    const supabase = createClient()
    const existing = await reg.pushManager.getSubscription()

    if (existing) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', existing.endpoint)
      await existing.unsubscribe()
      setSubscribed(false)
      setBusy(false)
      return
    }

    const perm = await Notification.requestPermission()
    if (perm !== 'granted') {
      setMsg('알림 권한을 허용해야 받을 수 있어요.')
      setBusy(false)
      return
    }

    try {
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        setMsg('로그인이 필요해요.')
        return
      }
      const j = sub.toJSON() as { keys?: { p256dh?: string; auth?: string } }
      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: session.user.id,
          endpoint: sub.endpoint,
          p256dh: j.keys?.p256dh,
          auth_key: j.keys?.auth,
        },
        { onConflict: 'endpoint' },
      )
      if (error) {
        setMsg('구독 저장 실패: ' + error.message)
        return
      }
      setSubscribed(true)
    } catch (e) {
      setMsg('알림 등록 실패: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }

  if (!supported) return null

  return (
    <div>
      <button
        onClick={toggle}
        disabled={busy}
        className={
          subscribed
            ? 'flex items-center gap-2 rounded-full border border-gray-200 bg-[#d4f4dd] px-4 py-2 text-sm font-medium text-[#0a7d33]'
            : 'flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium'
        }
      >
        <span className="material-symbols-outlined text-sm">notifications</span>
        {busy ? '처리 중…' : subscribed ? '출퇴근 알람 받는 중 (끄기)' : '출퇴근 알람 받기'}
      </button>
      {msg && <p className="mt-1.5 text-sm text-[#b00020]">{msg}</p>}
    </div>
  )
}
