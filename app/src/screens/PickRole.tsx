import { useSession } from '../auth/session';
const ROLE: Record<string, string> = { director: '원장', teacher: '강사', parent: '학부모', student: '학생' };
export function PickRole() {
  const { memberships, pick } = useSession();
  return (
    <section className="view on">
      <div className="head"><h1 className="hello">누구로 들어갈까요?</h1><p className="lede">이 번호로 등록된 역할이 여럿이에요.</p></div>
      <div className="box">
        {memberships.map(m => (
          <button key={m.id} className="rw" onClick={() => pick(m.id)}>
            <span className="bd"><span className="t">{ROLE[m.role]}{m.student_name ? ` · ${m.student_name}` : ''}</span><span className="s">{m.academy_name}</span></span><span className="go">›</span>
          </button>))}
      </div>
    </section>
  );
}
