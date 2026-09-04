/* 전화번호 문지기 — 화면·CSV·Edge 함수가 모두 이 두 함수만 쓴다.
   supabase/functions/_shared/sms.ts 에 같은 함수의 사본이 있다 (Deno 쪽은 app 을 import 할 수 없다). 둘을 같이 고친다. */

/** 숫자만 남긴 꼴로. 전각 숫자(０１０…)·공백·대시를 지우고 국가번호(+82 10…)는 0 으로 되돌린다. */
export const normalizePhone = (p: string) => {
  const s = (p ?? '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const d = s.replace(/[^0-9+]/g, '').replace(/(?!^)\+/g, '');   // '+' 는 맨 앞만
  const m = /^\+?82(\d+)$/.exec(d);
  return m ? '0' + m[1].replace(/^0+/, '') : d.replace(/\+/g, '');
};
/** 우리가 문자를 보낼 수 있는 휴대폰 모양인가. 010 은 11자리뿐이다(10자리는 011·016 등 옛 번호 — INP-36). */
export const isValidMobile = (p: string) => {
  const d = normalizePhone(p);
  return /^01[016789]\d{7,8}$/.test(d) && !(d.startsWith('010') && d.length !== 11);
};
export function formatPhone(p: string) {
  const d = normalizePhone(p);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`;
}
