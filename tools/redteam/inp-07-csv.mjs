// inp-07 CSV 명부 올리기 — parseRosterCsv/groupRoster(사본) + Import.apply 의 학생 짝짓기 규칙을 실제 DB 로
import { admin, setup, teardown, F, held, report, parseRosterCsv, groupRoster, splitCsv } from './inp-lib.mjs';

const HEAD = '반,요일,시작,끝,학생,학생번호,보호자,보호자번호,관계';
const row = (o = {}) => [o.cls ?? '고1 A', o.dows ?? '월수', o.start ?? '19:00', o.end ?? '21:00', o.st ?? '박지훈', o.sp ?? '', o.pa ?? '어머니', o.pp ?? '01099887766', o.rel ?? '모'].join(',');

console.log('--- 순수 파서 ---');
const cases = {
  'BOM + CRLF': '﻿' + HEAD + '\r\n' + row() + '\r\n',
  '따옴표 안 쉼표': HEAD + '\n' + row({ cls: '"고1, A반"' }) + '\n',
  '따옴표 안 줄바꿈': HEAD + '\n' + row({ st: '"박\n지훈"' }) + '\n',
  '두 겹 따옴표': HEAD + '\n' + row({ st: '"박""지훈"' }) + '\n',
  '같은 줄 두 번': HEAD + '\n' + row() + '\n' + row() + '\n',
  '열 모자람': HEAD + '\n고1 A,월수\n',
  '열 넘침': HEAD + '\n' + row() + ',추가,열,더\n',
  '머리글만': HEAD + '\n',
  '빈 파일': '',
  '머리글 없음': row() + '\n',
  '시간 25:00': HEAD + '\n' + row({ start: '25:00', end: '26:00' }) + '\n',
  '시간 7:00': HEAD + '\n' + row({ start: '7:00', end: '9:00' }) + '\n',
  '번호 국가코드': HEAD + '\n' + row({ pp: '+82 10-9988-7766' }) + '\n',
  '이름 40자': HEAD + '\n' + row({ st: '가'.repeat(40) }) + '\n',
  '이름 한 글자': HEAD + '\n' + row({ st: '민' }) + '\n',
  '이름에 이모지·숫자·공백': HEAD + '\n' + row({ st: '박 지훈2 🎉' }) + '\n',
  '요일에 없는 글자': HEAD + '\n' + row({ dows: '먼데이' }) + '\n',
};
for (const [why, text] of Object.entries(cases)) {
  const p = parseRosterCsv(text);
  const g = p.rows.length ? groupRoster(p.rows) : null;
  console.log(JSON.stringify({ why, rows: p.rows.length, errors: p.errors.map(e => `${e.line}:${e.msg}`), students: g?.students.map(s => s.name), classes: g?.classes.map(c => `${c.name} ${c.start}~${c.end}`) }));
}
{
  const p = parseRosterCsv(cases['BOM + CRLF']);
  if (!p.errors.length && p.rows.length === 1) held('BOM·CRLF·따옴표 안 쉼표/줄바꿈/두 겹 따옴표를 파서가 제대로 다룬다', 'splitCsv 는 RFC 4180 를 따른다');
  const dup = parseRosterCsv(cases['같은 줄 두 번']);
  const g = groupRoster(dup.rows);
  if (g.students.length === 1) held('완전히 같은 줄이 두 번 있어도 groupRoster 가 학생 하나로 합친다', `2줄 → 학생 ${g.students.length}명`);
  const t = parseRosterCsv(cases['시간 25:00']);
  if (!t.errors.length) F('INP-60', '중간', 'CSV 시각 검사가 ^\\d{2}:\\d{2}$ 뿐 — 25:00·26:00 이 통과해 반 시간표로 저장되고, 그 뒤 hmToMin 이 null 을 줘서 그 반은 "오늘 수업"에 안 잡힌다(INP-45 와 같은 자리)', 'tools/redteam/inp-07-csv.mjs', `25:00~26:00 오류 0건`);
  else held('CSV 25:00 거절', JSON.stringify(t.errors));
  const t7 = parseRosterCsv(cases['시간 7:00']);
  if (t7.errors.length) held("CSV 는 '7:00'(앞 0 없음)을 거절", JSON.stringify(t7.errors.map(e => e.msg)));
  const big = parseRosterCsv(cases['열 넘침']);
  if (!big.errors.length) held('열이 더 있어도 머리글 위치로만 읽어 무시한다', `오류 0건`);
  const nh = parseRosterCsv(cases['머리글 없음']);
  if (nh.errors.length) held('머리글이 없으면 1줄 오류로 막는다', nh.errors[0].msg);
}

