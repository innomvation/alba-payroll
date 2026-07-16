// send-open-shift-alerts : 마감시간 지났는데 퇴근 안 한 알바에게 웹푸시 발송.
//
// 흐름:
//   1) pg_cron이 15분마다 이 함수를 service_role 키로 호출(supabase/migrations/0009_push_alerts.sql)
//   2) 알림 시점은 대상별로 다름(0010_alert_timing.sql):
//      - 알바 본인: 마감시간 + 30분 (open_shift_worker_alerts)
//      - 사장: 영업 끝난 날짜 오전 11시 (open_shift_owner_alerts)
//   3) 각 대상의 push_subscriptions로 웹푸시 발송, 같은 근무는 대상별로 1회만
//   4) 만료/무효 구독(410/404)은 정리, 처리한 근무는 open_shift_alert_log에 기록(target별)
//
// 배포: supabase functions deploy send-open-shift-alerts
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    webpush.setVapidDetails(
      Deno.env.get("VAPID_SUBJECT")!,
      Deno.env.get("VAPID_PUBLIC_KEY")!,
      Deno.env.get("VAPID_PRIVATE_KEY")!,
    );

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    async function sendTo(userId: string, title: string, body: string) {
      const { data: subs } = await admin
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth_key")
        .eq("user_id", userId);

      let count = 0;
      for (const s of subs ?? []) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
            JSON.stringify({ title, body }),
          );
          count++;
        } catch (e) {
          const statusCode = (e as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await admin.from("push_subscriptions").delete().eq("id", s.id);
          }
        }
      }
      return count;
    }

    let sent = 0;

    const { data: workerAlerts, error: workerErr } = await admin.rpc("open_shift_worker_alerts");
    if (workerErr) throw workerErr;
    for (const a of workerAlerts ?? []) {
      if (a.worker_auth_id) {
        sent += await sendTo(a.worker_auth_id, "아 맞다 퇴근!", "잊지 말고 [퇴근] 눌러주세요.");
      }
      await admin
        .from("open_shift_alert_log")
        .insert({ clock_in_event_id: a.clock_in_event_id, target: "worker" });
    }

    const { data: ownerAlerts, error: ownerErr } = await admin.rpc("open_shift_owner_alerts");
    if (ownerErr) throw ownerErr;
    for (const a of ownerAlerts ?? []) {
      if (a.owner_id) {
        sent += await sendTo(a.owner_id, "미퇴근 알림", `${a.worker_name} 님이 아직 퇴근을 안 눌렀어요.`);
      }
      await admin
        .from("open_shift_alert_log")
        .insert({ clock_in_event_id: a.clock_in_event_id, target: "owner" });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        workerAlerts: workerAlerts?.length ?? 0,
        ownerAlerts: ownerAlerts?.length ?? 0,
        sent,
      }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
