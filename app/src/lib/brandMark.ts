/* 앱바·PC 내비 머리에 무엇을 보일지 — 순수 함수라 화면 둘(App·SideNav)이 같은 답을 낸다.
   img: 학원 가로 로고(경로는 넣어 준 그대로 — URL 변환은 부르는 쪽), text: 학원 이름 글자, bright: BRIGHT 워드마크.
   어두운 화면에 밝은 판 가로 로고를 그대로 올리면 검은 글자가 검은 바닥에 묻히므로 그때는 글자로 물러난다. */
export type BrandMark = { kind: 'img'; src: string } | { kind: 'text' } | { kind: 'bright' };

export function brandMark(a: { wordmark: string | null; wordmarkDark: string | null; logo: string | null } | null | undefined, dark: boolean): BrandMark {
  if (!a) return { kind: 'bright' };   // 학원이 없다(운영자) → BRIGHT
  const w = dark ? a.wordmarkDark : a.wordmark;   // 화면 밝기에 맞는 판만 그림으로
  if (w) return { kind: 'img', src: w };
  if (a.wordmark || a.wordmarkDark || a.logo) return { kind: 'text' };   // 무엇이든 올린 학원은 이름 글자로 — BRIGHT 로 되돌아가지 않는다
  return { kind: 'bright' };
}
