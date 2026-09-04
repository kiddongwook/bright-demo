// 0018_hardening.sql 이 실제로 막는지 — 레드팀 발견(INT-* / INP-*) 하나씩.
// 학원 slug 접두사는 hard-. 끝나면 자기가 만든 것만 지운다. yeongeo·yeongeo-jip 은 건드리지 않는다.
// 실행:  cd tools && node --env-file=../.env.local hardening-test.mjs
//
// 주의: 10절은 전역 함수 `outbox_claim()` 을 실제로 부른다(다른 학원 줄까지 잡아 attempts 를 +1 하고 next_attempt_at 을 5분 뒤로 민다).
// 그래서 기본으로는 건너뛴다 — 돌리려면 HARDEN_OUTBOX=1 을 붙인다.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
if (!URL || !SVC || !ANON) { console.error('missing env (run with --env-file=../.env.local)'); process.exit(2); }
const admin = createClient(URL, SVC, { auth: { persistSession: false } });

const fails = [], notes = [];
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails.push(m); };
const note = m => { console.log('  note ' + m); notes.push(m); };
const sec = t => console.log('\n── ' + t);

const rnd = () => Math.random().toString(36).slice(2, 8);
const num = () => String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
const PW = 'hard-' + rnd();
const email = p => `${p}@auth.yeongeo.local`;
const phone = () => '0109' + num() + String(Math.floor(Math.random() * 10));
const kst = (off = 0) => new Date(Date.now() + 9 * 3600e3 + off * 86400e3).toISOString().slice(0, 10);
const ym = (off = 0) => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCMonth(d.getUTCMonth() + off); return d.toISOString().slice(0, 7); };
const err = r => (r.error?.message ?? '').slice(0, 120);

const made = { academies: [], users: [] };
async function mkUser(name, ph) {
  const { data, error } = await admin.auth.admin.createUser({ email: email(ph), password: PW, email_confirm: true });
  if (error) throw error;
  await admin.from('users').insert({ id: data.user.id, name, phone: ph });
  made.users.push(data.user.id);
  return data.user.id;
}
async function login(ph, mid) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: email(ph), password: PW });
  if (error) throw error;
  if (mid) await c.rpc('set_active_membership', { m: mid });
  return c;
}
/** 학원 + 반 둘 + 로그인한 원장 */
async function setup(tag) {
  const t = rnd();
  const { data: ac, error } = await admin.from('academies').insert({ slug: `hard-${tag}-${t}`, name: `굳히기 ${tag}` }).select().single();
  if (error) throw error;
  made.academies.push(ac.id);
  const { data: c1 } = await admin.from('classes').insert({ academy_id: ac.id, name: '반 A', schedule: [{ dow: 1, start: '19:00', end: '21:00' }] }).select().single();
  const { data: c2 } = await admin.from('classes').insert({ academy_id: ac.id, name: '반 B', schedule: [{ dow: 2, start: '20:00', end: '22:00' }] }).select().single();
  const dp = phone(); const dirId = await mkUser('원장 ' + t, dp);
  const { data: dm } = await admin.from('memberships').insert({ user_id: dirId, academy_id: ac.id, role: 'director' }).select().single();
  await admin.from('users').update({ active_membership_id: dm.id }).eq('id', dirId);
  return { A: ac.id, c1, c2, dirId, dirPhone: dp, d: await login(dp) };
}
async function cleanup() {
  for (const id of made.academies) { const { error } = await admin.from('academies').delete().eq('id', id); if (error) console.log('  ! academy', error.message); }
  for (const id of made.users) { await admin.auth.admin.deleteUser(id).catch(() => {}); await admin.from('users').delete().eq('id', id); }
  console.log(`\n정리: 학원 ${made.academies.length}, 사용자 ${made.users.length}`);
}

