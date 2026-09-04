// 알림톡 템플릿 — docs/ops/alimtalk.md 표와 글자 하나까지 같아야 한다 (심사받은 문구).
// 앞머리 [학원] 은 변수다 (params['학원'] — trg_notification_outbox 가 academies.name 을 넣어 준다). 학원 이름 하드코딩 금지.
type P = Record<string, string>;
export const TEMPLATES: Record<string, { text: (p: P) => string; button: string }> = {
  NOTICE_NEW:        { text: p => `[${p['학원'] ?? '학원'}] 새 공지가 올라왔어요. ${p['제목'] ?? ''}`, button: '앱에서 보기' },
  NOTICE_REMIND:     { text: p => `[${p['학원'] ?? '학원'}] 아직 확인하지 않은 공지가 있어요. ${p['제목'] ?? ''}`, button: '앱에서 보기' },
  INQUIRY_ANSWERED:  { text: p => `[${p['학원'] ?? '학원'}] 문의에 답변이 도착했어요.`, button: '답변 보기' },
  MAKEUP_CONFIRMED:  { text: p => `[${p['학원'] ?? '학원'}] ${p['날짜'] ?? ''} 결석 보강이 정해졌어요. ${p['보강'] ?? ''}`, button: '확인하기' },
  ATTENDANCE:        { text: p => `[${p['학원'] ?? '학원'}] ${p['학생'] ?? ''} 오늘 출결이 기록됐어요. ${p['상태'] ?? ''}`, button: '확인하기' },
};

/* ── 길이 자르기 (INP-01/02/03/71) ──
   화면·DB 에 상한이 있어도 옛 데이터·다른 클라이언트가 긴 값을 실어 보낼 수 있다.
   문구를 만드는 마지막 자리에서 한 번 더 자른다 — 카톡 1,000자·문자 2,000바이트·푸시 4KB 를 넘기지 않게. */
export const TEXT_MAX = 1000;                 // 카카오 알림톡 본문 한도
export const SMS_MAX_BYTES = 2000;            // 문자(LMS) 한도 — 넉넉히 잡은 우리 상한
/** 칸마다의 상한. 여기 없는 칸은 기본 200자. */
export const PARAM_MAX: Record<string, number> = { 학원: 40, 제목: 80, 보강: 80, 날짜: 20, 학생: 20, 상태: 20, 사유: 100, 알림: 200 };
const PARAM_DEFAULT = 200;

/** n 자를 넘으면 잘라서 … 을 붙인다 (결과 길이는 n 을 넘지 않는다). */
export const cut = (s: string, n: number): string => (s.length > n ? s.slice(0, Math.max(0, n - 1)).trimEnd() + '…' : s);
/** 바이트로 자른다 — 한글은 3바이트. 글자 가운데가 잘리지 않게 한 글자씩 뺀다. */
export function cutBytes(s: string, maxBytes: number): string {
  const enc = new TextEncoder();
  if (enc.encode(s).length <= maxBytes) return s;
  let out = s;
  while (out.length > 0 && enc.encode(out + '…').length > maxBytes) out = out.slice(0, -1);
  return out.trimEnd() + '…';
}
/** 줄바꿈·연속 공백을 한 칸으로 (INP-05 — 학원 이름의 줄바꿈이 문구 앞머리에 들어간다). */
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();
/** params 를 문구에 넣기 전에 칸마다 자른다. */
export function clampParams(p: P | null | undefined): P {
  const out: P = {};
  for (const [k, v] of Object.entries(p ?? {})) out[k] = cut(oneLine(String(v ?? '')), PARAM_MAX[k] ?? PARAM_DEFAULT);
  return out;
}
/** 템플릿 문구 — 칸을 자른 뒤 만들고, 그래도 길면 1,000자에서 끊는다. */
export function renderTemplate(code: string, params: P | null | undefined): string {
  const p = clampParams(params);
  const t = TEMPLATES[code];
  return cut(t ? t.text(p) : `[${p['학원'] ?? '학원'}] 알림이 있어요.`, TEXT_MAX);
}

export type AlimtalkMsg = { to: string; templateCode: string; params: P; buttonUrl: string };
/** 대행사 어댑터. console: 로그만(받는 번호가 9999 로 끝나면 일부러 실패 — dead·문자 대체 경로 테스트용). http: 대행사 REST 로 전달. 반환값은 대행사 메시지 id. */
export async function sendAlimtalk(m: AlimtalkMsg): Promise<string> {
  const provider = Deno.env.get('ALIMTALK_PROVIDER') ?? 'console';
  const t = TEMPLATES[m.templateCode]; if (!t) throw new Error('unknown template ' + m.templateCode);
  const text = renderTemplate(m.templateCode, m.params);
  if (provider === 'console') {
    if (m.to.endsWith('9999')) throw new Error('console: simulated failure');
    const id = 'console-' + crypto.randomUUID();
    console.log(`[ALIMTALK→${m.to}] ${text} [${t.button}: ${m.buttonUrl}] (${id})`);
    return id;
  }
  if (provider === 'http') {
    // 대행사 계약 뒤 요청 본문·응답 필드(messageId)를 대행사 문서에 맞춘다 — docs/ops/outbox.md "대행사 붙이기"
    const r = await fetch(Deno.env.get('ALIMTALK_HTTP_URL')!, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (Deno.env.get('ALIMTALK_HTTP_TOKEN') ?? '') },
      body: JSON.stringify({ senderKey: Deno.env.get('ALIMTALK_SENDER_KEY'), to: m.to, templateCode: m.templateCode, text, buttons: [{ name: t.button, type: 'WL', url: m.buttonUrl }] }),
    });
    if (!r.ok) throw new Error('alimtalk http ' + r.status + ' ' + (await r.text()).slice(0, 200));
    const j = await r.json().catch(() => ({})); if (!j.messageId) throw new Error('alimtalk http: no messageId');
    return String(j.messageId);
  }
  throw new Error('unknown ALIMTALK_PROVIDER ' + provider);
}
/** 문자 대체 문구: 알림톡 문구 + 링크. 링크는 절대 자르지 않는다 — 문구 쪽을 2,000바이트 안으로 줄인다.
 *  90바이트를 넘으면 대행사가 LMS 로 보낸다 — 요율 확인 항목. */
export function renderSms(code: string, params: P | null | undefined, url: string): string {
  const room = SMS_MAX_BYTES - new TextEncoder().encode(' ' + url).length;
  return `${cutBytes(renderTemplate(code, params), Math.max(0, room))} ${url}`;
}
