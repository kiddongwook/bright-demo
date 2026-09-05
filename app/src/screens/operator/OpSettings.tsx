import { useSession } from '../../auth/session';
import { useLoad } from '../../lib/useLoad';
import { supabase } from '../../lib/supabase';
import { formatPhone } from '../../lib/phone';
import { toast } from '../../lib/toast';
import { copyText } from '../../lib/operator';
import { IcCopy, IcHouse, IcPerson } from '../../components/icons';
import '../ui.css';
import './operator.css';

/* BRIGHT 운영 · 설정 — 내가 누구인지, 앱 주소, 운영 절차 요약(docs/ops/operator.md), 로그아웃. */

const ROLE: Record<string, string> = { director: '원장', teacher: '강사', parent: '학부모', student: '학생' };
const STEPS: [string, string][] = [
  ['학원 만들기', '이름·주소(slug)·원장 이름·번호·강조색을 넣으면 학원·원장 명부·초대 링크가 한 번에 생겨요.'],
  ['링크 카톡으로 보내기', '초대 링크는 7일. 잃어버리면 학원 상세에서 다시 만들어요 — 옛 링크는 그때 죽어요.'],
  ['로고·명부 안내', '원장님이 직접 올려요. 설정 → 우리 학원 → 로고, 명부 → 한꺼번에 넣기(CSV).'],
  ['발신키', 'console 은 문자가 밖으로 안 나가요. 대행사를 붙이면 http 로 바꾸고 학원 키를 넣어요(없으면 전역 키).'],
];

export function OpSettings() {
  const { session, memberships, pick, exitOperator, logout } = useSession();
  const { data: me } = useLoad(async () => {
    const { data } = await supabase.from('users').select('name, phone').eq('id', session!.user.id).maybeSingle();
    return (data ?? null) as { name: string; phone: string } | null;
  });
  const appLink = `${location.origin}${import.meta.env.BASE_URL}`;
  const copyApp = async () => toast(await copyText(appLink) ? '앱 주소를 복사했어요' : appLink);

  return (
    <section className="view on">
      <div className="head"><h1 className="hello">운영 설정</h1><p className="lede">BRIGHT 운영자</p></div>

      <div className="box">
        <div className="rw" style={{ cursor: 'default' }}><span className="ic"><IcPerson size={20} /></span>
          <span className="bd"><span className="t">{me?.name ?? 'BRIGHT'}</span>
            <span className="s">{me?.phone ? formatPhone(me.phone) : '운영자 계정'} · {memberships.length ? `학원 ${memberships.length}곳 소속` : '학원 소속 없음'}</span></span></div>
        <button className="rw" onClick={copyApp}><span className="ic"><IcCopy size={20} /></span>
          <span className="bd"><span className="t">앱 링크 복사</span><span className="s">{appLink}</span></span><span className="go">›</span></button>
      </div>

      {!!memberships.length && <>
        <div className="lab">역할 바꾸기</div>
        <div className="box">
          {memberships.map(m => (
            <button key={m.id} className="rw" onClick={() => pick(m.id)}>
              <span className="ic"><IcHouse size={20} /></span>
              <span className="bd"><span className="t">{ROLE[m.role]}{m.student_name ? ` · ${m.student_name}` : ''}로 보기</span>
                <span className="s">{m.academy_name}</span></span><span className="go">›</span></button>))}
          <button className="rw" onClick={exitOperator}>
            <span className="bd"><span className="t">역할 고르기로 나가기</span><span className="s">운영 화면에서 나와 소속을 다시 골라요</span></span><span className="go">›</span></button>
        </div>
      </>}

      <div className="lab">운영 절차</div>
      <ol className="opsteps">
        {STEPS.map(([t, s], i) => <li key={t}><i>{i + 1}</i><span><b style={{ color: 'var(--ink)' }}>{t}</b> — {s}</span></li>)}
      </ol>
      <p className="muted" style={{ padding: '8px 20px 0', lineHeight: 1.7 }}>
        더 자세한 것은 <b>docs/ops/operator.md</b> 에 있어요 — 잠금·데이터 내려받기·지우기, 문제가 생겼을 때 볼 곳.
        운영자를 늘리는 길은 앱 안에 없어요(<b>tools/set-operator.mjs</b>).
      </p>

      <div className="btnrow"><button className="btn line" onClick={logout}>로그아웃</button></div>
      <div className="madeby">BRIGHT 운영</div>
    </section>
  );
}
