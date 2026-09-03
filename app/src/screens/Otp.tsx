import { useState } from 'react';
import { asset } from '../lib/asset';
import { fn } from '../lib/supabase';
import { useSession, type Membership } from '../auth/session';
import { formatPhone } from '../lib/phone';
import { useAcademyPublic } from '../lib/academy';
import { logoUrl } from '../lib/logo';
export function Otp({ phone, onBack }: { phone: string; onBack: () => void }) {
  const { setFromVerify } = useSession();
  const academy = useAcademyPublic();
  const name = academy?.name ?? '학원';
  const [code, setCode] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function verify() {
    setBusy(true); setErr('');
    let r: Response;
    try { r = await fetch(fn('otp-verify'), { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY }, body: JSON.stringify({ phone, code }) }); }
    catch { setBusy(false); setErr('연결이 안 돼요. 잠시 뒤 다시 시도해 주세요.'); return; }
    setBusy(false);
    if (r.status === 401) { setErr('인증번호가 맞지 않아요.'); return; }
    if (!r.ok) { setErr('확인하지 못했어요. 다시 시도해 주세요.'); return; }
    const j = await r.json() as { session: { access_token: string; refresh_token: string }; memberships: Membership[] };
    await setFromVerify(j.session, j.memberships);
  }
  return (
    <section className="view on" style={{ background: 'var(--paper)' }}>
      <div className="gate">
        <img className="gate-logo" src={logoUrl(academy?.logo_path ?? null) ?? asset('logo/yeongeo-jip-medium.png')} alt={name} />
        <h1>인증번호를 보냈어요</h1>
        <p>{formatPhone(phone)} 으로 6자리를 보냈습니다.</p>
        <div className="field"><label>인증번호</label>
          <input className="input" inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /></div>
        {err && <p className="muted" style={{ color: 'var(--danger)', marginTop: 10 }}>{err}</p>}
        <div className="btnrow" style={{ padding: '20px 0 0', width: '100%' }}>
          <button className="btn line" onClick={onBack}>다른 번호로</button>
          <button className="btn" disabled={busy || code.length !== 6} onClick={verify}>들어가기</button>
        </div>
      </div>
    </section>
  );
}
