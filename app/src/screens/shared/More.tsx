import { useSession } from '../../auth/session';
import { useNav } from '../../lib/nav';
import { IcHouse, IcNote, IcBell } from '../../components/icons';

const ROLE: Record<string, string> = { director: '원장', teacher: '강사', parent: '학부모', student: '학생' };
/* 학부모·학생 공용 더보기 */
export function MoreSimple() {
  const { active, memberships, pick, logout } = useSession(); const nav = useNav();
  const others = memberships.filter(m => m.id !== active?.id);
  return (
    <section className="view on">
      <div className="head"><h1 className="hello">더보기</h1></div>
      <div className="box">
        <div className="rw" style={{ cursor: 'default' }}><span className="nm">{(active?.student_name ?? ROLE[active?.role ?? ''] ?? '').charAt(0)}</span><span className="bd"><span className="t">{ROLE[active?.role ?? '']}{active?.student_name ? ` · ${active.student_name}` : ''}</span><span className="s">{active?.academy_name}</span></span></div>
        {others.map(m => <button key={m.id} className="rw" onClick={() => pick(m.id)}><span className="bd"><span className="t">{ROLE[m.role]}{m.student_name ? ` · ${m.student_name}` : ''}로 보기</span><span className="s">{m.academy_name}</span></span><span className="go">›</span></button>)}
        <button className="rw" onClick={() => nav.push('install')}><span className="ic"><IcHouse size={20} /></span><span className="bd"><span className="t">홈 화면에 추가</span><span className="s">앱처럼 아이콘으로 열어요</span></span><span className="go">›</span></button>
        <button className="rw" onClick={() => nav.push('about')}><span className="ic"><IcNote size={20} /></span><span className="bd"><span className="t">앱 정보·진단</span><span className="s">버전 · 환경 · 문제 보내기</span></span><span className="go">›</span></button>
        <button className="rw" onClick={() => nav.push('prefs')}><span className="ic"><IcBell size={20} /></span><span className="bd"><span className="t">알림 설정</span><span className="s">공지 · 답변 · 출결 카톡을 끄고 켜요</span></span><span className="go">›</span></button>
      </div>
      <div className="btnrow"><button className="btn line" onClick={logout}>로그아웃</button></div>
      <div className="madeby">{active?.academy_name} 앱 · BRIGHT로 만들어졌습니다</div>
    </section>
  );
}
