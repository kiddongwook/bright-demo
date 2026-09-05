import { useState } from 'react';
import { GateLogo } from '../components/GateLogo';
import { fn } from '../lib/supabase';
import { useSession, type Membership } from '../auth/session';
import { formatPhone } from '../lib/phone';
import { useAcademyPublic } from '../lib/academy';
import { useDark } from '../lib/theme';
/** 잠긴 학원의 사람에게 보이는 한 줄 — Otp·InviteEntry 가 같은 말을 쓴다. */
export const LOCKED = '이 학원은 지금 이용이 정지되어 있어요. 원장님께 문의해 주세요.';
export function Otp({ phone, onBack }: { phone: string; onBack: () => void }) {
  const { setFromVerify } = useSession();
  const dark = useDark();
  const academy = useAcademyPublic();
  const name = academy?.name ?? '이 학원';
  const [code, setCode] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function verify() {
    setBusy(true); setErr('');
    let r: Response;
    try { r = await fetch(fn('otp-verify'), { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY }, body: JSON.stringify({ phone, code }) }); }
    catch { setBusy(false); setErr('연결이 안 돼요. 잠시 뒤 다시 시도해 주세요.'); return; }
    setBusy(false);
    if (r.status === 401) { setErr('인증번호가 맞지 않아요.'); return; }
    if (!r.ok) {
      // 잠긴 학원(운영자가 이용 정지) — 번호는 맞아도 들어올 수 없다 (0023)
      const e = await r.json().catch(() => ({})) as { error?: string };
      setErr(r.status === 403 && e.error === 'academy_locked' ? LOCKED : '확인하지 못했어요. 다시 시도해 주세요.');
      return;
    }
    const j = await r.json() as { session: { access_token: string; refresh_token: string }; memberships: Membership[]; operator?: boolean };
    await setFromVerify(j.session, j.memberships, j.operator);
  }
  return (
    <section className="view on" style={{ background: 'var(--ground)' }}>
      <div className="gate">
        <GateLogo academy={academy} dark={dark} alt={name} />
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
