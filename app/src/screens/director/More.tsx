import { useState } from 'react';
import { asset } from '../../lib/asset';
import { academy, setBrandColor } from '../../lib/api';
import { useNav } from '../../lib/nav';
import { useLoad } from '../../lib/useLoad';
import { useSession } from '../../auth/session';
import { toast, errToast } from '../../lib/toast';

export function More() {
  const nav = useNav(); const { logout, active } = useSession();
  return (
    <section className="view on">
      <div className="head"><h1 className="hello">더보기</h1><p className="lede">{active?.academy_name} · 원장</p></div>
      <div className="lab first" style={{ marginTop: 0 }}>운영</div>
      <div className="box">
        <button className="rw" onClick={() => nav.push('roster')}><span className="bd"><span className="t">학생·학부모 명부</span><span className="s">여기 있는 번호만 앱에 들어올 수 있어요</span></span><span className="go">›</span></button>
        <button className="rw" onClick={() => nav.push('academy')}><span className="bd"><span className="t">우리 학원</span><span className="s">이름 · 강조색 · 앱 아이콘</span></span><span className="go">›</span></button>
        <button className="rw" onClick={() => nav.push('calendar')}><span className="bd"><span className="t">휴원일·특강</span><span className="s">정하면 다음 수업·결석 신청에서 빠져요</span></span><span className="go">›</span></button>
        <button className="rw" onClick={() => nav.push('classes')}><span className="bd"><span className="t">반·시간표</span><span className="s">요일 · 시간 · 담당 강사</span></span><span className="go">›</span></button>
        <button className="rw" onClick={() => nav.push('faq')}><span className="bd"><span className="t">자주 묻는 질문 관리</span><span className="s">학부모 문의 화면 맨 위에 보여요</span></span><span className="go">›</span></button>
        <button className="rw" onClick={() => nav.push('install')}><span className="bd"><span className="t">홈 화면에 추가</span><span className="s">앱처럼 아이콘으로 열어요</span></span><span className="go">›</span></button>
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
