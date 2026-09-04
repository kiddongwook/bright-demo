import { useEffect, useState } from 'react';
import { currentEnv, type Env } from '../../lib/env';
import { academy } from '../../lib/api';
import { reportError } from '../../lib/report';
import { toast } from '../../lib/toast';
import { useSession } from '../../auth/session';
import { AutoTextarea } from '../../components/AutoTextarea';

const ENV_KO: Record<Env, string> = { installed: '홈 화면 앱', kakao: '카톡 안 브라우저', ios: '아이폰 사파리', android: '안드로이드 브라우저', desktop: 'PC' };
const ROLE: Record<string, string> = { director: '원장', teacher: '강사', parent: '학부모', student: '학생' };

/* 앱 정보·진단 — "안 돼요" 할 때 원장님이 이 화면을 보내 주면 바로 짚는다. 서버는 연결 확인 한 번만 만진다. */
export function About() {
  const { active } = useSession();
  const [sw, setSw] = useState('확인 중…');
  const [conn, setConn] = useState('확인 중…');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        if (!reg) setSw('없음');
        else setSw(`${reg.active?.state ?? reg.waiting?.state ?? reg.installing?.state ?? '알 수 없음'} · scope ${reg.scope.slice(-24)}`);
      } catch { setSw('없음'); }
    })();
    (async () => {
      const t0 = performance.now();
      try { await academy(); setConn(`${Math.round(performance.now() - t0)}ms`); }
      catch { setConn('실패'); }
    })();
  }, []);

  async function send() {
    setBusy(true);
    try { await reportError(new Error('사용자 신고: ' + text), 'about'); toast('보냈어요. 확인하고 연락드릴게요'); setText(''); }
    finally { setBusy(false); }
  }

  const rows: [string, string][] = [
    ['앱 버전', __BUILD__],
    ['환경', ENV_KO[currentEnv()]],
    ['서비스워커', sw],
    ['로그인', `${ROLE[active?.role ?? ''] ?? '알 수 없음'} · ${active?.academy_name ?? ''}`],
    ['서버 연결', conn],
    ['앱 주소', location.origin + import.meta.env.BASE_URL],
  ];

  return (
    <section className="view on">
      <div className="head"><p className="lede">안 될 때 이 화면을 캡처해 보내주시면 빨리 찾을 수 있어요.</p></div>
      <div className="box">
        {rows.map(([t, s]) => <div key={t} className="rw" style={{ cursor: 'default' }}><span className="bd"><span className="t">{t}</span><span className="s">{s}</span></span></div>)}
      </div>
      <div className="lab">문제 보내기</div>
      <div style={{ padding: '0 20px' }}><AutoTextarea value={text} onChange={e => setText(e.target.value)} placeholder="어떤 화면에서 무엇이 안 되었는지 적어 주세요" /></div>
      <div className="btnrow"><button className="btn" disabled={busy || !text.trim()} onClick={send}>보내기</button></div>
    </section>
  );
}
