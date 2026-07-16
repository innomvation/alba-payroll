import { createClient } from '@/lib/supabase/server'
import WorkerManager from './worker-manager'
import LogoutButton from '../dashboard/logout-button'
import NavLink from '../nav-link'
import BottomNav from '../bottom-nav'

export const dynamic = 'force-dynamic'

export default async function ManagePage() {
  const supabase = await createClient()

  const { data: workplace } = await supabase
    .from('workplaces')
    .select('*')
    .order('created_at')
    .limit(1)
    .maybeSingle()

  let workersWithRate: {
    id: string
    name: string
    active: boolean
    hourly_rate: number | null
    bank_name: string | null
    account_number: string | null
    account_holder: string | null
  }[] = []
  if (workplace) {
    const { data: workers } = await supabase
      .from('workers')
      .select('id, name, active, bank_name, account_number, account_holder')
      .eq('workplace_id', workplace.id)
      .order('created_at')

    const ids = (workers ?? []).map((w) => w.id)
    const rateOf = new Map<string, number>()
    if (ids.length) {
      const { data: rates } = await supabase
        .from('worker_rate_history')
        .select('worker_id, hourly_rate, effective_from')
        .in('worker_id', ids)
        .order('effective_from', { ascending: false })
      for (const r of rates ?? []) {
        if (!rateOf.has(r.worker_id)) rateOf.set(r.worker_id, r.hourly_rate)
      }
    }
    workersWithRate = (workers ?? []).map((w) => ({ ...w, hourly_rate: rateOf.get(w.id) ?? null }))
  }

  return (
    <>
    <header className="fixed top-0 z-50 flex h-16 w-full items-center justify-center border-b border-gray-100 bg-white px-4">
      <h1 className="text-xl font-bold text-[#0052cc]">관리</h1>
      <div className="absolute right-4 top-1/2 -translate-y-1/2">
        <LogoutButton />
      </div>
    </header>
    <main style={{ maxWidth: 'min(720px, 94vw)', margin: '0 auto', padding: 16, paddingTop: 80, paddingBottom: 96, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {workplace ? (
        <WorkerManager workplaceId={workplace.id} workers={workersWithRate} />
      ) : (
        <p style={{ fontSize: 16, color: '#888' }}>
          먼저 <NavLink href="/manage/workplace" style={{ color: '#1a73e8' }}>가게 설정</NavLink>을 하면 알바를 등록할 수 있어요.
        </p>
      )}
    </main>
    <BottomNav />
    </>
  )
}
