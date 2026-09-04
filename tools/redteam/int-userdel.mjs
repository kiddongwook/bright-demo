// 무결성 점검 B2 — 사용자를 지울 수 있게 하는/막는 FK 를 하나씩 세운다 (탈퇴·테스트 정리·개인정보 삭제 요청이 여기서 막힌다).
// 실행: node --env-file=.env.local tools/redteam/int-userdel.mjs
import { admin, setup, mkUser, phone, kst, ym, F, report, cleanup } from './_int-common.mjs';

const log = (...a) => console.log(...a);
try {
  const { A, c1, dirId, d } = await setup('udel');
  const S = (await d.rpc('roster_save_student', { sid: null, p_name: '대상학생', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [] })).data;
  await d.from('billing_rules').upsert({ academy_id: A, billing_day: 1, due_day: 5, sibling_discount_pct: 0 });
  await d.from('fee_plans').insert({ academy_id: A, class_id: c1.id, name: '정규', amount: 100000 });
  await d.rpc('issue_invoices', { p_ym: ym() });
  const IV = (await admin.from('invoices').select('id').eq('student_id', S).single()).data;

  // 각 사례: 사용자 하나 + 딸린 행 하나 → 계정 삭제 시도
  const cases = [
    ['(대조) 소속만', async () => {}],
    ['payments.recorded_by', async u => admin.from('payments').insert({ academy_id: A, invoice_id: IV.id, amount: 1000, method: 'cash', recorded_by: u })],
    ['invite_tokens.created_by', async u => admin.from('invite_tokens').insert({ academy_id: A, phone: '01000000000', role: 'parent', token_hash: 'rtint' + Math.random(), expires_at: new Date(Date.now() + 86400e3).toISOString(), created_by: u })],
    ['notifications.user_id', async u => admin.from('notifications').insert({ academy_id: A, user_id: u, kind: 'x', title: 'x', body: '', link: 'home:' })],
    ['link_tokens.user_id', async u => admin.from('link_tokens').insert({ academy_id: A, user_id: u, view: 'home', token_hash: 'rtint' + Math.random(), expires_at: new Date(Date.now() + 86400e3).toISOString() })],
    ['push_subscriptions.user_id', async u => admin.from('push_subscriptions').insert({ user_id: u, endpoint: 'https://example.invalid/rt/' + Math.random(), p256dh: 'x', auth: 'y' })],
    ['guardians.user_id', async u => admin.from('guardians').insert({ student_id: S, user_id: u })],
    ['notice_reads.user_id', async u => { const n = (await admin.from('notices').insert({ academy_id: A, author_id: dirId, title: 'r', body: '' }).select().single()).data; return admin.from('notice_reads').insert({ notice_id: n.id, user_id: u }); }],
    ['notes.author_id', async u => admin.from('notes').insert({ academy_id: A, student_id: S, author_id: u, kind: 'memo', body: 'x' })],
    ['notices.author_id', async u => admin.from('notices').insert({ academy_id: A, author_id: u, title: '공지', body: '' })],
    ['attendance.marked_by', async u => admin.from('attendance').insert({ academy_id: A, student_id: S, class_id: c1.id, date: kst(-20 - Math.floor(Math.random() * 300)), status: 'present', marked_by: u })],
    ['absence_requests.requested_by', async u => admin.from('absence_requests').insert({ academy_id: A, student_id: S, requested_by: u, date: kst(-1), reason: 'x' })],
    ['inquiries.asked_by', async u => admin.from('inquiries').insert({ academy_id: A, student_id: S, asked_by: u, topic: 't', body: 'b' })],
    ['classes.teacher_id', async u => admin.from('classes').update({ teacher_id: u }).eq('id', c1.id)],
    ['students.user_id', async u => admin.from('students').update({ user_id: u }).eq('id', S)],
    ['outbox.to_user_id', async u => admin.from('outbox').insert({ academy_id: A, to_user_id: u, channel: 'push', template_code: 'NOTIFY', params: {}, idempotency_key: 'rtint:' + Math.random(), status: 'sent' })],
    ['audit_log.actor_id', async u => admin.from('audit_log').insert({ academy_id: A, actor_id: u, action: 'rt-int', target: 'x' })],
  ];

  const blocked = [], allowed = [], skipped = [];
  for (const [name, make] of cases) {
    const ph = phone();
    const u = await mkUser('udel-' + ph.slice(-4), ph);
    await admin.from('memberships').insert({ user_id: u, academy_id: A, role: 'teacher' });
    const mk = await make(u);
    if (mk?.error) { skipped.push(`${name} (준비 실패: ${mk.error.message.slice(0, 50)})`); continue; }
    const { error } = await admin.auth.admin.deleteUser(u);
    const stillUser = (await admin.from('users').select('id').eq('id', u)).data.length;
    if (error || stillUser) blocked.push(name); else allowed.push(name);
    // 다음 사례를 위해 흔적 되돌리기
    await admin.from('classes').update({ teacher_id: null }).eq('id', c1.id);
    await admin.from('students').update({ user_id: null }).eq('id', S);
    log(`  ${(error || stillUser) ? '막힘 ' : '지워짐'} ${name}${error ? ' — ' + error.message : ''}`);
  }
  log('\n지워짐:', allowed.join(', '));
  log('막힘  :', blocked.join(', '));
  if (skipped.length) log('건너뜀:', skipped.join(', '));
  if (blocked.length) F('INT-29', '중간', '사용자 계정을 지울 수 없게 막는 FK 가 여럿이다 (users(id) 참조에 on delete 규칙이 없다). 강사·원장 탈퇴, 개인정보 삭제 요청, 테스트 정리가 여기서 멈춘다', `막는 컬럼: ${blocked.join(', ')} / 통과: ${allowed.join(', ')}. 0014 가 payments.recorded_by 하나만 set null 로 고쳤고 나머지는 그대로다`);

  await report('사용자 삭제 FK');
} catch (e) { console.error('FATAL', e); }
finally { await cleanup(); }
