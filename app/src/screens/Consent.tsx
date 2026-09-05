import { useState, type CSSProperties } from 'react';
import { GateLogo } from '../components/GateLogo';
import { useAcademyPublic } from '../lib/academy';
import { useDark } from '../lib/theme';
import { acceptTerms, LEGAL_URLS } from '../lib/legal';
import { errToast } from '../lib/toast';

/* 이용약관·개인정보 처리방침 동의 문 (0026). 로그인 뒤 my_consent 가 없거나 판이 낮으면 한 번 뜬다.
   제한 세션(알림톡 링크)은 App 이 건너뛰고, 운영자도 지나간다. UX 게이트일 뿐 RLS 강제는 아니다. */
const ROW: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '12px 0', borderBottom: '1px solid var(--rule)', fontSize: 15, lineHeight: 1.5 };
const BOX: CSSProperties = { width: 18, height: 18, flex: '0 0 auto', accentColor: 'var(--brand)' };
const LINK: CSSProperties = { color: 'var(--brand)', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3, flex: '0 0 auto', padding: '4px 0 4px 6px' };

export function Consent({ onDone }: { onDone: () => void }) {
  const dark = useDark();
  const academy = useAcademyPublic();
  const name = academy?.name ?? 'BRIGHT';
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try { await acceptTerms(); onDone(); }
    catch (e) { errToast(e); setBusy(false); }
  }

  return (
    <section className="view on" style={{ background: 'var(--ground)' }}>
      <div className="gate">
        <GateLogo academy={academy} dark={dark} alt={name} />
        <h1>시작하기 전에</h1>
        <p>이용약관과 개인정보 처리방침을 확인하고 동의해 주세요. 한 번만 물어요 — 문서가 바뀌면 다시 안내해요.</p>
        <div style={{ width: '100%', marginTop: 22 }}>
          <div style={ROW}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, cursor: 'pointer' }}>
              <input type="checkbox" style={BOX} checked={terms} onChange={e => setTerms(e.target.checked)} />
              <span>이용약관에 동의합니다</span>
            </label>
            <a style={LINK} href={LEGAL_URLS.terms} target="_blank" rel="noopener noreferrer" aria-label="이용약관 보기">보기</a>
          </div>
          <div style={ROW}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, cursor: 'pointer' }}>
              <input type="checkbox" style={BOX} checked={privacy} onChange={e => setPrivacy(e.target.checked)} />
              <span>개인정보 처리방침에 동의합니다</span>
            </label>
            <a style={LINK} href={LEGAL_URLS.privacy} target="_blank" rel="noopener noreferrer" aria-label="개인정보 처리방침 보기">보기</a>
          </div>
        </div>
        <p style={{ marginTop: 14, fontSize: 13, textAlign: 'left', width: '100%' }}>14세 미만 학생의 개인정보는 학부모(법정대리인)님의 동의로 처리돼요.</p>
        <div className="btnrow" style={{ padding: '20px 0 0', width: '100%' }}>
          <button className="btn" disabled={!terms || !privacy || busy} onClick={go}>{busy ? '잠시만요…' : '동의하고 시작'}</button>
        </div>
      </div>
    </section>
  );
}
