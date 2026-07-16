// redeem-invite : 초대코드를 검증하고, 익명 로그인한 사용자를 알바생(worker)에 연결한다.
//
// 흐름:
//   1) 앱이 supabase.auth.signInAnonymously() 로 익명 세션(uid) 발급
//   2) 그 세션의 JWT 와 함께 이 함수를 코드와 함께 호출
//   3) (service role) 코드 검증 → workers.user_id = uid 연결 → 코드 used_at 기록
//
// 배포: supabase functions deploy redeem-invite
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { code } = await req.json().catch(() => ({}));
    if (!code) return json({ error: "코드를 입력하세요." }, 400);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "인증이 필요합니다." }, 401);

    // 호출자(익명 로그인 사용자) 신원 확인
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "유효하지 않은 세션입니다." }, 401);

    // 권한 있는 service role 클라이언트 (RLS 우회)
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: invite } = await admin
      .from("worker_invites")
      .select("id, worker_id, expires_at, used_at")
      .eq("code", code)
      .is("used_at", null)
      .maybeSingle();

    if (!invite) return json({ error: "잘못되었거나 이미 사용된 코드입니다." }, 400);
    if (new Date(invite.expires_at) < new Date())
      return json({ error: "만료된 코드입니다." }, 400);

    // 워커에 현재 사용자 연결
    const { error: linkErr } = await admin
      .from("workers")
      .update({ user_id: user.id })
      .eq("id", invite.worker_id);
    if (linkErr) return json({ error: "워커 연결에 실패했습니다." }, 500);

    // 코드 사용 처리
    await admin
      .from("worker_invites")
      .update({ used_at: new Date().toISOString() })
      .eq("id", invite.id);

    const { data: worker } = await admin
      .from("workers")
      .select("id, name, workplace_id")
      .eq("id", invite.worker_id)
      .single();

    return json({ worker }, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