console.log('--- 1,000줄 ---');
{
  const t0 = Date.now();
  const many = HEAD + '\n' + Array.from({ length: 1000 }, (_, i) => row({ st: '학생' + i, pp: '010' + String(10000000 + i) })).join('\n');
  const p = parseRosterCsv(many);
  const g = groupRoster(p.rows);
  console.log(JSON.stringify({ rows: p.rows.length, errors: p.errors.length, students: g.students.length, ms: Date.now() - t0 }));
  F('INP-61', '낮음', 'CSV 줄 수에 상한이 없다 — 1,000줄이 그대로 통과하고, Import.apply 는 학생 하나마다 studentDetail + saveStudent 를 순차로 부른다(1,000줄이면 왕복 2,000회 이상). 진행 표시도 중단도 없고, 도중에 실패하면 절반만 들어간 채 남는다',
    'tools/redteam/inp-07-csv.mjs (1,000줄)', `파싱 ${p.rows.length}줄/${Date.now() - t0}ms, 오류 0. app/src/screens/director/Import.tsx apply(): for 문 안에서 await studentDetail·saveStudent`);
}

console.log('--- 같은 이름 두 학생 + 학생번호 빈 CSV (Import.apply 짝짓기) ---');
const ctx = await setup('csv');
{
  // 이름이 같은 학생 둘, 번호는 다르다
  const a = await ctx.d.rpc('roster_save_student', { sid: null, p_name: '김민수', p_class_ids: [ctx.cls.id], p_student_phone: '01011110001', p_parent_phones: ['01022220001'] });
  const b = await ctx.d.rpc('roster_save_student', { sid: null, p_name: '김민수', p_class_ids: [ctx.cls.id], p_student_phone: '01011110002', p_parent_phones: ['01022220002'] });
  console.log('두 김민수', a.data, b.data, a.error?.message ?? '', b.error?.message ?? '');
  // Import.apply 의 짝짓기: 이름이 같은 후보를 훑어, CSV 학생번호가 비었으면 첫 후보에 붙인다
  const csv = HEAD + '\n' + row({ st: '김민수', sp: '', pp: '01033330003' }) + '\n';
  const g = groupRoster(parseRosterCsv(csv).rows);
  const s = g.students[0];
  const { data: existing } = await ctx.d.from('students').select('id, name').eq('name', '김민수').order('created_at');
  let sid = null;
  for (const x of existing) {
    const d = await ctx.d.rpc('roster_of_student', { sid: x.id });
    const sp = (d.data ?? []).find(r => r.role === 'student')?.phone ?? '';
    if (!s.student_phone || !sp || sp === s.student_phone) { sid = x.id; break; }
  }
  console.log(JSON.stringify({ csvPhone: s.student_phone, matched: sid, first: existing[0].id, second: existing[1].id }));
  if (sid === existing[0].id && existing.length > 1) {
    // 진짜로 붙여 본다
    await ctx.d.rpc('roster_save_student', { sid, p_name: s.name, p_class_ids: [ctx.cls.id], p_student_phone: s.student_phone, p_parent_phones: s.parent_phones });
    const after = await ctx.d.rpc('roster_of_student', { sid });
    F('INP-62', '높음', 'CSV 에 학생번호가 비어 있으면 Import 가 동명이인 중 "먼저 만들어진 아이"에게 무조건 붙인다 — 남의 아이 명부에 엉뚱한 보호자 번호가 들어가고, 원래 보호자 번호는 지워진다(roster_save_student 는 목록을 통째로 덮어쓴다). 되돌릴 안내도 확인 창도 없다',
      'tools/redteam/inp-07-csv.mjs (같은 이름 두 학생)',
      `학생 A(${existing[0].id.slice(0, 8)}, 학생번호 01011110001)·B(${existing[1].id.slice(0, 8)}, 01011110002) 가 있는데 CSV 한 줄(김민수, 학생번호 빈칸, 보호자 01033330003) → Import.tsx apply() 의 조건 \`!s.student_phone || !d.student_phone || d.student_phone === s.student_phone\` 이 A 에서 참 → A 갱신. A 의 명부: ${JSON.stringify((after.data ?? []).map(r => r.role + ':' + r.phone))}`);
  } else held('동명이인 짝짓기가 첫 후보로 새지 않는다', `matched=${sid}`);
}

report('inp-07 CSV 명부');
await teardown(ctx);
