import { useEffect, useState } from 'react';
import { listClasses, listStudents, studentDetail, saveStudent, leaveStudent, listTeachers, saveTeacher, removeTeacher, academy, entryStatus, createInvite, type Cls } from '../../lib/api';
import { formatPhone, isValidMobile, normalizePhone } from '../../lib/phone';
import { copyInvite, personalInviteText } from '../../lib/invite';
import { useNav } from '../../lib/nav';
import { useLoad } from '../../lib/useLoad';
import { useSession } from '../../auth/session';
import { toast, errToast } from '../../lib/toast';
import { Empty } from '../../components/Empty';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';
import { BottomCta } from '../../components/BottomCta';
import { confirmSheet } from '../../components/Confirm';
import { IcCheck, IcPhone } from '../../components/icons';
import { Counter } from '../../components/Counter';
import { LIMITS } from '../../lib/limits';

/* 사람별 1회용 초대 링크 만들기 + 복사 — 명부와 강사 화면이 같이 쓴다.
   토큰은 누를 때 새로 만들어진다(7일·1회용). 복사가 막히면 문구를 시트로 보여 준다 — 안 그러면 만든 토큰이 사라진다. */
function usePersonalInvite() {
  const { data: myAcademy } = useLoad(academy);
  const [busy, setBusy] = useState('');
  async function copyFor(phone: string, who: string, key: string) {
    if (busy) return;
    setBusy(key);
    try {
      const token = await createInvite(phone);
      const text = personalInviteText(myAcademy?.name ?? '우리 학원', myAcademy?.slug ?? null, token, who);
      if (await copyInvite(text)) { toast('초대 링크를 복사했어요. 카톡으로 보내세요'); return; }
      if (await confirmSheet({ title: '복사가 막혔어요', body: text, okLabel: '다시 복사', cancelLabel: '닫기' })) {
        toast(await copyInvite(text) ? '초대 링크를 복사했어요. 카톡으로 보내세요' : '주소를 길게 눌러 복사해 주세요');
      }
    } catch (e) { errToast(e); }
    finally { setBusy(''); }
  }
  return { busy, copyFor };
}

/* 명부: 반별 활성 학생 + 접힌 퇴원생. 행을 누르면 학생 상세, 편집은 작은 단추. 강사는 더보기 → 강사에서 따로 본다. */
export function Roster() {
  const nav = useNav(); const { active: me } = useSession();
  const isDirector = me?.role === 'director';
  const { data: classes } = useLoad(listClasses);
  const { data: students, err: studentsErr, reload: reloadStudents } = useLoad(() => listStudents(undefined, true));
  const { data: entryRows, err: entryErr } = useLoad(() => isDirector ? entryStatus() : Promise.resolve(null));
  useEffect(() => { if (entryErr) errToast(new Error(entryErr)); }, [entryErr]);
  const invite = usePersonalInvite();
  const active = students?.filter(s => s.status === 'active') ?? [];
  const left = students?.filter(s => s.status === 'left') ?? [];
  const noClass = active.filter(s => !s.classes.length);
  const notEntered = entryRows?.filter(r => !r.entered) ?? [];
  const row = (s: { id: string; name: string; classes: Cls[] }) => (
    <div key={s.id} className="rw" style={{ cursor: 'pointer' }} onClick={() => nav.push('student', { id: s.id })}>
      <span className="nm">{s.name.charAt(0)}</span>
      <span className="bd"><span className="t">{s.name}</span><span className="s">{s.classes.map(x => x.name).join(' · ') || '반 없음'}</span></span>
      <button className="btn sm line" onClick={e => { e.stopPropagation(); nav.push('student-edit', { id: s.id }); }}>편집</button>
    </div>);
  return (
    <section className="view on">
      <div className="head"><p className="lede">명부에 있는 전화번호로만 앱에 들어올 수 있어요.<br />학생과 학부모는 <b>각자 번호로</b> 들어옵니다.</p></div>
      {!students
        ? (studentsErr ? <ErrorState onRetry={reloadStudents} /> : <Skeleton rows={4} />)
        : <>
      {isDirector && entryRows && (notEntered.length > 0 ? (
        <details className="fold">
          <summary>아직 앱에 안 들어온 {notEntered.length}명</summary>
          <div className="box">
            {notEntered.map((r, i) => (
              <div key={`${r.role}-${r.phone}-${i}`} className="rw" style={{ cursor: 'default' }}>
                <span className="nm">{(r.student_name ?? r.name).charAt(0)}</span>
                <span className="bd"><span className="t">{r.student_name} {r.role === 'parent' ? '학부모' : '학생'}</span><span className="s"><a href={'tel:' + r.phone} onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, textDecoration: 'none', color: 'inherit' }}><IcPhone size={13} style={{ color: 'var(--brand)', verticalAlign: -1 }} />{formatPhone(r.phone)}</a></span></span>
                <button className="btn sm line" onClick={() => invite.copyFor(r.phone, `${r.student_name ?? r.name} ${r.role === 'parent' ? '학부모' : '학생'}`, `${r.role}-${r.phone}-${i}`)}>{invite.busy === `${r.role}-${r.phone}-${i}` ? '만드는 중…' : '초대 링크 복사'}</button>
              </div>
            ))}
          </div>
        </details>
      ) : <p className="muted" style={{ padding: '0 20px', display: 'flex', alignItems: 'center', gap: 6 }}><IcCheck size={18} style={{ color: 'var(--ok-ink)', flex: '0 0 auto' }} />명부의 학부모·학생이 모두 들어왔어요</p>)}
      {classes?.map(c => {
        const list = active.filter(s => s.classes.some(x => x.id === c.id));
        return <div key={c.id}><div className="lab">{c.name}<span className="r">{list.length}명</span></div>
          <div className="box">{list.length ? list.map(row) : <Empty icon="people" title="이 반에 학생이 없어요" hint="아래 학생 추가로 넣으면 출석부와 할 것이 바로 생겨요." />}</div></div>;
      })}
      {noClass.length > 0 && <><div className="lab">반 없음<span className="r">{noClass.length}명</span></div><div className="box">{noClass.map(row)}</div></>}
      <div className="btnrow"><button className="btn" onClick={() => nav.push('student-edit')}>학생 추가</button></div>
      {left.length > 0 && <details className="fold"><summary>퇴원 {left.length}명</summary><div className="box">{left.map(s => <div key={s.id} className="rw" style={{ cursor: 'pointer' }} onClick={() => nav.push('student', { id: s.id })}><span className="nm">{s.name.charAt(0)}</span><span className="bd"><span className="t">{s.name}</span><span className="s">기록은 남아 있어요</span></span><span className="go">›</span></div>)}</div></details>}
      </>}
    </section>
  );
}

