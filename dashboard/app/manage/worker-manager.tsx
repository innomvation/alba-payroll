'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Worker = {
  id: string
  name: string
  active: boolean
  hourly_rate: number | null
  bank_name: string | null
  account_number: string | null
  account_holder: string | null
}

// 헷갈리는 글자(0/O, 1/I) 뺀 6자리 코드
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

export default function WorkerManager({
  workplaceId,
  workers,
}: {
  workplaceId: string
  workers: Worker[]
}) {
  const router = useRouter()
  const today = new Date().toISOString().slice(0, 10)
  const [name, setName] = useState('')
  const [rate, setRate] = useState('')
  const [startDate, setStartDate] = useState(today)
  const [msg, setMsg] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  async function addWorker(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    setAdding(true)
    const supabase = createClient()
    const { data: w, error } = await supabase
      .from('workers')
      .insert({ workplace_id: workplaceId, name })
      .select('id')
      .single()
    if (error || !w) {
      setAdding(false)
      setMsg('추가 실패: ' + (error?.message ?? ''))
      return
    }
    await supabase
      .from('worker_rate_history')
      .insert({ worker_id: w.id, hourly_rate: parseFloat(rate), effective_from: startDate })
    setAdding(false)
    setName('')
    setRate('')
    setStartDate(today)
    router.refresh()
  }

  return (
    <div style={styles.card}>
      <h2 style={styles.h2}>알바 관리</h2>

      <form onSubmit={addWorker} style={styles.addForm}>
        <div style={styles.addRow}>
          <input style={{ ...styles.input, flex: 2 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="알바 이름" required />
          <input style={{ ...styles.input, flex: 1 }} value={rate} onChange={(e) => setRate(e.target.value)} placeholder="시급" inputMode="numeric" required />
        </div>
        <label style={styles.dateLabel}>
          시급 시작일 (이 시급을 언제부터 적용할지 · 보통 입사일)
          <input type="date" style={styles.input} value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </label>
        <button type="submit" disabled={adding} style={styles.addButton}>{adding ? '추가 중…' : '추가'}</button>
      </form>
      {msg && <p style={styles.msg}>{msg}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        {workers.length === 0 && <p style={styles.empty}>아직 등록된 알바가 없어요.</p>}
        {workers.map((w) => (
          <WorkerCard key={w.id} worker={w} />
        ))}
      </div>
    </div>
  )
}

function WorkerCard({ worker }: { worker: Worker }) {
  const router = useRouter()
  const today = new Date().toISOString().slice(0, 10)
  const [code, setCode] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [showRate, setShowRate] = useState(false)
  const [newRate, setNewRate] = useState('')
  const [rateDate, setRateDate] = useState(today)
  // 계좌는 알바가 앱에서 직접 등록. 평소엔 보기/복사만, 오타 등 보정용으로 '수정' 토글.
  const [showBank, setShowBank] = useState(false)
  const [bankName, setBankName] = useState(worker.bank_name ?? '')
  const [account, setAccount] = useState(worker.account_number ?? '')
  const [holder, setHolder] = useState(worker.account_holder ?? '')
  const [busyAction, setBusyAction] = useState<'code' | 'active' | 'remove' | 'bank' | 'rate' | null>(null)

  async function makeCode() {
    setBusyAction('code')
    const supabase = createClient()
    const c = genCode()
    const { error } = await supabase.from('worker_invites').insert({ worker_id: worker.id, code: c })
    setBusyAction(null)
    if (error) return setNote('코드 생성 실패: ' + error.message)
    setCode(c)
  }

  async function setActive(active: boolean) {
    setBusyAction('active')
    const supabase = createClient()
    await supabase.from('workers').update({ active }).eq('id', worker.id)
    setBusyAction(null)
    router.refresh()
  }

  async function removeWorker() {
    if (!window.confirm(`'${worker.name}' 의 모든 기록(근무·급여 포함)을 완전히 삭제할까요? 되돌릴 수 없어요.`)) return
    setBusyAction('remove')
    const supabase = createClient()
    await supabase.from('workers').delete().eq('id', worker.id)
    setBusyAction(null)
    router.refresh()
  }

  async function copyAccount() {
    if (!worker.account_number) return
    await navigator.clipboard.writeText(worker.account_number)
    setNote('계좌번호 복사됨 📋')
  }

  async function saveBank() {
    setBusyAction('bank')
    const supabase = createClient()
    const { error } = await supabase
      .from('workers')
      .update({
        bank_name: bankName.trim() || null,
        account_number: account.trim() || null,
        account_holder: holder.trim() || null,
      })
      .eq('id', worker.id)
    setBusyAction(null)
    if (error) return setNote('저장 실패: ' + error.message)
    setShowBank(false)
    setNote('계좌 저장됨 ✅')
    router.refresh()
  }

  async function applyRate() {
    const amt = parseFloat(newRate)
    if (isNaN(amt)) return setNote('새 시급 숫자를 입력하세요.')
    setBusyAction('rate')
    const supabase = createClient()
    const { error } = await supabase
      .from('worker_rate_history')
      .insert({ worker_id: worker.id, hourly_rate: amt, effective_from: rateDate })
    setBusyAction(null)
    if (error) return setNote('시급 변경 실패 (같은 날짜에 이미 시급이 있으면 날짜를 바꾸세요): ' + error.message)
    setShowRate(false)
    setNewRate('')
    router.refresh()
  }

  return (
    <div style={{ ...styles.worker, opacity: worker.active ? 1 : 0.55 }}>
      <div>
        <span style={{ fontWeight: 600, fontSize: 16 }}>{worker.name}</span>
        {!worker.active && <span style={styles.badge}>그만둠</span>}
        <div style={{ fontSize: 15, color: '#666', display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <span>시급 {worker.hourly_rate ? worker.hourly_rate.toLocaleString('ko-KR') : '-'}원</span>
          <button onClick={() => setShowRate((v) => !v)} style={styles.linkBtn}>시급 변경</button>
        </div>
      </div>

      {showRate && (
        <div style={styles.subBox}>
          <div style={styles.row}>
            <input style={{ ...styles.input, flex: 1 }} value={newRate} onChange={(e) => setNewRate(e.target.value)} placeholder="새 시급" inputMode="numeric" />
            <input type="date" style={{ ...styles.input, flex: 1 }} value={rateDate} onChange={(e) => setRateDate(e.target.value)} />
            <button onClick={applyRate} disabled={busyAction === 'rate'} style={styles.action}>{busyAction === 'rate' ? '적용 중…' : '적용'}</button>
          </div>
          <p style={styles.hint}>이 날짜부터 새 시급 적용 · 과거 근무는 예전 시급 유지</p>
        </div>
      )}

      {/* 계좌 (급여 송금용) — 알바가 앱에서 직접 등록. 평소엔 보기/복사만, '수정'으로 보정 가능. */}
      <div style={styles.subBox}>
        {showBank ? (
          <>
            <div style={styles.row}>
              <input style={{ ...styles.input, flex: 1 }} value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="은행" />
              <input style={{ ...styles.input, flex: 2 }} value={account} onChange={(e) => setAccount(e.target.value)} placeholder="계좌번호" inputMode="numeric" />
            </div>
            <div style={styles.row}>
              <input style={{ ...styles.input, flex: 1 }} value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="예금주" />
              <button onClick={saveBank} disabled={busyAction === 'bank'} style={styles.actionPrimary}>{busyAction === 'bank' ? '저장 중…' : '저장'}</button>
              <button onClick={() => setShowBank(false)} disabled={busyAction === 'bank'} style={styles.action}>취소</button>
            </div>
            <p style={styles.hint}>보통은 알바가 앱에서 등록합니다. 오타 등 보정이 필요할 때만 직접 수정하세요.</p>
          </>
        ) : worker.account_number ? (
          <>
            <div style={{ fontSize: 16, color: '#1a1a1a' }}>
              {worker.bank_name ? `${worker.bank_name} ` : ''}{worker.account_number}
              {worker.account_holder ? ` (${worker.account_holder})` : ''}
            </div>
            <div style={styles.row}>
              <button onClick={copyAccount} style={styles.actionPrimary}>계좌 복사</button>
              <button onClick={() => setShowBank(true)} style={styles.action}>수정</button>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <p style={{ ...styles.hint, margin: 0 }}>알바가 앱에서 계좌를 등록하면 여기 표시됩니다.</p>
            <button onClick={() => setShowBank(true)} style={styles.linkBtn}>직접 입력</button>
          </div>
        )}
      </div>

      {code && (
        <div style={styles.codeBox}>
          초대코드: <b style={{ letterSpacing: 2, fontSize: 18 }}>{code}</b>
          <span style={{ color: '#888' }}> · 알바한테 알려주세요 (7일 내)</span>
        </div>
      )}
      {note && <p style={styles.note}>{note}</p>}

      <div style={styles.actions}>
        {worker.active && (
          <button onClick={makeCode} disabled={busyAction === 'code'} style={styles.actionPrimary}>
            {busyAction === 'code' ? '생성 중…' : '초대코드 생성'}
          </button>
        )}
        <Link href={`/manage/worker/${worker.id}`} style={styles.actionLink}>출퇴근 기록</Link>
        {worker.active ? (
          <button onClick={() => setActive(false)} disabled={busyAction === 'active'} style={styles.action}>
            {busyAction === 'active' ? '처리 중…' : '그만둠 처리'}
          </button>
        ) : (
          <button onClick={() => setActive(true)} disabled={busyAction === 'active'} style={styles.action}>
            {busyAction === 'active' ? '처리 중…' : '다시 활성화'}
          </button>
        )}
        <button onClick={removeWorker} disabled={busyAction === 'remove'} style={styles.actionDanger}>
          {busyAction === 'remove' ? '삭제 중…' : '삭제'}
        </button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: { background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  h2: { fontSize: 17, margin: '0 0 12px' },
  addForm: { display: 'flex', flexDirection: 'column', gap: 8 },
  addRow: { display: 'flex', gap: 8 },
  input: { padding: '12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 16, minWidth: 0 },
  dateLabel: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 15, color: '#666' },
  addButton: { padding: '13px 16px', border: 'none', borderRadius: 8, background: '#1a1a1a', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  msg: { fontSize: 15, color: '#b00020', margin: '8px 0 0' },
  empty: { fontSize: 16, color: '#888' },
  worker: { border: '1px solid #eee', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 },
  badge: { marginLeft: 8, fontSize: 13, background: '#eee', color: '#666', padding: '2px 6px', borderRadius: 999 },
  subBox: { background: '#fafafa', border: '1px solid #eee', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 },
  row: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  hint: { fontSize: 14, color: '#888', margin: 0 },
  linkBtn: { background: 'none', border: 'none', color: '#1a73e8', fontSize: 15, cursor: 'pointer', padding: 0, textDecoration: 'underline' },
  codeBox: { background: '#f0f7ff', border: '1px solid #cfe3ff', borderRadius: 8, padding: '8px 10px', fontSize: 16 },
  note: { fontSize: 15, color: '#0a7d33', margin: 0 },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  actionPrimary: { flex: 1, minWidth: 110, padding: '10px', border: 'none', borderRadius: 8, background: '#1a73e8', color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer' },
  action: { flex: 1, minWidth: 90, padding: '10px', border: '1px solid #ddd', borderRadius: 8, background: '#fff', fontSize: 16, cursor: 'pointer' },
  actionLink: { flex: 1, minWidth: 90, padding: '10px', border: '1px solid #ddd', borderRadius: 8, background: '#fff', fontSize: 16, cursor: 'pointer', textAlign: 'center', color: '#1a1a1a', textDecoration: 'none' },
  actionDanger: { padding: '10px 14px', border: '1px solid #f3c2c2', borderRadius: 8, background: '#fff', color: '#b00020', fontSize: 16, cursor: 'pointer' },
}
