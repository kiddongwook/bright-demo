import { useEffect, useState } from 'react';
import { listClasses, classMonthTable, monthGrid, kstToday, fmtMD, DOW, dowOf, type AttStatus } from '../../lib/api';
import { useLoad } from '../../lib/useLoad';
import { toCsv } from '../../lib/csv';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';

const MARK: Record<AttStatus, string> = { present: '○', late: '△', absent: '✕', makeup: '◌' };
/* 반별 월 출결표: 학생 × 수업일. 폰에선 가로 스크롤, PC 에선 넓게. */
export function Stats() {
  const { data: classes } = useLoad(listClasses);
  const [cid, setCid] = useState(''); const [ym, setYm] = useState(kstToday().slice(0, 7));
  useEffect(() => { if (classes?.length && !cid) setCid(classes[0].id); }, [classes]);
  const { data, err, reload } = useLoad(() => cid ? classMonthTable(cid, ym) : Promise.resolve(null), [cid, ym]);
  const g = monthGrid(ym);
  const rate = (sid: string) => { const c = data?.cells[sid] ?? {}; const n = data?.days.filter(d => c[d]).length ?? 0; const came = data?.days.filter(d => c[d] && c[d] !== 'absent').length ?? 0; return n ? Math.round(came / n * 100) : null; };
  const rates = (data?.students ?? []).map(s => rate(s.id)).filter((x): x is number => x !== null);
  const avg = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null;
  const className = classes?.find(c => c.id === cid)?.name ?? '';
  function downloadCsv() {
    if (!data || !data.students.length) return;
    const header = ['학생', ...data.days.map(d => d.slice(5).replace('-', '/')), '출석률'];
    const rows = data.students.map(s => [s.name, ...data.days.map(d => { const st = data.cells[s.id]?.[d]; return st ? MARK[st] : ''; }), rate(s.id) === null ? '–' : rate(s.id) + '%']);
    const csv = toCsv([header, ...rows]);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${className}-${ym}-출결.csv`;
    a.click();
  }
  return (
    <section className="view on">
      <div className="head"><p className="lede">반과 달을 고르면 학생마다 수업일 출결이 한 줄로 보여요. ○ 출석 △ 지각 ✕ 결석 ◌ 보강</p></div>
      {classes && classes.length > 1 && <div className="seg">{classes.map(c => <button key={c.id} className={c.id === cid ? 'on' : ''} onClick={() => setCid(c.id)}>{c.name}</button>)}</div>}
      <div className="lab"><button className="calnav" onClick={() => setYm(g.prev)} aria-label="이전 달">‹</button>{g.label}<button className="calnav" onClick={() => setYm(g.next)} aria-label="다음 달">›</button><span className="r">{data ? `수업일 ${data.days.length}` : ''}</span>{data && data.students.length > 0 && <button className="btn sm line" onClick={downloadCsv}>CSV 내려받기</button>}</div>
      {!data && cid && (err ? <ErrorState onRetry={reload} /> : <Skeleton rows={4} />)}
      {data && (data.students.length ? <div className="box tbl-wrap"><table className="tbl">
        <thead><tr><th className="fix">학생</th>{data.days.map(d => <th key={d}><span>{fmtMD(d).replace('월 ', '/').replace('일', '')}</span><small>{DOW[dowOf(d)]}</small></th>)}<th>출석률</th></tr></thead>
        <tbody>{data.students.map(s => <tr key={s.id}><td className="fix">{s.name}</td>{data.days.map(d => { const st = data.cells[s.id]?.[d]; return <td key={d} className={st ?? ''}>{st ? MARK[st] : ''}</td>; })}<td className="rate">{rate(s.id) === null ? '–' : rate(s.id) + '%'}</td></tr>)}</tbody>
      </table></div> : <p className="muted" style={{ padding: '0 20px' }}>이 반에 학생이 없어요.</p>)}
      {data && <p className="muted" style={{ padding: '10px 20px 0' }}>{avg === null ? '이 달에는 기록이 없어요.' : `기록된 날 기준 평균 출석률 ${avg}% · 빈 칸은 아직 기록 전`}</p>}
      {data && data.students.length > 0 && <p className="muted" style={{ padding: '4px 20px 0' }}>카톡 안에서는 내려받기가 안 될 수 있어요. 브라우저로 열어 주세요.</p>}
    </section>
  );
}
