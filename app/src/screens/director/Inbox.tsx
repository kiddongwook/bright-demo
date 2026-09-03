import { useState } from 'react';
import { listInquiries, answerInquiry, listFaqs, type Inquiry } from '../../lib/api';
import { useNav } from '../../lib/nav';
import { useLoad } from '../../lib/useLoad';
import { toast, errToast } from '../../lib/toast';

const when = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function Inbox() {
  const nav = useNav();
  const { data } = useLoad(listInquiries);
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
      {data && (open.length ? <div className="box">{open.map(row)}</div> : <p className="muted" style={{ padding: '0 20px' }}>답변 대기 중인 문의가 없어요.</p>)}
      <div className="lab">답변 완료</div>
      {data && (done.length ? <div className="box soft">{done.map(row)}</div> : <p className="muted" style={{ padding: '0 20px' }}>아직 없어요.</p>)}
      <div className="btnrow"><button className="btn line" onClick={() => nav.push('faq')}>자주 묻는 질문 관리</button></div>
    </section>
  );
}

export function Answer() {
  const nav = useNav(); const id = nav.params.id;
  const { data: i } = useLoad(() => listInquiries().then(l => l.find(x => x.id === id) ?? null), [id]);
  const [text, setText] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const val = text ?? i?.answer ?? '';
  async function send() {
    if (!val.trim()) { toast('답변을 적어주세요'); return; }
    setBusy(true);
    try { await answerInquiry(id, val.trim()); toast(`${i?.asker_name}께 답변을 보냈어요`); nav.back(); } catch (e) { errToast(e); setBusy(false); }
  }
  if (!i) return <section className="view on" />;
  return (
    <section className="view on">
      <div className="head"><p className="lede">{i.student_name ? i.student_name + ' · ' : ''}{i.asker_name} · {when(i.created_at)}</p></div>
      <div className="bubble"><div className="who">{i.asker_name}</div>{i.body}</div>
      <div className="lab">답변{i.answered_at && <span className="r">{when(i.answered_at)} 답함</span>}</div>
      <div style={{ padding: '0 20px' }}><textarea className="input" value={val} onChange={e => setText(e.target.value)} placeholder="답변을 적어주세요" /></div>
      <div className="btnrow"><button className="btn line" onClick={nav.back}>나중에</button><button className="btn" disabled={busy} onClick={send}>{i.answer ? '답변 고치기' : '답하고 알리기'}</button></div>
    </section>
  );
}

export function FaqManage() {
  const { data } = useLoad(listFaqs);
  return (
    <section className="view on">
      <div className="head"><p className="lede">학부모 문의 화면 맨 위에 이 목록이 보여요.<br />자주 오는 질문을 미리 답해두면 <b>문의가 줄어듭니다.</b></p></div>
      {data && (data.length ? <div className="box">{data.map(f => <details key={f.id} className="faq"><summary>{f.q}</summary><div className="a">{f.a}</div></details>)}</div> : <p className="muted" style={{ padding: '0 20px' }}>아직 없어요.</p>)}
      <div className="btnrow"><button className="btn line" onClick={() => toast('질문 추가·수정은 다음 주에 열려요')}>질문 추가</button></div>
    </section>
  );
}
