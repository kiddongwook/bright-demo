/* 글자 수 — 칸 아래 오른쪽에 작게. 상한에 닿으면 눈에 띄게 (maxLength 가 이미 막고 있어 알려만 준다). */
export function Counter({ n, max }: { n: number; max: number }) {
  const full = n >= max;
  return (
    <span aria-hidden="true" style={{
      display: 'block', textAlign: 'right', fontSize: 'calc(12px * var(--fs))', lineHeight: 1.4, paddingTop: 4,
      color: full ? 'var(--danger)' : 'var(--ink2)',
    }}>{n}/{max}</span>
  );
}
