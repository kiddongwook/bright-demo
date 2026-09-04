/* 공지 대상·읽음률을 말로 바꾸는 순수 함수들 — 화면 세 곳(목록·쓰기·읽은 사람)이 같은 것을 쓴다.
   사람 수 세기(countRecipients)는 api.ts 에 있다. 여기는 화면에 나갈 글자만. */

export type Named = { id: string; name: string };

/** 대상 반 이름 — 비면 "전체", 아니면 "고1 A · 고2 B".
 *  차례는 반 목록(칩이 서는 차례)을 따른다 — 고른 차례·DB 가 돌려준 차례가 달라도 늘 같게 보이게.
 *  목록에 없는(지워졌거나 아직 못 읽은) 반은 뒤에 "반" 으로 붙인다. */
export function targetLabel(classIds: string[] | null | undefined, classes: Named[] | null | undefined): string {
  const ids = classIds ?? [];
  if (ids.length === 0) return '전체';
  const list = classes ?? [];
  const known = list.filter(c => ids.includes(c.id)).map(c => c.name);
  const unknown = ids.filter(id => !list.some(c => c.id === id)).map(() => '반');
  return [...known, ...unknown].join(' · ');
}

/** 읽음률(%) — 0명 중 0명은 0%. 소수점은 버린다(반올림). */
export function readPct(read: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((Math.min(read, total) / total) * 100);
}

/** 다시 알리기 단추 글자 — 안 읽은 사람이 없으면 누를 것이 없다. */
export function remindLabel(unread: number, remindedBefore = false): string {
  if (unread <= 0) return '모두 읽었어요';
  return remindedBefore ? `안 읽은 ${unread}명에게 한 번 더 알리기` : `안 읽은 ${unread}명에게 다시 알리기`;
}
