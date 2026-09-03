import { useState } from 'react';
import { listAbsences, confirmMakeup, nextSaturdays, fmtMDW } from '../../lib/api';
import { useNav } from '../../lib/nav';
import { useLoad } from '../../lib/useLoad';
import { toast, errToast } from '../../lib/toast';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';

export function Makeup() {
  const nav = useNav(); const id = nav.params.id;
  const { data, err, reload } = useLoad(() => listAbsences().then(l => l.find(a => a.id === id) ?? null), [id]);
  const sats = nextSaturdays(2);
  const opts: { key: string; label: string; kind: 'saturday' | 'material'; at: string | null }[] = [
    ...sats.map(d => ({ key: d, label: `${fmtMDW(d)} 2시`, kind: 'saturday' as const, at: `${d}T14:00:00+09:00` })),
    { key: 'material', label: '자료로 대체', kind: 'material' as const, at: null }];
  const [pick, setPick] = useState(opts[0].key);
  const [busy, setBusy] = useState(false);
  async function confirm() {
    const o = opts.find(x => x.key === pick)!; setBusy(true);
    try { await confirmMakeup(id, o.kind, o.at); toast(`${data?.student_name} 학부모에게 ${o.kind === 'material' ? '자료 대체' : '보강 일정'}을 알렸어요`); nav.back(); }
    catch (e) { errToast(e); setBusy(false); }
  }
  if (!data) return <section className="view on">{err ? <ErrorState onRetry={reload} /> : <Skeleton rows={3} />}</section>;
  return (
    <section className="view on">
      <div className="head"><p className="lede">{data.student_name} · <b>{fmtMDW(data.date)}</b> 결석<br />{data.reason}</p></div>
      {data.status !== 'requested' && <p className="muted" style={{ padding: '0 20px 14px' }}>이미 처리된 신청이에요. 다시 정하면 덮어씁니다.</p>}
      <div className="lab first">보강</div>
      <div className="seg col">{opts.map(o => <button key={o.key} className={o.key === pick ? 'on' : ''} onClick={() => setPick(o.key)}>{o.label}</button>)}</div>
      <div className="btnrow"><button className="btn line" onClick={nav.back}>나중에</button><button className="btn" disabled={busy} onClick={confirm}>확정하고 알리기</button></div>
    </section>
  );
}
