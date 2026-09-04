import { useState } from 'react';
import { listInquiries, answerInquiry, listFaqs, addNote, type Inquiry, saveFaq, deleteFaq } from '../../lib/api';
import { recentAnswers, FIXED_REPLIES, faqQuestion, saveFaqDedup } from '../../lib/inbox';
import { useNav } from '../../lib/nav';
import { useLoad } from '../../lib/useLoad';
import { toast, errToast, deferDelete, isPending } from '../../lib/toast';
import { Empty } from '../../components/Empty';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';
import '../ux.css';

const when = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function Inbox() {
  const nav = useNav();
  const { data, err, reload } = useLoad(listInquiries);
  const open = data?.filter(i => !i.answer) ?? [], done = data?.filter(i => i.answer) ?? [];
  const row = (i: Inquiry) => (
    <button key={i.id} className="rw" onClick={() => nav.push('answer', { id: i.id })}>
      <span className="nm">{i.asker_name.charAt(0)}</span>
      <span className="bd"><span className="t">{i.asker_name}</span><span className="s">{i.topic} · {when(i.created_at)}</span></span>
      <span className={'tag ' + (i.answer ? 'muted' : 'danger')}>{i.answer ? '답변 완료' : '답변 대기'}</span>
    </button>);
  return (
    <section className="view on">
      <div className="head"><h1 className="hello">문의</h1><p className="lede">학부모가 보낸 1:1 문의예요. 답하면 <b>그 학부모에게만</b> 알림이 갑니다.</p></div>
      <div className="lab first">답변 대기<span className="r">{open.length}</span></div>
      {!data ? (err ? <ErrorState onRetry={reload} /> : <Skeleton rows={3} />) : (open.length ? <div className="box">{open.map(row)}</div> : <div className="box"><Empty icon="chat" title="답변 대기 중인 문의가 없어요" hint="학부모가 1:1 문의를 보내면 여기에 쌓여요." /></div>)}
      <div className="lab">답변 완료</div>
      {data && (done.length ? <div className="box soft">{done.map(row)}</div> : <p className="muted" style={{ padding: '0 20px' }}>아직 없어요.</p>)}
      <div className="btnrow"><button className="btn line" onClick={() => nav.push('faq')}>자주 묻는 질문 관리</button></div>
    </section>
  );
}

export function Answer() {
  const nav = useNav(); const id = nav.params.id;
  const { data: i, err, reload } = useLoad(() => listInquiries().then(l => l.find(x => x.id === id) ?? null), [id]);
  const [text, setText] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [toFaq, setToFaq] = useState(false);
  const [toNote, setToNote] = useState(false);
  const { data: recent } = useLoad(() => recentAnswers(5).catch(() => [] as string[]), []);
  const val = text ?? i?.answer ?? '';
  /* 답변 틀 — 최근에 보낸 답 다섯 개 + 늘 쓰는 세 개. 누르면 넣는다(이미 쓴 게 있으면 뒤에 붙인다). */
  const templates = [...(recent ?? []), ...FIXED_REPLIES];
  function insert(t: string) {
    const cur = val.trim();
    setText(cur ? cur + (cur.endsWith('\n') ? '' : '\n') + t : t);
  }
  async function send() {
    if (!val.trim()) { toast('답변을 적어주세요'); return; }
    setBusy(true);
    const answer = val.trim();
    try {
      await answerInquiry(id, answer);
    } catch (e) { errToast(e); setBusy(false); return; }
    /* 답변은 이미 나갔다 — 아래 둘은 실패해도 알리고 넘어간다 */
    let faqMsg = '';
    if (toFaq && i) {
      try { faqMsg = (await saveFaqDedup(faqQuestion(i.body), answer)) === 'updated' ? ' · 이미 있는 질문이라 답만 바꿨어요' : ' · 자주 묻는 질문에도 올렸어요'; }
      catch (e) { errToast(e); }
    }
    let noteMsg = '';
    if (toNote && i?.student_id) {
      try { await addNote(i.student_id, 'consult', `[문의] ${faqQuestion(i.body)} → ${answer.slice(0, 120)}`); noteMsg = ' · 메모에도 남겼어요'; }
      catch (e) { errToast(e); }
    }
    toast(`${i?.asker_name}께 답변을 보냈어요${faqMsg}${noteMsg}`); nav.back();
  }
  if (!i) return <section className="view on">{err ? <ErrorState onRetry={reload} /> : <Skeleton rows={3} />}</section>;
  const sid = i.student_id;
  return (
    <section className="view on">
      <div className="head"><p className="lede">{i.student_name ? i.student_name + ' · ' : ''}{i.asker_name} · {when(i.created_at)}</p></div>
      <div className="bubble"><div className="who">{i.asker_name}</div>{i.body}</div>
      {sid && (
        <div className="btnrow" style={{ paddingBottom: 0 }}>
          <button className="btn line" onClick={() => nav.push('student', { id: sid })}>{i.student_name ?? '학생'} 기록 보기 ›</button>
        </div>)}
      <div className="lab">답변{i.answered_at && <span className="r">{when(i.answered_at)} 답함</span>}</div>
      <div className="chips-row wrap">{templates.map(t => (
        <button key={t} onClick={() => insert(t)} title={t}>{t}</button>))}</div>
      <div style={{ padding: '10px 20px 0' }}><textarea className="input" value={val} onChange={e => setText(e.target.value)} placeholder="답변을 적어주세요" /></div>
      <label className="chk-row"><input type="checkbox" checked={toFaq} onChange={e => setToFaq(e.target.checked)} />이 답을 자주 묻는 질문에도 올리기</label>
      {sid && <label className="chk-row"><input type="checkbox" checked={toNote} onChange={e => setToNote(e.target.checked)} />메모로도 남기기</label>}
      <div className="btnrow"><button className="btn line" onClick={nav.back}>나중에</button><button className="btn" disabled={busy} onClick={send}>{i.answer ? '답변 고치기' : '답하고 알리기'}</button></div>
    </section>
  );
}

