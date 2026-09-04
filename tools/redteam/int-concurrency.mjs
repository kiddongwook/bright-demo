// 무결성 점검 A — 같은 요청을 동시에 두 번 이상. 실행: node --env-file=.env.local tools/redteam/int-concurrency.mjs
import { admin, setup, mkClient, phone, kst, ym, outcome, codes, F, report, cleanup } from './_int-common.mjs';

const YM = ym();
const log = (...a) => console.log(...a);
try {
  const { A, c1, dirId, d } = await setup('conc');

  // ---------- 준비: 형제 둘 + 요금제 + 규칙
  const MOM = phone();
  const S1 = (await d.rpc('roster_save_student', { sid: null, p_name: '첫째', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [MOM] })).data;
  await d.rpc('roster_save_student', { sid: null, p_name: '둘째', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [MOM] });
  await d.from('billing_rules').upsert({ academy_id: A, billing_day: 1, due_day: 5, sibling_discount_pct: 10, bank_info: '점검계좌' });
  await d.from('fee_plans').insert({ academy_id: A, class_id: c1.id, name: '정규', amount: 100000 });

  // ---------- C1. issue_invoices(ym) 5회 동시
  let rs = (await Promise.all([1, 2, 3, 4, 5].map(() => d.rpc('issue_invoices', { p_ym: YM })))).map(outcome);
  let inv = (await admin.from('invoices').select('id, student_id, total, status').eq('academy_id', A).eq('period_ym', YM)).data;
  log('C1 issue_invoices x5 ->', codes(rs), '| invoices=', inv.length);
  const okCount = rs.filter(x => x.ok).length, dupErr = rs.filter(x => !x.ok && x.code === '23505').length;
  if (inv.length !== 2) F('INT-01', '높음', 'issue_invoices 동시 5회가 청구서를 중복 발행', `invoices=${inv.length} (기대 2)`);
  else if (dupErr > 0) F('INT-01', '중간', 'issue_invoices 동시 실행 시 unique 위반이 그대로 원장 화면에 튄다 (not exists 선검사 → 경합)', `성공 ${okCount}, 23505 ${dupErr}건, invoices=${inv.length}(정확). 오류 원문: ${rs.find(x => !x.ok)?.msg}`);
  else F('INT-01', '정보', 'issue_invoices 동시 5회 — 직렬화되어 오류 없음', `결과 ${codes(rs)}, invoices=${inv.length}`);

  // ---------- C2. record_payment 3회 동시 (한 청구서, 각 전액)
  const one = inv[0]; const TOT = one.total;
  rs = (await Promise.all([1, 2, 3].map(() => d.rpc('record_payment', { p_invoice: one.id, p_amount: TOT, p_method: 'transfer' })))).map(outcome);
  let pays = (await admin.from('payments').select('amount').eq('invoice_id', one.id)).data;
  let sum = pays.reduce((a, p) => a + p.amount, 0);
  let st = (await admin.from('invoices').select('status, paid_at').eq('id', one.id).single()).data;
  log('C2 record_payment x3 ->', codes(rs), '| payments=', pays.length, 'sum=', sum, 'total=', TOT, 'status=', st.status);
  if (sum > TOT) F('INT-02', '중간', 'record_payment 에 과납 방어가 없다 — 동시/반복 호출이 청구액을 넘는 납부를 그대로 적는다', `총액 ${TOT}원 청구서에 납부 ${pays.length}건 합계 ${sum}원 (초과 ${sum - TOT}원), status=${st.status}`);

  // 단발 과납도 막지 않는지
  const two = inv[1];
  let r = await d.rpc('record_payment', { p_invoice: two.id, p_amount: two.total * 10, p_method: 'cash' });
  let st2 = (await admin.from('invoices').select('status').eq('id', two.id).single()).data;
  log('C2b 단발 10배 과납 ->', r.error?.message ?? 'OK', 'status=', st2.status);
  if (!r.error) F('INT-03', '중간', '단발 record_payment 도 총액의 10배를 받아들인다 (금액 상한·과납 경고 없음)', `총액 ${two.total} → 납부 ${two.total * 10} 성공, status=${st2.status}`);

  // 학부모가 보는 금액
  const par = await mkClient(A, 'parent', { studentId: one.student_id });
  await admin.from('guardians').insert({ student_id: one.student_id, user_id: par.uid });
  const mine = (await par.c.rpc('my_invoice', { p_ym: YM })).data?.[0];
  log('C2c my_invoice(학부모) ->', JSON.stringify(mine && { total: mine.total, paid: mine.paid, status: mine.status }));
  if (mine && mine.paid > mine.total) F('INT-04', '중간', '학부모 수강료 카드가 낸 돈 > 청구액을 그대로 보여 준다 (잔액·환불 안내 없음)', `total=${mine.total}, paid=${mine.paid}, status=${mine.status}`);

  // ---------- C3. addCalendarMany 두 탭 동시 (겹치는 기간)
  const D = n => kst(30 + n);
  const many = (dates) => d.from('calendar').insert(dates.map(date => ({ academy_id: A, date, kind: 'closed', note: '휴원', class_id: null })));
  rs = (await Promise.all([many([D(1), D(2), D(3)]), many([D(2), D(3), D(4)])])).map(outcome);
  let cal = (await admin.from('calendar').select('date').eq('academy_id', A).eq('kind', 'closed')).data.map(x => x.date).sort();
  log('C3 addCalendarMany 겹침 ->', codes(rs), '| calendar=', cal.join(','));
  if (!cal.includes(D(4))) F('INT-05', '중간', 'addCalendarMany 는 한 statement 라, 겹치는 날 하나 때문에 그 탭이 넣으려던 새 날짜까지 전부 없던 일이 된다', `탭1 [${D(1)},${D(2)},${D(3)}] · 탭2 [${D(2)},${D(3)},${D(4)}] 동시 → 저장된 날 ${cal.join(',')} (${D(4)} 누락). 결과 ${codes(rs)}`);

  // addCalendar 찾고-고치기 경합
  const DX = kst(45);
  const addCal = async () => {
    const ex = await d.from('calendar').select('id').eq('date', DX).eq('kind', 'closed').is('class_id', null).maybeSingle();
    return ex.data ? d.from('calendar').update({ note: 'x' }).eq('id', ex.data.id) : d.from('calendar').insert({ academy_id: A, date: DX, kind: 'closed', note: 'x', class_id: null });
  };
  rs = (await Promise.all([addCal(), addCal()])).map(outcome);
  const nx = (await admin.from('calendar').select('id').eq('academy_id', A).eq('date', DX)).data.length;
  log('C3b addCalendar 동시 ->', codes(rs), '| rows=', nx);
  if (rs.some(x => !x.ok)) F('INT-06', '낮음', 'addCalendar 의 찾고-없으면-넣기 는 원자적이지 않다 — 동시 두 번이면 한쪽이 23505 원문 오류', `rows=${nx}(중복은 unique 가 막음), 결과 ${codes(rs)}`);

  // ---------- C4. saveAttendance upsert 3회 동시 (같은 학생·날짜·상태)
  const DATE = kst(-3);
  const sa = (status) => d.from('attendance').upsert([{ academy_id: A, class_id: c1.id, date: DATE, student_id: S1, status, marked_by: dirId }], { onConflict: 'student_id,class_id,date' });
  rs = (await Promise.all([sa('late'), sa('late'), sa('late')])).map(outcome);
  let att = (await admin.from('attendance').select('id, status').eq('student_id', S1).eq('date', DATE)).data;
  let nt = (await admin.from('notifications').select('id, title').eq('academy_id', A).eq('kind', 'attendance')).data;
  let ob = (await admin.from('outbox').select('id').eq('academy_id', A)).data;
  log('C4 saveAttendance x3 ->', codes(rs), '| attendance=', att.length, 'notifications=', nt.length, 'outbox=', ob.length);
  if (att.length !== 1) F('INT-07', '높음', '같은 학생·반·날짜 출결이 여러 행', `attendance=${att.length}`);
  if (nt.length > 1) F('INT-08', '중간', '같은 상태를 동시에 세 번 저장했는데 학부모 알림이 여러 번', `notifications=${nt.length}: ${nt.map(x => x.title).join(' / ')}`);
  else log('   -> 알림 1건 (트리거의 old.status is distinct 조건이 막음)');

  // 상태를 왔다 갔다 하면?
  await sa('present'); await sa('late');
  nt = (await admin.from('notifications').select('id').eq('academy_id', A).eq('kind', 'attendance')).data;
  ob = (await admin.from('outbox').select('id').eq('academy_id', A)).data;
  log('C4b 지각→출석→지각 -> notifications=', nt.length, 'outbox=', ob.length);
  if (nt.length >= 2) F('INT-09', '낮음', '출결 상태를 되돌렸다가 다시 넣으면 같은 내용 알림이 다시 간다 (멱등키가 notification.id 라 트리거 재발화만 막고 사건 중복은 못 막는다)', `상태 3번 저장 → notifications=${nt.length}, outbox=${ob.length}`);

  // ---------- C5. create_invite 3회 동시 (한 번호)
  rs = (await Promise.all([1, 2, 3].map(() => d.rpc('create_invite', { p_phone: MOM })))).map(outcome);
  let live = (await admin.from('invite_tokens').select('id, expires_at, used_at').eq('academy_id', A).eq('phone', MOM)).data
    .filter(t => !t.used_at && new Date(t.expires_at) > new Date());
  log('C5 create_invite x3 ->', codes(rs), '| 살아 있는 토큰=', live.length);
  if (live.length > 1) F('INT-10', '중간', 'create_invite 의 "옛 토큰 만료 → 새 토큰" 이 원자적이지 않다 — 동시 발급이면 살아 있는 링크가 여러 개 남는다', `동시 3회 → 사용 안 한 유효 토큰 ${live.length}개. 주석·S13 계약은 "링크는 늘 마지막 것 하나만 산다"`);
  await d.rpc('create_invite', { p_phone: MOM });
  const live2 = (await admin.from('invite_tokens').select('id, expires_at, used_at').eq('academy_id', A).eq('phone', MOM)).data.filter(t => !t.used_at && new Date(t.expires_at) > new Date());
  log('C5b 순차 1회 더 -> 살아 있는 토큰=', live2.length);
  if (live2.length > 1) F('INT-10b', '중간', '순차 발급조차 앞선 동시 발급으로 생긴 여분 토큰을 정리하지 못한다', `순차 1회 뒤에도 유효 토큰 ${live2.length}개`);

  // ---------- C6. notifications → outbox 멱등
  const before = (await admin.from('outbox').select('id').eq('academy_id', A)).data.length;
  const nrow = { academy_id: A, user_id: par.uid, kind: 'notice', title: '동일 알림', body: '', link: 'notice-view:' };
  await admin.from('notifications').insert(nrow);
  await admin.from('notifications').insert(nrow);
  const after = (await admin.from('outbox').select('id').eq('academy_id', A)).data;
  log('C6 같은 내용 알림 2줄 -> outbox 증가', after.length - before);
  if (after.length - before === 2) F('INT-11', '낮음', 'outbox 멱등키가 notification.id 라, 내용이 같은 알림이 두 줄이면 카톡/푸시도 두 번 나간다', `같은 (user, kind, link, title) 알림 2행 → outbox +${after.length - before}`);

  // ---------- C7. remind_unpaid 2회 동시
  await d.rpc('roster_save_student', { sid: null, p_name: '셋째', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [par.phone] });
  await d.rpc('issue_invoices', { p_ym: YM });
  const bn = (await admin.from('notifications').select('id').eq('academy_id', A).eq('kind', 'billing')).data.length;
  rs = (await Promise.all([d.rpc('remind_unpaid', { p_ym: YM }), d.rpc('remind_unpaid', { p_ym: YM })])).map(outcome);
  const an = (await admin.from('notifications').select('id, user_id, title').eq('academy_id', A).eq('kind', 'billing')).data;
  log('C7 remind_unpaid x2 ->', codes(rs), '| billing 알림 증가', an.length - bn);
  const perKey = {};
  for (const x of an) { const k = x.user_id + '|' + x.title; perKey[k] = (perKey[k] ?? 0) + 1; }
  const dupKeys = Object.entries(perKey).filter(([, n]) => n > 1);
  if (dupKeys.length) F('INT-12', '중간', 'remind_unpaid 는 reminded_at 을 읽고-쓰기라 동시 두 번이면 같은 학부모에게 안내가 두 번 간다 (20시간 규칙 무력화)', `동시 2회 반환 ${codes(rs)} → 같은 사람·같은 문구 중복 ${dupKeys.length}건 (최대 ${Math.max(...dupKeys.map(([, n]) => n))}회)`);
  else log('   -> 중복 없음');

  await report('동시성');
} catch (e) { console.error('FATAL', e); }
finally { await cleanup(); }
