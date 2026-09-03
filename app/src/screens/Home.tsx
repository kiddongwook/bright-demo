import { useSession } from '../auth/session';
const ROLE: Record<string, string> = { director: '원장', teacher: '강사', parent: '학부모', student: '학생' };
export function Home() {
  const { active, memberships, logout, pick } = useSession();
  if (!active) return null;
  return (
    <section className="view on">
      <div className="head"><h1 className="hello">{active.academy_name}</h1><p className="lede">{ROLE[active.role]}{active.student_name ? ` · ${active.student_name}` : ''} 계정으로 들어왔어요. 2주차에 이 자리에 오늘·공지·문의가 붙습니다.</p></div>
      {memberships.length > 1 && <div className="btnrow"><button className="btn line" onClick={() => pick(memberships.find(m => m.id !== active.id)!.id)}>다른 역할로</button></div>}
      <div className="btnrow"><button className="btn line" onClick={logout}>로그아웃</button></div>
    </section>
  );
}
