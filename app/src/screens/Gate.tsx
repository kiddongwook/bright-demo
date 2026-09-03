import { useState } from 'react';
import { formatPhone, isValidMobile, normalizePhone } from '../lib/phone';
import { fn } from '../lib/supabase';
export function Gate({ onSent }: { onSent: (phone: string) => void }) {
  const [phone, setPhone] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function send() {
    if (!isValidMobile(phone)) { setErr('휴대폰 번호를 확인해 주세요'); return; }
    setBusy(true); setErr('');
    let r: Response;
    try { r = await fetch(fn('otp-send'), { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY }, body: JSON.stringify({ phone }) }); }
    catch { setBusy(false); setErr('연결이 안 돼요. 잠시 뒤 다시 시도해 주세요.'); return; }
    setBusy(false);
    if (r.status === 404) { setErr('아직 등록되지 않은 번호예요. 영어의 집 학생·학부모로 등록되면 문이 열려요.'); return; }
    if (r.status === 429) { setErr('잠시 뒤 다시 시도해 주세요.'); return; }
    if (!r.ok) { setErr('보내지 못했어요. 다시 시도해 주세요.'); return; }
    onSent(normalizePhone(phone));
  }
  return (
    <section className="view on" style={{ background: 'var(--paper)' }}>
      <div className="gate">
        <img className="gate-logo" src="/logo/yeongeo-jip-medium.png" alt="영어의 집" />
        <h1>문을 열어드릴게요</h1>
        <p>영어의 집 학생·학부모로 등록된<br />전화번호를 알려주세요.</p>
        <div className="field"><label>전화번호</label>
          <input className="input" inputMode="tel" placeholder="010-0000-0000" value={phone} onChange={e => setPhone(formatPhone(e.target.value))} /></div>
        {err && <p className="muted" style={{ color: 'var(--danger)', marginTop: 10 }}>{err}</p>}
        <div className="btnrow" style={{ padding: '20px 0 0', width: '100%' }}><button className="btn" disabled={busy} onClick={send}>{busy ? '보내는 중…' : '인증번호 받기'}</button></div>
      </div>
    </section>
  );
}
