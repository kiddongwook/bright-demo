import { useChild } from './Child';
import { MonthCal } from '../director/StudentDetail';
/* 학부모: 자녀의 달력 (읽기 전용). 지각·결석·보강만 표시된다. */
export function ChildMonth() {
  const child = useChild();
  if (!child) return <section className="view on" />;
  return (
    <section className="view on">
      <div className="head"><p className="lede">{child.name.replace(/^[가-힣]/, '')}이의 이번 달이에요. 휴원일은 빗금, 오늘은 테두리.</p></div>
      <MonthCal sid={child.id} />
    </section>
  );
}
