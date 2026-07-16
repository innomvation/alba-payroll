// save-bank : 로그인한 알바생 본인이 자기 계좌 정보를 등록/수정한다.
//
// 배경: workers 테이블엔 알바생 본인 UPDATE RLS 정책이 없음(조회만 가능).
//   직접 UPDATE 를 열면 알바가 이름·시급·소속까지 바꿀 수 있어 위험하므로,
//   service role 로 '계좌 컬럼만' 갱신하는 이 함수로 한정한다.
//   (redeem-invite 와 동일한 패턴: 세션으로 본인 확인 → service role 로 안전 갱신)
//
// 배포: supabase functions deploy save-bank
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
    const body = await req.json().catch(() => ({}));
    const bank_name = String(body.bank_name ?? "").trim();
    const account_number = String(body.account_number ?? "").trim();
    const account_holder = String(body.account_holder ?? "").trim();
    if (!bank_name || !account_number || !account_holder)
      return json({ error: "은행·계좌번호·예금주를 모두 입력하세요." }, 400);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "인증이 필요합니다." }, 401);

    // 호출자(로그인한 알바생) 신원 확인
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

    // service role: 본인에게 연결된 워커의 '계좌 컬럼만' 갱신
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: worker } = await admin
      .from("workers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!worker) return json({ error: "연결된 알바생 정보가 없습니다." }, 400);

    const { error: updErr } = await admin
      .from("workers")
      .update({ bank_name, account_number, account_holder })
      .eq("id", worker.id);
    if (updErr) return json({ error: "계좌 저장에 실패했습니다." }, 500);

    return json({ ok: true }, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