try {
  /* ══════════════════════════════════════════ 1. 돈 (INT-02/03/04/30/31/34/50/54, INP-51~53) */
  sec('1. 돈 — 과납·음수·상한·면제');
  {
    const { A, c1, d } = await setup('money');
    const S1 = (await d.rpc('roster_save_student', { sid: null, p_name: '한첫째', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [] })).data;
    await d.from('fee_plans').insert({ academy_id: A, class_id: c1.id, name: '정규', amount: 100000 });
    await d.rpc('issue_invoices', { p_ym: ym() });
    const iv = (await admin.from('invoices').select('*').eq('student_id', S1).single()).data;
    ok(iv.total === 100000, `청구서 총액 100,000 (got ${iv.total})`);

    // INT-02/03 과납 — 동시 3회 전액
    const rs = await Promise.all([1, 2, 3].map(() => d.rpc('record_payment', { p_invoice: iv.id, p_amount: 100000, p_method: 'transfer' })));
    const okN = rs.filter(r => !r.error).length;
    const over = rs.filter(r => /overpay/.test(r.error?.message ?? '')).length;
    const pays = (await admin.from('payments').select('amount').eq('invoice_id', iv.id)).data ?? [];
    const sum = pays.reduce((a, x) => a + x.amount, 0);
    ok(okN === 1 && over === 2, `동시 3회 전액 → 성공 1 · overpay 2 (got 성공 ${okN}, overpay ${over})`);
    ok(sum === 100000, `납부 합계 = 총액 (got ${sum})`);
    // INP-52 단발 과납
    let r = await d.rpc('record_payment', { p_invoice: iv.id, p_amount: 1, p_method: 'cash' });
    ok(/overpay/.test(err(r)), `다 낸 청구서에 1원 더 → overpay (got ${err(r) || 'OK'})`);

    // INP-51/53 상한
    const { data: iv2 } = await admin.from('invoices').insert({ academy_id: A, student_id: S1, period_ym: ym(1), amount: 200000, discount: 0, textbook: 0, total: 200000, due_date: kst(10) }).select().single();
    r = await d.rpc('record_payment', { p_invoice: iv2.id, p_amount: 6000000, p_method: 'cash' });
    ok(!!r.error, `500만 원 넘는 납부 거절 (got ${err(r) || 'OK'})`);
    // INT-31/INP-50 음수 총액
    r = await d.rpc('set_invoice_amount', { p_invoice: iv2.id, p_amount: 10000, p_discount: 50000, p_textbook: 0 });
    ok(/bad amount/.test(err(r)), `총액 음수 거절 (got ${err(r) || 'OK'})`);
    r = await d.rpc('set_invoice_amount', { p_invoice: iv2.id, p_amount: 9000000, p_discount: 0, p_textbook: 0 });
    ok(/over_cap/.test(err(r)), `총액 상한 초과 거절 (got ${err(r) || 'OK'})`);
    // INT-30 낸 돈보다 낮은 총액
    r = await d.rpc('set_invoice_amount', { p_invoice: iv.id, p_amount: 40000, p_discount: 0, p_textbook: 0 });
    ok(/below_paid/.test(err(r)), `낸 돈보다 낮은 총액 거절 (got ${err(r) || 'OK'})`);
    // INT-34 납부 있는 청구서 면제
    r = await d.rpc('void_invoice', { p_invoice: iv.id, p_memo: 'x' });
    ok(/has_payments/.test(err(r)), `납부 있는 청구서 면제 거절 (got ${err(r) || 'OK'})`);
    r = await d.rpc('void_invoice', { p_invoice: iv2.id, p_memo: 'ok' });
    ok(!r.error, `납부 없는 청구서는 면제된다 (${err(r)})`);
    // INP-54 표 제약 — 원장 RLS 로 직접 넣기
    r = await d.from('invoices').insert({ academy_id: A, student_id: S1, period_ym: ym(2), amount: 0, discount: 0, textbook: 0, total: -50002, due_date: kst(10), status: 'paid' });
    ok(!!r.error, `total 음수 직접 insert 거절 (got ${err(r) || 'OK'})`);
    r = await d.from('invoices').insert({ academy_id: A, student_id: S1, period_ym: ym(2), amount: 0, discount: 0, textbook: 0, total: 1000000000, due_date: kst(10) });
    ok(!!r.error, `total 10억 직접 insert 거절 (got ${err(r) || 'OK'})`);
    // INP-42 없는 달
    r = await d.from('invoices').insert({ academy_id: A, student_id: S1, period_ym: '2026-13', amount: 0, discount: 0, textbook: 0, total: 0, due_date: kst(10) });
    ok(!!r.error, `period_ym 2026-13 거절 (got ${err(r) || 'OK'})`);
    r = await d.rpc('my_invoice', { p_ym: '2026-13' });
    ok(!r.error && (r.data ?? []).length === 0, `my_invoice('2026-13') 빈 줄 (got ${JSON.stringify(r.data)})`);
    // INP-53 요금제 상한
    r = await d.from('fee_plans').insert({ academy_id: A, class_id: c1.id, name: '10억', amount: 1000000000 });
    ok(!!r.error, `요금제 10억 거절 (got ${err(r) || 'OK'})`);
  }

  /* ══════════════════════════════════════════ 2. "한 번만" 규칙 (INT-01/10/12) */
  sec('2. 한 번만 — 청구서·초대 링크·미납 안내');
  {
    const { A, c1, d, dirPhone } = await setup('once');
    await d.from('fee_plans').insert({ academy_id: A, class_id: c1.id, name: '정규', amount: 100000 });
    await d.rpc('roster_save_student', { sid: null, p_name: '한둘째', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [] });
    await d.rpc('roster_save_student', { sid: null, p_name: '한셋째', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [] });

    // INT-01 동시 5회 → 오류 없음, 합계 2장
    const M = ym(3);
    const rs = await Promise.all([1, 2, 3, 4, 5].map(() => d.rpc('issue_invoices', { p_ym: M })));
    const errs = rs.filter(r => r.error).map(r => err(r));
    const total = rs.reduce((a, r) => a + (r.data ?? 0), 0);
    const rows = (await admin.from('invoices').select('id').eq('academy_id', A).eq('period_ym', M)).data ?? [];
    ok(errs.length === 0, `issue_invoices 동시 5회 오류 0 (got ${errs.length}: ${errs[0] ?? ''})`);
    ok(rows.length === 2, `청구서 2장 (got ${rows.length})`);
    ok(total === 2, `돌려준 수 합계 2 (got ${total} — ${rs.map(r => r.data).join('/')})`);

    // INT-10 초대 링크 동시 3회 → 살아 있는 토큰 하나
    const invPhone = phone();
    await d.rpc('roster_save_teacher', { p_name: '초대 강사', p_phone: invPhone });
    const irs = await Promise.all([1, 2, 3].map(() => d.rpc('create_invite', { p_phone: invPhone })));
    const iok = irs.filter(r => !r.error).length;
    const live = (await admin.from('invite_tokens').select('id, expires_at, used_at').eq('academy_id', A).eq('phone', invPhone)).data ?? [];
    const alive = live.filter(t => !t.used_at && new Date(t.expires_at) > new Date());
    ok(iok === 3, `create_invite 동시 3회 전부 성공 (got ${iok})`);
    ok(alive.length === 1, `살아 있는 초대 토큰 정확히 1개 (got ${alive.length} / 전체 ${live.length})`);

    // INT-12 미납 안내 동시 2회 → 알림 1건
    const momPhone = phone(); const momId = await mkUser('한 어머님', momPhone);
    const S = (await d.rpc('roster_save_student', { sid: null, p_name: '한넷째', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [momPhone] })).data;
    const YM = ym(4);
    await d.rpc('issue_invoices', { p_ym: YM });
    const before = ((await admin.from('notifications').select('id').eq('academy_id', A).eq('kind', 'billing')).data ?? []).length;
    const nrs = await Promise.all([d.rpc('remind_unpaid', { p_ym: YM }), d.rpc('remind_unpaid', { p_ym: YM })]);
    const bills = (await admin.from('notifications').select('id, user_id, title').eq('academy_id', A).eq('kind', 'billing')).data ?? [];
    const mine = bills.filter(b => b.user_id === momId);
    ok(nrs.filter(r => r.error).length === 0, `remind_unpaid 동시 2회 오류 0 (${nrs.map(r => err(r)).join('|')})`);
    ok(mine.length === 1, `같은 학부모에게 안내 알림 1건 (got ${mine.length}, before ${before})`);
    ok(nrs.reduce((a, r) => a + (r.data ?? 0), 0) === 1, `돌려준 수 합계 1 (got ${nrs.map(r => r.data).join('/')})`);
    void S;
    void dirPhone;
  }

  /* ══════════════════════════════════════════ 3. 휴원일 여러 날 (INT-05) */
  sec('3. add_calendar_many — 겹치는 날은 건너뛰고 새 날만');
  {
    const { A, c1, d } = await setup('cal');
    let r = await d.rpc('add_calendar_many', { p_dates: [kst(30), kst(31), kst(32)], p_kind: 'closed', p_note: '설 연휴', p_class: null });
    ok(!r.error && r.data === 3, `첫 번째 3일 → 3 (got ${err(r) || r.data})`);
    r = await d.rpc('add_calendar_many', { p_dates: [kst(31), kst(32), kst(33)], p_kind: 'closed', p_note: '설 연휴', p_class: null });
    ok(!r.error && r.data === 1, `겹치는 2일 + 새 1일 → 1 (got ${err(r) || r.data})`);
    const rows = (await admin.from('calendar').select('date').eq('academy_id', A).eq('kind', 'closed')).data ?? [];
    ok(rows.length === 4 && rows.some(x => x.date === kst(33)), `달력 4행 · 새 날짜 들어감 (got ${rows.length}: ${rows.map(x => x.date).sort().join(',')})`);
    // 동시 두 탭
    const [r1, r2] = await Promise.all([
      d.rpc('add_calendar_many', { p_dates: [kst(40), kst(41)], p_kind: 'closed', p_note: '', p_class: null }),
      d.rpc('add_calendar_many', { p_dates: [kst(41), kst(42)], p_kind: 'closed', p_note: '', p_class: null }),
    ]);
    ok(!r1.error && !r2.error, `동시 두 탭 오류 0 (${err(r1)}|${err(r2)})`);
    ok((r1.data ?? 0) + (r2.data ?? 0) === 3, `합쳐서 3일 (got ${r1.data}/${r2.data})`);
    // 반 지정 · 남의 반 거절
    r = await d.rpc('add_calendar_many', { p_dates: [kst(50)], p_kind: 'closed', p_note: '', p_class: c1.id });
    ok(!r.error && r.data === 1, `반 지정 1일 (got ${err(r) || r.data})`);
    const other = await setup('cal2');
    r = await d.rpc('add_calendar_many', { p_dates: [kst(51)], p_kind: 'closed', p_note: '', p_class: other.c1.id });
    ok(/bad class/.test(err(r)), `남의 반은 거절 (got ${err(r) || 'OK'})`);
  }

  /* ══════════════════════════════════════════ 4. 반·공지를 지울 때 (INT-22/23/38) */
  sec('4. 반 삭제 cascade · 공지 삭제 뒷정리');
  {
    const { A, c1, c2, d } = await setup('del');
    await d.from('fee_plans').insert({ academy_id: A, class_id: c2.id, name: '반B 정규', amount: 90000 });
    await d.from('calendar').insert({ academy_id: A, date: kst(60), kind: 'closed', note: '반B 휴원', class_id: c2.id });
    // 반 공지가 걸려 있으면 못 지운다 (restrict)
    await d.from('notices').insert({ academy_id: A, author_id: (await admin.from('memberships').select('user_id').eq('academy_id', A).eq('role', 'director').single()).data.user_id, title: '반B 공지', body: '', target_class_id: c2.id });
    let r = await d.from('classes').delete().eq('id', c2.id);
    ok(!!r.error, `반 공지가 남아 있으면 반 삭제 거절 (got ${err(r) || 'OK'})`);
    await admin.from('notices').delete().eq('target_class_id', c2.id);
    r = await d.from('classes').delete().eq('id', c2.id);
    ok(!r.error, `공지를 치우면 반 삭제 성공 (${err(r)})`);
    const fp = (await admin.from('fee_plans').select('id, class_id').eq('academy_id', A)).data ?? [];
    ok(fp.length === 0, `반 요금제가 같이 사라진다 — 공통 요금제로 둔갑 안 함 (got ${JSON.stringify(fp)})`);
    const cal = (await admin.from('calendar').select('id').eq('academy_id', A)).data ?? [];
    ok(cal.length === 0, `반 휴원일도 같이 사라진다 (got ${cal.length})`);

    // INT-38 공지를 지우면 알림·발송 줄도
    const momPhone = phone(); const momId = await mkUser('삭제 어머님', momPhone);
    const S = (await d.rpc('roster_save_student', { sid: null, p_name: '삭제학생', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [momPhone] })).data;
    void S;
    const { data: nt } = await d.from('notices').insert({ academy_id: A, author_id: (await admin.from('memberships').select('user_id').eq('academy_id', A).eq('role', 'director').single()).data.user_id, title: '지워질 공지', body: '', target_class_id: null }).select().single();
    const n1 = (await admin.from('notifications').select('id, link').eq('academy_id', A).eq('link', 'notice-view:' + nt.id)).data ?? [];
    const o1 = (await admin.from('outbox').select('id, status').eq('academy_id', A).eq('link_ref', nt.id)).data ?? [];
    ok(n1.length >= 1, `공지 알림이 생겼다 (got ${n1.length}, user ${momId.slice(0, 8)})`);
    await admin.from('notices').delete().eq('id', nt.id);
    const n2 = (await admin.from('notifications').select('id').eq('academy_id', A).eq('link', 'notice-view:' + nt.id)).data ?? [];
    const o2 = (await admin.from('outbox').select('id, status').eq('academy_id', A).eq('link_ref', nt.id)).data ?? [];
    ok(n2.length === 0, `공지를 지우면 그 알림도 사라진다 (got ${n2.length})`);
    ok(o2.every(x => x.status === 'dead' || x.status === 'sent'), `줄에 선 발송은 dead 로 (before ${o1.length}, got ${JSON.stringify(o2.map(x => x.status))})`);
  }

  /* ══════════════════════════════════════════ 5. 퇴원 (INT-20/21/27/32/39) */
  sec('5. 퇴원 — 뒤를 친다');
  {
    const { A, c1, d } = await setup('leave');
    await d.from('fee_plans').insert({ academy_id: A, class_id: c1.id, name: '정규', amount: 100000 });
    const momPhone = phone(); const momId = await mkUser('퇴원 어머님', momPhone);
    const S1 = (await d.rpc('roster_save_student', { sid: null, p_name: '퇴원첫째', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [momPhone] })).data;
    const S2 = (await d.rpc('roster_save_student', { sid: null, p_name: '퇴원둘째', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [momPhone] })).data;
    // 이번 달·다음 달 청구서
    await d.rpc('issue_invoices', { p_ym: ym() });
    await d.rpc('issue_invoices', { p_ym: ym(1) });
    await admin.from('invoices').update({ due_date: kst(-3) }).eq('student_id', S1).eq('period_ym', ym());
    // 푸시 구독 · 초대 토큰
    await admin.from('push_subscriptions').insert({ user_id: momId, endpoint: 'https://fcm.googleapis.com/hard/' + rnd(), p256dh: 'x', auth: 'y' });
    await d.rpc('create_invite', { p_phone: momPhone });
    // 엄마가 첫째를 보고 있게
    const mm = (await admin.from('memberships').select('id, student_id').eq('user_id', momId).eq('academy_id', A)).data ?? [];
    const mm1 = mm.find(m => m.student_id === S1);
    await admin.from('users').update({ active_membership_id: mm1.id }).eq('id', momId);
    ok(mm.length === 2, `엄마 소속 2개(자녀 둘) (got ${mm.length})`);

    await d.rpc('student_leave', { sid: S1 });

    // INT-27 남은 자녀로 옮겨 준다
    const am = (await admin.from('users').select('active_membership_id').eq('id', momId).single()).data;
    ok(!!am.active_membership_id, `active_membership_id 가 비지 않는다 (got ${am.active_membership_id})`);
    const still = (await admin.from('memberships').select('id, student_id').eq('user_id', momId).eq('academy_id', A)).data ?? [];
    ok(still.length === 1 && still[0].id === am.active_membership_id, `남은 자녀 소속으로 옮겨졌다 (got ${JSON.stringify(still.map(x => x.student_id === S2))})`);
    // INT-20 푸시 구독은 남은 소속이 있으니 그대로
    let ps = (await admin.from('push_subscriptions').select('id').eq('user_id', momId)).data ?? [];
    ok(ps.length === 1, `남은 소속이 있으면 푸시 구독은 그대로 (got ${ps.length})`);
    // 초대 토큰: 그 번호가 아직 둘째 명부에 있으니 살아 있다
    let it = (await admin.from('invite_tokens').select('expires_at, used_at').eq('academy_id', A).eq('phone', momPhone)).data ?? [];
    ok(it.some(t => new Date(t.expires_at) > new Date()), `번호가 아직 명부에 있으면 초대 토큰 유지 (got ${it.length})`);
    // INT-21 퇴원생 청구서는 연체로 안 뒤집힌다
    const ro = await d.rpc('refresh_overdue');
    const iv1 = (await admin.from('invoices').select('status, period_ym').eq('student_id', S1)).data ?? [];
    ok(!iv1.some(x => x.period_ym === ym() && x.status === 'overdue'), `퇴원생 청구서는 연체로 안 뒤집힌다 (got ${JSON.stringify(iv1)}, refresh ${ro.data})`);
    // 다음 달 미납 청구서는 면제
    ok(iv1.find(x => x.period_ym === ym(1))?.status === 'void', `다음 달 미납 청구서는 면제 (got ${iv1.find(x => x.period_ym === ym(1))?.status})`);
    // INT-21 미납 안내에서도 빠진다
    const ru = await d.rpc('remind_unpaid', { p_ym: ym() });
    const rem = (await admin.from('invoices').select('reminded_at').eq('student_id', S1).eq('period_ym', ym()).single()).data;
    ok(!rem.reminded_at, `퇴원생은 미납 안내 대상이 아니다 (got ${rem.reminded_at}, remind ${ru.data})`);

    // 둘째까지 퇴원 → 소속 0 → 푸시 구독·초대 토큰 정리
    await d.rpc('student_leave', { sid: S2 });
    ps = (await admin.from('push_subscriptions').select('id').eq('user_id', momId)).data ?? [];
    ok(ps.length === 0, `소속이 하나도 없으면 푸시 구독을 지운다 (got ${ps.length})`);
    it = (await admin.from('invite_tokens').select('expires_at').eq('academy_id', A).eq('phone', momPhone)).data ?? [];
    ok(!it.some(t => new Date(t.expires_at) > new Date()), `명부에서 빠진 번호의 초대 토큰은 만료 (got ${it.length}행)`);

    // INT-32 부분 납부도 연체로 뒤집힌다 (살아 있는 학생)
    const S3 = (await d.rpc('roster_save_student', { sid: null, p_name: '부분학생', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [] })).data;
    await d.rpc('issue_invoices', { p_ym: ym(2) });
    const iv3 = (await admin.from('invoices').select('id, total').eq('student_id', S3).eq('period_ym', ym(2)).single()).data;
    await d.rpc('record_payment', { p_invoice: iv3.id, p_amount: 30000, p_method: 'cash' });
    await admin.from('invoices').update({ due_date: kst(-3) }).eq('id', iv3.id);
    await d.rpc('refresh_overdue');
    let st = (await admin.from('invoices').select('status').eq('id', iv3.id).single()).data.status;
    ok(st === 'overdue', `부분 납부 + 납기 지남 → overdue (got ${st})`);
    // 추가 납부가 들어와도 연체는 유지된다 (뒤집기 반복 없음)
    await d.rpc('record_payment', { p_invoice: iv3.id, p_amount: 1000, p_method: 'cash' });
    st = (await admin.from('invoices').select('status').eq('id', iv3.id).single()).data.status;
    ok(st === 'overdue', `추가 납부 뒤에도 overdue 유지 (got ${st})`);

    // INT-39 발송기용 물음
    const { data: ob } = await admin.from('outbox').select('id, to_user_id').eq('academy_id', A).eq('to_user_id', momId).limit(1).maybeSingle();
    if (ob) {
      const act = await admin.rpc('outbox_recipient_active', { p_outbox: ob.id });
      ok(!act.error && act.data === false, `outbox_recipient_active — 소속 끊긴 사람은 false (got ${err(act) || act.data})`);
    } else note('outbox 줄이 없어 outbox_recipient_active 는 못 봤다');
  }

  /* ══════════════════════════════════════════ 6. 출결 알림 되풀이 (INT-09) */
  sec('6. 출결 — 되돌렸다 다시 넣어도 같은 알림은 한 번');
  {
    const { A, c1, d } = await setup('att');
    const momPhone = phone(); const momId = await mkUser('출결 어머님', momPhone);
    const S = (await d.rpc('roster_save_student', { sid: null, p_name: '출결학생', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [momPhone] })).data;
    const day = kst();
    await d.from('attendance').insert({ academy_id: A, student_id: S, class_id: c1.id, date: day, status: 'late' });
    const id = (await admin.from('attendance').select('id').eq('student_id', S).single()).data.id;
    await d.from('attendance').update({ status: 'present' }).eq('id', id);
    await d.from('attendance').update({ status: 'late' }).eq('id', id);
    await d.from('attendance').update({ status: 'present' }).eq('id', id);
    await d.from('attendance').update({ status: 'late' }).eq('id', id);
    const ns = (await admin.from('notifications').select('id, title').eq('academy_id', A).eq('kind', 'attendance').eq('user_id', momId)).data ?? [];
    ok(ns.length === 1, `지각↔출석 5번 저장 → 같은 알림 1건 (got ${ns.length})`);
    const ob = (await admin.from('outbox').select('id').eq('academy_id', A)).data ?? [];
    ok(ob.length <= 1, `발송 줄도 1줄 이하 (got ${ob.length})`);
    // 진짜로 바뀌면 알린다
    await d.from('attendance').update({ status: 'absent' }).eq('id', id);
    const ns2 = (await admin.from('notifications').select('id, title').eq('academy_id', A).eq('kind', 'attendance').eq('user_id', momId)).data ?? [];
    ok(ns2.length === 2, `지각 → 결석은 새 알림 (got ${ns2.length})`);
  }

  /* ══════════════════════════════════════════ 7. 모양·길이 상한 (INP-*) */
  sec('7. 모양·길이 — 제목·이름·사유·번호·endpoint·시간표·날짜');
  {
    const { A, c1, d } = await setup('shape');
    const dirU = (await admin.from('memberships').select('user_id').eq('academy_id', A).eq('role', 'director').single()).data.user_id;
    // INP-01 공지 제목
    let r = await d.from('notices').insert({ academy_id: A, author_id: dirU, title: 'ㅋ'.repeat(2000), body: '' });
    ok(!!r.error, `공지 제목 2,000자 거절 (got ${err(r) || 'OK'})`);
    // INP-06 빈 제목
    r = await d.from('notices').insert({ academy_id: A, author_id: dirU, title: '   ', body: '' });
    ok(!!r.error, `빈 제목 거절 (got ${err(r) || 'OK'})`);
    r = await d.from('notices').insert({ academy_id: A, author_id: dirU, title: '정상 제목', body: '본문' });
    ok(!r.error, `80자 이하 제목은 통과 (${err(r)})`);
    // INP-75 학생 이름
    r = await d.rpc('roster_save_student', { sid: null, p_name: '가'.repeat(40), p_class_ids: [], p_student_phone: '', p_parent_phones: [] });
    ok(!!r.error, `40자 학생 이름 거절 (got ${err(r) || 'OK'})`);
    // INP-70 출결 사유
    const S = (await d.rpc('roster_save_student', { sid: null, p_name: '모양학생', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [] })).data;
    r = await d.from('attendance').insert({ academy_id: A, student_id: S, class_id: c1.id, date: kst(1), status: 'late', note: 'ㅜ'.repeat(5000) });
    ok(!!r.error, `출결 사유 5,000자 거절 (got ${err(r) || 'OK'})`);
    // INP-73 계좌 안내
    r = await d.from('billing_rules').upsert({ academy_id: A, bank_info: '국'.repeat(3000) });
    ok(!!r.error, `bank_info 3,000자 거절 (got ${err(r) || 'OK'})`);
    // INP-40/41 날짜 상·하한
    r = await d.from('calendar').insert({ academy_id: A, date: '9999-12-31', kind: 'closed' });
    ok(!!r.error, `달력 9999-12-31 거절 (got ${err(r) || 'OK'})`);
    r = await d.from('todos').insert({ academy_id: A, class_id: c1.id, kind: 'homework', title: 'x', due_date: '9999-12-31' });
    ok(!!r.error, `할 것 9999-12-31 거절 (got ${err(r) || 'OK'})`);
    // INP-31 명부 번호 모양
    r = await d.rpc('roster_save_student', { sid: null, p_name: '번호학생', p_class_ids: [], p_student_phone: '+82 10-1234-5678', p_parent_phones: [] });
    ok(/bad_phone/.test(err(r)), `roster_save_student 이상한 번호 거절 (got ${err(r) || 'OK'})`);
    r = await d.rpc('roster_save_student', { sid: null, p_name: '번호학생2', p_class_ids: [], p_student_phone: '', p_parent_phones: ['0212345678'] });
    ok(/bad_phone/.test(err(r)), `보호자 번호도 모양을 본다 (got ${err(r) || 'OK'})`);
    r = await d.rpc('roster_save_teacher', { p_name: '이상강사', p_phone: '821012345678' });
    ok(/bad_phone/.test(err(r)), `roster_save_teacher 도 모양을 본다 (got ${err(r) || 'OK'})`);
    // INP-45/60/80 시간표
    for (const bad of [[{ dow: 1, start: '24:00', end: '25:00' }], [{ dow: 1, start: '19:60', end: '21:00' }], [{ dow: 9, start: '19:00', end: '21:00' }], [{ dow: 1, start: 'x', end: null }], [{ dow: 1, start: '7:00', end: '9:00' }], [{ dow: 1, start: '21:00', end: '19:00' }]]) {
      r = await d.from('classes').insert({ academy_id: A, name: '나쁜 반', schedule: bad });
      ok(!!r.error, `시간표 ${JSON.stringify(bad[0])} 거절 (got ${err(r) || 'OK'})`);
    }
    r = await d.from('classes').insert({ academy_id: A, name: '좋은 반', schedule: [{ dow: 0, start: '09:00', end: '10:30' }] });
    ok(!r.error, `제대로 된 시간표는 통과 (${err(r)})`);
    // INP-20 outbox.params (service role)
    r = await admin.from('outbox').insert({ academy_id: A, to_user_id: dirU, channel: 'alimtalk', template_code: 'NOTICE_NEW', params: { 제목: 'ㅋ'.repeat(20000) }, idempotency_key: 'hard-' + rnd() });
    ok(!!r.error, `outbox.params 30KB 거절 (got ${err(r) || 'OK'})`);
  }

  /* ══════════════════════════════════════════ 8. 푸시 구독 (INP-10/12/13) */
  sec('8. 푸시 구독 — https · 길이 · 기기 5대');
  {
    const { A, c1, d } = await setup('push');
    const pp = phone(); const pu = await mkUser('푸시 학부모', pp);
    const S = (await d.rpc('roster_save_student', { sid: null, p_name: '푸시학생', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [pp] })).data;
    void S;
    const pm = (await admin.from('memberships').select('id').eq('user_id', pu).eq('academy_id', A).single()).data;
    const p = await login(pp, pm.id);
    let r = await p.from('push_subscriptions').insert({ user_id: pu, endpoint: 'http://192.0.2.1/x', p256dh: 'a', auth: 'b' });
    ok(!!r.error, `http:// endpoint 거절 (got ${err(r) || 'OK'})`);
    r = await p.from('push_subscriptions').insert({ user_id: pu, endpoint: 'https://fcm.googleapis.com/' + 'a'.repeat(10000), p256dh: 'a', auth: 'b' });
    ok(!!r.error, `10KB endpoint 거절 (got ${err(r) || 'OK'})`);
    for (let i = 0; i < 8; i++) {
      r = await p.from('push_subscriptions').insert({ user_id: pu, endpoint: `https://fcm.googleapis.com/hard/${rnd()}/${i}`, p256dh: 'a', auth: 'b' });
      if (r.error) { ok(false, `구독 ${i} insert 실패: ${err(r)}`); break; }
    }
    const subs = (await admin.from('push_subscriptions').select('id, endpoint').eq('user_id', pu)).data ?? [];
    ok(subs.length === 5, `기기 8대를 넣어도 5행만 남는다 (got ${subs.length})`);
    // 0019: 5대가 찬 뒤 같은 endpoint 로 다시 구독(upsert)해도 엉뚱한 기기가 빠지지 않는다
    const before = new Set(subs.map(x => x.id));
    for (let i = 0; i < 3; i++) {
      const r2 = await p.from('push_subscriptions').upsert({ user_id: pu, endpoint: subs[0].endpoint, p256dh: 'a', auth: 'b' }, { onConflict: 'endpoint' });
      if (r2.error) { ok(false, `같은 endpoint upsert 실패: ${err(r2)}`); break; }
    }
    const after = (await admin.from('push_subscriptions').select('id').eq('user_id', pu)).data ?? [];
    ok(after.length === 5 && after.every(x => before.has(x.id)), `같은 기기로 다시 구독해도 5대 그대로 (got ${after.length}, 그대로 ${after.filter(x => before.has(x.id)).length})`);
  }

  /* ══════════════════════════════════════════ 9. 사람을 지울 수 있나 (INT-25/29) */
  sec('9. 계정 삭제 — users FK 아홉 개');
  {
    const { A, c1, d } = await setup('userdel');
    const tp = phone(); const tu = await mkUser('탈퇴 강사', tp);
    await d.rpc('roster_save_teacher', { p_name: '탈퇴 강사', p_phone: tp });
    await admin.from('classes').update({ teacher_id: tu, teacher_phone: tp }).eq('id', c1.id);
    const S = (await d.rpc('roster_save_student', { sid: null, p_name: '탈퇴반학생', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [] })).data;
    const dirU = (await admin.from('memberships').select('user_id').eq('academy_id', A).eq('role', 'director').single()).data.user_id;
    await admin.from('notes').insert({ academy_id: A, student_id: S, author_id: tu, kind: 'memo', body: '메모' });
    await admin.from('notices').insert({ academy_id: A, author_id: tu, title: '강사 공지', body: '' });
    await admin.from('attendance').insert({ academy_id: A, student_id: S, class_id: c1.id, date: kst(2), status: 'present', marked_by: tu });
    await admin.from('absence_requests').insert({ academy_id: A, student_id: S, requested_by: tu, date: kst(3), reason: '병원' });
    await admin.from('inquiries').insert({ academy_id: A, student_id: S, asked_by: tu, topic: '문의', body: '내용' });
    await admin.from('outbox').insert({ academy_id: A, to_user_id: tu, channel: 'alimtalk', template_code: 'NOTICE_NEW', params: {}, idempotency_key: 'hard-del-' + rnd() });
    await admin.from('audit_log').insert({ academy_id: A, actor_id: tu, action: 'test' });
    await admin.from('students').update({ user_id: tu }).eq('id', S);
    const r = await admin.from('users').delete().eq('id', tu);
    ok(!r.error, `아홉 자리를 다 걸어 둔 사용자도 지워진다 (got ${err(r) || 'OK'})`);
    if (!r.error) {
      const left = (await admin.from('notes').select('author_id').eq('academy_id', A)).data ?? [];
      ok(left.every(x => x.author_id === null), `기록은 남고 사람만 떨어진다 (notes.author_id null)`);
      const ob = (await admin.from('outbox').select('id').eq('academy_id', A).eq('to_user_id', tu)).data ?? [];
      ok(ob.length === 0, `그 사람 앞으로 선 줄은 같이 사라진다 (got ${ob.length})`);
      made.users = made.users.filter(x => x !== tu);
    }
    void dirU;
  }

  /* ══════════════════════════════════════════ 10. 굳은 outbox 줄 (INP-21) */
  // outbox_claim() 은 학원 범위가 아니라 전역이라 기본으로는 건너뛴다 (다른 점검의 줄까지 잡는다).
  // 돌리려면 HARDEN_OUTBOX=1 node --env-file=../.env.local hardening-test.mjs
  sec('10. outbox — 굳은 줄이 다시 풀린다');
  if (process.env.HARDEN_OUTBOX !== '1') note('10절 건너뜀 — outbox_claim 은 전역이다. HARDEN_OUTBOX=1 로 돌리세요');
  else {
    const { A, d } = await setup('outbox');
    const dirU = (await admin.from('memberships').select('user_id').eq('academy_id', A).eq('role', 'director').single()).data.user_id;
    const key = 'hard-stuck-' + rnd();
    const { data: row } = await admin.from('outbox').insert({ academy_id: A, to_user_id: dirU, channel: 'alimtalk', template_code: 'NOTICE_NEW', params: {}, idempotency_key: key, status: 'queued', attempts: 5, next_attempt_at: new Date(Date.now() - 60000).toISOString() }).select().single();
    // 발송기를 흉내내지 않고, claim 이 이 줄을 다시 집어 주는지만 본다 (claim 은 전역이라 이 줄이 섞여 나온다)
    const cl = await admin.rpc('outbox_claim', { n: 50 });
    const mine = (cl.data ?? []).filter(x => x.id === row.id);
    ok(!cl.error, `outbox_claim 오류 없음 (${err(cl)})`);
    ok(mine.length === 1, `굳은 줄(queued·attempts 5)을 다시 집는다 (got ${mine.length})`);
    ok(mine[0]?.attempts === 6, `attempts 6 → 발송기의 dead 분기(>=5)로 간다 (got ${mine[0]?.attempts})`);
    // 잡힌 뒤 또 죽으면(queued 로 되돌림) 다음 claim 에서 dead 로 박힌다
    await admin.from('outbox').update({ status: 'queued', next_attempt_at: new Date(Date.now() - 60000).toISOString() }).eq('id', row.id);
    await admin.rpc('outbox_claim', { n: 50 });
    const after = (await admin.from('outbox').select('status, attempts, last_error').eq('id', row.id).single()).data;
    ok(after.status === 'dead', `여섯 번을 넘기면 dead 로 박힌다 (got ${JSON.stringify(after)})`);
    // 다른 학원 줄을 건드리지 않도록 내 줄은 여기서 치운다
    await admin.from('outbox').delete().eq('academy_id', A);
    void d;
  }
} catch (e) {
  fails.push('예외: ' + (e?.message ?? String(e)));
  console.error(e);
} finally {
  await cleanup();
}

if (notes.length) console.log('\n' + notes.map(n => 'NOTE: ' + n).join('\n'));
if (fails.length) { console.error(`\nFAIL (${fails.length})\n- ` + fails.join('\n- ')); process.exitCode = 1; }
else console.log('\nPASS: hardening 1~10 (돈 상한·한 번만 규칙·범위 넣기·삭제 뒷정리·퇴원·출결 알림·모양 상한·푸시 구독·계정 삭제·굳은 줄)');
