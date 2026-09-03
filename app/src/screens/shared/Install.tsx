import { useState } from 'react';
import { currentEnv, externalOpenUrl } from '../../lib/env';
import { useSession } from '../../auth/session';
/* 홈 화면에 추가 — 환경마다 길이 다르다. 카톡 안에서는 안 되니 브라우저로 내보낸다. */
export function Install() {
  const { active } = useSession(); const env = currentEnv(); const name = active?.academy_name ?? '영어의 집';
  const [done, setDone] = useState(false);
  const ext = externalOpenUrl(location.href, env);
  return (
    <section className="view on">
      <div className="head"><p className="lede">앱처럼 아이콘으로 열어요. 설치는 <b>한 번</b>이면 돼요.</p></div>
      {env === 'installed' && <p className="muted" style={{ padding: '0 20px' }}>이미 홈 화면에서 열었어요. 더 할 일이 없어요.</p>}
      {env === 'kakao' && <><p className="para">카톡 안에서는 홈 화면에 추가할 수 없어요. 기본 브라우저로 열어서 추가해 주세요.</p>
        <div className="btnrow"><a className="btn" href={ext!}>브라우저로 열기</a></div>
        <p className="muted" style={{ padding: '10px 20px 0' }}>안 열리면 오른쪽 위 ⋮ → "다른 브라우저로 열기".</p></>}
      {env === 'ios' && <ol className="steps"><li>아래 <b>공유</b> 단추(네모에 화살표)를 누르세요.</li><li><b>홈 화면에 추가</b>를 고르세요.</li><li>오른쪽 위 <b>추가</b>.</li></ol>}
      {env === 'android' && (window.__installPrompt
        ? <div className="btnrow"><button className="btn" disabled={done} onClick={async () => { await window.__installPrompt!.prompt(); const c = await window.__installPrompt!.userChoice; if (c.outcome === 'accepted') setDone(true); }}>{done ? '추가됐어요' : '홈 화면에 추가'}</button></div>
        : <ol className="steps"><li>오른쪽 위 <b>⋮</b> 를 누르세요.</li><li><b>홈 화면에 추가</b>(또는 앱 설치)를 고르세요.</li></ol>)}
      {env === 'desktop' && <p className="para">폰에서 이 주소를 열면 홈 화면에 추가할 수 있어요. 카톡으로 받은 링크를 폰에서 눌러 주세요.</p>}
      <p className="muted" style={{ padding: '20px 20px 0' }}>추가하면 {name} 아이콘으로 바로 열려요. 알림은 카톡으로 계속 와요.</p>
    </section>
  );
}
