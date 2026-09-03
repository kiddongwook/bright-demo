import { useState } from 'react';
import { parseRosterCsv, groupRoster, type ParsedRoster, type RosterStudent } from '../../lib/csv';
import { listClasses, listStudents, createClass, saveStudent, studentDetail } from '../../lib/api';
import { useNav } from '../../lib/nav';
import { toast, errToast } from '../../lib/toast';

/* 명부 CSV 올리기: 파일 → 미리보기 → 적용. 같은 학생(이름+학생번호)이 이미 있으면 갱신, 반이 없으면 만든다. */
export function Import() {
  const nav = useNav();
  const [parsed, setParsed] = useState<ParsedRoster | null>(null); const [name, setName] = useState('');
  const [busy, setBusy] = useState(false); const [result, setResult] = useState<string>('');
  const grouped = parsed ? groupRoster(parsed.rows) : null;
  async function pick(f: File | undefined) {
    if (!f) return; setName(f.name); setResult('');
    const buf = await f.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    if (/�/.test(text)) text = new TextDecoder('euc-kr').decode(buf); // 엑셀이 CP949 로 저장한 경우
    setParsed(parseRosterCsv(text));
  }
  async function apply() {
    if (!grouped || !parsed || parsed.errors.length) return;
    setBusy(true);
    try {
      const classes = await listClasses(); const byName = new Map(classes.map(c => [c.name, c.id]));
      let newCls = 0;
      for (const c of grouped.classes) if (!byName.has(c.name)) { byName.set(c.name, await createClass(c.name, c.dows.map(dow => ({ dow, start: c.start, end: c.end })))); newCls++; }
      const existing = await listStudents(undefined, true);
      let added = 0, updated = 0;
      for (const s of grouped.students as RosterStudent[]) {
        const cand = existing.filter(x => x.name === s.name);
        let sid: string | null = null;
        for (const x of cand) { const d = await studentDetail(x.id); if (!s.student_phone || !d.student_phone || d.student_phone === s.student_phone) { sid = x.id; break; } }
        await saveStudent(sid, s.name, s.classes.map(n => byName.get(n)!), s.student_phone, s.parent_phones);
        if (sid) updated++; else added++;
      }
      setResult(`반 ${newCls}개 새로 · 학생 ${added}명 넣음 · ${updated}명 갱신`); toast('적용했어요');
    } catch (e) { errToast(e); } finally { setBusy(false); }
  }
  return (
    <section className="view on">
      <div className="head"><p className="lede">엑셀에서 <b>CSV</b>로 저장한 표를 올려요. 머리글은 <code>반,요일,시작,끝,학생,학생번호,보호자,보호자번호</code> 순서예요(순서는 달라도 돼요). 같은 학생이 여러 줄이면 보호자·반을 합쳐요.</p></div>
      <div style={{ padding: '0 20px' }}><label className="btn line" style={{ display: 'block', cursor: 'pointer' }}>{name || '파일 고르기 (.csv)'}<input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => pick(e.target.files?.[0])} /></label></div>
      {parsed && <>
        <div className="lab">미리보기<span className="r">{parsed.rows.length}줄</span></div>
        {parsed.errors.length ? <div className="box">{parsed.errors.slice(0, 20).map((e, i) => <div key={i} className="rw" style={{ cursor: 'default' }}><span className="tag danger">{e.line}줄</span><span className="bd" style={{ marginLeft: 10 }}><span className="s">{e.msg}</span></span></div>)}</div>
          : <div className="box">
            <div className="rw" style={{ cursor: 'default' }}><span className="bd"><span className="t">반 {grouped!.classes.length}개</span><span className="s">{grouped!.classes.map(c => c.name).join(' · ')}</span></span></div>
            <div className="rw" style={{ cursor: 'default' }}><span className="bd"><span className="t">학생 {grouped!.students.length}명</span><span className="s">{grouped!.students.slice(0, 8).map(s => s.name).join(', ')}{grouped!.students.length > 8 ? ' …' : ''}</span></span></div>
          </div>}
        {parsed.errors.length > 0 && <p className="muted" style={{ padding: '10px 20px 0' }}>오류 줄을 고쳐 다시 올려주세요. 고치기 전엔 적용할 수 없어요.</p>}
        <div className="btnrow"><button className="btn line" onClick={nav.back}>{result ? '명부로' : '취소'}</button><button className="btn" disabled={busy || !!parsed.errors.length || !!result} onClick={apply}>{busy ? '넣는 중…' : '적용'}</button></div>
        {result && <p className="muted" style={{ padding: '0 20px' }}>{result}. 번호가 있는 사람은 바로 들어올 수 있어요.</p>}
      </>}
    </section>
  );
}
