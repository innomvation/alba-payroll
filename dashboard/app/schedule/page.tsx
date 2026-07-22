import { createClient } from '@/lib/supabase/server'
import BottomNav from '../bottom-nav'
import ScheduleEditor from './schedule-editor'
import CopyTodayButton from './copy-today'

export const dynamic = 'force-dynamic'

export type Worker = { id: string; name: string }
export type Schedule = {
  id: string
  worker_id: string
  weekday: number
  start_time: string
  end_time: string
}

export default async function SchedulePage() {
  const supabase = await createClient()

  const [{ data: workers }, { data: schedules }] = await Promise.all([
    supabase.from('workers').select('id, name').eq('active', true).order('name'),
    supabase
      .from('worker_schedules')
      .select('id, worker_id, weekday, start_time, end_time')
      .order('weekday')
      .order('start_time'),
  ])

  return (
    <>
      <header className="fixed top-0 z-50 flex h-16 w-full items-center justify-center border-b border-gray-100 bg-white px-4">
        <h1 className="text-xl font-bold text-[#0052cc]">근무표</h1>
        <div className="absolute right-4 top-1/2 -translate-y-1/2">
          <CopyTodayButton workers={(workers ?? []) as Worker[]} schedules={(schedules ?? []) as Schedule[]} />
        </div>
      </header>
      <main className="mx-auto max-w-[min(720px,94vw)] space-y-4 px-4 pb-24 pt-20">
        <ScheduleEditor workers={(workers ?? []) as Worker[]} schedules={(schedules ?? []) as Schedule[]} />
      </main>
      <BottomNav />
    </>
  )
}