/* 학생 추가·편집: 이름 · 반(여럿) · 학생 번호 · 학부모 번호(여럿) · 퇴원 */
export function StudentEdit() {
  const nav = useNav(); const id = nav.params.id ?? null;
  const { data: classes } = useLoad(listClasses);
  const [name, setName] = useState(''); const [cls, setCls] = useState<string[]>([]);
  const [sp, setSp] = useState(''); const [pp, setPp] = useState<string[]>(['']);
  const [busy, setBusy] = useState(false); const [loaded, setLoaded] = useState(!id);
  const [loadErr, setLoadErr] = useState(false);
  function loadStudent() {
    if (!id) return;
    setLoadErr(false);
    studentDetail(id).then(d => { setName(d.name); setCls(d.classes.map(c => c.id)); setSp(formatPhone(d.student_phone)); setPp(d.parent_phones.length ? d.parent_phones.map(formatPhone) : ['']); setLoaded(true); })
      .catch(e => { setLoadErr(true); errToast(e); });
  }
  useEffect(loadStudent, [id]);
  const toggle = (cid: string) => setCls(l => l.includes(cid) ? l.filter(x => x !== cid) : [...l, cid]);
  async function save() {
    if (!name.trim()) { toast('이름을 적어주세요'); return; }
    const bad = [sp, ...pp].filter(p => normalizePhone(p) && !isValidMobile(p));
    if (bad.length) { toast(`번호를 확인해 주세요: ${bad[0]}`); return; }
    setBusy(true);
    try { await saveStudent(id, name.trim(), cls, normalizePhone(sp), pp.map(normalizePhone).filter(Boolean)); toast('저장했어요. 번호가 있는 사람은 바로 들어올 수 있어요'); nav.back(); }
    catch (e) { errToast(e); setBusy(false); }
  }
  async function leave() {
    if (!id) return;
    if (!(await confirmSheet({ title: '퇴원 처리할까요?', body: '퇴원 처리하면 학부모·학생이 앱에 들어올 수 없어요. 출결·문의·메모 기록은 남아요.', okLabel: '퇴원 처리', danger: true }))) return;
    setBusy(true);
    try { await leaveStudent(id); toast('퇴원 처리했어요'); nav.tab('more'); } catch (e) { errToast(e); setBusy(false); }
  }
  if (!loaded) return (
    <section className="view on">
      <div className="head"><p className="lede">이름·반·번호를 고쳐요. 학부모 번호는 여럿이어도 돼요.</p></div>
      {loadErr ? <ErrorState onRetry={loadStudent} /> : <Skeleton rows={4} />}
    </section>
  );
  return (
    <section className="view on">
      <div className="head"><p className="lede">{id ? '이름·반·번호를 고쳐요.' : '학생을 넣으면 번호로 바로 들어올 수 있어요.'} 학부모 번호는 여럿이어도 돼요.</p></div>
      <div className="lab first">이름</div>
      <div style={{ padding: '0 20px' }}>
        <input className="input" value={name} maxLength={LIMITS.personName} onChange={e => setName(e.target.value)} placeholder="예) 박지훈" />
        <Counter n={name.length} max={LIMITS.personName} />
      </div>
      <div className="lab">반<span className="r">여럿 가능</span></div>
      <div className="seg col">{classes?.map(c => <button key={c.id} className={cls.includes(c.id) ? 'on' : ''} onClick={() => toggle(c.id)}>{c.name}</button>)}</div>
      <div className="lab">학생 번호<span className="r">없으면 비워요</span></div>
      <div style={{ padding: '0 20px' }}><input className="input" inputMode="tel" value={sp} onChange={e => setSp(formatPhone(e.target.value))} placeholder="010-0000-0000" /></div>
      <div className="lab">학부모 번호</div>
      <div style={{ padding: '0 20px', display: 'grid', gap: 8 }}>
        {pp.map((p, i) => <input key={i} className="input" inputMode="tel" value={p} onChange={e => setPp(l => l.map((x, j) => j === i ? formatPhone(e.target.value) : x))} placeholder="010-0000-0000" />)}
        {pp.length < 3 && <button className="btn sm line" onClick={() => setPp(l => [...l, ''])}>+ 번호 추가</button>}
      </div>
      {id && <><div className="lab" style={{ marginTop: 28 }}>위험 구역</div><div className="btnrow" style={{ paddingTop: 0 }}><button className="btn line" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} disabled={busy} onClick={leave}>퇴원 처리</button></div></>}
      <BottomCta primary={{ label: '저장', onClick: save, busy }} secondary={{ label: '취소', onClick: nav.back }} />
    </section>
  );
}

