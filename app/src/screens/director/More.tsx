import { useState } from 'react';
import { asset } from '../../lib/asset';
import { academy, setBrandColor, listClassesFull, exportAcademy } from '../../lib/api';
import { useNav } from '../../lib/nav';
import { useLoad } from '../../lib/useLoad';
import { useSession } from '../../auth/session';
import { toast, errToast } from '../../lib/toast';

export function More() {
  const nav = useNav(); const { logout, active, session } = useSession();
  const isDirector = active?.role === 'director';
  const { data: myClasses } = useLoad(() => isDirector ? Promise.resolve([]) : listClassesFull().then(l => l.filter(c => c.teacher_id === session?.user.id)));
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<string | null>(null);   // 클립보드가 안 되면 직접 눌러 복사하게 펼친다
  const inviteText = `[${active?.academy_name ?? '우리 학원'}] 학부모님, 학원 앱을 열었어요.
아래 주소를 누르고 등록된 휴대폰 번호로 들어오시면 출결·공지·문의를 바로 보실 수 있어요.
${location.origin + import.meta.env.BASE_URL}
홈 화면에 추가하면 앱처럼 쓸 수 있어요 (앱 안 더보기 → 홈 화면에 추가).`;
  async function copyInvite() {
    try {
      if (!navigator.clipboard) throw new Error('클립보드를 쓸 수 없어요');
      await navigator.clipboard.writeText(inviteText); setInvite(null);
      toast('초대 문구를 복사했어요. 카톡에 붙여 보내세요');
    } catch { setInvite(inviteText); }
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
      <div className="box">{myClasses?.length ? myClasses.map(c => <div key={c.id} className="rw" style={{ cursor: 'default' }}><span className="bd"><span className="t">{c.name}</span><span className="s">출결·공지·문의·학생 기록을 이 반 안에서 봐요</span></span></div>)
        : <p className="muted" style={{ padding: '14px 16px' }}>원장님이 담당 반을 지정하면 여기 보여요. 그 전엔 화면이 비어 있어요.</p>}</div>
      <div className="box" style={{ marginTop: 12 }}>
        <button className="rw" onClick={() => nav.push('install')}><span className="bd"><span className="t">홈 화면에 추가</span><span className="s">앱처럼 아이콘으로 열어요</span></span><span className="go">›</span></button>
        <button className="rw" onClick={() => nav.push('about')}><span className="bd"><span className="t">앱 정보·진단</span><span className="s">버전 · 환경 · 문제 보내기</span></span><span className="go">›</span></button>
      </div>
      <div className="btnrow"><button className="btn line" onClick={logout}>로그아웃</button></div>
      <div className="madeby">{active?.academy_name} 앱 · BRIGHT로 만들어졌습니다</div>
    </section>
  );
  return (
    <section className="view on">
      <div className="head"><h1 className="hello">더보기</h1><p className="lede">{active?.academy_name} · 원장</p></div>
      <div className="lab first" style={{ marginTop: 0 }}>운영</div>
      <div className="box">
        <button className="rw" onClick={() => nav.push('roster')}><span className="bd"><span className="t">학생·학부모 명부</span><span className="s">여기 있는 번호만 앱에 들어올 수 있어요</span></span><span className="go">›</span></button>
        <button className="rw" onClick={() => nav.push('academy')}><span className="bd"><span className="t">우리 학원</span><span className="s">이름 · 강조색 · 앱 아이콘</span></span><span className="go">›</span></button>
        <button className="rw" onClick={() => nav.push('calendar')}><span className="bd"><span className="t">휴원일·특강</span><span className="s">정하면 다음 수업·결석 신청에서 빠져요</span></span><span className="go">›</span></button>
        <button className="rw" onClick={() => nav.push('classes')}><span className="bd"><span className="t">반·시간표</span><span className="s">요일 · 시간 · 담당 강사</span></span><span className="go">›</span></button>
        <button className="rw" onClick={() => nav.push('stats')}><span className="bd"><span className="t">반별 출결표</span><span className="s">학생 × 수업일 · 출석률</span></span><span className="go">›</span></button>
        <button className="rw" onClick={() => nav.push('import')}><span className="bd"><span className="t">명부 CSV 올리기</span><span className="s">엑셀에서 저장한 표로 한 번에</span></span><span className="go">›</span></button>
        <button className="rw" disabled={busy} onClick={download}><span className="bd"><span className="t">학원 데이터 내려받기</span><span className="s">학생·출결·공지·문의 전부 한 파일로 (JSON)</span></span><span className="go">↓</span></button>
        <button className="rw" onClick={() => nav.push('faq')}><span className="bd"><span className="t">자주 묻는 질문 관리</span><span className="s">학부모 문의 화면 맨 위에 보여요</span></span><span className="go">›</span></button>
        <button className="rw" onClick={() => nav.push('install')}><span className="bd"><span className="t">홈 화면에 추가</span><span className="s">앱처럼 아이콘으로 열어요</span></span><span className="go">›</span></button>
        <button className="rw" onClick={copyInvite}><span className="bd"><span className="t">학부모 초대 문구 복사</span><span className="s">카톡에 붙여 보내요</span></span><span className="go">⧉</span></button>
        {invite && <div style={{ padding: '0 16px 14px' }}><textarea className="input" readOnly value={invite} /><p className="muted" style={{ paddingTop: 6 }}>길게 눌러 복사해 주세요</p></div>}
        <button className="rw" onClick={() => nav.push('about')}><span className="bd"><span className="t">앱 정보·진단</span><span className="s">버전 · 환경 · 문제 보내기</span></span><span className="go">›</span></button>
      </div>
      <div className="lab">준비 중<span className="r">필요할 때 켭니다</span></div>
      <div className="box soft">
        {[['수강료', '청구서 발송 · 납부 확인 · 미납 안내'], ['첨삭', 'AI가 짚고 원장님이 확정'], ['편지', '채점 결과를 원장님 말투로'], ['성장 기록', '틀리던 것이 줄어드는 추이']].map(([t, s]) => (
          <button key={t} className="rw" onClick={() => toast('준비 중인 기능이에요')}><span className="bd"><span className="t">{t}</span><span className="s">{s}</span></span><span className="tag muted">준비 중</span></button>))}
      </div>
      <div className="btnrow"><button className="btn line" onClick={logout}>로그아웃</button></div>
      <div className="madeby">{active?.academy_name} 앱 · BRIGHT로 만들어졌습니다</div>
    </section>
  );
}

