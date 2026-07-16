import { createClient } from '@/lib/supabase/server'
import WorkplaceForm from '../workplace-form'
import BottomNav from '../../bottom-nav'

export const dynamic = 'force-dynamic'

export default async function WorkplaceSettingsPage() {
  const supabase = await createClient()

  const { data: workplace } = await supabase
    .from('workplaces')
    .select('*')
    .order('created_at')
    .limit(1)
    .maybeSingle()

  return (
    <>
    <header className="fixed top-0 z-50 flex h-16 w-full items-center justify-center border-b border-gray-100 bg-white px-4">
      <h1 className="text-xl font-bold text-[#0052cc]">가게 설정</h1>
    </header>
    <main style={{ maxWidth: 'min(720px, 94vw)', margin: '0 auto', padding: 16, paddingTop: 80, paddingBottom: 96, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <WorkplaceForm workplace={workplace ?? null} />
    </main>
    <BottomNav />
    </>
  )
}