/* 강사: 명부에 넣으면 번호로 들어온다. 담당 반 배정은 반·시간표에서. */
export function Teachers() {
  const { data, err, reload } = useLoad(listTeachers);
  const invite = usePersonalInvite();
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [busy, setBusy] = useState(false);
  async function add() {
    if (!name.trim() || !isValidMobile(phone)) { toast('이름과 휴대폰 번호를 확인해 주세요'); return; }
    setBusy(true);
    try { await saveTeacher(name.trim(), normalizePhone(phone)); setName(''); setPhone(''); toast('강사를 넣었어요. 그 번호로 들어올 수 있어요'); reload(); } catch (e) { errToast(e); } finally { setBusy(false); }
  }
  async function remove(p: string, n: string) {
    if (!(await confirmSheet({ title: `${n} 강사를 뺄까요?`, body: '명부에서 빼면 더는 들어올 수 없어요.', okLabel: '빼기', danger: true }))) return;
    try { await removeTeacher(p); toast('뺐어요'); reload(); } catch (e) { errToast(e); }
  }
  return (
    <section className="view on">
      <div className="head"><p className="lede">강사는 <b>담당 반</b>의 출결·공지·문의만 봅니다. 반 배정은 <b>반·시간표</b>에서 해요.</p></div>
      <div className="lab first">강사<span className="r">{data ? `${data.length}명` : ''}</span></div>
      {!data ? (err ? <ErrorState onRetry={reload} /> : <Skeleton rows={3} />) : (data.length ? <div className="box">{data.map(t => <div key={t.phone} className="rw" style={{ cursor: 'default' }}><span className="nm">{t.name.charAt(0)}</span><span className="bd"><span className="t">{t.name}</span><span className="s">{formatPhone(t.phone)}{t.user_id ? ' · 들어옴' : ' · 아직 안 들어옴'}</span></span><span style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>{!t.user_id && <button className="btn sm line" onClick={() => invite.copyFor(t.phone, `${t.name} 강사`, t.phone)}>{invite.busy === t.phone ? '만드는 중…' : '초대 링크 복사'}</button>}<button className="btn sm line" onClick={() => remove(t.phone, t.name)}>빼기</button></span></div>)}</div>
        : <p className="muted" style={{ padding: '0 20px' }}>아직 강사가 없어요.</p>)}
      <div className="lab">강사 추가</div>
      <div style={{ padding: '0 20px', display: 'grid', gap: 8 }}>
        <div><input className="input" style={{ width: '100%' }} value={name} maxLength={LIMITS.personName} onChange={e => setName(e.target.value)} placeholder="이름" /><Counter n={name.length} max={LIMITS.personName} /></div>
        <input className="input" inputMode="tel" value={phone} onChange={e => setPhone(formatPhone(e.target.value))} placeholder="010-0000-0000" />
      </div>
      <div className="btnrow"><button className="btn" disabled={busy} onClick={add}>넣기</button></div>
    </section>
  );
}
