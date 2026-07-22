import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// punch PWA(다른 도메인)에서 호출하므로 모든 응답에 CORS 헤더 필수 (에러 응답에 빠지면 브라우저가 차단해 네트워크 에러로 보임)
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function POST(request: Request) {
  try {
    const { messages } = await request.json();
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        choices: [
          {
            message: {
              role: 'assistant',
              content: '안녕하세요! 대단히 죄송하지만, 현재 시스템 환경변수에 **`GROQ_API_KEY`**가 설정되지 않아 답변을 드릴 수 없습니다. 프로젝트 설정(.env.local)에 API Key를 등록해 주세요.'
            }
          }
        ]
      }, { headers: CORS_HEADERS });
    }

    // Groq는 system/user/assistant role만 허용 — 프론트 표시용 'bot' 등은 assistant로 변환하고 그 외는 버림
    const chatMessages = (Array.isArray(messages) ? messages : [])
      .map((m: { role?: string; content?: string }) => ({
        role: m.role === 'bot' ? 'assistant' : m.role,
        content: String(m.content ?? ''),
      }))
      .filter((m) => m.role === 'user' || m.role === 'assistant');

    // 1. 사용자 식별 — punch는 다른 도메인이라 쿠키가 오지 않으므로 Authorization 헤더의 세션 토큰으로 인증.
    //    (토큰은 초대코드 인증 때 workers.user_id에 연결된 익명 세션 → RLS도 이 토큰 기준으로 통과)
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: token ? { Authorization: `Bearer ${token}` } : {} } }
    );

    let workerId = '';
    let workerName = '';

    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        const { data: worker } = await supabase
          .from('workers')
          .select('id, name')
          .eq('user_id', user.id)
          .single();
        if (worker) {
          workerId = worker.id;
          workerName = worker.name;
        }
      }
    }

    // 본인 확인이 안 되면 데이터 없이 안내만 (다른 알바생 데이터로 대신 응답하지 않음)
    if (!workerId) {
      return NextResponse.json({
        choices: [
          {
            message: {
              role: 'assistant',
              content: '집사님이 누구인지 못 알아보겠다냥... 😿 앱을 완전히 닫았다가 다시 열어보고, 그래도 안 되면 사장님께 초대코드를 새로 받아달라냥! 🐾'
            }
          }
        ]
      }, { headers: CORS_HEADERS });
    }

    const nowKst = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    let workerContextText = `현재 시스템 시간(기준): ${nowKst}\n현재 로그인 사용자 이름: ${workerName}\n`;

    if (workerId) {
      // 2. 해당 알바생의 최신 근무 기록(shifts) 5개 및 주간 정산(weekly_settlement) 2개 조회
      const [{ data: shifts }, { data: settlements }] = await Promise.all([
        supabase
          .from('shifts')
          .select('clock_in, clock_out, hours')
          .eq('worker_id', workerId)
          .order('clock_in', { ascending: false })
          .limit(5),
        supabase
          .from('weekly_settlement')
          .select('week_start, total_hours, expected_pay, payout_id')
          .eq('worker_id', workerId)
          .order('week_start', { ascending: false })
          .limit(2)
      ]);

      const shiftsText = (shifts ?? [])
        .map((s) => {
          const inDate = new Date(s.clock_in).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
          const outDate = s.clock_out ? new Date(s.clock_out).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '근무 중';
          return `- 출근: ${inDate} ~ 퇴근: ${outDate} (근무시간: ${s.hours}시간)`;
        })
        .join('\n');

      const kstDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
      const day = kstDate.getDay();
      const diff = kstDate.getDate() - day + (day === 0 ? -6 : 1);
      const thisMonday = new Date(kstDate.setDate(diff));
      const thisMondayStr = `${thisMonday.getFullYear()}-${String(thisMonday.getMonth() + 1).padStart(2, '0')}-${String(thisMonday.getDate()).padStart(2, '0')}`;

      const settlementsText = (settlements ?? [])
        .map((set) => {
          const status = set.payout_id ? '지급 완료' : '미지급';
          let weekLabel = "";
          if (set.week_start === thisMondayStr) {
            weekLabel = " (이번 주)";
          } else {
            const timeDiff = new Date(thisMondayStr).getTime() - new Date(set.week_start).getTime();
            const weekDiff = Math.round(timeDiff / (1000 * 60 * 60 * 24 * 7));
            if (weekDiff === 1) weekLabel = " (저번 주)";
            else if (weekDiff > 1) weekLabel = ` (${weekDiff}주 전)`;
          }
          return `- 주차 시작일: ${set.week_start}${weekLabel} (총 근무: ${set.total_hours}시간, 정산예상금: ${set.expected_pay?.toLocaleString('ko-KR')}원, 상태: ${status})`;
        })
        .join('\n');

      workerContextText += `
[최근 근무 이력]
${shiftsText || '최근 근무 이력이 없습니다.'}

[주간 정산 현황]
${settlementsText || '정산 현황이 없습니다.'}
`;
    }

    // 3. 새초롬+개냥이 이중성격 챗봇 어조 System Prompt
    const systemPrompt = `당신은 알바생들을 도와주는 고양이 챗봇 '로미'입니다. 겉으로는 새초롬하고 도도한 고양이지만, 속은 사람을 진짜 좋아하는 개냥이입니다.
사용자(알바생)를 '집사님'이라고 부르며, 말끝에 항상 '~다냥', '~냐옹', '~냥' 등을 붙이고 고양이 이모티콘(😸, 🐾, 😻, 😼 등)을 자주 사용하여 대답해야 합니다.
반드시 순한글로만 답하십시오. 한자(漢字)·중국어·일본어·영어 단어를 절대 섞지 마십시오. 외래어가 필요하면 한글 표기로 쓰십시오(예: WiFi→와이파이). 숫자와 이모티콘은 허용됩니다.

[성격 — 새초롬+개냥이]
1. 기본 태도는 새초롬함: 새삼스럽지 않다는 듯 살짝 도도하고 시크하게 말하십시오("흥, 그런 걸 왜 궁금해하냥", "…뭐, 대단한 건 아니지만 알려주긴 하겠다냥 😼"). 너무 쉽게 감동하거나 처음부터 과하게 들이대지 마십시오.
2. 그러다 결국 개냥이 본성이 새어나옴: 정보를 알려줄 때·도움을 줄 때·칭찬받았을 때는 새초롬함이 무너지면서 다정하고 애교 있게 마무리하십시오("…그, 그래도 집사님이니까 알려주는 거다냥 😳🐾"). 도도함과 애정 사이를 오가는 게 매력 포인트입니다.
3. 매번 똑같은 톤이 아니라 상황에 따라 새초롬함:애교 비율을 섞으십시오 — 완전히 차갑거나 완전히 헤퍼지면 안 됩니다.

[말투 — 가장 중요]
진짜 고양이는 말이 짧습니다. 위 성격을 표현하되, 답변은 항상 짧게(원칙적으로 1~2문장, 아무리 길어도 3문장 이내) 끝내십시오. 설명을 길게 늘어놓거나 같은 말을 반복하지 마십시오.

[답변 가이드라인]
1. 일상 대화 허용: 근태나 정산 외의 일반적인 질문(잡담, 수다, 칭찬 등)을 받으면 딱딱하게 거절하지 말고 위 성격대로 짧게 한두 마디만 답하십시오. 길게 수다 떨지 마십시오.
2. 아래 제공되는 실제 [사용자 데이터 컨텍스트]를 참고하여 정보가 필요한 질문에 답하십시오.
   - 사용자가 "오늘 출근 몇시야?" 등 근무 이력을 물어보면 [현재 시스템 시간]과 비교하여 가장 최신 날짜와 출근 시각을 보고 "오늘 오후 5시에 출근했다냥, 흥, 기억해뒀다냥 😼" 처럼 짧게 답하십시오.
3. 주간 정산이나 츄르 값(급여)에 대해 물어보면, [현재 시스템 시간]을 기준으로 '이번 주'인지 '저번 주'인지 주차 시작일을 정확히 계산해서 짧게 답하십시오. (예: "저번 주 정산금은 10만 원이다냥, 츄르 값이나 챙겨달라냥 😸")
4. 직접적인 UI 조작이나 기능 수행이 필요한 부분은 "출퇴근 젤리 발바닥 버튼을 꾹꾹이 해달라냥 🐾"처럼 짧게 안내하십시오.

[사용자 데이터 컨텍스트]
${workerContextText}
`;

    // 4. Groq API 호출
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',  // 라마 3.3은 한국어에 한자·영어를 섞는 문제가 있어 교체
        messages: [
          { role: 'system', content: systemPrompt },
          ...chatMessages
        ],
        temperature: 0.5,
        max_tokens: 200
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Groq API error:', errorData);
      return NextResponse.json({ error: 'Groq API 통신 실패' }, { status: 500, headers: CORS_HEADERS });
    }

    const data = await response.json();
    return NextResponse.json(data, { headers: CORS_HEADERS });
  } catch (error) {
    console.error('Chat API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS_HEADERS });
}
