import { useChild } from './Child';
import { callName } from '../../lib/name';
import { MonthCal } from '../director/StudentDetail';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';
/* 학부모: 자녀의 달력 (읽기 전용). 지각·결석·보강만 표시된다. */
export function ChildMonth() {
  const { child, err, reload } = useChild();
  if (!child) return <section className="view on">{err ? <ErrorState onRetry={reload} /> : <Skeleton rows={4} />}</section>;
  return (
    <section className="view on">
      <div className="head"><p className="lede">{callName(child.name)}의 이번 달이에요. 휴원일은 빗금, 오늘은 테두리.</p></div>
      <MonthCal sid={child.id} />
    </section>
  );
}