const COLORS = ['#2B5BD9', '#1C1C1C', '#E8912D', '#5B7A5B', '#9C8B74'];
export function Academy() {
  const { data, setData } = useLoad(academy);
  const [busy, setBusy] = useState(false);
  async function pick(c: string) {
    setBusy(true);
    try { await setBrandColor(c); document.documentElement.style.setProperty('--brand', c); setData(data ? { ...data, brand_color: c } : data); toast('강조색이 바뀌었어요. 앱바·버튼·아이콘에 적용됩니다.'); }
    catch (e) { errToast(e); } finally { setBusy(false); }
  }
  return (
    <section className="view on">
      <div className="homescr">
        <div className="appicon"><img src={asset('logo/yeongeo-jip-bold-white.png')} alt="" /></div>
        <div className="hl">{data?.name ?? ''}</div>
        <p className="hc">원장님과 학부모, 학생 폰 홈 화면에<br />이렇게 놓입니다.</p>
      </div>
      <div className="lab">앱에 보이는 것</div>
      <div className="box">
        <div className="rw" style={{ cursor: 'default' }}><span className="bd"><span className="t">학원 이름</span><span className="s">{data?.name ?? ''}</span></span></div>
        <div className="rw" style={{ cursor: 'default' }}><span className="bd"><span className="t">강조색</span><span className="s">로고 컬러웨이 중 고르세요</span></span>
          <span className="chips">{COLORS.map(c => <button key={c} className={'chip' + (data?.brand_color === c ? ' on' : '')} style={{ background: c }} disabled={busy} onClick={() => pick(c)} aria-label={c} />)}</span></div>
      </div>
      <p className="muted" style={{ padding: '16px 20px 0', textAlign: 'center' }}>로고는 단색으로 두고, 강조색은 앱바·버튼·표시에 씁니다.</p>
    </section>
  );
}
