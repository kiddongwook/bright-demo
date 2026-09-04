// inp-05 날짜·시간 — calendar/todos/invoices/billing_rules/classes.schedule 와 순수 함수(hmToMin·pickInitialClass·fmtDateLong·fmtTime12)
import { admin, setup, teardown, F, held, report, hmToMin, pickInitialClass, fmtDateLong, fmtTime12 } from './inp-lib.mjs';

const ctx = await setup('date');
console.log('academy', ctx.slug);
const D = ctx.d;

console.log('--- calendar.date ---');
for (const [d, why] of [['2026-02-30', '없는 날'], ['2026-13-01', '13월'], ['2025-01-01', '과거'], ['9999-12-31', '먼 미래'], ['0001-01-01', '연도 1']]) {
  const r = await D.from('calendar').insert({ academy_id: ctx.A, date: d, kind: 'closed', note: why }).select('id, date').single();
  console.log(JSON.stringify({ d, why, ok: !r.error, got: r.data?.date, err: r.error?.message?.slice(0, 60) }));
  if (r.error) held(`calendar.date ${d} 거절`, r.error.message.slice(0, 60));
  else {
    if (d === '9999-12-31' || d === '0001-01-01') F('INP-40', '낮음', `달력에 터무니없는 날짜(${d})가 들어간다 — 화면·다음 수업일 계산에 상·하한이 없다`, 'tools/redteam/inp-05-dates.mjs (calendar)', `insert 성공, date=${r.data.date}`);
    if (d === '2025-01-01') held('과거 휴원일은 의도적으로 허용(지난 기록 입력)', 'insert 성공');
    await D.from('calendar').delete().eq('id', r.data.id);
  }
}

console.log('--- todos.due_date ---');
for (const [d, why] of [['2026-02-30', '없는 날'], ['2025-01-01', '과거'], ['9999-12-31', '먼 미래']]) {
  const r = await D.from('todos').insert({ academy_id: ctx.A, class_id: ctx.cls.id, kind: 'homework', title: '적대 ' + why, due_date: d }).select('id, due_date').single();
  console.log(JSON.stringify({ d, why, ok: !r.error, err: r.error?.message?.slice(0, 60) }));
  if (r.error) held(`todos.due_date ${d} 거절`, r.error.message.slice(0, 60));
  else {
    if (d !== '2025-01-01') F('INP-41', '낮음', `할 것 마감일에 상한이 없다 (${d} 저장됨) — 학부모 목록에 영원히 남는다`, 'tools/redteam/inp-05-dates.mjs (todos)', `due_date=${r.data.due_date}`);
    await D.from('todos').delete().eq('id', r.data.id);
  }
}

console.log('--- invoices.period_ym ---');
for (const ym of ['2026-13', '2026-00', '0000-99', '2026-1', '2026-012']) {
  const r = await D.from('invoices').insert({ academy_id: ctx.A, student_id: ctx.student.id, period_ym: ym, amount: 1000, discount: 0, textbook: 0, total: 1000, due_date: '2026-09-05', status: 'issued' }).select('id, period_ym').single();
  console.log(JSON.stringify({ ym, ok: !r.error, err: r.error?.message?.slice(0, 60) }));
  if (r.error) { held(`invoices.period_ym ${ym} 거절`, r.error.message.slice(0, 60)); continue; }
  // 학부모가 읽는 RPC 로도 나오나
  const mine = await ctx.p.rpc('my_invoice', { p_ym: ym });
  F('INP-42', '중간', `invoices.period_ym 검사가 모양(^\\d{4}-\\d{2}$)뿐이라 존재하지 않는 달(${ym})이 청구서로 들어간다 — 학부모 화면에 "${ym.split('-')[1].replace(/^0/, '')}월 수강료" 로 뜬다`,
    'tools/redteam/inp-05-dates.mjs (invoices)',
    `직접 insert 성공(0003_billing.sql 29줄 check 는 자릿수만), my_invoice('${ym}') → ${mine.data?.length ?? 0}행`);
  await D.from('invoices').delete().eq('id', r.data.id);
}
{
  const r = await D.rpc('issue_invoices', { p_ym: '2026-13' });
  if (r.error) held("issue_invoices('2026-13') 는 to_date 에서 막힌다", r.error.message.slice(0, 80));
  else F('INP-43', '중간', "issue_invoices 가 13월 청구서를 만든다", 'tools/redteam/inp-05-dates.mjs', `${r.data}장`);
  const r2 = await D.rpc('remind_unpaid', { p_ym: '2026-13' });
  if (r2.error) held("remind_unpaid('2026-13') 거절", r2.error.message.slice(0, 60));
}

console.log('--- billing_rules.due_day ---');
for (const dd of [0, 29, 30, 31, 99, -1]) {
  const r = await D.from('billing_rules').upsert({ academy_id: ctx.A, billing_day: 1, due_day: dd, sibling_discount_pct: 0 }).select('due_day').maybeSingle();
  console.log(JSON.stringify({ due_day: dd, ok: !r.error, err: r.error?.message?.slice(0, 50) }));
  if (r.error) held(`billing_rules.due_day ${dd} 거절 (check 1~28)`, r.error.message.slice(0, 50));
  else F('INP-44', '중간', `due_day ${dd} 이 통과한다 (check between 1 and 28 이 안 걸림)`, 'tools/redteam/inp-05-dates.mjs', `upsert 성공`);
}
await admin.from('billing_rules').delete().eq('academy_id', ctx.A);

