import { useEffect, useState } from 'react';
import { asset } from '../lib/asset';
import { fn } from '../lib/supabase';
import { useSession, type Membership } from '../auth/session';
import { useAcademyPublic } from '../lib/academy';
import { logoUrl } from '../lib/logo';
import { useDark } from '../lib/theme';
import { LOCKED } from './Otp';
export type LinkTarget = { academy_id: string; view: string; ref_id: string | null };
type Resp = { user_id: string; session?: { access_token: string; refresh_token: string }; memberships: Membership[]; academy_id: string; view: string; ref_id: string | null };
/* 알림톡 버튼으로 들어온 사람: 토큰을 확인하는 동안 보이는 화면. 실패하면 번호로 들어가는 길을 준다.
   이미 이 기기에 들어와 있으면(설치된 앱·외부 브라우저) 세션을 갈지 않고 화면만 옮긴다 — 링크를 누를 때마다 로그아웃되면 안 된다. */
export function LinkEntry({ token, currentUserId, onDone }: { token: string; currentUserId: string | null; onDone: (t: LinkTarget | null) => void }) {
  const { setFromVerify, enterLimited } = useSession();
  const dark = useDark();
  const academy = useAcademyPublic();
  const name = academy?.name ?? '이 학원';
  const [err, setErr] = useState(''); const [other, setOther] = useState<LinkTarget | null>(null);
  useEffect(() => { (async () => {
    let r: Response;
    try { r = await fetch(fn('link-login'), { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY }, body: JSON.stringify({ token, resolve: !!currentUserId }) }); }
    catch { setErr('연결이 안 돼요. 잠시 뒤 다시 눌러주세요.'); return; }
    if (r.status === 401) { const j = await r.json().catch(() => ({})); setErr(j.error === 'expired' ? '이 링크는 기한이 지났어요. 앱에서 번호로 들어가면 볼 수 있어요.' : '열 수 없는 링크예요.'); return; }
    if (r.status === 403) {
      // 잠긴 학원(운영자가 이용 정지)의 링크 — 번호로 들어가도 같은 안내를 받는다 (0023)
      const j = await r.json().catch(() => ({})) as { error?: string };
      setErr(j.error === 'academy_locked' ? LOCKED : '열지 못했어요. 잠시 뒤 다시 눌러주세요.'); return;
    }
    if (!r.ok) { setErr('열지 못했어요. 잠시 뒤 다시 눌러주세요.'); return; }
    const j = await r.json() as Resp;
    const target = { academy_id: j.academy_id, view: j.view, ref_id: j.ref_id };
    if (currentUserId) {
      if (j.user_id === currentUserId) { onDone(target); return; }
      setOther(target); return; // 다른 사람 앞으로 온 링크 — 들어와 있는 계정을 지우지 않는다
    }
    enterLimited();
    await setFromVerify(j.session!, j.memberships);
    onDone(target);
  })(); }, [token]);
  return (
    <section className="view on" style={{ background: 'var(--ground)' }}>
      <div className="gate">
        <img className="gate-logo" src={logoUrl(academy?.logo_path ?? null) ?? asset(dark ? 'logo/bright-wordmark-white.png' : 'logo/bright-wordmark.png')} alt={name} />
        {err ? <><h1>열지 못했어요</h1><p>{err}</p><div className="btnrow" style={{ padding: '20px 0 0', width: '100%' }}><button className="btn" onClick={() => onDone(null)}>번호로 들어가기</button></div></>
          : other ? <><h1>다른 사람 앞으로 온 링크예요</h1><p>이 기기에는 다른 계정으로 들어와 있어요.<br />그 사람 번호로 들어가면 볼 수 있어요.</p><div className="btnrow" style={{ padding: '20px 0 0', width: '100%' }}><button className="btn" onClick={() => onDone(null)}>지금 계정으로 계속</button></div></>
          : <><h1>문을 여는 중이에요</h1><p>잠시만요.</p></>}
      </div>
    </section>
  );
}
