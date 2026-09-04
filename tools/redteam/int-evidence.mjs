// 무결성 점검 보강 — 추정으로 적을 뻔한 세 가지를 직접 받아 적는다.
//  (1) issue_invoices 동시 실행 오류의 전체 문구  (2) 반 삭제를 막는 FK 이름 전체  (3) 반이 지워진 요금제가 공통 요금제로 쓰이는지
// 실행: node --env-file=.env.local tools/redteam/int-evidence.mjs
import { admin, setup, ym, outcome, F, report, cleanup } from './_int-common.mjs';

const log = (...a) => console.log(...a);
try {
  const { A, c1, c2, dirId, d } = await setup('evid');
  await d.from('billing_rules').upsert({ academy_id: A, billing_day: 1, due_day: 5, sibling_discount_pct: 0 });
  await d.from('fee_plans').insert({ academy_id: A, class_id: c1.id, name: '반A 정규', amount: 100000 });
  const mk = async (name, classes) => (await d.rpc('roster_save_student', { sid: null, p_name: name, p_class_ids: classes, p_student_phone: '', p_parent_phones: [] })).data;
  await mk('갑', [c1.id]); await mk('을', [c1.id]);

  // (1) issue_invoices 동시 실행 오류 전문
  let msg = '';
  for (let k = 1; k <= 8 && !msg; k++) {
    const M = ym(k);
    const rs = (await Promise.all([1, 2, 3, 4, 5].map(() => d.rpc('issue_invoices', { p_ym: M })))).map(outcome);
    const e = rs.find(x => !x.ok);
    if (e) msg = `${e.code}: ${e.msg}`;
  }
  log('E1 issue_invoices 동시 오류 전문 ->', msg || '(8판 안에 안 나옴)');
  if (msg) F('INT-01', '중간', 'issue_invoices 동시 실행 오류 문구 (원장 화면에 그대로 뜬다)', msg);

  // (2) 반 삭제를 막는 FK 이름 (하나씩 치우면서 무엇이 다음으로 막는지)
  await mk('병', [c2.id]);
  await d.from('fee_plans').insert({ academy_id: A, class_id: c2.id, name: '반B 정규', amount: 90000 });
  await admin.from('calendar').insert({ academy_id: A, date: '2027-03-03', kind: 'closed', note: '반 휴원', class_id: c2.id });
  await d.from('notices').insert({ academy_id: A, author_id: dirId, title: '반 공지', body: '', target_class_id: c2.id });
  const blockers = [];
  for (let i = 0; i < 4; i++) {
    const r = outcome(await d.from('classes').delete().eq('id', c2.id).select());
    if (r.ok) { blockers.push('삭제 성공'); break; }
    blockers.push(r.msg);
    if (r.msg.includes('notices')) await admin.from('notices').delete().eq('target_class_id', c2.id);
    else if (r.msg.includes('calendar')) await admin.from('calendar').delete().eq('class_id', c2.id);
    else break;
  }
  log('E2 반 삭제를 막는 것들 ->'); blockers.forEach(b => log('   ', b));
  F('INT-22', '중간', '반 삭제를 막는 FK 전문', blockers.join(' || '));

  // (3) 반이 지워진 요금제가 "학원 공통 요금제" 로 쓰이는가
  const orphanPlans = (await admin.from('fee_plans').select('id, name, amount, class_id').eq('academy_id', A).is('class_id', null)).data;
  log('E3 class_id=null 이 된 요금제:', JSON.stringify(orphanPlans));
  const S = await mk('반없는아이', []);                       // 어떤 반에도 안 든 학생
  const M3 = ym(11);
  await d.rpc('issue_invoices', { p_ym: M3 });
  const iv = (await admin.from('invoices').select('amount, total').eq('student_id', S).eq('period_ym', M3).maybeSingle()).data;
  log('E3 반 없는 학생의 청구액 ->', JSON.stringify(iv));
  if (iv && orphanPlans.some(p => p.amount === iv.amount)) F('INT-23', '중간', '반을 지우면 그 반 요금제가 class_id=null 로 남아 공통 요금제가 되고, issue_invoices 의 폴백이 그 금액을 반 없는 학생에게 매긴다', `지워진 반 B 요금제 ${JSON.stringify(orphanPlans.map(p => [p.name, p.amount]))} → 어떤 반에도 안 든 학생 청구액 amount=${iv.amount}, total=${iv.total}`);
  else if (iv) log('   -> 폴백에 안 걸림 (amount=' + iv.amount + ')');

  await report('보강 증거');
} catch (e) { console.error('FATAL', e); }
finally { await cleanup(); }
