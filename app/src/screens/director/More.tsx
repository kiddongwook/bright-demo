import { useRef, useState } from 'react';
import { asset } from '../../lib/asset';
import { academy, setBrandColor, setLogo, listClassesFull, exportAcademy } from '../../lib/api';
import { uploadLogo, removeLogo, logoUrl } from '../../lib/logo';
import { useNav } from '../../lib/nav';
import { useLoad } from '../../lib/useLoad';
import { useSession } from '../../auth/session';
import { toast, errToast } from '../../lib/toast';
import { inviteText, copyInvite } from '../../lib/invite';
import { applyBrand } from '../../lib/theme';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';
import { confirmSheet } from '../../components/Confirm';
import {
  IcCopy, IcDownload, IcPeople, IcTable, IcClock, IcCalendar, IcPerson, IcPalette, IcHelp,
  IcList, IcHouse, IcNote, IcReceipt, IcSparkle, IcMail, IcTrendingUp,
} from '../../components/icons';
import { AutoTextarea } from '../../components/AutoTextarea';

export function More() {
  const nav = useNav(); const { logout, active, session } = useSession();
  const isDirector = active?.role === 'director';
  const { data: myClasses, err: myClassesErr, reload: reloadMyClasses } = useLoad(() => isDirector ? Promise.resolve([]) : listClassesFull().then(l => l.filter(c => c.teacher_id === session?.user.id)));
  const { data: myAcademy } = useLoad(academy);
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<string | null>(null);   // 클립보드가 안 되면 직접 눌러 복사하게 펼친다
  const text = inviteText(active?.academy_name ?? '우리 학원', myAcademy?.slug ?? null);
  async function doCopyInvite() {
    if (await copyInvite(text)) { setInvite(null); toast('초대 문구를 복사했어요. 카톡에 붙여 보내세요'); }
    else setInvite(text);
  }
  async function download() {
    setBusy(true);
    try { const blob = await exportAcademy(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${active?.academy_name ?? 'academy'}-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast('내려받았어요. 카톡 안에서 안 되면 브라우저로 열어 주세요'); }
    catch (e) { errToast(e); } finally { setBusy(false); }
  }
  if (!isDirector) return (
    <section className="view on">
      <div className="head"><h1 className="hello">더보기</h1><p className="lede">{active?.academy_name} · 강사</p></div>
      <div className="lab first" style={{ marginTop: 0 }}>담당 반</div>
      {!myClasses ? (myClassesErr ? <ErrorState onRetry={reloadMyClasses} /> : <Skeleton rows={2} />)
        : <div className="box">{myClasses.length ? myClasses.map(c => <div key={c.id} className="rw" style={{ cursor: 'default' }}><span className="bd"><span className="t">{c.name}</span><span className="s">출결·공지·문의·학생 기록을 이 반 안에서 봐요</span></span></div>)
        : <p className="muted" style={{ padding: '14px 16px' }}>원장님이 담당 반을 지정하면 여기 보여요. 그 전엔 화면이 비어 있어요.</p>}</div>}
      <div className="box" style={{ marginTop: 12 }}>
        <button className="rw" onClick={() => nav.push('install')}><span className="ic"><IcHouse size={20} /></span><span className="bd"><span className="t">홈 화면에 추가</span><span className="s">앱처럼 아이콘으로 열어요</span></span><span className="go">›</span></button>
        <button className="rw" onClick={() => nav.push('about')}><span className="ic"><IcNote size={20} /></span><span className="bd"><span className="t">앱 정보·진단</span><span className="s">버전 · 환경 · 문제 보내기</span></span><span className="go">›</span></button>
      </div>
      <div className="btnrow"><button className="btn line" onClick={logout}>로그아웃</button></div>
      <div className="madeby">{active?.academy_name} 앱 · BRIGHT로 만들어졌습니다</div>
    </section>
  );
  return (
    <section className="view on">
      <div className="head"><h1 className="hello">더보기</h1><p className="lede">{active?.academy_name} · 원장</p></div>
      <div className="lab first" style={{ marginTop: 0 }}>매일 쓰는 것</div>
      <div className="box">
        <button className="rw" onClick={() => nav.push('roster')}><span className="ic"><IcPeople size={20} /></span><span className="bd"><span className="t">학생·학부모 명부</span><span className="s">여기 있는 번호만 앱에 들어올 수 있어요</span></span><span className="go">›</span></button>
        <button className="rw" onClick={() => nav.push('stats')}><span className="ic"><IcTable size={20} /></span><span className="bd"><span className="t">반별 출결표</span><span className="s">학생 × 수업일 · 출석률</span></span><span className="go">›</span></button>
        <button className="rw" onClick={() => nav.push('classes')}><span className="ic"><IcClock size={20} /></span><span className="bd"><span className="t">반·시간표</span><span className="s">요일 · 시간 · 담당 강사</span></span><span className="go">›</span></button>
        <button className="rw" onClick={() => nav.push('calendar')}><span className="ic"><IcCalendar size={20} /></span><span className="bd"><span className="t">휴원일·특강</span><span className="s">정하면 다음 수업·결석 신청에서 빠져요</span></span><span className="go">›</span></button>
      </div>
      <div className="lab">설정</div>
      <div className="box">
        <button className="rw" onClick={() => nav.push('billing')}><span className="ic"><IcReceipt size={20} /></span><span className="bd"><span className="t">수강료</span><span className="s">청구서 · 납부 확인 · 미납 안내</span></span><span className="go">›</span></button>
        <button className="rw" onClick={() => nav.push('teachers')}><span className="ic"><IcPerson size={20} /></span><span className="bd"><span className="t">강사</span><span className="s">담당 반을 지정하면 그 반만 봐요</span></span><span className="go">›</span></button>
        <button className="rw" onClick={() => nav.push('academy')}><span className="ic"><IcPalette size={20} /></span><span className="bd"><span className="t">우리 학원</span><span className="s">이름 · 강조색 · 앱 아이콘</span></span><span className="go">›</span></button>
        <button className="rw" onClick={() => nav.push('faq')}><span className="ic"><IcHelp size={20} /></span><span className="bd"><span className="t">자주 묻는 질문 관리</span><span className="s">학부모 문의 화면 맨 위에 보여요</span></span><span className="go">›</span></button>
        <button className="rw" onClick={() => nav.push('import')}><span className="ic"><IcList size={20} /></span><span className="bd"><span className="t">명부 CSV 올리기</span><span className="s">엑셀에서 저장한 표로 한 번에</span></span><span className="go">›</span></button>
        <button className="rw" disabled={busy} onClick={download}><span className="ic"><IcDownload size={20} /></span><span className="bd"><span className="t">학원 데이터 내려받기</span><span className="s">학생·출결·공지·문의 전부 한 파일로 (JSON)</span></span><span className="go">›</span></button>
        <button className="rw" onClick={doCopyInvite}><span className="ic"><IcCopy size={20} /></span><span className="bd"><span className="t">학부모 초대 문구 복사</span><span className="s">카톡에 붙여 보내요</span></span><span className="go">›</span></button>
        {invite && <div style={{ padding: '0 16px 14px' }}><AutoTextarea readOnly value={invite} /><p className="muted" style={{ paddingTop: 6 }}>길게 눌러 복사해 주세요</p></div>}
        <button className="rw" onClick={() => nav.push('install')}><span className="ic"><IcHouse size={20} /></span><span className="bd"><span className="t">홈 화면에 추가</span><span className="s">앱처럼 아이콘으로 열어요</span></span><span className="go">›</span></button>
        <button className="rw" onClick={() => nav.push('about')}><span className="ic"><IcNote size={20} /></span><span className="bd"><span className="t">앱 정보·진단</span><span className="s">버전 · 환경 · 문제 보내기</span></span><span className="go">›</span></button>
      </div>
      <div className="lab">준비 중<span className="r">필요할 때 켭니다</span></div>
      <div className="box soft">
        {([['첨삭', 'AI가 짚고 원장님이 확정', IcSparkle], ['편지', '채점 결과를 원장님 말투로', IcMail], ['성장 기록', '틀리던 것이 줄어드는 추이', IcTrendingUp]] as const).map(([t, s, Icon]) => (
          <button key={t} className="rw soon" onClick={() => toast('준비 중인 기능이에요')}><span className="ic"><Icon size={20} /></span><span className="bd"><span className="t">{t}</span><span className="s">{s}</span></span><span className="tag muted">준비 중</span></button>))}
      </div>
      <div className="btnrow"><button className="btn line" onClick={logout}>로그아웃</button></div>
      <div className="madeby">{active?.academy_name} 앱 · BRIGHT로 만들어졌습니다</div>
    </section>
  );
}

const COLORS = ['#2F5BEA', '#111318', '#0FA37F', '#F97316', '#7C5CE6'];
export function Academy() {
  const { data, err, reload, setData } = useLoad(academy);
  const [busy, setBusy] = useState(false);
  const [busyLogo, setBusyLogo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  async function pick(c: string) {
    setBusy(true);
    try { await setBrandColor(c); applyBrand(c); setData(data ? { ...data, brand_color: c } : data); toast('강조색이 바뀌었어요. 앱바·버튼·아이콘에 적용됩니다.'); }
    catch (e) { errToast(e); } finally { setBusy(false); }
  }
  async function pickLogo(f: File | undefined) {
    if (!f || !data) return;
    setBusyLogo(true);
    try { const path = await uploadLogo(data.id, f); await setLogo(path); setData({ ...data, logo_path: path }); toast('로고를 올렸어요. 문 화면에 바로 보여요'); }
    catch (e) { errToast(e); }
    finally { setBusyLogo(false); if (fileRef.current) fileRef.current.value = ''; }
  }
  async function clearLogo() {
    if (!data?.logo_path) return;
    if (!(await confirmSheet({ title: '로고를 지울까요?', body: '문·인증 화면은 다시 기본 이미지로 보여요.', okLabel: '지우기', danger: true }))) return;
    setBusyLogo(true);
    try { await removeLogo(data.logo_path).catch(() => {}); await setLogo(null); setData({ ...data, logo_path: null }); toast('로고를 지웠어요'); }
    catch (e) { errToast(e); } finally { setBusyLogo(false); }
  }
  const logoSrc = data?.logo_path ? logoUrl(data.logo_path, Date.now()) : null;
  return (
    <section className="view on">
      <div className="homescr">
        <div className="appicon"><img src={logoSrc ?? asset('logo/yeongeo-jip-bold-white.png')} alt="" /></div>
        <div className="hl">{data?.name ?? ''}</div>
        <p className="hc">원장님과 학부모, 학생 폰 홈 화면에<br />이렇게 놓입니다.</p>
      </div>
      <div className="lab">앱에 보이는 것</div>
      {!data ? (err ? <ErrorState onRetry={reload} /> : <Skeleton rows={3} />) : <div className="box">
        <div className="rw" style={{ cursor: 'default' }}><span className="bd"><span className="t">학원 이름</span><span className="s">{data?.name ?? ''}</span></span></div>
        <div className="rw" style={{ cursor: 'default' }}><span className="bd"><span className="t">강조색</span><span className="s">로고 컬러웨이 중 고르세요</span></span>
          <span className="chips">{COLORS.map(c => <button key={c} className={'chip' + (data?.brand_color === c ? ' on' : '')} style={{ background: c }} disabled={busy} onClick={() => pick(c)} aria-label={c} />)}</span></div>
        <div className="rw" style={{ cursor: 'default' }}>
          {logoSrc && <img src={logoSrc} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flex: '0 0 auto' }} />}
          <span className="bd"><span className="t">로고</span><span className="s">{logoSrc ? '문·인증 화면에 바로 보여요' : '정사각으로 잘라 올려요'}</span></span>
          {logoSrc
            ? <><button className="btn sm line" disabled={busyLogo} onClick={() => fileRef.current?.click()}>바꾸기</button>
                <button className="btn sm line" style={{ marginLeft: 8 }} disabled={busyLogo} onClick={clearLogo}>지우기</button></>
            : <button className="btn sm line" disabled={busyLogo} onClick={() => fileRef.current?.click()}>올리기</button>}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={e => pickLogo(e.target.files?.[0])} />
        </div>
        <p className="muted" style={{ padding: '2px 16px 12px' }}>이 로고가 앱 아이콘과 설치 이름에 쓰여요. 512×512 PNG가 가장 좋아요.</p>
      </div>}
      <p className="muted" style={{ padding: '16px 20px 0', textAlign: 'center' }}>로고는 단색으로 두고, 강조색은 앱바·버튼·표시에 씁니다.</p>
    </section>
  );
}
