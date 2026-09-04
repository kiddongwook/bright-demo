// 무결성 점검 C — 값이 서로 안 맞는 자리(청구액↔납부합계, 연체 뒤집기, 휴원일 우선순위, 줄에 선 알림).
// 실행: node --env-file=.env.local tools/redteam/int-consistency.mjs
import { admin, setup, mkClient, phone, kst, ym, outcome, F, report, cleanup } from './_int-common.mjs';

const YM = ym();
const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  const { A, c1, dirId, d } = await setup('cons');
  await d.from('billing_rules').upsert({ academy_id: A, billing_day: 1, due_day: 5, sibling_discount_pct: 0, bank_info: '점검계좌' });
  await d.from('fee_plans').insert({ academy_id: A, class_id: c1.id, name: '정규', amount: 100000 });
  const mk = async (name, parents = []) => (await d.rpc('roster_save_student', { sid: null, p_name: name, p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: parents })).data;
  const S1 = await mk('갑'), S2 = await mk('을'), S3 = await mk('병'), S4 = await mk('정');
  await d.rpc('issue_invoices', { p_ym: YM });
  const invOf = async sid => (await admin.from('invoices').select('*').eq('student_id', sid).eq('period_ym', YM).single()).data;

  // ---------- D1. 낸 돈보다 낮게 금액을 고치면
  let iv = await invOf(S1);
  await d.rpc('record_payment', { p_invoice: iv.id, p_amount: 100000, p_method: 'transfer' });
  await d.rpc('set_invoice_amount', { p_invoice: iv.id, p_amount: 40000, p_discount: 0, p_textbook: 0 });
  iv = await invOf(S1);
  const paid1 = (await admin.from('payments').select('amount').eq('invoice_id', iv.id)).data.reduce((a, p) => a + p.amount, 0);
  log('D1 100,000 납부 뒤 총액 40,000 으로 하향 ->', JSON.stringify({ total: iv.total, paid: paid1, status: iv.status }));
  if (paid1 > iv.total) F('INT-30', '중간', '청구액을 낸 돈보다 낮게 고쳐도 상태는 paid 그대로고, 돌려줄 돈(과납액)을 어디에도 적지 않는다', `total=${iv.total}, 납부합계=${paid1}, status=${iv.status}. recalc_invoice 는 s >= total 이면 paid 라 초과분을 보지 않는다`);

  // 할인이 금액보다 크면 총액이 음수
  const r1 = outcome(await d.rpc('set_invoice_amount', { p_invoice: iv.id, p_amount: 10000, p_discount: 50000, p_textbook: 0 }));
  iv = await invOf(S1);
  log('D1b amount=10,000 discount=50,000 ->', r1.ok ? 'OK' : r1.msg, '| total=', iv.total, 'status=', iv.status);
  if (r1.ok && iv.total < 0) F('INT-31', '낮음', 'set_invoice_amount 는 음수 총액을 만든다 (각 칸의 음수만 막고 합계는 안 본다)', `amount 10,000 - discount 50,000 → total=${iv.total}, status=${iv.status}. 학부모 카드에 -40,000원이 뜬다`);

  // ---------- D2. 부분 납부 + 납기 지남 → 연체로 안 뒤집힌다
  const iv2 = await invOf(S2);
  await d.rpc('record_payment', { p_invoice: iv2.id, p_amount: 30000, p_method: 'cash' });
  await admin.from('invoices').update({ due_date: kst(-3) }).eq('id', iv2.id);
  const ro = await d.rpc('refresh_overdue');
  const iv2b = await invOf(S2);
  log('D2 부분 납부 + 납기 3일 지남 -> refresh_overdue', ro.data, '| status=', iv2b.status);
  if (iv2b.status === 'partial') F('INT-32', '중간', '부분 납부한 청구서는 납기가 지나도 연체로 표시되지 않는다 (refresh_overdue 는 status=issued 만 뒤집는다). 미납 안내(remind_unpaid)는 나가는데 화면 배지는 "부분 납부" 로 남아 원장이 못 알아본다', `납기 ${kst(-3)}, 납부 30,000/100,000 → status=${iv2b.status} (기대: overdue). housekeeping() 의 야간 일괄도 같은 조건이라 영원히 안 바뀐다`);

  // ---------- D3. refresh_overdue 의 KST 경계
  const iv3 = await invOf(S3);
  await admin.from('invoices').update({ due_date: kst(0), status: 'issued' }).eq('id', iv3.id);
  await d.rpc('refresh_overdue');
  const todayStatus = (await invOf(S3)).status;
  await admin.from('invoices').update({ due_date: kst(-1), status: 'issued' }).eq('id', iv3.id);
  await d.rpc('refresh_overdue');
  const ydayStatus = (await invOf(S3)).status;
  log('D3 납기=오늘(KST) ->', todayStatus, '| 납기=어제 ->', ydayStatus);
  if (todayStatus === 'issued' && ydayStatus === 'overdue') log('   -> KST 자정 경계 정확 (due_date < (now() at time zone Asia/Seoul)::date)');
  else F('INT-33', '중간', 'refresh_overdue 의 날짜 경계가 KST 와 어긋난다', `납기=오늘 → ${todayStatus} (기대 issued), 납기=어제 → ${ydayStatus} (기대 overdue)`);

  // ---------- D4. 낸 청구서를 면제하면 납부 기록은?
  const iv4 = await invOf(S4);
  await d.rpc('record_payment', { p_invoice: iv4.id, p_amount: 100000, p_method: 'transfer' });
  await d.rpc('void_invoice', { p_invoice: iv4.id, p_memo: '착오' });
  const iv4b = await invOf(S4);
  const pay4 = (await admin.from('payments').select('amount').eq('invoice_id', iv4.id)).data.reduce((a, p) => a + p.amount, 0);
  log('D4 전액 납부 뒤 면제 -> status=', iv4b.status, 'total=', iv4b.total, '| payments 합계=', pay4);
  if (iv4b.status === 'void' && pay4 > 0) F('INT-34', '낮음', '전액 낸 청구서를 면제하면 청구는 void 로 사라지는데 납부 기록 10만원은 남아, 그 달 "받은 돈" 집계와 청구서 목록이 어긋난다', `status=void, total=${iv4b.total}, payments 합계=${pay4}. recalc_invoice 는 void 를 그냥 return 하고 나간다`);
  // 면제된 청구서에 금액을 고치면 되살아난다
  const r2 = outcome(await d.rpc('set_invoice_amount', { p_invoice: iv4.id, p_amount: 50000, p_discount: 0, p_textbook: 0 }));
  const iv4c = await invOf(S4);
  log('D4b 면제된 청구서에 set_invoice_amount ->', r2.ok ? 'OK' : r2.msg, '| status=', iv4c.status);

  // ---------- D5. 휴원일: 반 A 와 전체(null) 가 같이 있을 때
  const DD = kst(20);
  await d.from('calendar').insert({ academy_id: A, date: DD, kind: 'closed', note: '전체 휴원', class_id: null });
  const rBoth = outcome(await d.from('calendar').insert({ academy_id: A, date: DD, kind: 'closed', note: '반 A 휴원', class_id: c1.id }));
  const rows = (await admin.from('calendar').select('class_id, note').eq('academy_id', A).eq('date', DD)).data;
  // 같은 날 '특강'(special)도 같이
  await d.from('calendar').insert({ academy_id: A, date: DD, kind: 'special', note: '그날 특강 함', class_id: null });
  const all = (await admin.from('calendar').select('kind, class_id, note').eq('academy_id', A).eq('date', DD)).data;
  log('D5 같은 날 휴원 행:', JSON.stringify(rows), '| 같은 날 전체:', JSON.stringify(all.map(x => [x.kind, x.class_id ? '반' : '전체'])));
  if (rows.length === 2) F('INT-35', '낮음', '같은 날에 "전체 휴원" 과 "반 A 휴원" 이 나란히 저장된다 (unique 에 class_id 가 들어가 서로 다른 행). closedFor 는 둘을 합집합으로만 보므로 결과는 같지만, 원장 휴원일 목록에는 같은 날이 두 줄로 보이고 하나만 지우면 여전히 쉰다', `${DD} 에 ${rows.length}행: ${rows.map(x => (x.class_id ? '반A' : '전체') + '/' + x.note).join(', ')}`);
  if (all.some(x => x.kind === 'special')) F('INT-36', '낮음', '같은 날 closed 와 special 이 공존해도 우선순위 규칙이 없다 — closedFor()/nextClassDaysFor() 는 closed 만 보고 특강을 무시하므로 "휴원인데 특강" 인 날이 학부모 화면에서 그냥 쉬는 날로 보인다', `${DD}: ${all.map(x => x.kind).join('+')} (코드 읽기 — app/src/lib/api.ts closedFor 는 kind='closed' 합집합만)`);

  // ---------- D6. 할 것을 지우면 체크 기록은
  const todo = (await admin.from('todos').insert({ academy_id: A, class_id: c1.id, kind: 'homework', title: '단어', due_date: kst(2) }).select().single()).data;
  await admin.from('todo_done').insert([{ todo_id: todo.id, student_id: S1 }, { todo_id: todo.id, student_id: S2 }]);
  await admin.from('todos').delete().eq('id', todo.id);
  const doneLeft = (await admin.from('todo_done').select('todo_id').eq('todo_id', todo.id)).data.length;
  log('D6 할 것 삭제 -> todo_done 남음', doneLeft);
  if (doneLeft) F('INT-37', '중간', 'todos 를 지워도 todo_done 이 남아 고아 행이 된다', `todo_done ${doneLeft}행`);
  else log('   -> cascade 정상');

  // ---------- D7. 공지를 지우면 그 공지로 만든 할 것·알림·줄은
  const nt = (await d.from('notices').insert({ academy_id: A, author_id: dirId, title: '지울 공지', body: '' }).select().single()).data;
  await admin.from('todos').insert({ academy_id: A, class_id: c1.id, kind: 'homework', title: '공지에 딸린 할 것', due_date: kst(2), notice_id: nt.id });
  await admin.from('notifications').insert({ academy_id: A, user_id: dirId, kind: 'notice', title: '공지 알림', body: '', link: 'notice-view:' + nt.id });
  const delN = outcome(await d.from('notices').delete().eq('id', nt.id).select());
  const tdo = (await admin.from('todos').select('notice_id').eq('academy_id', A).is('notice_id', null)).data.length;
  const orphanNotif = (await admin.from('notifications').select('id, link').eq('academy_id', A).like('link', 'notice-view:' + nt.id)).data;
  const orphanOb = (await admin.from('outbox').select('id, link_ref, template_code, params').eq('academy_id', A).eq('link_ref', nt.id)).data;
  log('D7 공지 삭제 ->', delN.ok ? 'OK' : delN.msg, '| todos.notice_id set null', tdo, '| 남은 알림', orphanNotif.length, '| 남은 줄', orphanOb.length);
  if (orphanNotif.length || orphanOb.length) F('INT-38', '중간', '공지를 지워도 그 공지를 가리키는 알림·발송 줄이 남는다 — 종에서 누르면 없는 공지로 가고, 아직 안 보낸 줄은 지워진 공지를 알리며 나간다(문구는 트리거 때 박제된 제목 그대로)', `삭제 뒤 notifications ${orphanNotif.length}행(link=notice-view:${nt.id.slice(0, 8)}…), outbox ${orphanOb.length}행(link_ref 가 없는 공지). notifications.link 는 문자열, outbox.link_ref 는 FK 없는 uuid 라 아무도 안 치운다`);

  // ---------- D8. 줄에 선 알림 vs 퇴원 (알림톡 경로)
  const PM = phone();
  const SX = await mk('나갈아이', [PM]);
  const px = await mkClient(A, 'parent', { phone: PM, studentId: SX });
  await admin.from('guardians').insert({ student_id: SX, user_id: px.uid });
  await admin.from('attendance').insert({ academy_id: A, student_id: SX, class_id: c1.id, date: kst(-6), status: 'absent', marked_by: dirId });
  const ob0 = (await admin.from('outbox').select('id, status').eq('to_user_id', px.uid)).data;
  const lt0 = (await admin.from('link_tokens').select('id').eq('user_id', px.uid)).data.length;
  await d.rpc('student_leave', { sid: SX });
  log('D8 결석 알림이 줄에 선 채 퇴원 -> 줄', ob0.length, '행, 퇴원 직후 link_tokens', lt0);
  for (let i = 0; i < 14; i++) {                       // 1분 틱을 최대 ~140초 기다린다
    const now = (await admin.from('outbox').select('id, status, sent_at').eq('to_user_id', px.uid)).data;
    if (now.some(x => x.status !== 'queued')) {
      const lt1 = (await admin.from('link_tokens').select('id, expires_at, view').eq('user_id', px.uid)).data;
      log(`   -> 줄 상태 ${now.map(x => x.status).join(',')} | 퇴원한 학부모 앞으로 발급된 link_tokens ${lt1.length}개`);
      if (lt1.length > lt0) F('INT-39', '중간', '퇴원 직전에 줄에 선 알림톡이 퇴원 뒤에 그대로 나간다 — 이미 관계가 끊긴 학부모가 아이 결석 알림을 받고, 발송기는 그 사람 앞으로 7일짜리 로그인 링크 토큰까지 새로 만든다', `student_leave 뒤 outbox status=${now.map(x => x.status).join(',')}, link_tokens ${lt0}→${lt1.length}개(만료 ${lt1[lt1.length - 1]?.expires_at?.slice(0, 10)}). outbox_claim·outbox-send 는 to_user_id 의 소속을 다시 보지 않는다. 다만 토큰 자체는 무해하다 — link-login 이 그 학원 소속이 없으면 401 로 막는다(코드 읽기)`);
      break;
    }
    await sleep(10000);
  }

  await report('일관성');
} catch (e) { console.error('FATAL', e); }
finally { await cleanup(); }
