// 무결성 점검 B — 연쇄 삭제·고아 행. 실행: node --env-file=.env.local tools/redteam/int-cascade.mjs
import { admin, setup, mkClient, mkUser, phone, kst, ym, outcome, F, report, cleanup } from './_int-common.mjs';

const YM = ym();
const log = (...a) => console.log(...a);
const cnt = async (t, col, v) => ((await admin.from(t).select('*', { count: 'exact', head: true }).eq(col, v)).count ?? 0);
try {
  const { A, c1, c2, dirId, d } = await setup('casc');

  // ================= B1. 퇴원 연쇄 =================
  const MOM = phone(), STU = phone();
  const S1 = (await d.rpc('roster_save_student', { sid: null, p_name: '퇴원생', p_class_ids: [c1.id], p_student_phone: STU, p_parent_phones: [MOM] })).data;
  const mom = await mkClient(A, 'parent', { phone: MOM, studentId: S1 });
  await admin.from('guardians').insert({ student_id: S1, user_id: mom.uid });
  // 딸린 데이터 한 벌
  await d.from('billing_rules').upsert({ academy_id: A, billing_day: 1, due_day: 5, sibling_discount_pct: 0 });
  await d.from('fee_plans').insert({ academy_id: A, class_id: c1.id, name: '정규', amount: 100000 });
  await d.rpc('issue_invoices', { p_ym: YM });
  const iv = (await admin.from('invoices').select('id, total').eq('student_id', S1).single()).data;
  await d.rpc('record_payment', { p_invoice: iv.id, p_amount: 50000, p_method: 'cash' });
  await admin.from('attendance').insert({ academy_id: A, student_id: S1, class_id: c1.id, date: kst(-5), status: 'late', marked_by: dirId });
  await admin.from('absence_requests').insert({ academy_id: A, student_id: S1, requested_by: mom.uid, date: kst(-2), reason: '병원' });
  const todo = (await admin.from('todos').insert({ academy_id: A, class_id: c1.id, kind: 'homework', title: '단어', due_date: kst(1) }).select().single()).data;
  await admin.from('todo_done').insert({ todo_id: todo.id, student_id: S1 });
  await admin.from('push_subscriptions').insert({ user_id: mom.uid, endpoint: 'https://example.invalid/rt-int/' + Math.random(), p256dh: 'x', auth: 'y' });
  await d.rpc('create_invite', { p_phone: MOM });
  await admin.from('link_tokens').insert({ academy_id: A, user_id: mom.uid, view: 'child', token_hash: 'rtint' + Math.random(), expires_at: new Date(Date.now() + 86400e3).toISOString() });
  await admin.from('notes').insert({ academy_id: A, student_id: S1, author_id: dirId, kind: 'memo', body: '메모' });

  const before = {
    invoices: await cnt('invoices', 'student_id', S1), payments: await cnt('payments', 'invoice_id', iv.id),
    attendance: await cnt('attendance', 'student_id', S1), absence: await cnt('absence_requests', 'student_id', S1),
    todo_done: await cnt('todo_done', 'student_id', S1), push: await cnt('push_subscriptions', 'user_id', mom.uid),
    invite: await cnt('invite_tokens', 'phone', MOM), link: await cnt('link_tokens', 'user_id', mom.uid),
    notif: await cnt('notifications', 'user_id', mom.uid), notes: await cnt('notes', 'student_id', S1),
  };
  const lr = await d.rpc('student_leave', { sid: S1 });
  const after = {
    invoices: await cnt('invoices', 'student_id', S1), payments: await cnt('payments', 'invoice_id', iv.id),
    attendance: await cnt('attendance', 'student_id', S1), absence: await cnt('absence_requests', 'student_id', S1),
    todo_done: await cnt('todo_done', 'student_id', S1), push: await cnt('push_subscriptions', 'user_id', mom.uid),
    invite: await cnt('invite_tokens', 'phone', MOM), link: await cnt('link_tokens', 'user_id', mom.uid),
    notif: await cnt('notifications', 'user_id', mom.uid), notes: await cnt('notes', 'student_id', S1),
    membership: await cnt('memberships', 'student_id', S1), roster: await cnt('roster_phones', 'student_id', S1),
  };
  log('B1 student_leave ->', lr.error?.message ?? 'OK');
  log('   전:', JSON.stringify(before)); log('   후:', JSON.stringify(after));
  const leftovers = [];
  if (after.push) leftovers.push(`push_subscriptions ${after.push}`);
  if (after.invite) leftovers.push(`invite_tokens ${after.invite}`);
  if (after.link) leftovers.push(`link_tokens ${after.link}`);
  if (after.notif) leftovers.push(`notifications ${after.notif}`);
  if (leftovers.length) F('INT-20', '중간', '퇴원(student_leave)은 명부·소속·보호자·수강 등록만 지우고, 그 학부모의 푸시 구독·초대 토큰·링크 토큰·묵은 알림은 그대로 남는다', `퇴원 후 남은 행: ${leftovers.join(', ')} (student_leave 본문에 이 네 표가 없다). 푸시 구독이 남아 있으면 다음 학원 알림이 트리거를 타는 순간 퇴원 학부모 기기로 간다`);
  if (after.invoices && after.attendance) log('   -> 기록(청구서·출결·결석·메모·todo_done)은 의도대로 남음');

  // 퇴원생 청구서가 계속 연체로 굴러가는지
  await admin.from('invoices').update({ due_date: kst(-1), status: 'issued' }).eq('id', iv.id);
  const ro = await d.rpc('refresh_overdue');
  const ivAfter = (await admin.from('invoices').select('status').eq('id', iv.id).single()).data;
  const ru = await d.rpc('remind_unpaid', { p_ym: YM });
  log('B1b 퇴원생 청구서: refresh_overdue ->', ro.data, 'status=', ivAfter.status, '| remind_unpaid ->', ru.data);
  if (ivAfter.status === 'overdue') F('INT-21', '중간', '퇴원한 학생의 미납 청구서가 계속 연체로 뒤집힌다 — 원장 수강료 화면의 미납·연체 합계가 영원히 부풀어 있고 지울 방법은 면제(void)뿐', `student_leave 뒤에도 refresh_overdue 가 status=issued → overdue 로 바꿈(${ro.data}장). remind_unpaid 는 받을 사람이 없어 ${ru.data}건(조용히 실패)`);

  // ================= B2. 반 삭제 =================
  const S2 = (await d.rpc('roster_save_student', { sid: null, p_name: '반생', p_class_ids: [c2.id], p_student_phone: '', p_parent_phones: [] })).data;
  await admin.from('todos').insert({ academy_id: A, class_id: c2.id, kind: 'exam', title: '시험', due_date: kst(3) });
  await admin.from('calendar').insert({ academy_id: A, date: kst(10), kind: 'closed', note: '반 휴원', class_id: c2.id });
  const nt = (await d.from('notices').insert({ academy_id: A, author_id: dirId, title: '반 공지', body: '', target_class_id: c2.id }).select().single()).data;
  await admin.from('attendance').insert({ academy_id: A, student_id: S2, class_id: c2.id, date: kst(-4), status: 'present', marked_by: dirId });
  await admin.from('fee_plans').insert({ academy_id: A, class_id: c2.id, name: '반B 정규', amount: 90000 });
  const del = outcome(await d.from('classes').delete().eq('id', c2.id).select());
  const stillThere = (await admin.from('classes').select('id').eq('id', c2.id)).data.length;
  log('B2 반 삭제 ->', del.ok ? 'OK' : `${del.code} ${del.msg}`, '| 반 남음=', stillThere);
  if (!del.ok || stillThere) {
    F('INT-22', '중간', '반에 휴원일·반 공지가 걸려 있으면 반을 지울 수 없다 (calendar.class_id·notices.target_class_id 에 on delete 규칙이 없다). 원장 화면에는 FK 원문 오류가 뜬다', `삭제 결과: ${del.code} ${del.msg}`);
    // 무엇이 막는지 하나씩
    const blockers = [];
    for (const [t, col] of [['calendar', 'class_id'], ['notices', 'target_class_id'], ['fee_plans', 'class_id'], ['todos', 'class_id'], ['attendance', 'class_id'], ['enrollments', 'class_id']]) {
      const n = await cnt(t, col, c2.id); if (n) blockers.push(`${t}.${col}=${n}`);
    }
    log('   걸린 것:', blockers.join(', '));
    // calendar·notices 를 치우면 지워지는가
    await admin.from('calendar').delete().eq('class_id', c2.id);
    await admin.from('notices').delete().eq('id', nt.id);
    const del2 = outcome(await d.from('classes').delete().eq('id', c2.id).select());
    const gone = (await admin.from('classes').select('id').eq('id', c2.id)).data.length === 0;
    log('   휴원일·공지 치운 뒤 삭제 ->', del2.ok ? 'OK' : `${del2.code} ${del2.msg}`, '| 사라짐=', gone);
    if (gone) {
      const orphan = { todos: await cnt('todos', 'class_id', c2.id), attendance: await cnt('attendance', 'class_id', c2.id), enrollments: await cnt('enrollments', 'class_id', c2.id) };
      log('   -> 딸린 것 정리:', JSON.stringify(orphan));
      const fp = (await admin.from('fee_plans').select('class_id').eq('academy_id', A).is('class_id', null)).data.length;
      log('   -> fee_plans.class_id 는 set null 로 살아남음(학원 공통 요금제로 둔갑):', fp);
      if (fp) F('INT-23', '중간', '반을 지우면 그 반 요금제가 class_id=null 이 되어 "학원 공통 요금제" 로 둔갑한다 (fee_plans.class_id on delete set null)', `반 B 요금제 90,000원이 남아 공통 요금제 ${fp}개가 됨 → issue_invoices 의 공통 요금제 폴백이 엉뚱한 학생에게 이 금액을 매긴다`);
    }
  }

  // ================= B3. 강사 빼기 =================
  const TP = phone();
  await d.rpc('roster_save_teacher', { p_name: '강사', p_phone: TP });
  await d.rpc('assign_class_teacher', { p_class: c1.id, p_phone: TP });
  const tId = await mkUser('tch-' + TP.slice(-4), TP);
  await admin.rpc('link_teacher_classes', { p_user: tId, p_phone: TP });
  let cl = (await admin.from('classes').select('teacher_id, teacher_phone').eq('id', c1.id).single()).data;
  log('B3 배정 후:', JSON.stringify(cl));
  await d.rpc('roster_remove_teacher', { p_phone: TP });
  cl = (await admin.from('classes').select('teacher_id, teacher_phone').eq('id', c1.id).single()).data;
  const tm = await cnt('memberships', 'user_id', tId);
  log('   빼기 후:', JSON.stringify(cl), 'membership=', tm);
  if (cl.teacher_id || cl.teacher_phone) F('INT-24', '높음', 'roster_remove_teacher 가 담당 반을 풀지 못한다', JSON.stringify(cl));
  else log('   -> teacher_id·teacher_phone 둘 다 풀림 (0012 가 고친 자리, 유지됨)');

  // 강사 계정 자체를 지우면?
  await d.rpc('roster_save_teacher', { p_name: '강사2', p_phone: TP });
  await d.rpc('assign_class_teacher', { p_class: c1.id, p_phone: TP });
  const delU = await admin.auth.admin.deleteUser(tId);
  cl = (await admin.from('classes').select('teacher_id, teacher_phone').eq('id', c1.id).single()).data;
  log('B3b 강사 계정 삭제 ->', delU.error?.message ?? 'OK', '| classes=', JSON.stringify(cl));
  if (delU.error) F('INT-25', '중간', '담당 반이 있는 강사 계정은 지울 수 없다 (classes.teacher_id 에 on delete 규칙 없음)', `auth.admin.deleteUser: ${delU.error.message}`);

  // ================= B4. 명부에서 학부모 번호 빼기 =================
  const S3 = (await d.rpc('roster_save_student', { sid: null, p_name: '남은학생', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [] })).data;
  const P2 = phone();
  await d.rpc('roster_save_student', { sid: S3, p_name: '남은학생', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [P2] });
  const par2 = await mkClient(A, 'parent', { phone: P2, studentId: S3 });
  await admin.from('guardians').insert({ student_id: S3, user_id: par2.uid });
  await admin.from('notifications').insert({ academy_id: A, user_id: par2.uid, kind: 'notice', title: '옛 공지 알림', body: '', link: 'notice-view:' });
  // 번호를 명부에서 뺀다
  await d.rpc('roster_save_student', { sid: S3, p_name: '남은학생', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [] });
  const left = { membership: await cnt('memberships', 'user_id', par2.uid), guardian: await cnt('guardians', 'user_id', par2.uid), notif: await cnt('notifications', 'user_id', par2.uid) };
  const seeStudents = (await par2.c.from('students').select('id')).data?.length ?? 0;
  const seeNotif = (await par2.c.from('notifications').select('id, title')).data ?? [];
  const seeAcademy = (await par2.c.from('academies').select('name')).data?.length ?? 0;
  log('B4 명부에서 학부모 번호 뺌 ->', JSON.stringify(left), '| 남은 세션이 보는 것: 학생', seeStudents, '알림', seeNotif.length, '학원', seeAcademy);
  if (seeNotif.length) F('INT-26', '중간', '명부에서 뺀 학부모의 남은 세션이 묵은 알림을 계속 읽는다 (notifications 정책은 user_id = auth.uid() 뿐, 소속을 안 본다)', `소속·보호자는 지워졌는데(${JSON.stringify(left)}) 남은 세션으로 알림 ${seeNotif.length}건: "${seeNotif[0].title}". 학생·학원은 0으로 정확히 막힌다`);

  // ================= B5. 자녀 둘 중 하나 퇴원 =================
  const P3 = phone();
  const K1 = (await d.rpc('roster_save_student', { sid: null, p_name: '첫아이', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [P3] })).data;
  const K2 = (await d.rpc('roster_save_student', { sid: null, p_name: '둘째아이', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [P3] })).data;
  const par3 = await mkClient(A, 'parent', { phone: P3, studentId: K1 });
  await admin.from('memberships').insert({ user_id: par3.uid, academy_id: A, role: 'parent', student_id: K2 });
  await admin.from('users').update({ active_membership_id: par3.membershipId }).eq('id', par3.uid);   // 첫아이를 보고 있는 중
  await d.rpc('student_leave', { sid: K1 });
  const act = (await admin.from('users').select('active_membership_id').eq('id', par3.uid).single()).data;
  const ms = (await par3.c.from('memberships').select('id, student_id')).data ?? [];
  const kids = (await par3.c.from('students').select('id, name')).data ?? [];
  log('B5 첫아이 퇴원 -> active_membership_id=', act.active_membership_id, '| 남은 소속', ms.length, '| 지금 보이는 자녀', kids.length);
  if (!act.active_membership_id && ms.length) F('INT-27', '낮음', '자녀 둘 중 하나가 퇴원하면 학부모의 active_membership_id 가 FK set null 로 비어, 남은 자녀가 있는데도 앱이 역할 선택 화면으로 튕긴다', `active_membership_id=null, 남은 소속 ${ms.length}개(둘째아이), 지금 세션이 보는 자녀 ${kids.length}명 — 다시 고르기 전까지 current_academy_id() 가 null 이라 아무것도 안 보인다`);

  // 형제 할인 재계산
  await d.from('fee_plans').insert({ academy_id: A, class_id: c1.id, name: '재계산용', amount: 100000 }).select();
  await d.from('billing_rules').upsert({ academy_id: A, billing_day: 1, due_day: 5, sibling_discount_pct: 20 });
  const NM = ym(2);
  await d.rpc('issue_invoices', { p_ym: NM });
  const k2inv = (await admin.from('invoices').select('discount, total').eq('student_id', K2).eq('period_ym', NM).maybeSingle()).data;
  log('B5b 형제 하나 퇴원 뒤 다음 달 청구:', JSON.stringify(k2inv));
  if (k2inv && k2inv.discount > 0) F('INT-28', '중간', '형제 하나가 퇴원해도 남은 아이가 형제 할인을 계속 받는다', JSON.stringify(k2inv));
  else log('   -> 형제 할인 없음 (shared 번호가 활성 학생만 보므로 정상)');

  // ================= B6. 사용자 삭제와 남는 기록 =================
  const rec = phone(); const recId = await mkUser('rec-' + rec.slice(-4), rec);
  await admin.from('memberships').insert({ user_id: recId, academy_id: A, role: 'teacher' });
  const iv2 = (await admin.from('invoices').select('id').eq('academy_id', A).limit(1).single()).data;
  await admin.from('payments').insert({ academy_id: A, invoice_id: iv2.id, amount: 1000, method: 'cash', recorded_by: recId });
  const noteRow = (await admin.from('notes').insert({ academy_id: A, student_id: S3, author_id: recId, kind: 'memo', body: '이 사람이 쓴 메모' }).select().single()).data;
  const du = await admin.auth.admin.deleteUser(recId);
  const payAfter = (await admin.from('payments').select('recorded_by').eq('invoice_id', iv2.id).eq('amount', 1000).maybeSingle()).data;
  const noteAfter = (await admin.from('notes').select('id, author_id').eq('id', noteRow.id).maybeSingle()).data;
  log('B6 사용자 삭제 ->', du.error?.message ?? 'OK', '| payments.recorded_by=', payAfter?.recorded_by, '| notes 남음=', !!noteAfter);
  if (du.error) F('INT-29', '중간', '메모를 쓴 사람은 계정을 지울 수 없다 (notes.author_id 에 on delete 규칙이 없다) — 0014 가 payments.recorded_by 만 set null 로 고쳤다', `auth.admin.deleteUser: ${du.error.message}. 같은 문제가 notices.author_id·absence_requests.requested_by/decided_by·inquiries.asked_by/answered_by·attendance.marked_by·outbox.to_user_id·students.user_id·audit_log.actor_id 에도 있다`);
  else if (payAfter && payAfter.recorded_by === null) log('   -> payments.recorded_by set null 동작, notes 도 함께 정리됨');

  await report('연쇄·고아');
} catch (e) { console.error('FATAL', e); }
finally { await cleanup(); }
