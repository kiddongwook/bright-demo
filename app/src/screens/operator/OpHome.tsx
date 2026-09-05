import { useState } from 'react';
import { useNav } from '../../lib/nav';
import { useLoad } from '../../lib/useLoad';
import { opAcademies, type OpAcademy } from '../../lib/operator';
import { Empty } from '../../components/Empty';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';
import { BottomCta } from '../../components/BottomCta';
import '../ui.css';
import './operator.css';

/* BRIGHT 운영 · 학원 목록 — op_academies() 한 줄이 카드 한 장.
   숫자의 뜻은 docs/ops/operator.md 2번 표와 같다. */

const match = (a: OpAcademy, q: string) => !q || a.name.toLowerCase().includes(q) || a.slug.includes(q);

export function OpHome() {
  const nav = useNav();
  const { data, err, reload } = useLoad(opAcademies);
  const [q, setQ] = useState('');
  const list = data?.filter(a => match(a, q.trim().toLowerCase())) ?? null;
  return (
    <section className="view on">
      <div className="head"><h1 className="hello">학원</h1>
        <p className="lede">{data ? `${data.length}곳을 운영하고 있어요` : 'BRIGHT 운영'}</p></div>
      {!!data?.length && <div className="opsearch">
        <input className="input" placeholder="이름이나 주소로 찾기" value={q} onChange={e => setQ(e.target.value)} /></div>}
      {!data ? (err ? <ErrorState onRetry={reload} /> : <Skeleton rows={3} />)
        : !data.length
          ? <Empty icon="list" title="아직 학원이 없어요" hint="학원을 만들면 원장님께 보낼 초대 링크가 함께 나와요." action={{ label: '학원 만들기', onClick: () => nav.push('op-new') }} />
          : !list!.length
            ? <Empty icon="list" title="찾는 학원이 없어요" hint="이름이나 주소의 일부만 넣어도 돼요." />
            : <div className="opcards">
              {list!.map(a => (
                <button key={a.id} className="opcard" onClick={() => nav.push('op-academy', { id: a.id })}>
                  <span className="ct">
                    <span className="cn">{a.name}</span>
                    {a.locked && <span className="tag danger">이용 정지</span>}
                    {a.sms_provider === 'http' && <span className="tag ok">발신 켬</span>}
                    <span className="go">›</span>
                  </span>
                  <span className="cs">{a.slug}</span>
                  <span className="cnums">
                    <span>학생 <b>{a.students}</b></span>
                    <span>학부모 <b>{a.parents_entered}</b>/{a.parents_total} 들어옴</span>
                    <span className={a.no_push ? 'hot' : ''}>알림 못 받는 <b>{a.no_push}</b></span>
                    <span>이번 달 청구 <b>{a.invoices_month}</b> · 납부 <b>{a.paid_month}</b></span>
                  </span>
                </button>))}
            </div>}
      <BottomCta primary={{ label: '학원 만들기', onClick: () => nav.push('op-new') }} />
    </section>
  );
}
