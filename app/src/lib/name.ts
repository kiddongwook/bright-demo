/* 아이 이름을 부르는 말투로: 박지훈 → 지훈이, 이지수 → 지수, 남궁민수 → 민수, 김민 → 민이, 숫자·영문이 섞이면 그대로 */
const HANGUL = /^[가-힣]+$/;
const DOUBLE_SURNAMES = ['남궁', '독고', '제갈', '선우', '사공', '서문', '황보', '동방', '망절', '어금', '장곡'];

export function givenName(name: string): string {
  const n = name.trim();
  if (!HANGUL.test(n) || n.length < 2) return n;
  const ds = DOUBLE_SURNAMES.find(s => n.startsWith(s));
  if (ds && n.length >= 4) return n.slice(2);
  return n.length >= 3 ? n.slice(1) : n.slice(1);
}

/* 받침이 있으면 "이"를 붙인다(지훈 → 지훈이). 받침이 없으면 그대로(지수). 한글이 아니면 그대로 */
export function callName(name: string): string {
  const g = givenName(name);
  if (!HANGUL.test(g)) return g;
  const last = g.charCodeAt(g.length - 1) - 0xac00;
  const hasBatchim = last % 28 !== 0;
  return hasBatchim ? g + '이' : g;
}

/* 주어 조사까지: 지훈이가 · 지수가 · 박테스터1이 */
export function withSubject(name: string): string {
  const c = callName(name);
  if (!HANGUL.test(c)) return c + '이';
  const last = c.charCodeAt(c.length - 1) - 0xac00;
  return c + (last % 28 !== 0 ? '이' : '가');
}
