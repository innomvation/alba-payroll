'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Workplace = {
  id: string
  name: string
  lat: number
  lng: number
  radius_m: number
  wifi_ssid: string | null
}

export default function WorkplaceForm({ workplace }: { workplace: Workplace | null }) {
  const router = useRouter()
  const [name, setName] = useState(workplace?.name ?? '')
  const [lat, setLat] = useState(workplace ? String(workplace.lat) : '')
  const [lng, setLng] = useState(workplace ? String(workplace.lng) : '')
  const [radius, setRadius] = useState(workplace ? String(workplace.radius_m) : '100')
  const [ssid, setSsid] = useState(workplace?.wifi_ssid ?? '')
  const [msg, setMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [locating, setLocating] = useState(false)

  function useCurrentLocation() {
    setMsg(null)
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6))
        setLng(pos.coords.longitude.toFixed(6))
        setMsg('현재 위치를 넣었어요. (가게 안/앞에서 누르면 정확)')
        setLocating(false)
      },
      () => {
        setMsg('위치를 못 가져왔어요. 브라우저 위치 권한을 허용해주세요.')
        setLocating(false)
      },
    )
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    const supabase = createClient()
    const payload = {
      name,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      radius_m: parseInt(radius, 10),
      wifi_ssid: ssid.trim() || null,
    }
    // 기존 가게가 있으면 무조건 그걸 수정 (서버가 가게를 못 읽어와도 중복 생성 방지)
    const existingId =
      workplace?.id ??
      (await supabase.from('workplaces').select('id').order('created_at').limit(1).maybeSingle()).data?.id
    const res = existingId
      ? await supabase.from('workplaces').update(payload).eq('id', existingId)
      : await supabase.from('workplaces').insert(payload)
    setSaving(false)
    if (res.error) setMsg('저장 실패: ' + res.error.message)
    else {
      setMsg('저장됐어요 ✅')
      router.refresh()
    }
  }

  return (
    <form onSubmit={save} style={styles.card}>
      <h2 style={styles.h2}>가게(근무지) 설정</h2>

      <label style={styles.label}>가게 이름</label>
      <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: OO편의점" required />

      <label style={styles.label}>위치 (위도 / 경도)</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={{ ...styles.input, flex: 1 }} value={lat} onChange={(e) => setLat(e.target.value)} placeholder="위도" required />
        <input style={{ ...styles.input, flex: 1 }} value={lng} onChange={(e) => setLng(e.target.value)} placeholder="경도" required />
      </div>
      <button type="button" onClick={useCurrentLocation} disabled={locating} style={styles.subButton}>
        {locating ? '📍 위치 확인 중…' : '📍 지금 내 위치로 설정'}
      </button>

      <label style={styles.label}>출퇴근 인식 반경 (m)</label>
      <input style={styles.input} value={radius} onChange={(e) => setRadius(e.target.value)} placeholder="100" inputMode="numeric" required />

      <label style={styles.label}>가게 WiFi 이름 (선택)</label>
      <input style={styles.input} value={ssid} onChange={(e) => setSsid(e.target.value)} placeholder="실내 정확도 보완용 (없으면 비워두기)" />

      {msg && <p style={styles.msg}>{msg}</p>}
      <button type="submit" disabled={saving} style={styles.button}>
        {saving ? '저장 중...' : '저장'}
      </button>
    </form>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: { background: '#fff', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  h2: { fontSize: 17, margin: '0 0 4px' },
  label: { fontSize: 15, color: '#666', marginTop: 6 },
  input: { padding: '12px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 16, minWidth: 0, boxSizing: 'border-box' },
  subButton: { padding: '10px', border: '1px solid #ddd', borderRadius: 8, background: '#f4f4f5', fontSize: 16, cursor: 'pointer', marginTop: 4 },
  button: { padding: '13px', border: 'none', borderRadius: 8, background: '#1a1a1a', color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer', marginTop: 8 },
  msg: { fontSize: 15, color: '#0a7d33', margin: '4px 0 0' },
}
