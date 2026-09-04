/* 연락처 붙여넣기 — 주소록·문자·엑셀에서 긁어 온 글에서 "이름 + 번호"를 뽑아낸다.
   화면(명부 학생 추가)이 붙여넣기 한 번으로 여러 칸을 채우게 하려고 만든 자리다.

   번호의 참·거짓은 여기서 정하지 않는다 — phone.ts 의 normalizePhone/isValidMobile 만 쓴다(문지기는 하나여야 한다). */
import { isValidMobile, normalizePhone } from './phone';

export type Contact = { name?: string; phone: string };

/* 줄 안에서 전화번호로 보이는 토막.
   - 앞의 (^|숫자 아닌 글자) 는 "숫자 한복판에서 시작하지 않게" 하려고 한 글자 먹는다 (lookbehind 는 옛 사파리가 모른다).
   - +82 · 82 로 시작하면 그다음 0 은 없어도 된다 (+82 10-1234-5678).
   - 가운데·끝 자리는 3~4자리 — 011·016 같은 10자리 옛 번호도 잡는다.
   - 뒤에 숫자가 더 붙어 있으면(12자리 이상) 아예 안 잡는다 — 잘라 내면 남의 번호가 된다. */
const PHONE_RE = /(^|[^0-9])((?:\+?82[ \t.·-]*)?0?1[016789][ \t.·-]*\d{3,4}[ \t.·-]*\d{3,4})(?![0-9])/g;
/* 이름 자리에서 지울 것 — 주소록이 끼워 넣는 꼬리표·구분자 */
const NAME_DROP = /^(휴대폰|휴대전화|전화|집|회사|모바일|학부모|어머니|아버지|엄마|아빠|학생|이름|번호|연락처)$/;

/** 붙여넣은 글에서 이름·번호 쌍을 뽑는다. 휴대폰 모양이 아닌 번호는 버리고, 같은 번호는 한 번만 남긴다. */
export function parseContacts(text: string): Contact[] {
  const out: Contact[] = [];
  const seen = new Map<string, Contact>();
  for (const rawLine of (text ?? '').split(/[\r\n;]+/)) {
    // 전각 숫자(０１０…)를 먼저 되돌린다 — 정규식은 반각만 안다
    const line = rawLine.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
    if (!line.trim()) continue;
    let rest = line;
    const phones: string[] = [];
    for (const m of line.matchAll(PHONE_RE)) {
      const d = normalizePhone(m[2]);
      if (!isValidMobile(d)) continue;   // 02-…·짧은 번호는 버린다 (채워 봐야 저장에서 막힌다)
      phones.push(d);
      rest = rest.replace(m[2], ' ');
    }
    if (!phones.length) continue;
    const name = pickName(rest);
    phones.forEach((p, i) => {
      const c: Contact = i === 0 && name ? { name, phone: p } : { phone: p };
      const had = seen.get(p);
      if (had) { if (!had.name && c.name) had.name = c.name; return; }   // 같은 번호는 한 번만 — 이름은 먼저 나온 것 뒤에 채워 준다
      seen.set(p, c); out.push(c);
    });
  }
  return out;
}

/** 번호를 걷어낸 나머지에서 사람 이름만 남긴다. 아무것도 안 남으면 이름 없는 연락처다. */
function pickName(rest: string): string | undefined {
  const s = rest.replace(/[,\t|/()[\]<>"'·:]+/g, ' ').replace(/\+82/g, ' ')
    .split(/\s+/).map(w => w.trim()).filter(w => w && !NAME_DROP.test(w) && !/\d/.test(w)).join(' ');
  return s ? s.slice(0, 40) : undefined;
}
