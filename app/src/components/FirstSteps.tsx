import { useState } from 'react';
import { listNotices, todaySummary, type TodaySummary } from '../lib/api';
import { inviteSent } from '../lib/invite';
import { useNav } from '../lib/nav';
import { useLoad } from '../lib/useLoad';
import { useSession } from '../auth/session';
import '../screens/ui.css';

const hiddenKey = (academyId: string) => `firststeps_hidden_${academyId}`;
const isHidden = (academyId: string) => { try { return localStorage.getItem(hiddenKey(academyId)) === '1'; } catch { return false; } };

/* 새 학원 첫걸음: 반 → 학생 → 초대 → 첫 공지. 반·학생이 다 있으면(또는 숨기면) 사라진다. */
export function FirstSteps({ summary }: { summary?: TodaySummary | null }) {
  const nav = useNav(); const { active } = useSession();
  const academyId = active?.academy_id ?? '';
  const isDirector = active?.role === 'director';
  const { data: own } = useLoad(() => (isDirector && summary === undefined) ? todaySummary(true) : Promise.resolve(null), [isDirector, summary === undefined]);
  const { data: notices } = useLoad(() => isDirector ? listNotices() : Promise.resolve(null));
  const [hidden, setHidden] = useState(() => isHidden(academyId));
  const s = summary ?? own;
  if (!isDirector || hidden || !s) return null;
  if (!(s.classesTotal === 0 || s.studentsTotal === 0)) return null;
  function hide() {
    try { localStorage.setItem(hiddenKey(academyId), '1'); } catch { /* 저장 못 해도 이번 화면은 숨긴다 */ }
    setHidden(true);
  }
  const steps: { t: string; sub: string; done: boolean; go: () => void }[] = [
    { t: '반 만들기', sub: '요일·시간을 정하면 출석부가 생겨요', done: s.classesTotal > 0, go: () => nav.push('classes') },
    { t: '학생·학부모 넣기', sub: '번호를 넣으면 그 번호로만 들어와요', done: s.studentsTotal > 0, go: () => nav.push('student-edit') },
    { t: '학부모 초대 문구 보내기', sub: '더보기에서 복사해 카톡으로 보내요', done: (s.parentsEntered ?? 0) > 0 || inviteSent(academyId), go: () => nav.tab('more') },
    { t: '첫 공지 올리기', sub: '올리면 학부모·학생에게 알림이 가요', done: (notices?.length ?? 0) > 0, go: () => nav.push('notice-new') },
  ];
  return (
    <div className="fs">
      <div className="fshead"><span className="t">{active?.academy_name ?? '우리 학원'} 시작하기</span><button className="hide" onClick={hide}>숨기기</button></div>
      <p className="fsl">네 가지만 하면 오늘부터 바로 써요.</p>
      {steps.map(st => (
        <button key={st.t} className={'step' + (st.done ? ' done' : '')} onClick={st.go}>
          <span className="chk">{st.done ? '✓' : ''}</span>
          <span className="bd"><span className="t">{st.t}</span><span className="s">{st.sub}</span></span>
          <span className="goto">가기 ›</span>
        </button>))}
    </div>
  );
}
