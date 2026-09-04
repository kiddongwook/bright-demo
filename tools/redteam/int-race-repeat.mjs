// 무결성 점검 A2 — 한 번 만에 안 걸리는 경합(issue_invoices · create_invite · record_payment)을 여러 판 돌려 본다.
// 실행: node --env-file=.env.local tools/redteam/int-race-repeat.mjs
import { admin, setup, phone, ym, outcome, codes, F, report, cleanup } from './_int-common.mjs';

const log = (...a) => console.log(...a);
const ROUNDS = 8;
try {
  const { A, c1, d } = await setup('race');
  const MOM = phone();
  await d.rpc('roster_save_student', { sid: null, p_name: '첫째', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [MOM] });
  await d.rpc('roster_save_student', { sid: null, p_name: '둘째', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [MOM] });
  await d.from('billing_rules').upsert({ academy_id: A, billing_day: 1, due_day: 5, sibling_discount_pct: 0 });
  await d.from('fee_plans').insert({ academy_id: A, class_id: c1.id, name: '정규', amount: 100000 });

  // ---- issue_invoices: 판마다 다른 달 (unique 는 student_id, period_ym)
  let dup = 0, extraInv = 0, detail = [];
  for (let k = 1; k <= ROUNDS; k++) {
    const M = ym(k);
    const rs = (await Promise.all([1, 2, 3, 4, 5].map(() => d.rpc('issue_invoices', { p_ym: M })))).map(outcome);
    const n = (await admin.from('invoices').select('id').eq('academy_id', A).eq('period_ym', M)).data.length;
    const e = rs.filter(x => !x.ok);
    if (e.length) { dup++; detail.push(`${M}: ${codes(rs)}`); }
    if (n !== 2) { extraInv++; detail.push(`${M}: invoices=${n}`); }
  }
  log(`R1 issue_invoices x5, ${ROUNDS}판 -> 오류 난 판 ${dup}, 청구서 수 틀린 판 ${extraInv}`);
  if (detail.length) log('   ', detail.slice(0, 4).join(' / '));
  if (extraInv) F('INT-01', '높음', 'issue_invoices 동시 실행이 청구서를 중복 발행', detail.join(' / '));
  else if (dup) F('INT-01', '중간', 'issue_invoices 동시 실행 시 unique 위반 원문 오류가 원장 화면에 튄다 (not exists 선검사 → 경합). 데이터는 unique 가 지킨다', `${ROUNDS}판 중 ${dup}판에서 오류. 예: ${detail[0]}`);
  else F('INT-01', '정보', `issue_invoices 동시 5회 x ${ROUNDS}판 — 중복도 오류도 없음`, '유니크 인덱스 + 문장 단위 잠금으로 직렬화됨');

  // ---- create_invite: 판마다 3회 동시
  let bad = 0, worst = 1;
  for (let k = 1; k <= ROUNDS; k++) {
    await admin.from('invite_tokens').delete().eq('academy_id', A).eq('phone', MOM);
    await Promise.all([1, 2, 3].map(() => d.rpc('create_invite', { p_phone: MOM })));
    const live = (await admin.from('invite_tokens').select('id, expires_at, used_at').eq('academy_id', A).eq('phone', MOM)).data
      .filter(t => !t.used_at && new Date(t.expires_at) > new Date());
    if (live.length > 1) { bad++; worst = Math.max(worst, live.length); }
  }
  log(`R2 create_invite x3, ${ROUNDS}판 -> 살아 있는 토큰 2개 이상인 판 ${bad} (최대 ${worst}개)`);
  if (bad) F('INT-10', '중간', 'create_invite 의 "옛 토큰 만료 → 새 토큰" 이 원자적이지 않다 — 동시 발급이면 쓸 수 있는 초대 링크가 여러 개 남는다', `${ROUNDS}판 중 ${bad}판, 최대 ${worst}개 동시 유효. 주석·S13 계약은 "링크는 늘 마지막 것 하나만 산다"`);
  else F('INT-10', '정보', `create_invite 동시 3회 x ${ROUNDS}판 — 늘 하나만 살아남음`, 'update 가 행 잠금을 잡아 직렬화됨');

  // ---- record_payment: 판마다 새 청구서에 동시 3회 전액
  let over = 0, sample = '';
  for (let k = 1; k <= ROUNDS; k++) {
    const M = ym(k);
    const iv = (await admin.from('invoices').select('id, total').eq('academy_id', A).eq('period_ym', M)).data[0];
    if (!iv || !iv.total) continue;
    await Promise.all([1, 2, 3].map(() => d.rpc('record_payment', { p_invoice: iv.id, p_amount: iv.total, p_method: 'transfer' })));
    const s = (await admin.from('payments').select('amount').eq('invoice_id', iv.id)).data.reduce((a, p) => a + p.amount, 0);
    if (s > iv.total) { over++; sample = `${M}: 총액 ${iv.total} / 납부 합계 ${s}`; }
  }
  log(`R3 record_payment x3, ${ROUNDS}판 -> 과납된 판 ${over}`);
  if (over) F('INT-02', '중간', 'record_payment 는 과납을 전혀 막지 않는다 (동시 3회 = 3배 납부, status=paid)', `${ROUNDS}판 중 ${over}판. 예: ${sample}`);

  await report('경합 반복');
} catch (e) { console.error('FATAL', e); }
finally { await cleanup(); }
