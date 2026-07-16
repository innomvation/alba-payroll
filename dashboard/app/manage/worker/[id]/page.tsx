import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import ClockEvents from './clock-events'

export const dynamic = 'force-dynamic'

export default async function WorkerClockPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: worker } = await supabase.from('workers').select('id, name').eq('id', id).maybeSingle()

  if (!worker) {
    return (
      <main style={{ maxWidth: 'min(720px, 94vw)', margin: '0 auto', padding: 16 }}>
        <p>알바를 찾을 수 없어요.</p>
        <Link href="/manage" style={{ color: '#1a73e8' }}>← 관리로</Link>
      </main>
    )
  }

  const { data: events } = await supabase
    .from('clock_events')
    .select('id, type, ts, source, needs_correction')
    .eq('worker_id', id)
    .order('ts', { ascending: false })
    .limit(50)

  return (
    <main style={{ maxWidth: 'min(720px, 94vw)', margin: '0 auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>{worker.name} · 출퇴근 기록</h1>
        <Link href="/manage" style={{ fontSize: 16, color: '#1a73e8' }}>← 관리</Link>
      </header>
      <ClockEvents workerId={worker.id} events={events ?? []} />
    </main>
  )
}
