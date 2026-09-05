import { useState } from 'react';
import { useNav } from '../../lib/nav';
import { toast, errToast } from '../../lib/toast';
import { formatPhone, isValidMobile, normalizePhone } from '../../lib/phone';
import { BottomCta } from '../../components/BottomCta';
import { COLORS } from '../director/More';
import { copyText, directorInviteText, opCreateAcademy, slugOk, suggestSlug } from '../../lib/operator';
import '../ui.css';
import './operator.css';

/* BRIGHT 운영 · 학원 만들기 — op_create_academy 한 번에 학원·원장 명부·7일 초대 토큰이 함께 생긴다.
   만들고 나면 초대 링크가 이 화면에 한 번만 나온다. 잃어버리면 학원 상세에서 다시 만든다. */

type Done = { academy_id: string; invite_url: string; name: string };

export function OpNew() {
  const nav = useNav();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [dirName, setDirName] = useState('');
  const [phone, setPhone] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [taken, setTaken] = useState('');          // 서버가 이미 쓴다고 한 주소 — 그 자리에서 알려 준다
  const [done, setDone] = useState<Done | null>(null);
  const [shown, setShown] = useState(false);       // 클립보드가 막히면 링크를 눌러 복사하게 펼친다

  // 이름을 치면 주소를 제안한다. 운영자가 주소를 한 번이라도 고치면 더는 건드리지 않는다.
  const onName = (v: string) => { setName(v); if (!slugTouched) { setSlug(suggestSlug(v)); setTaken(''); } };
  const onSlug = (v: string) => { setSlugTouched(true); setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, '')); setTaken(''); };

  const phoneOk = isValidMobile(phone);
  const ready = !!name.trim() && slugOk(slug) && slug !== taken && !!dirName.trim() && phoneOk;

  async function create() {
    setBusy(true);
    try {
      const r = await opCreateAcademy(slug, name.trim(), normalizePhone(phone), dirName.trim(), color);
      setDone({ ...r, name: name.trim() });
      toast('학원을 만들었어요. 초대 링크를 원장님께 보내세요');
    } catch (e) {
      if (e instanceof Error && /slug_taken/.test(e.message)) setTaken(slug);   // 그 자리에서 '이미 쓰는 주소' 를 띄운다
      errToast(e);
    } finally { setBusy(false); }
  }
  async function copyInvite() {
    if (!done) return;
    const text = directorInviteText(done.name, done.invite_url);
    if (await copyText(text)) toast('초대 문구를 복사했어요. 카톡에 붙여 보내세요');
    else { setShown(true); toast('길게 눌러 복사해 주세요'); }
  }

  if (done) return (
    <section className="view on">
      <div className="head"><h1 className="hello">만들었어요</h1><p className="lede">{done.name} · {slug}</p></div>
      <div className="opdone">
        <p className="t">원장님께 이 링크를 보내세요</p>
        <p className="s">7일 안에 누르면 인증번호 없이 원장으로 들어와요. 이 링크는 이 화면에서만 보여요 —
          잃어버리면 학원 상세에서 다시 만들 수 있어요(옛 링크는 그때 죽어요).</p>
        {shown && <span className="url">{done.invite_url}</span>}
      </div>
      <div className="btnrow"><button className="btn" onClick={copyInvite}>초대 문구 복사</button></div>
      <div className="btnrow" style={{ paddingTop: 0 }}>
        <button className="btn line" onClick={() => nav.replace('op-academy', { id: done.academy_id })}>학원 보기</button>
      </div>
      <p className="muted" style={{ padding: '10px 20px 0', lineHeight: 1.7 }}>
        이어서 안내할 것 — 로고(설정 → 우리 학원 → 로고), 명부 CSV 넣기(원장 화면의 명부 → 한꺼번에 넣기).
      </p>
    </section>
  );

  return (
    <section className="view on">
      <div className="head"><h1 className="hello">학원 만들기</h1><p className="lede">학원·원장 명부·초대 링크가 한 번에 생겨요.</p></div>
      <div className="box" style={{ padding: '4px 16px 18px' }}>
        <div className="field"><label htmlFor="on-name">학원 이름</label>
          <input id="on-name" className="input" maxLength={40} value={name} onChange={e => onName(e.target.value)} placeholder="예) 영어의 집" /></div>
        <div className="field"><label htmlFor="on-slug">주소 (slug)</label>
          <input id="on-slug" className="input" autoCapitalize="none" spellCheck={false} maxLength={40} value={slug} onChange={e => onSlug(e.target.value)} placeholder="yeongeo" />
          {slug === taken && taken
            ? <span className="err">이미 쓰는 주소예요. 다른 주소로 바꿔 주세요</span>
            : slug && !slugOk(slug)
              ? <span className="err">영어 소문자·숫자·붙임표만, 2~40자예요</span>
              : <span className="err" style={{ color: 'var(--ink3)' }}>앱 주소에 들어가요 — …/?a={slug || 'yeongeo'}</span>}
        </div>
        <div className="field"><label htmlFor="on-dir">원장 이름</label>
          <input id="on-dir" className="input" maxLength={20} value={dirName} onChange={e => setDirName(e.target.value)} placeholder="예) 김선생" /></div>
        <div className="field"><label htmlFor="on-phone">원장 번호</label>
          <input id="on-phone" className="input" inputMode="numeric" value={formatPhone(phone)} onChange={e => setPhone(normalizePhone(e.target.value).slice(0, 11))} placeholder="010-0000-0000" />
          {!!phone && !phoneOk && <span className="err">휴대폰 번호 형식이 아니에요 (010-0000-0000)</span>}</div>
        <div className="field"><label>강조색</label>
          <span className="chips">{COLORS.map(c => (
            <button key={c} className={'chip' + (color === c ? ' on' : '')} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />))}</span></div>
      </div>
      <p className="muted" style={{ padding: '14px 20px 0', lineHeight: 1.7 }}>
        만들면 원장 번호가 명부에 들어가고 7일짜리 초대 링크가 나와요. 로고는 원장님이 직접 올리세요.
      </p>
      <BottomCta primary={{ label: '학원 만들기', onClick: create, disabled: !ready, busy, busyLabel: '만드는 중…' }}
        secondary={{ label: '취소', onClick: () => nav.back() }} />
    </section>
  );
}
