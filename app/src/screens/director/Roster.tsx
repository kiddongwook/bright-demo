import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { listClasses, listStudents, studentDetail, saveStudent, leaveStudent, listTeachers, saveTeacher, removeTeacher, academy, entryStatus, createInvite, type Cls, type StudentFull } from '../../lib/api';
import { formatPhone, isValidMobile, normalizePhone } from '../../lib/phone';
import { parseContacts } from '../../lib/contacts';
import { fillParentPhones, notEnteredRoles } from '../../lib/roster';
import { copyInvite, personalInviteText } from '../../lib/invite';
import { atSheetEntry, openSheetEntry, setSheetClose } from '../../lib/nav-history';
import { useNav } from '../../lib/nav';
import { useLoad } from '../../lib/useLoad';
import { useSession } from '../../auth/session';
import { toast, errToast } from '../../lib/toast';
import { Empty } from '../../components/Empty';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';
import { BottomCta } from '../../components/BottomCta';
import { confirmSheet } from '../../components/Confirm';
import { IcCheck, IcCopy, IcList, IcPerson, IcPhone } from '../../components/icons';
import { Counter } from '../../components/Counter';
import { LIMITS } from '../../lib/limits';
import '../ux.css';

const LONG_PRESS_MS = 450;

/* 초대 문구 말고 그냥 글자를 복사할 때 — copyInvite 는 '초대 문구를 보냈다' 표시까지 남기므로 여기 쓰지 않는다 */
async function copyText(text: string): Promise<boolean> {
  try { if (!navigator.clipboard) return false; await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/* 사람별 1회용 초대 링크 만들기 + 복사 — 명부와 강사 화면이 같이 쓴다.
   토큰은 누를 때 새로 만들어진다(7일·1회용). 복사가 막히면 문구를 시트로 보여 준다 — 안 그러면 만든 토큰이 사라진다. */
function usePersonalInvite() {
  const { data: myAcademy } = useLoad(academy);
  const [busy, setBusy] = useState('');
  const academyName = myAcademy?.name ?? '우리 학원';
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
  return { busy, copyFor, academyName };
}

/* 알림을 안 켠 사람에게 보낼 안내 — 화면의 실제 이름(더보기 → 알림 설정 → '이 기기로 알림 받기')을 그대로 쓴다.
   아이폰은 홈 화면에 추가한 뒤에야 푸시를 켤 수 있어 한 줄 덧붙인다. */
export function notifyHintText(academyName: string): string {
  return `[${academyName}] 앱에서 더보기 → 알림 설정 → '이 기기로 알림 받기'를 켜 주세요 (아이폰은 홈 화면에 추가한 앱에서)`;
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
  const [hintBusy, setHintBusy] = useState('');
  const active = students?.filter(s => s.status === 'active') ?? [];
  const left = students?.filter(s => s.status === 'left') ?? [];
  const noClass = active.filter(s => !s.classes.length);
  const notEntered = entryRows?.filter(r => !r.entered) ?? [];
  /* 들어왔는데 앱 밖으로는 아무것도 못 받는 사람. 푸시 구독이 없고, 문자 대행사도 아직 안 붙었다(kakao_ok=false).
     대행사가 붙는 날 kakao_ok 가 true 로 뒤집히면서 이 접힘은 저절로 비게 된다. */
  const noNotify = entryRows?.filter(r => r.entered && !r.push && !r.kakao_ok) ?? [];
  async function copyNotifyHint(key: string) {
    const text = notifyHintText(invite.academyName);
    setHintBusy(key);
    try {
      if (await copyText(text)) { toast('안내 문구를 복사했어요. 카톡으로 보내세요'); return; }
      if (await confirmSheet({ title: '복사가 막혔어요', body: text, okLabel: '다시 복사', cancelLabel: '닫기' })) {
        toast(await copyText(text) ? '안내 문구를 복사했어요. 카톡으로 보내세요' : '문구를 길게 눌러 복사해 주세요');
      }
    } finally { setHintBusy(''); }
  }
  /* ── 빠른 작업 시트 — 명부 행을 길게 누르거나(손가락·마우스 공통) 행 오른쪽 "⋯" 를 눌러 연다.
       전화·초대·편집·기록을 한자리에 모은다. 번호는 열 때 studentDetail 로 읽어 온다.
       열 때 history 항목을 하나 쌓는다(확인 시트와 같은 길) — 안드로이드 뒤로가기가 화면이 아니라 시트를 닫게. */
  type Sheet = { sid: string; name: string; detail: StudentFull | null; err: boolean };
  const [sheet, setSheet] = useState<Sheet | null>(null);
  /* 시트는 .app 안에 붙인다 — .view 는 들어올 때 transform 으로 움직여서 그 안에 두면 자리가 어긋난다 */
  const [sheetHost, setSheetHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { setSheetHost(document.querySelector<HTMLElement>('.app')); }, []);
  const lpT = useRef(0);            // 길게 누르기 타이머
  const lpFired = useRef(false);    // 시트가 떴으면 이어 오는 click 은 학생 화면으로 넘어가지 않는다
  useEffect(() => () => clearTimeout(lpT.current), []);
  const notEnteredMap = notEnteredRoles(entryRows);   // 안 들어온 번호 → 자리. 시트의 초대 단추가 이걸 본다
  function openSheet(sid: string, sname: string) {
    if (sheet) return;   // 이미 열려 있으면 항목을 또 쌓지 않는다 — 뒤로가기 한 번에 하나씩만 사라져야 한다
    setSheet({ sid, name: sname, detail: null, err: false });
    setSheetClose(() => setSheet(null));
    openSheetEntry();
    studentDetail(sid)
      .then(d => setSheet(s => s && s.sid === sid ? { ...s, detail: d } : s))
      .catch(e => { errToast(e); setSheet(s => s && s.sid === sid ? { ...s, err: true } : s); });
  }
  function closeSheet() {
    if (atSheetEntry()) { history.back(); return; }   // popstate → setSheetClose 가 닫는다
    setSheetClose(null); setSheet(null);
  }
  /* 시트를 닫은 뒤에 할 일 — 화면을 밀거나(편집·기록) 또 다른 시트를 여는(초대 복사가 막혔을 때) 일은
     시트 항목이 사라진 뒤라야 안전하다. popstate 안에서는 아직 nav 가 되감기는 중이라 한 틱 미룬다. */
  function closeThen(fn: () => void) {
    if (atSheetEntry()) { setSheetClose(() => { setSheet(null); setTimeout(fn, 0); }); history.back(); return; }
    setSheetClose(null); setSheet(null); fn();
  }
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); closeSheet(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheet]);
  /* 길게 누르기: pointerdown 에서 450ms 를 재고, 떼거나 벗어나면 취소한다. 손가락·마우스가 같은 길을 탄다. */
  function lpDown(sid: string, sname: string) {
    lpFired.current = false; clearTimeout(lpT.current);
    lpT.current = window.setTimeout(() => { lpFired.current = true; openSheet(sid, sname); }, LONG_PRESS_MS);
  }
  const lpUp = () => clearTimeout(lpT.current);
  const row = (s: { id: string; name: string; classes: Cls[] }) => (
    <div key={s.id} className="rw qk" style={{ cursor: 'pointer' }}
      onClick={() => { if (lpFired.current) { lpFired.current = false; return; } nav.push('student', { id: s.id }); }}
      onPointerDown={() => lpDown(s.id, s.name)} onPointerUp={lpUp} onPointerLeave={lpUp} onPointerCancel={lpUp}
      onContextMenu={e => e.preventDefault()}>
      <span className="nm">{s.name.charAt(0)}</span>
      <span className="bd"><span className="t">{s.name}</span><span className="s">{s.classes.map(x => x.name).join(' · ') || '반 없음'}</span></span>
      <button className="btn sm line" onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); nav.push('student-edit', { id: s.id }); }}>편집</button>
      {/* 마우스로 쓰는 사람 — 길게 누르기 대신 여기를 누른다 */}
      <span className="more" role="button" tabIndex={-1} aria-label={`${s.name} 빠른 작업`}
        onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); openSheet(s.id, s.name); }}>⋯</span>
    </div>);
  /* 시트 안 한 줄 — 전화는 <a>, 나머지는 <button>. tel: 은 history 를 건드리지 않아 그냥 닫아도 된다. */
  const sheetPhones = sheet?.detail
    ? [...(sheet.detail.student_phone ? [{ phone: sheet.detail.student_phone, role: 'student' as const }] : []),
       ...sheet.detail.parent_phones.map(p => ({ phone: p, role: 'parent' as const }))]
    : [];
  const sheetInvites = sheetPhones.filter(p => notEnteredMap.has(normalizePhone(p.phone)));
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
      {/* 들어왔지만 알림은 못 받는 사람 — 앱을 열어야만 소식을 본다. 문자 대행사가 붙기 전까지는 푸시가 유일한 길이다. */}
      {isDirector && entryRows && (noNotify.length > 0 ? (
        <details className="fold">
          <summary>알림 못 받는 {noNotify.length}명</summary>
          <div className="box">
            {noNotify.map((r, i) => {
              const key = `np-${r.role}-${r.phone}-${i}`;
              return (
                <div key={key} className="rw" style={{ cursor: 'default' }}>
                  <span className="nm">{(r.student_name ?? r.name).charAt(0)}</span>
                  <span className="bd">
                    <span className="t">{r.student_name ?? r.name} {r.role === 'parent' ? '학부모' : '학생'}</span>
                    <span className="s"><a href={'tel:' + r.phone} onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, textDecoration: 'none', color: 'inherit' }}><IcPhone size={13} style={{ color: 'var(--brand)', verticalAlign: -1 }} />{formatPhone(r.phone)}</a> · 앱은 들어왔지만 알림을 안 켰어요</span>
                  </span>
                  <button className="btn sm line" onClick={() => copyNotifyHint(key)}>{hintBusy === key ? '복사 중…' : '안내 문구 복사'}</button>
                </div>
              );
            })}
          </div>
        </details>
      ) : <p className="muted" style={{ padding: '0 20px' }}>들어온 사람은 모두 알림을 받아요</p>)}
      {classes?.map(c => {
        const list = active.filter(s => s.classes.some(x => x.id === c.id));
        return <div key={c.id}><div className="lab">{c.name}<span className="r">{list.length}명</span></div>
          <div className="box">{list.length ? list.map(row) : <Empty icon="people" title="이 반에 학생이 없어요" hint="아래 학생 추가로 넣으면 출석부와 할 것이 바로 생겨요." />}</div></div>;
      })}
      {noClass.length > 0 && <><div className="lab">반 없음<span className="r">{noClass.length}명</span></div><div className="box">{noClass.map(row)}</div></>}
      <div className="btnrow"><button className="btn" onClick={() => nav.push('student-edit')}>학생 추가</button></div>
      {left.length > 0 && <details className="fold"><summary>퇴원 {left.length}명</summary><div className="box">{left.map(s => <div key={s.id} className="rw" style={{ cursor: 'pointer' }} onClick={() => nav.push('student', { id: s.id })}><span className="nm">{s.name.charAt(0)}</span><span className="bd"><span className="t">{s.name}</span><span className="s">기록은 남아 있어요</span></span><span className="go">›</span></div>)}</div></details>}
      </>}
      {sheet && sheetHost && createPortal(<div className="sheet-dim" onClick={closeSheet}>
        <div className="sheet stusheet" role="dialog" aria-modal="true" aria-label={`${sheet.name} 빠른 작업`} onClick={e => e.stopPropagation()}>
          <p className="ss-name">{sheet.name}</p>
          <p className="ss-sub">전화·초대 링크·편집을 여기서 바로 해요</p>
          {!sheet.detail
            ? (sheet.err
              ? <p className="ss-empty">번호를 불러오지 못했어요. 편집에서 확인해 주세요.</p>
              : <div className="ss-list"><Skeleton rows={3} /></div>)
            : <div className="ss-list">
              {sheetPhones.length === 0 && <p className="ss-empty">아직 번호가 없어요. 편집에서 번호를 넣으면 바로 들어올 수 있어요.</p>}
              {sheetPhones.map((p, i) => (
                <a key={`tel-${i}`} className="ss-row" href={'tel:' + p.phone} onClick={closeSheet}>
                  <IcPhone size={20} className="ss-ic" />
                  <span className="ss-t">{p.role === 'student' ? '학생에게 전화' : '학부모에게 전화'}</span>
                  <span className="ss-s">{formatPhone(p.phone)}</span>
                </a>))}
              {sheetInvites.map((p, i) => {
                const label = p.role === 'parent' ? '학부모' : '학생';
                return (
                  <button key={`inv-${i}`} className="ss-row"
                    onClick={() => closeThen(() => invite.copyFor(p.phone, `${sheet.name} ${label}`, `sheet-${p.phone}`))}>
                    <IcCopy size={20} className="ss-ic" />
                    <span className="ss-t">초대 링크 복사</span>
                    <span className="ss-s">{label} · 아직 안 들어옴</span>
                  </button>);
              })}
            </div>}
          <div className="ss-list">
            <button className="ss-row" onClick={() => closeThen(() => nav.push('student-edit', { id: sheet.sid }))}>
              <IcPerson size={20} className="ss-ic" /><span className="ss-t">편집</span></button>
            <button className="ss-row" onClick={() => closeThen(() => nav.push('student', { id: sheet.sid }))}>
              <IcList size={20} className="ss-ic" /><span className="ss-t">기록 보기</span></button>
          </div>
          <div className="sa"><button className="btn line" onClick={closeSheet}>닫기</button></div>
        </div>
      </div>, sheetHost)}
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
  const [added, setAdded] = useState(0);          // 이번에 이어서 넣은 사람 수 — 새로 넣을 때만 쓴다
  const nameRef = useRef<HTMLInputElement>(null);
  function loadStudent() {
    if (!id) return;
    setLoadErr(false);
    studentDetail(id).then(d => { setName(d.name); setCls(d.classes.map(c => c.id)); setSp(formatPhone(d.student_phone)); setPp(d.parent_phones.length ? d.parent_phones.map(formatPhone) : ['']); setLoaded(true); })
      .catch(e => { setLoadErr(true); errToast(e); });
  }
  useEffect(loadStudent, [id]);
  const toggle = (cid: string) => setCls(l => l.includes(cid) ? l.filter(x => x !== cid) : [...l, cid]);
  /* again=true 는 "저장하고 다음" — 화면에 그대로 남아 반은 두고 이름·번호만 비운다.
     한 반에 여러 명을 넣을 때 화면을 오갈 일이 없어진다. */
  async function save(again = false) {
    if (busy) return;
    if (!name.trim()) { toast('이름을 적어주세요'); nameRef.current?.focus(); return; }
    const bad = [sp, ...pp].filter(p => normalizePhone(p) && !isValidMobile(p));
    if (bad.length) { toast(`번호를 확인해 주세요: ${bad[0]}`); return; }
    const saved = name.trim();
    setBusy(true);
    try {
      await saveStudent(id, saved, cls, normalizePhone(sp), pp.map(normalizePhone).filter(Boolean));
      if (again) {
        setAdded(n => n + 1); setName(''); setSp(''); setPp(['']); setBusy(false);
        toast(`${saved} 넣었어요`); nameRef.current?.focus(); return;
      }
      toast('저장했어요. 번호가 있는 사람은 바로 들어올 수 있어요'); nav.back();
    } catch (e) { errToast(e); setBusy(false); }
  }
  /* 주소록·문자에서 긁어 온 글을 번호 칸에 붙여넣으면 이름·나머지 번호까지 한 번에 앉힌다.
     번호 하나에 이름도 없으면 손대지 않는다 — 평소 붙여넣기가 그대로 돌아야 한다. */
  function onPastePhone(target: number | null, e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData?.getData('text') ?? '';
    if (!text) return;
    const list = parseContacts(text);
    if (!(list.length >= 2 || (list.length === 1 && !!list[0].name))) return;
    e.preventDefault();
    const phones = list.map(c => formatPhone(c.phone));
    const { pp: nextPp, placed } = fillParentPhones(pp, phones, target);
    setPp(nextPp);
    if (target === null) setSp(phones[0]);
    const parsed = list.find(c => c.name)?.name;
    if (parsed && !name.trim()) setName(parsed.slice(0, LIMITS.personName));
    toast(`붙여넣은 연락처 ${placed}개를 채웠어요`);
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
      <div className="head"><p className="lede">{id ? '이름·반·번호를 고쳐요.' : '학생을 넣으면 번호로 바로 들어올 수 있어요.'} 학부모 번호는 여럿이어도 돼요.{added > 0 && <> 이번에 <b>{added}명</b> 넣었어요.</>}</p></div>
      <div className="lab first">이름</div>
      <div style={{ padding: '0 20px' }}>
        <input ref={nameRef} className="input" value={name} maxLength={LIMITS.personName} onChange={e => setName(e.target.value)} placeholder="예) 박지훈" />
        <Counter n={name.length} max={LIMITS.personName} />
      </div>
      <div className="lab">반<span className="r">여럿 가능</span></div>
      <div className="seg col">{classes?.map(c => <button key={c.id} className={cls.includes(c.id) ? 'on' : ''} onClick={() => toggle(c.id)}>{c.name}</button>)}</div>
      <div className="lab">학생 번호<span className="r">없으면 비워요</span></div>
      <div style={{ padding: '0 20px' }}><input className="input" inputMode="tel" value={sp} onPaste={e => onPastePhone(null, e)} onChange={e => setSp(formatPhone(e.target.value))} placeholder="010-0000-0000" /></div>
      <div className="lab">학부모 번호</div>
      <div style={{ padding: '0 20px', display: 'grid', gap: 8 }}>
        {pp.map((p, i) => <input key={i} className="input" inputMode="tel" value={p} onPaste={e => onPastePhone(i, e)} onChange={e => setPp(l => l.map((x, j) => j === i ? formatPhone(e.target.value) : x))} placeholder="010-0000-0000" />)}
        {pp.length < 3 && <button className="btn sm line" onClick={() => setPp(l => [...l, ''])}>+ 번호 추가</button>}
        <p className="muted" style={{ margin: 0, fontSize: 'var(--t-sub)' }}>주소록에서 <b>이름과 번호를 함께 복사</b>해 붙여넣으면 칸이 알아서 채워져요.</p>
      </div>
      {id && <><div className="lab" style={{ marginTop: 28 }}>위험 구역</div><div className="btnrow" style={{ paddingTop: 0 }}><button className="btn line" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} disabled={busy} onClick={leave}>퇴원 처리</button></div></>}
      {/* 연속 추가 — 반은 그대로 두고 이름·번호만 비운다. 한 반을 통째로 넣을 때 화면을 오갈 일이 없다 */}
      {!id && <div className="btnrow" style={{ paddingBottom: 0 }}><button className="btn line" disabled={busy} onClick={() => save(true)}>저장하고 다음</button></div>}
      <BottomCta primary={{ label: '저장', onClick: () => save(false), busy }} secondary={{ label: '취소', onClick: nav.back }} />
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
