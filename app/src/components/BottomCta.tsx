import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IcCheck } from './icons';

/* 하단 고정 CTA — 주 동작을 엄지 자리에 둔다 (스크롤과 무관하게).
   화면 안에서 <BottomCta …/> 로 쓰면 .app 맨 아래로 포털돼, 탭바(또는 제한 줄) 위에 붙는다.
   본문 아래 여백은 body.has-cta 가 theme.css 에서 늘린다 — 마지막 줄이 바에 가리지 않게. */

/* done — 저장이 끝난 잠깐(부르는 쪽이 켰다 끈다). 배경은 그대로 두고 안쪽만 체크+말로 갈아 낀다.
   막지는 않는다: 다시 눌러도 같은 결과라, 성공 표시를 흐리게(disabled) 만드는 쪽이 더 어색하다. */
type Primary = { label: string; onClick: () => void; disabled?: boolean; busy?: boolean; busyLabel?: string; done?: boolean; doneLabel?: string };
type Secondary = { label: string; onClick: () => void };

/* 화면이 바뀔 때 옛 바가 늦게 내려가도 body.has-cta 가 사라지지 않게 센다 */
let mounted = 0;

export function BottomCta({ primary, secondary }: { primary: Primary; secondary?: Secondary }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  // .view 는 들어올 때 transform 으로 움직여서 position:fixed 가 어긋난다 — .app 안에 붙인다.
  // 레이아웃 단계에서 붙여야 바와 여백이 같은 프레임에 그려진다.
  useLayoutEffect(() => {
    setHost(document.querySelector<HTMLElement>('.app'));
    mounted += 1; document.body.classList.add('has-cta');
    return () => { mounted -= 1; if (mounted <= 0) { mounted = 0; document.body.classList.remove('has-cta'); } };
  }, []);
  if (!host) return null;
  // busy > done > 평소. key 를 붙여 내용이 바뀔 때마다 새로 그려지고, 그때 150ms 로 떠오른다.
  const face = primary.busy ? 'busy' : primary.done ? 'done' : 'idle';
  return createPortal(
    <div className="bottom-cta">
      {secondary && <button className="btn line" onClick={secondary.onClick}>{secondary.label}</button>}
      <button className="btn" disabled={primary.disabled || primary.busy} onClick={primary.onClick}>
        <span key={face} className="cta-face">
          {face === 'busy' ? (primary.busyLabel ?? '저장 중…')
            : face === 'done' ? <><IcCheck size={19} />{primary.doneLabel ?? '알렸어요'}</>
            : primary.label}
        </span>
      </button>
    </div>, host);
}
