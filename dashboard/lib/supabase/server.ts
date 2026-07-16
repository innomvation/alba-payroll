import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// 서버 컴포넌트/액션용 Supabase 클라이언트 (쿠키 세션 기반)
export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // 서버 컴포넌트에서 호출 시 무시 (미들웨어가 세션 갱신 담당)
          }
        },
      },
    }
  )
}
