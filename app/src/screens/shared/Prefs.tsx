import { useEffect, useState } from 'react';
import { getPrefs, hasPushSubscription, setPrefs } from '../../lib/api';
import { currentEnv } from '../../lib/env';
import { currentSubscription, isPushSupported, permissionState, subscribe, unsubscribe } from '../../lib/push';
import { useNav } from '../../lib/nav';
import { useLoad } from '../../lib/useLoad';
import { toast, errToast } from '../../lib/toast';
import { usePop } from '../../lib/pop';

/* 알림 설정 — 맨 위가 이 기기 푸시, 그 아래가 카톡. 키가 없으면 켠 것(카톡은 기본 전부 켬). 누르면 바로 저장한다. */
const ROWS: [string, string, string][] = [
  ['kakao_notice', '새 공지', '학원이 공지를 올리면'],
  ['kakao_remind', '안 읽은 공지 다시 알림', '읽지 않은 공지를 원장님이 다시 알릴 때'],
  ['kakao_answer', '문의 답변', '내 문의에 답이 달리면'],
  ['kakao_makeup', '보강 확정', '결석 보강 날짜가 정해지면'],
  ['kakao_attendance', '지각·결석 기록', '오늘 지각·결석으로 기록되면'],
];

/* 푸시 스위치가 놓인 처지 — 화면에 뭘 그릴지가 여기서 갈린다.
   ios-tab: 아이폰 사파리 탭(홈 화면에 추가해야 켤 수 있다) · kakao: 카톡 내장 브라우저 · none: 이 브라우저가 못 함
   denied: 브라우저에서 막음 · on/off: 쓸 수 있음 */
type PushState = 'loading' | 'ios-tab' | 'kakao' | 'none' | 'denied' | 'off' | 'on';

export function Prefs() {
  const nav = useNav();
  const { data, setData, err } = useLoad(getPrefs, []);
  const [busy, setBusy] = useState('');
  const pop = usePop();                        // 방금 켠 체크만 한 번 튄다
  const prefs = data ?? {};
  const [push, setPush] = useState<PushState>('loading');

  // 이 기기의 처지를 먼저 본다: 아이폰 탭·카톡은 푸시 API 자체가 없어서 "지원 안 함" 보다 앞에 둔다.
  async function readPush() {
    const env = currentEnv();
    if (env === 'kakao') { setPush('kakao'); return; }
    if (env === 'ios') { setPush('ios-tab'); return; }
    if (!isPushSupported()) { setPush('none'); return; }
    if (permissionState() === 'denied') { setPush('denied'); return; }
    const sub = await currentSubscription();
    if (!sub) { setPush('off'); return; }
    // 기기엔 구독이 남았는데 서버에 내 행이 없으면(기기를 물려받음·행을 지움) 꺼진 것으로 본다 — 누르면 새로 만든다.
    try { setPush(await hasPushSubscription(sub.endpoint) ? 'on' : 'off'); } catch { setPush('on'); }
  }
  useEffect(() => { readPush(); }, []);

  async function togglePush() {
    if (busy) return;
    setBusy('push');
    try {
      if (push === 'on') { await unsubscribe(); setPush('off'); toast('이 기기 알림을 껐어요'); }
      else {
        const r = await subscribe();
        if (r === 'ok') { setPush('on'); toast('이제 이 기기로 알림이 와요'); }
        else if (r === 'denied') { setPush('denied'); toast('브라우저가 알림을 막았어요'); }
        else if (r === 'unsupported') { setPush('none'); toast('이 브라우저는 알림을 지원하지 않아요'); }
        else if (r === 'insecure') { setPush('none'); toast('이 브라우저는 푸시를 지원하지 않아요'); }
        else toast('알림을 켜지 못했어요. 잠시 뒤 다시 눌러 주세요');
      }
    } catch (e) { errToast(e); }
    finally { setBusy(''); }
  }

  async function toggle(key: string, defaultOn: boolean) {
    if (busy) return;
    const on = defaultOn ? prefs[key] !== false : prefs[key] === true;
    const next = { ...prefs, [key]: !on };
    setBusy(key); setData(next);
    try { await setPrefs(next); toast('저장했어요'); }
    catch (e) { setData(prefs); errToast(e); }
    finally { setBusy(''); }
  }

  const pushSub = push === 'on' ? '이 기기로 알림이 와요' : push === 'off' ? '누르면 알림을 받기 시작해요'
    : push === 'denied' ? '브라우저에서 막았어요. 브라우저 설정에서 이 사이트의 알림을 허용해 주세요'
      : push === 'ios-tab' ? '홈 화면에 추가한 뒤 켤 수 있어요'
        : push === 'kakao' ? '카톡 안에서는 켤 수 없어요. 브라우저로 열어 주세요'
          : push === 'none' ? '이 브라우저는 알림을 지원하지 않아요' : '확인하는 중…';
  const canToggle = push === 'on' || push === 'off';
  const kakaoAlso = prefs.kakao_also === true;

  return (
    <section className="view on">
      <div className="head"><p className="lede">앱 안 알림은 계속 남아요. 여기서 정하는 건 <b>어디로 알려줄지</b>예요.</p></div>
      {err && <p className="muted" style={{ padding: '0 20px 10px' }}>{err}</p>}
      <div className="lab first">이 기기</div>
      <div className="box">
        <button className="rw" onClick={() => { if (canToggle) { if (push === 'off') pop.fire('push'); togglePush(); } }} aria-pressed={push === 'on'} aria-disabled={!canToggle}>
          <span className="bd"><span className="t">이 기기로 알림 받기</span><span className="s">{pushSub}</span></span>
          <span className={'cb' + (push === 'on' ? ' on' : '') + pop.cls('push')} onAnimationEnd={pop.end}>{push === 'on' ? '✓' : ''}</span>
        </button>
        {push === 'ios-tab' && (
          <button className="rw" onClick={() => nav.push('install')}>
            <span className="bd"><span className="t">홈 화면에 추가하기</span><span className="s">아이폰은 홈 화면에 추가해야 알림을 켤 수 있어요</span></span>
            <span className="go">›</span>
          </button>
        )}
        {push === 'on' && (
          <button className="rw" onClick={() => { if (!kakaoAlso) pop.fire('kakao_also'); toggle('kakao_also', false); }} aria-pressed={kakaoAlso}>
            <span className="bd"><span className="t">카톡도 같이 받기</span><span className="s">끄면 아래 카톡 알림 대신 이 기기 알림만 와요</span></span>
            <span className={'cb' + (kakaoAlso ? ' on' : '') + pop.cls('kakao_also')} onAnimationEnd={pop.end}>{kakaoAlso ? '✓' : ''}</span>
          </button>
        )}
      </div>
      <div className="lab">카톡</div>
      <div className="box">
        {ROWS.map(([key, title, sub]) => {
          const on = prefs[key] !== false;
          return (
            <button key={key} className="rw" onClick={() => { if (!on) pop.fire(key); toggle(key, true); }} aria-pressed={on}>
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
