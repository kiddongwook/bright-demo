import { useState } from 'react';
import { listFaqs, listInquiries, createInquiry } from '../../lib/api';
import { useNav } from '../../lib/nav';
import { useLoad } from '../../lib/useLoad';
import { useSession } from '../../auth/session';
import { toast, errToast } from '../../lib/toast';
import { Counter } from '../../components/Counter';
import { LIMITS } from '../../lib/limits';
import { AutoTextarea } from '../../components/AutoTextarea';

const when = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function Ask() {
  const nav = useNav();
  const { data: faqs } = useLoad(listFaqs);
  return (
    <section className="view on">
      <div className="head"><h1 className="hello">문의</h1><p className="lede">자주 묻는 질문을 먼저 보시고, 없으면 <b>직접 문의</b>해 주세요. 원장님만 봅니다.</p></div>
      <div className="lab first">자주 묻는 질문</div>
      {faqs && (faqs.length ? <div className="box">{faqs.map(f => <details key={f.id} className="faq"><summary>{f.q}</summary><div className="a">{f.a}</div></details>)}</div> : <p className="muted" style={{ padding: '0 20px' }}>아직 없어요.</p>)}
      <div className="btnrow"><button className="btn line" onClick={() => nav.push('ask-mine')}>내 문의</button><button className="btn" onClick={() => nav.push('ask-new')}>직접 문의하기</button></div>
    </section>
  );
}

export function AskNew() {
  const nav = useNav(); const { active } = useSession();
  const [body, setBody] = useState(''); const [busy, setBusy] = useState(false);
  async function send() {
    const q = body.trim(); if (!q) { toast('문의 내용을 적어주세요'); return; }
    setBusy(true);
    try { await createInquiry(active?.student_id ?? null, q.length > 14 ? q.slice(0, 14) + '…' : q, q); toast('원장님께 문의를 보냈어요'); nav.back(); } catch (e) { errToast(e); setBusy(false); }
  }
  return (
    <section className="view on">
      <div className="head"><p className="lede">원장님만 봅니다. 답이 오면 <b>알림</b>으로 알려드려요.</p></div>
      <div className="lab first">문의 내용</div>
      <div style={{ padding: '0 20px' }}>
        <AutoTextarea value={body} maxLength={LIMITS.inquiry} onChange={e => setBody(e.target.value)} placeholder="예) 다음 주 수요일 결석 예정입니다." />
        <Counter n={body.length} max={LIMITS.inquiry} />
      </div>
      <div className="btnrow"><button className="btn line" onClick={nav.back}>취소</button><button className="btn" disabled={busy} onClick={send}>보내기</button></div>
    </section>
  );
}

export function AskMine() {
  const { data } = useLoad(listInquiries);
  return (
    <section className="view on">
      <div className="head"><p className="lede">보낸 문의와 원장님 답변이에요.</p></div>
      {data && (data.length === 0 ? <p className="muted" style={{ padding: '0 20px' }}>보낸 문의가 없어요.</p>
        : data.map((i, k) => <div key={i.id}>
          <div className={'lab' + (k ? '' : ' first')}>{when(i.created_at)}</div>
          <div className="bubble me"><div className="who">나</div>{i.body}</div>
          {i.answer ? <div className="bubble" style={{ marginTop: 10 }}><div className="who">원장님 · {i.answered_at ? when(i.answered_at) : ''}</div>{i.answer}</div>
            : <p className="muted" style={{ padding: '10px 20px 0' }}>원장님이 아직 답하지 않았어요. 답이 오면 알림으로 알려드려요.</p>}
        </div>))}
    </section>
  );
}
