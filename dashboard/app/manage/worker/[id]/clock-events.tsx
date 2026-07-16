'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Ev = { id: string; type: 'in' | 'out'; ts: string; source: string; needs_correction: boolean }

export default function ClockEvents({ workerId, events }: { workerId: string; events: Ev[] }) {
  const router = useRouter()
  const [type, setType] = useState<'in' | 'out'>('in')
  const [dt, setDt] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  async function add() {
    if (!dt) return setNote('날짜·시간을 정하세요.')
    setAdding(true)
    const supabase = createClient()
    const iso = new Date(dt).toISOString() // datetime-local(로컬) → ISO
    const { error } = await supabase
      .from('clock_events')
      .insert({ worker_id: workerId, type, ts: iso, source: 'manual' })
    setAdding(false)
    if (error) return setNote('추가 실패: ' + error.message)
    setNote('추가됨 ✅')
    setDt('')
    router.refresh()
  }

  async function del(id: string) {
    const supabase = createClient()
    await supabase.from('clock_events').delete().eq('id', id)
    router.refresh()
  }

  // 퇴근 누락 감지: 시간순으로 봤을 때 '출근' 다음이 또 '출근'이면 사이에 퇴근이 빠진 것
  const asc = [...events].sort((a, b) => a.ts.localeCompare(b.ts))
  let missingOut = false
  for (let i = 0; i < asc.length - 1; i++) {
    if (asc[i].type === 'in' && asc[i + 1].type === 'in') missingOut = true
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {missingOut && (
        <div style={styles.warn}>
          ⚠️ 퇴근 기록이 빠진 근무가 있어요. 아래에서 퇴근 시각을 추가해 주세요.
        </div>
      )}

      {/* 수동 추가 */}
      <div style={styles.card}>
        <h2 style={styles.h2}>기록 직접 추가 (보정)</h2>
        <div style={styles.row}>
          <select value={type} onChange={(e) => setType(e.target.value as 'in' | 'out')} style={styles.input}>
            <option value="in">출근</option>
            <option value="out">퇴근</option>
          </select>
          <input type="datetime-local" value={dt} onChange={(e) => setDt(e.target.value)} style={{ ...styles.input, flex: 1 }} />
          <button onClick={add} disabled={adding} style={styles.addButton}>{adding ? '추가 중…' : '추가'}</button>
        </div>
        {note && <p style={styles.note}>{note}</p>}
      </div>

      {/* 목록 */}
      <div style={styles.card}>
        <h2 style={styles.h2}>최근 기록</h2>
        {events.length === 0 && <p style={{ color: '#888', fontSize: 16 }}>아직 기록이 없어요.</p>}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {events.map((e) => (
            <EventRow key={e.id} event={e} onDelete={() => del(e.id)} />
          ))}
        </div>
      </div>
    </div>
  )
}

function EventRow({ event, onDelete }: { event: Ev; onDelete: () => void }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [dt, setDt] = useState(toLocalInput(event.ts))
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // 수정창 열려 있을 때 뒤로가기(모바일)를 누르면 페이지 이동 대신 수정창만 닫히게
  useEffect(() => {
    if (!editing) return
    window.history.pushState({ clockEventEditing: true }, '')
    const onPopState = () => setEditing(false)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [editing])

  const fmt = (ts: string) =>
    new Date(ts).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })

  // 수정창을 닫을 땐 항상 이 경로로 — pushState로 쌓인 히스토리를 같이 정리
  function closeEditing() {
    if (editing) window.history.back()
  }

  async function saveTime() {
    if (!dt) return
    setBusy(true)
    const supabase = createClient()
    await supabase.from('clock_events').update({ ts: new Date(dt).toISOString() }).eq('id', event.id)
    setBusy(false)
    closeEditing()
    router.refresh()
  }

  async function toggleCorrectionRequest() {
    setBusy(true)
    const supabase = createClient()
    await supabase.from('clock_events').update({ needs_correction: !event.needs_correction }).eq('id', event.id)
    setBusy(false)
    router.refresh()
  }

  async function handleDelete() {
    if (!window.confirm('이 기록을 삭제할까요?')) return
    setDeleting(true)
    onDelete()
  }

  return (
    <div style={styles.evRowWrap}>
      <div style={styles.evRow}>
        <span style={{ ...styles.tag, background: event.type === 'in' ? '#e7f6ec' : '#fdecec', color: event.type === 'in' ? '#0a7d33' : '#b00020' }}>
          {event.type === 'in' ? '출근' : '퇴근'}
        </span>
        <span style={{ flex: 1, fontSize: 16 }}>{fmt(event.ts)}</span>
        <span style={{ fontSize: 13, color: '#aaa' }}>{event.source}</span>
        {event.needs_correction && <span style={styles.reqTag}>요청됨</span>}
        <button onClick={() => (editing ? closeEditing() : setEditing(true))} disabled={busy || deleting} style={styles.edit}>수정</button>
        <button onClick={toggleCorrectionRequest} disabled={busy || deleting} style={styles.reqBtn}>
          {busy ? '처리 중…' : event.needs_correction ? '요청취소' : '수정요청'}
        </button>
        <button onClick={handleDelete} disabled={deleting} style={styles.del}>{deleting ? '삭제 중…' : '삭제'}</button>
      </div>
      {editing && (
        <div style={styles.row}>
          <input type="datetime-local" value={dt} onChange={(e) => setDt(e.target.value)} style={{ ...styles.input, flex: 1 }} />
          <button onClick={saveTime} disabled={busy} style={styles.addButton}>{busy ? '저장 중…' : '저장'}</button>
        </div>
      )}
    </div>
  )
}

function toLocalInput(ts: string) {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const styles: Record<string, React.CSSProperties> = {
  warn: { background: '#fff4e0', border: '1px solid #ffd591', color: '#8a5a00', borderRadius: 8, padding: '10px 14px', fontSize: 16 },
  card: { background: '#fff', borderRadius: 12, padding: 18, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  h2: { fontSize: 16, margin: '0 0 12px' },
  row: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  input: { padding: '10px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15, minWidth: 0 },
  addButton: { padding: '10px 16px', border: 'none', borderRadius: 8, background: '#1a1a1a', color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer' },
  note: { fontSize: 15, color: '#0a7d33', margin: '8px 0 0' },
  evRowWrap: { borderTop: '1px solid #f2f2f2', padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 8 },
  evRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  tag: { fontSize: 14, fontWeight: 600, padding: '3px 8px', borderRadius: 999 },
  reqTag: { fontSize: 13, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: '#fff4e0', color: '#8a5a00' },
  edit: { width: 'auto', padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', color: '#1a1a1a', fontSize: 14, cursor: 'pointer' },
  reqBtn: { width: 'auto', padding: '6px 10px', border: '1px solid #cfe0fb', borderRadius: 6, background: '#fff', color: '#1a73e8', fontSize: 14, cursor: 'pointer' },
  del: { width: 'auto', padding: '6px 10px', border: '1px solid #f3c2c2', borderRadius: 6, background: '#fff', color: '#b00020', fontSize: 14, cursor: 'pointer' },
}
