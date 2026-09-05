import { useEffect, useState } from 'react';
import { asset } from '../lib/asset';
import { inviteLogin } from '../lib/api';
import { useSession } from '../auth/session';
import { currentSlug, useAcademyPublic } from '../lib/academy';
import { LOCKED } from './Otp';
import { logoUrl } from '../lib/logo';
import { useDark } from '../lib/theme';

/* 개인 초대 링크(?i=<토큰>)로 들어온 사람: 토큰을 확인하는 동안 보이는 화면.
   알림톡 링크(LinkEntry)와 달리 여기서 만든 세션은 제한 세션이 아니다 — 이 사람의 정식 첫 로그인이다. */
const MSG: Record<string, string> = {
  expired: '초대 링크가 만료됐어요. 원장님께 새 링크를 부탁해 주세요.',
  used: '이미 사용한 링크예요.',
  bad_token: '링크가 올바르지 않아요.',
  network: '연결이 안 돼요. 잠시 뒤 다시 눌러주세요.',
  academy_locked: LOCKED,
};

export function InviteEntry({ token, onDone, onGate }: { token: string; onDone: () => void; onGate: () => void }) {
  const { setFromVerify, limited, endLimited, session, active, loading } = useSession();
  const dark = useDark();
  const academy = useAcademyPublic();
  const name = academy?.name ?? '이 학원';
  const [err, setErr] = useState('');
  // 이 기기에 이미 정식으로 들어와 있으면(원장이 자기가 만든 링크를 눌러 보는 경우 등) 토큰을 쓰기 전에 한 번 묻는다
  const occupied = !loading && !!session && !limited && !!active;
  const [go, setGo] = useState(false);
  useEffect(() => { if (loading || (occupied && !go)) return; (async () => {
    // 이 기기에 알림톡 링크로 들어온 제한 세션이 남아 있으면 먼저 걷어낸다 — 초대 세션까지 제한으로 표시되면 안 된다.
    if (limited) await endLimited();
    const r = await inviteLogin(token, currentSlug());
    if (!r.ok) { setErr(MSG[r.error] ?? MSG.bad_token); return; }
    await setFromVerify(r.session, r.memberships, r.operator);
    onDone();
  })(); }, [token, loading, occupied, go]);
  if (occupied && !go && !err) {
    const who = `${active!.academy_name ?? name} · ${active!.role === 'director' ? '원장' : active!.role === 'teacher' ? '강사' : active!.role === 'parent' ? '학부모' : '학생'}`;
    return (
      <section className="view on" style={{ background: 'var(--ground)' }}>
        <div className="gate">
          <img className="gate-logo" src={logoUrl(academy?.logo_path ?? null) ?? asset(dark ? 'logo/bright-wordmark-white.png' : 'logo/bright-wordmark.png')} alt={name} />
          <h1>이미 들어와 있어요</h1>
          <p>이 기기는 <b>{who}</b>로 들어와 있어요. 초대 링크로 들어가면 지금 계정에서 나가고, 링크는 한 번 쓰면 끝나요.</p>
          <div className="btnrow" style={{ padding: '20px 0 0', width: '100%' }}><button className="btn" onClick={onDone}>지금 계정 그대로</button></div>
          <div className="btnrow" style={{ padding: '10px 0 0', width: '100%' }}><button className="btn line" onClick={() => setGo(true)}>초대 링크로 새로 들어가기</button></div>
        </div>
      </section>
    );
  }
  return (
    <section className="view on" style={{ background: 'var(--ground)' }}>
      <div className="gate">
        <img className="gate-logo" src={logoUrl(academy?.logo_path ?? null) ?? asset(dark ? 'logo/bright-wordmark-white.png' : 'logo/bright-wordmark.png')} alt={name} />
        {err
          ? <><h1>들어가지 못했어요</h1><p>{err}</p>
            <div className="btnrow" style={{ padding: '20px 0 0', width: '100%' }}><button className="btn" onClick={onGate}>전화번호로 들어가기</button></div></>
          : <><h1>초대를 확인하는 중…</h1><p>잠시만요.</p></>}
      </div>
    </section>
  );
}
