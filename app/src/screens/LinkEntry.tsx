import { useEffect, useState } from 'react';
import { fn } from '../lib/supabase';
import { useSession, type Membership } from '../auth/session';
export type LinkTarget = { academy_id: string; view: string; ref_id: string | null };
/* 알림톡 버튼으로 들어온 사람: 토큰을 확인하는 동안 보이는 화면. 실패하면 번호로 들어가는 길을 준다. */
export function LinkEntry({ token, onDone }: { token: string; onDone: (t: LinkTarget | null) => void }) {
  const { setFromVerify, enterLimited } = useSession();
  const [err, setErr] = useState('');
  useEffect(() => { (async () => {
    let r: Response;
    try { r = await fetch(fn('link-login'), { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY }, body: JSON.stringify({ token }) }); }
    catch { setErr('연결이 안 돼요. 잠시 뒤 다시 눌러주세요.'); return; }
    if (r.status === 401) { const j = await r.json().catch(() => ({})); setErr(j.error === 'expired' ? '이 링크는 기한이 지났어요. 앱에서 번호로 들어가면 볼 수 있어요.' : '열 수 없는 링크예요.'); return; }
    if (!r.ok) { setErr('열지 못했어요. 잠시 뒤 다시 눌러주세요.'); return; }
    const j = await r.json() as { session: { access_token: string; refresh_token: string }; memberships: Membership[]; academy_id: string; view: string; ref_id: string | null };
    enterLimited();
    await setFromVerify(j.session, j.memberships);
    onDone({ academy_id: j.academy_id, view: j.view, ref_id: j.ref_id });
  })(); }, [token]);
  return (
    <section className="view on" style={{ background: 'var(--paper)' }}>
      <div className="gate">
        <img className="gate-logo" src="/logo/yeongeo-jip-medium.png" alt="영어의 집" />
        {err ? <><h1>열지 못했어요</h1><p>{err}</p><div className="btnrow" style={{ padding: '20px 0 0', width: '100%' }}><button className="btn" onClick={() => onDone(null)}>번호로 들어가기</button></div></>
             : <><h1>문을 여는 중이에요</h1><p>잠시만요.</p></>}
      </div>
    </section>
  );
}
