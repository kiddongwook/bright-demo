import { useState } from 'react';
import { getPrefs, setPrefs } from '../../lib/api';
import { useLoad } from '../../lib/useLoad';
import { toast, errToast } from '../../lib/toast';
import { usePop } from '../../lib/pop';

/* 알림 설정 — 끄는 건 카톡뿐이다. 키가 없으면 켠 것(기본 전부 켬). 누르면 바로 저장한다. */
const ROWS: [string, string, string][] = [
  ['kakao_notice', '새 공지', '학원이 공지를 올리면'],
  ['kakao_remind', '안 읽은 공지 다시 알림', '읽지 않은 공지를 원장님이 다시 알릴 때'],
  ['kakao_answer', '문의 답변', '내 문의에 답이 달리면'],
  ['kakao_makeup', '보강 확정', '결석 보강 날짜가 정해지면'],
  ['kakao_attendance', '지각·결석 기록', '오늘 지각·결석으로 기록되면'],
];

export function Prefs() {
  const { data, setData, err } = useLoad(getPrefs, []);
  const [busy, setBusy] = useState('');
  const pop = usePop();                        // 방금 켠 체크만 한 번 튄다
  const prefs = data ?? {};

  async function toggle(key: string) {
    if (busy) return;
    const next = { ...prefs, [key]: prefs[key] === false };   // 없거나 true → 끈다, false → 켠다
    setBusy(key); setData(next);
    try { await setPrefs(next); toast('저장했어요'); }
    catch (e) { setData(prefs); errToast(e); }
    finally { setBusy(''); }
  }

  return (
    <section className="view on">
      <div className="head"><p className="lede">앱 안 알림은 계속 남아요. 여기서 끄는 건 <b>카톡</b>만이에요.</p></div>
      {err && <p className="muted" style={{ padding: '0 20px 10px' }}>{err}</p>}
      <div className="box">
        {ROWS.map(([key, title, sub]) => {
          const on = prefs[key] !== false;
          return (
            <button key={key} className="rw" onClick={() => { if (!on) pop.fire(key); toggle(key); }} aria-pressed={on}>
              <span className="bd"><span className="t">{title}</span><span className="s">{sub}</span></span>
              <span className={'cb' + (on ? ' on' : '') + pop.cls(key)} onAnimationEnd={pop.end}>{on ? '✓' : ''}</span>
            </button>
          );
        })}
      </div>
      <p className="muted" style={{ padding: '10px 20px 0' }}>체크를 지우면 그 카톡만 안 보내요. 앱을 열면 그대로 다 보여요.</p>
    </section>
  );
}
