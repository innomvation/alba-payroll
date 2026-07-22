// send-open-shift-alerts : 마감시간 지났는데 퇴근 안 한 알바에게 웹푸시 발송.
//
// 흐름:
//   1) pg_cron이 15분마다 이 함수를 service_role 키로 호출(supabase/migrations/0009_push_alerts.sql)
//   2) 알림 시점은 대상별로 다름(0010_alert_timing.sql):
//      - 알바 본인: 마감시간 + 30분 (open_shift_worker_alerts)
//      - 사장: 영업 끝난 날짜 오전 11시 (open_shift_owner_alerts)
//   3) 각 대상의 push_subscriptions로 웹푸시 발송, 같은 근무는 대상별로 1회만
//   4) 사장 알림 시점(익일 11시)엔 그때까지도 퇴근을 안 눌렀다는 뜻이므로, 마감시간을 추정 퇴근
//      시각으로 자동 기록(needs_correction=true)해 알바가 punch 앱에서 직접 실제 시각으로
//      고치게 한다(기존 "수정요청" 기능을 사장이 수동으로 누르던 걸 자동화).
//   5) 만료/무효 구독(410/404)은 정리, 처리한 근무는 open_shift_alert_log에 기록(target별)
//   6) 근무표(worker_schedules)에 오늘 근무 예정인데 예정시각+15분이 지나도 출근(in)을
//      아예 안 누른 알바는 no_checkin_owner_alerts()로 찾아서 사장에게 알림(하루 1회, no_checkin_alert_log로 중복 방지)
//
// 배포: supabase functions deploy send-open-shift-alerts
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// 출근일이 속한 날의 가게 마감 시각(다음날 새벽) — 월~금 02:00 KST, 토·일 03:00 KST
// (dashboard/app/dashboard/page.tsx, punch/index.html의 closingDeadline과 동일 규칙)
function closingDeadlineIso(clockInIso: string): string {
  const kstDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
    new Date(clockInIso),
  );
  const d = new Date(kstDateStr + "T00:00:00Z");
  const dow = d.getUTCDay(); // 0=일 ... 6=토 (KST 달력일 기준)
  const closeHourKst = dow === 0 || dow === 6 ? 3 : 2;
  const deadline = new Date(d);
  deadline.setUTCDate(deadline.getUTCDate() + 1);
  deadline.setUTCHours(closeHourKst - 9, 0, 0, 0); // KST → UTC
  return deadline.toISOString();
}

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
    let corrected = 0;
    for (const a of ownerAlerts ?? []) {
      if (a.owner_id) {
        sent += await sendTo(a.owner_id, "미퇴근 알림", `${a.worker_name} 님이 아직 퇴근을 안 눌렀어요.`);
      }
      // 익일 11시까지도 미퇴근 → 마감시간을 추정 퇴근시각으로 자동 기록, 알바 본인이 실제 시각으로 고치게 함
      const { error: insertErr } = await admin.from("clock_events").insert({
        worker_id: a.worker_id,
        type: "out",
        source: "manual",
        ts: closingDeadlineIso(a.clock_in),
        needs_correction: true,
      });
      if (!insertErr) corrected++;
      await admin
        .from("open_shift_alert_log")
        .insert({ clock_in_event_id: a.clock_in_event_id, target: "owner" });
    }

    const { data: noCheckinAlerts, error: noCheckinErr } = await admin.rpc("no_checkin_owner_alerts");
    if (noCheckinErr) throw noCheckinErr;
    for (const a of noCheckinAlerts ?? []) {
      if (a.owner_id) {
        const t = a.scheduled_start.slice(0, 5);
        sent += await sendTo(a.owner_id, "미출근 알림", `${a.worker_name} 님이 아직 출근을 안 하셨어요. (예정 ${t})`);
      }
      await admin.from("no_checkin_alert_log").insert({
        worker_id: a.worker_id,
        alert_date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()),
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        workerAlerts: workerAlerts?.length ?? 0,
        ownerAlerts: ownerAlerts?.length ?? 0,
        noCheckin: noCheckinAlerts?.length ?? 0,
        sent,
        corrected,
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