export function FaqManage() {
  const { data, err, reload, setData } = useLoad(listFaqs);
  const [edit, setEdit] = useState<{ id: string | null; q: string; a: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!edit || !edit.q.trim() || !edit.a.trim()) { toast('질문과 답을 모두 적어주세요'); return; }
    /* 같은 질문은 학원마다 하나 (0017 unique index) — 부딪히면 날 오류 대신 안내를 낸다 */
    const key = edit.q.trim().toLowerCase();
    const dup = (data ?? []).find(f => f.id !== edit.id && (f.q ?? '').trim().toLowerCase() === key);
    if (dup && edit.id) { toast('이미 있는 질문이에요'); return; }
    setBusy(true);
    try {
      await saveFaq(dup ? dup.id : edit.id, edit.q.trim(), edit.a.trim(), (data?.length ?? 0) + 1);
      toast(dup ? '이미 있는 질문이라 답만 바꿨어요' : '저장했어요'); setEdit(null); reload();
    } catch (e) { errToast(e); } finally { setBusy(false); }
  }
  /* 지우기는 5초 뒤에 진짜로 — 되돌리기를 누르면 없던 일이 된다 */
  function del(id: string, q: string) {
    setData(l => l ? l.filter(f => f.id !== id) : l);
    const cancel = deferDelete(`faq:${id}`, () => { deleteFaq(id).then(() => reload()).catch(e => { errToast(e); reload(); }); });
    toast(`「${q}」를 지웠어요`, { ms: 5000, action: { label: '되돌리기', onClick: () => { cancel(); reload(); } } });
  }
  const faqs = data?.filter(f => !isPending(`faq:${f.id}`));   /* 되돌리기를 기다리는 줄은 다시 읽어도 숨긴 채로 */
  return (
    <section className="view on">
      <div className="head"><p className="lede">학부모 문의 화면 맨 위에 이 목록이 보여요.<br />자주 오는 질문을 미리 답해두면 <b>문의가 줄어듭니다.</b></p></div>
      {!faqs ? (err ? <ErrorState onRetry={reload} /> : <Skeleton rows={3} />) : (faqs.length ? <div className="box">{faqs.map(f => <details key={f.id} className="faq"><summary>{f.q}</summary><div className="a">{f.a}<div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button className="btn sm line" onClick={() => setEdit({ id: f.id, q: f.q, a: f.a })}>고치기</button><button className="btn sm line" onClick={() => del(f.id, f.q)}>지우기</button></div></div></details>)}</div> : <p className="muted" style={{ padding: '0 20px' }}>아직 없어요.</p>)}
      {edit ? <>
        <div className="lab">{edit.id ? '질문 고치기' : '새 질문'}</div>
        <div style={{ padding: '0 20px', display: 'grid', gap: 8 }}>
          <input className="input" value={edit.q} onChange={e => setEdit({ ...edit, q: e.target.value })} placeholder="질문 (예: 결석하면 보강이 되나요?)" />
          <textarea className="input" style={{ minHeight: 90 }} value={edit.a} onChange={e => setEdit({ ...edit, a: e.target.value })} placeholder="답" />
        </div>
        <div className="btnrow"><button className="btn line" onClick={() => setEdit(null)}>취소</button><button className="btn" disabled={busy} onClick={save}>저장</button></div>
      </> : <div className="btnrow"><button className="btn line" onClick={() => setEdit({ id: null, q: '', a: '' })}>질문 추가</button></div>}
    </section>
  );
}
