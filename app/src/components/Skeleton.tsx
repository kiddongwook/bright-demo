import '../screens/ui.css';

/* 기다리는 동안 화면이 비어 보이지 않게 — 줄 모양 회색 막대.
   움직임을 줄이는 설정에서는 반짝임 없이 그대로 있는다(theme.css 의 전역 규칙). */
export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="box sk" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skr"><span className="b b1" /><span className="b b2" /></div>
      ))}
    </div>
  );
}
