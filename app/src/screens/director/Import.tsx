import { useState } from 'react';
import { parseRosterCsv, groupRoster, planImport, mergePhones, type ImportPlan, type ExistingStudent, type ParsedRoster, type RosterStudent } from '../../lib/csv';
import { listClasses, listStudents, createClass, saveStudent, studentDetail } from '../../lib/api';
import { useNav } from '../../lib/nav';
import { toast, errToast } from '../../lib/toast';
import { confirmSheet } from '../../components/Confirm';

/* 명부 CSV 올리기: 파일 → 미리보기 → 적용. 같은 학생(이름+학생번호)이 이미 있으면 갱신, 반이 없으면 만든다.
   짝짓기는 파일을 고르는 자리에서 미리 맞춰 본다 — 동명이인인데 학생번호가 비면 그 줄을 막고,
   사람이 하나뿐이라 합쳐야 하면 무엇에 합치는지 보여 주고 확인을 받는다 (INP-62). */
export function Import() {
  const nav = useNav();
  const [parsed, setParsed] = useState<ParsedRoster | null>(null); const [name, setName] = useState('');
  const [busy, setBusy] = useState(false); const [result, setResult] = useState<string>('');
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [known, setKnown] = useState<Map<string, ExistingStudent>>(new Map());
  const [planErr, setPlanErr] = useState('');
  const grouped = parsed ? groupRoster(parsed.rows) : null;
  const allErrors = [...(parsed?.errors ?? []), ...(plan?.errors ?? [])];
  const canApply = !!grouped && !!plan && allErrors.length === 0;

  async function pick(f: File | undefined) {
    if (!f) return; setName(f.name); setResult(''); setPlan(null); setPlanErr('');
    const buf = await f.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    if (/�/.test(text)) text = new TextDecoder('euc-kr').decode(buf); // 엑셀이 CP949 로 저장한 경우
    const p = parseRosterCsv(text);
    setParsed(p);
    if (p.errors.length) return;
    /* 이미 있는 학생과 맞춰 본다 — 이름이 겹치는 사람의 번호만 읽는다(줄 수만큼 왕복하지 않게) */
    try {
      const active = await listStudents(undefined, false);
      const names = new Set(groupRoster(p.rows).students.map(s => s.name));
      const cands = active.filter(s => names.has(s.name));
      const detail = new Map<string, ExistingStudent>();
      for (const c of cands) {
        const d = await studentDetail(c.id);
        detail.set(c.id, { id: d.id, name: d.name, student_phone: d.student_phone, parent_phones: d.parent_phones, class_ids: d.classes.map(x => x.id) });
      }
      setKnown(detail);
      setPlan(planImport(groupRoster(p.rows).students, [...detail.values()]));
    } catch (e) { setPlanErr(e instanceof Error ? e.message : '명부를 읽지 못했어요'); errToast(e); }
  }

  async function apply() {
    if (!grouped || !parsed || !plan || allErrors.length) return;
    if (plan.merges.length && !(await confirmSheet({
      title: '이미 있는 학생과 합칠까요?',
      body: plan.merges.join('\n') + '\n보호자 번호는 지우지 않고 함께 남겨요.',
      okLabel: '합치고 적용',
    }))) return;
    setBusy(true);
    try {
      const classes = await listClasses(); const byName = new Map(classes.map(c => [c.name, c.id]));
      let newCls = 0;
      for (const c of grouped.classes) if (!byName.has(c.name)) { byName.set(c.name, await createClass(c.name, c.dows.map(dow => ({ dow, start: c.start, end: c.end })))); newCls++; }
      let added = 0, updated = 0, merged = 0;
      for (const s of grouped.students as RosterStudent[]) {
        const m = plan.by.get(s.key);
        if (!m || m.kind === 'ambiguous') continue;
        const sid = m.kind === 'new' ? null : m.id;
        const prev = sid ? known.get(sid) : undefined;
        /* 보호자 번호는 절대 덮어쓰지 않는다. 학생 번호도 CSV 가 비었으면 있던 것을 지키고,
           합치는 자리에서는 그 학생이 이미 듣던 반도 남긴다 — 명부가 갈아치워지지 않게. */
        const parents = mergePhones(prev?.parent_phones ?? [], s.parent_phones);
        const phone = s.student_phone || prev?.student_phone || '';
        const csvClasses = s.classes.map(n => byName.get(n)!);
        const classIds = m.kind === 'merge' ? [...new Set([...(prev?.class_ids ?? []), ...csvClasses])] : csvClasses;
        await saveStudent(sid, s.name, classIds, phone, parents);
        if (m.kind === 'new') added++; else if (m.kind === 'merge') merged++; else updated++;
      }
      setResult(`반 ${newCls}개 새로 · 학생 ${added}명 넣음 · ${updated}명 갱신${merged ? ` · ${merged}명 합침` : ''}`); toast('적용했어요');
    } catch (e) { errToast(e); } finally { setBusy(false); }
  }
  return (
    <section className="view on">
      <div className="head"><p className="lede">엑셀에서 <b>CSV</b>로 저장한 표를 올려요. 머리글은 <code>반,요일,시작,끝,학생,학생번호,보호자,보호자번호</code> 순서예요(순서는 달라도 돼요). 같은 학생이 여러 줄이면 보호자·반을 합쳐요.</p></div>
      <div style={{ padding: '0 20px' }}><label className="btn line" style={{ display: 'block', cursor: 'pointer' }}>{name || '파일 고르기 (.csv)'}<input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => pick(e.target.files?.[0])} /></label></div>
      {parsed && <>
        <div className="lab">미리보기<span className="r">{parsed.rows.length}줄</span></div>
        {allErrors.length ? <div className="box">{allErrors.slice(0, 20).map((e, i) => <div key={i} className="rw" style={{ cursor: 'default' }}><span className="tag danger">{e.line}줄</span><span className="bd" style={{ marginLeft: 10 }}><span className="s">{e.msg}</span></span></div>)}</div>
          : <div className="box">
            <div className="rw" style={{ cursor: 'default' }}><span className="bd"><span className="t">반 {grouped!.classes.length}개</span><span className="s">{grouped!.classes.map(c => c.name).join(' · ')}</span></span></div>
            <div className="rw" style={{ cursor: 'default' }}><span className="bd"><span className="t">학생 {grouped!.students.length}명</span><span className="s">{grouped!.students.slice(0, 8).map(s => s.name).join(', ')}{grouped!.students.length > 8 ? ' …' : ''}</span></span></div>
            {plan?.merges.map((m, i) => <div key={'m' + i} className="rw" style={{ cursor: 'default' }}><span className="tag warn">합치기</span><span className="bd" style={{ marginLeft: 10 }}><span className="s">{m}</span></span></div>)}
          </div>}
        {allErrors.length > 0 && <p className="muted" style={{ padding: '10px 20px 0' }}>오류 줄을 고쳐 다시 올려주세요. 고치기 전엔 적용할 수 없어요.</p>}
        {planErr && <p className="muted" style={{ padding: '10px 20px 0' }}>{planErr}</p>}
        {!parsed.errors.length && !plan && !planErr && <p className="muted" style={{ padding: '10px 20px 0' }}>이미 있는 학생과 맞춰 보는 중…</p>}
        <div className="btnrow"><button className="btn line" onClick={nav.back}>{result ? '명부로' : '취소'}</button><button className="btn" disabled={busy || !canApply || !!result} onClick={apply}>{busy ? '넣는 중…' : '적용'}</button></div>
        {result && <p className="muted" style={{ padding: '0 20px' }}>{result}. 번호가 있는 사람은 바로 들어올 수 있어요.</p>}
      </>}
    </section>
  );
}
