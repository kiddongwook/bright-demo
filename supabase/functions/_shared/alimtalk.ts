// 알림톡 템플릿 — docs/ops/alimtalk.md 표와 글자 하나까지 같아야 한다 (심사받은 문구).
type P = Record<string, string>;
export const TEMPLATES: Record<string, { text: (p: P) => string; button: string }> = {
  NOTICE_NEW:        { text: p => `[영어의 집] 새 공지가 올라왔어요. ${p['제목'] ?? ''}`, button: '앱에서 보기' },
  NOTICE_REMIND:     { text: p => `[영어의 집] 아직 확인하지 않은 공지가 있어요. ${p['제목'] ?? ''}`, button: '앱에서 보기' },
  INQUIRY_ANSWERED:  { text: () => `[영어의 집] 문의에 답변이 도착했어요.`, button: '답변 보기' },
  MAKEUP_CONFIRMED:  { text: p => `[영어의 집] ${p['날짜'] ?? ''} 결석 보강이 정해졌어요. ${p['보강'] ?? ''}`, button: '확인하기' },
  ATTENDANCE:        { text: p => `[영어의 집] ${p['학생'] ?? ''} 오늘 출결이 기록됐어요. ${p['상태'] ?? ''}`, button: '확인하기' },
};
export type AlimtalkMsg = { to: string; templateCode: string; params: P; buttonUrl: string };
/** 대행사 어댑터. console: 로그만(받는 번호가 9999 로 끝나면 일부러 실패 — dead·문자 대체 경로 테스트용). http: 대행사 REST 로 전달. 반환값은 대행사 메시지 id. */
export async function sendAlimtalk(m: AlimtalkMsg): Promise<string> {
  const provider = Deno.env.get('ALIMTALK_PROVIDER') ?? 'console';
  const t = TEMPLATES[m.templateCode]; if (!t) throw new Error('unknown template ' + m.templateCode);
  if (provider === 'console') {
    if (m.to.endsWith('9999')) throw new Error('console: simulated failure');
    const id = 'console-' + crypto.randomUUID();
    console.log(`[ALIMTALK→${m.to}] ${t.text(m.params)} [${t.button}: ${m.buttonUrl}] (${id})`);
    return id;
  }
  if (provider === 'http') {
    // 대행사 계약 뒤 요청 본문·응답 필드(messageId)를 대행사 문서에 맞춘다 — docs/ops/outbox.md "대행사 붙이기"
    const r = await fetch(Deno.env.get('ALIMTALK_HTTP_URL')!, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (Deno.env.get('ALIMTALK_HTTP_TOKEN') ?? '') },
      body: JSON.stringify({ senderKey: Deno.env.get('ALIMTALK_SENDER_KEY'), to: m.to, templateCode: m.templateCode, text: t.text(m.params), buttons: [{ name: t.button, type: 'WL', url: m.buttonUrl }] }),
    });
    if (!r.ok) throw new Error('alimtalk http ' + r.status + ' ' + (await r.text()).slice(0, 200));
    const j = await r.json().catch(() => ({})); if (!j.messageId) throw new Error('alimtalk http: no messageId');
    return String(j.messageId);
  }
  throw new Error('unknown ALIMTALK_PROVIDER ' + provider);
}
/** 문자 대체 문구: 알림톡 문구 + 링크. 90바이트를 넘으면 대행사가 LMS 로 보낸다 — 요율 확인 항목. */
export const renderSms = (code: string, params: P, url: string) => `${TEMPLATES[code]?.text(params) ?? '[영어의 집] 알림이 있어요.'} ${url}`;