console.log('--- classes.schedule 시간 ---');
{
  const bad = [{ dow: 1, start: '24:00', end: '25:00' }, { dow: 3, start: '19:60', end: '21:00' }, { dow: 5, start: '7:00', end: '9:00' }, { dow: 9, start: 'x', end: null }, { dow: 2, start: '21:00', end: '19:00' }];
  const r = await D.from('classes').insert({ academy_id: ctx.A, name: '적대 시간표', schedule: bad }).select('id, schedule').single();
  if (r.error) held('이상한 schedule 거절', r.error.message.slice(0, 80));
  else {
    const cls = { id: r.data.id, schedule: r.data.schedule };
    const rows = bad.map(s => ({ ...s, startMin: hmToMin(s.start), endMin: hmToMin(s.end), fmt: fmtTime12(String(s.start)) }));
    console.log(JSON.stringify(rows));
    const dropped = rows.filter(x => x.startMin === null || x.endMin === null);
    F('INP-45', '중간', 'classes.schedule(jsonb) 에 아무 검사도 없다 — 24:00·25:00·19:60·dow 9 가 그대로 저장된다. hmToMin 이 null 을 주면 pickInitialClass·nextClassDays 가 그 시간대를 조용히 버려, 시간표는 있는데 "오늘 수업"에 안 잡히는 반이 생긴다',
      'tools/redteam/inp-05-dates.mjs (classes.schedule)',
      `저장된 ${bad.length}개 중 ${dropped.length}개가 hmToMin=null 로 버려짐: ${JSON.stringify(dropped.map(d => `${d.start}~${d.end}`))}`);
    // '7:00' 은 CSV 는 거절, hmToMin 은 통과 — 두 문지기가 다르다
    const csvOk = /^\d{2}:\d{2}$/.test('7:00');
    if (!csvOk && hmToMin('7:00') !== null) {
      F('INP-46', '낮음', "'7:00'(앞 0 없음) 을 CSV 파서는 거절하고 hmToMin·fmtTime12 는 받아들인다 — 같은 값의 문지기가 화면마다 다르다",
        'tools/redteam/inp-05-dates.mjs', `parseRosterCsv 정규식 ^\\d{2}:\\d{2}$ → 거절 · hmToMin('7:00')=${hmToMin('7:00')} · fmtTime12('7:00')='${fmtTime12('7:00')}'`);
    }
    // 끝이 시작보다 이른 시간대
    const now = pickInitialClass([cls], 2, 20 * 60);
    console.log('pickInitialClass(화 20:00, 21:00~19:00 반) →', now?.id === cls.id ? '이 반' : '없음');
    await D.from('classes').delete().eq('id', r.data.id);
  }
}

console.log('--- 순수 함수: 이상한 날짜·시간 표기 ---');
{
  const t = [['2026-02-30', fmtDateLong('2026-02-30')], ['2026-13-01', fmtDateLong('2026-13-01')], ['9999-12-31', fmtDateLong('9999-12-31')]];
  console.log(JSON.stringify(t));
  // 없는 날짜: 날짜 숫자는 그대로 두면서 요일만 Date 가 굴린 날(3월 2일)의 것을 쓴다
  if (/^2월 30일 \(.\)$/.test(fmtDateLong('2026-02-30'))) F('INP-47', '낮음', "fmtDateLong 이 없는 날짜를 그럴듯하게 보여 준다 — 날짜는 '2월 30일' 그대로 두고 요일만 Date 가 굴린 3월 2일의 것을 쓴다", 'tools/redteam/inp-05-dates.mjs', `fmtDateLong('2026-02-30') = '${fmtDateLong('2026-02-30')}' (실제 3월 2일의 요일)`);
  if (fmtDateLong('2026-13-01').includes('undefined')) F('INP-48', '낮음', "fmtDateLong('2026-13-01') 의 요일이 undefined 로 나온다", 'tools/redteam/inp-05-dates.mjs', `= '${fmtDateLong('2026-13-01')}'`);
  const tm = ['24:00', '25:00', '19:60', '7:00', '99:99'].map(x => [x, fmtTime12(x), hmToMin(x)]);
  console.log(JSON.stringify(tm));
  if (fmtTime12('19:60') === '오후 7:60') F('INP-49', '낮음', "fmtTime12 가 분을 검사하지 않는다 — '19:60' → '오후 7:60'", 'tools/redteam/inp-05-dates.mjs', `fmtTime12('19:60')='${fmtTime12('19:60')}' (hmToMin 은 null 을 준다 — 두 함수의 판단이 갈린다)`);
  if (fmtTime12('24:00') === '24:00' && hmToMin('24:00') === null) held("fmtTime12·hmToMin 모두 24:00 이상은 거른다", `fmtTime12('24:00')='${fmtTime12('24:00')}', hmToMin=null`);
}

report('inp-05 날짜·시간');
await teardown(ctx);
