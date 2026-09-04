import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';
import '../screens/ui.css';

/* 스스로 늘어나는 글쓰기 칸 — `<textarea className="input">` 을 그대로 대신한다.
   두 줄로 시작해 친 만큼 늘어나고 열 줄에서 멈춰 안에서 구른다. 손잡이(resize)는 원래도 없었다.
   글자 수는 부르는 쪽이 value.length 로 <Counter> 에 넘기고 있어 여기서 셀 게 없다 — maxLength 는 그대로 지나간다. */

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number; maxRows?: number };

export function AutoTextarea({ minRows = 2, maxRows = 10, className = 'input', value, ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
    const line = num(cs.lineHeight) || num(cs.fontSize) * 1.6 || 26;
    // border-box 라 scrollHeight(내용+안여백)에 테두리를 더한 값이 곧 높이다
    const frame = num(cs.paddingTop) + num(cs.paddingBottom) + num(cs.borderTopWidth) + num(cs.borderBottomWidth);
    const min = line * minRows + frame;
    const max = line * maxRows + frame;
    el.style.height = 'auto';                    // 줄어들 때도 재려면 한 번 풀어야 한다
    const want = el.scrollHeight + num(cs.borderTopWidth) + num(cs.borderBottomWidth);
    el.style.height = `${Math.min(Math.max(want, min), max)}px`;
    el.style.overflowY = want > max ? 'auto' : 'hidden';
  }, [value, minRows, maxRows]);
  return <textarea ref={ref} className={className.includes('auto') ? className : `${className} auto`} value={value} {...rest} />;
}
