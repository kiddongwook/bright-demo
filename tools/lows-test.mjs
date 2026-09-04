// 0022_lows.sql 이 실제로 막는지 — 적대적 점검의 "낮음" 하나씩.
//   A. 휴원일: 하루짜리 원자적 저장(INT-06), 전체 ↔ 반 우선순위(INT-35/36)
//   B. 같은 내용 알림 묶기(INT-11)
//   C. 명부에서 빠진 사람의 묵은 알림(INT-26)
//   D. 010 은 11자리(INP-36) — 표 검사
// 학원 slug 접두사는 low-. 끝나면 자기가 만든 것만 지운다. yeongeo·yeongeo-jip 은 건드리지 않는다.
// 실행:  cd tools && node --env-file=../.env.local lows-test.mjs
//
// 1분 틱(pg_cron → outbox_tick)이 끼어들어 진짜 문자를 보내지 않게 app_settings.outbox_url 을 잠시 빼고,
// 만든 outbox 줄은 절마다 곧바로 지운다.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
if (!URL || !SVC || !ANON) { console.error('missing env (run with --env-file=../.env.local)'); process.exit(2); }
const admin = createClient(URL, SVC, { auth: { persistSession: false } });

const fails = [];
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails.push(m); };
const sec = t => console.log('\n── ' + t);

const rnd = () => Math.random().toString(36).slice(2, 8);
const num = () => String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
const PW = 'low-' + rnd();
const email = p => `${p}@auth.yeongeo.local`;
const phone = () => '0109' + num() + String(Math.floor(Math.random() * 10));
const kst = (off = 0) => new Date(Date.now() + 9 * 3600e3 + off * 86400e3).toISOString().slice(0, 10);
const err = r => (r.error?.message ?? '').slice(0, 140);
const uuid = () => crypto.randomUUID();

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
async function setup(tag) {
  const t = rnd();
  const { data: ac, error } = await admin.from('academies').insert({ slug: `low-${tag}-${t}`, name: `낮음 ${tag}` }).select().single();
  if (error) throw error;
  made.academies.push(ac.id);
  const { data: c1 } = await admin.from('classes').insert({ academy_id: ac.id, name: '반 A', schedule: [{ dow: 1, start: '19:00', end: '21:00' }] }).select().single();
  const { data: c2 } = await admin.from('classes').insert({ academy_id: ac.id, name: '반 B', schedule: [{ dow: 2, start: '20:00', end: '22:00' }] }).select().single();
  const dp = phone(); const dirId = await mkUser('원장 ' + t, dp);
  const { data: dm } = await admin.from('memberships').insert({ user_id: dirId, academy_id: ac.id, role: 'director' }).select().single();
  await admin.from('users').update({ active_membership_id: dm.id }).eq('id', dirId);
  return { A: ac.id, c1, c2, dirId, dirMid: dm.id, dirPhone: dp, d: await login(dp, dm.id) };
}
const calRows = (A, date) => admin.from('calendar').select('id, kind, note, class_id').eq('academy_id', A).eq('date', date);
const dropOutbox = A => admin.from('outbox').delete().eq('academy_id', A);

// 1분 틱을 잠시 끈다
const { data: tickUrl } = await admin.from('app_settings').select('value').eq('key', 'outbox_url').maybeSingle();
if (tickUrl) await admin.from('app_settings').delete().eq('key', 'outbox_url');

try {
  // ============================================================ A. 휴원일
  sec('A. 휴원일 — 하루짜리 원자적 저장 · 전체↔반 우선순위 (INT-06 / 35 / 36)');
  {
    const s = await setup('cal');
    const D1 = kst(3), D2 = kst(4), D3 = kst(5), D4 = kst(6);
    const up = (date, kind, note, cls) => s.d.rpc('upsert_calendar_day', { p_date: date, p_kind: kind, p_note: note, p_class: cls });

    // A1 같은 날 두 번 → 행 하나, 메모는 마지막 것
    ok(!(await up(D1, 'closed', '추석', null)).error, 'A1 전체 휴원 저장');
    const r2 = await up(D1, 'closed', '추석 연휴', null);
    ok(!r2.error, 'A1 같은 날 다시 저장해도 오류 없음 (전에는 클라이언트가 select→insert 했다)');
    {
      const { data } = await calRows(s.A, D1);
      ok(data.length === 1 && data[0].note === '추석 연휴', `A1 행 1개 · 메모 갱신 (got ${data.length}, ${data[0]?.note})`);
    }

    // A2 동시 두 번 → 23505 원문 없이 행 하나 (INT-06)
    const both = await Promise.all([up(D2, 'closed', '동시1', null), up(D2, 'closed', '동시2', null)]);
    ok(both.every(r => !r.error), `A2 동시 저장 둘 다 성공 (${both.map(r => err(r) || 'OK').join(' | ')})`);
    {
      const { data } = await calRows(s.A, D2);
      ok(data.length === 1, `A2 행은 1개 (got ${data.length})`);
    }

    // A3 전체가 있는 날에 반 휴원 → 막힌다
    const blocked = await up(D1, 'closed', '반 A 휴원', s.c1.id);
    ok(/closed_by_all/.test(err(blocked)), `A3 전체 휴원일에 반 휴원은 거절 (${err(blocked) || '거절 안 됨'})`);
    {
      const { data } = await calRows(s.A, D1);
      ok(data.length === 1 && data[0].class_id === null, `A3 그 날은 전체 한 줄뿐 (got ${data.length})`);
    }

    // A4 반 휴원이 있는 날에 전체 휴원 → 반 줄은 군더더기라 치운다 (INT-35)
    ok(!(await up(D3, 'closed', '반 A만', s.c1.id)).error, 'A4 반 휴원 저장');
    ok(!(await up(D3, 'closed', '반 B만', s.c2.id)).error, 'A4 다른 반 휴원도 저장 (반끼리는 나란히 선다)');
    {
      const { data } = await calRows(s.A, D3);
      ok(data.length === 2, `A4 반 둘이 나란히 (got ${data.length})`);
    }
    ok(!(await up(D3, 'closed', '전체 휴원', null)).error, 'A4 전체 휴원 저장');
    {
      const { data } = await calRows(s.A, D3);
      ok(data.length === 1 && data[0].class_id === null, `A4 전체가 덮으면 반 줄은 사라진다 (got ${data.length})`);
    }

    // A5 특강은 휴원을 지우지 않는다 — 판단은 closed 가 이긴다 (INT-36)
    ok(!(await up(D1, 'special', '휴원 중 보충 특강', null)).error, 'A5 같은 날 특강 저장');
    {
      const { data } = await calRows(s.A, D1);
      ok(data.length === 2 && data.some(x => x.kind === 'closed') && data.some(x => x.kind === 'special'),
        `A5 closed·special 은 함께 남는다 (closedFor 가 closed 만 보므로 그날은 쉰다) (got ${data.length})`);
    }

    // A6 여러 날 — 전체에 덮인 날은 건너뛴다
    const many1 = await s.d.rpc('add_calendar_many', { p_dates: [D1, D3, D4], p_kind: 'closed', p_note: '반 A 3일', p_class: s.c1.id });
    ok(!many1.error && many1.data === 1, `A6 전체 휴원인 두 날은 건너뛰고 1일만 (got ${many1.data}, ${err(many1)})`);
    {
      const { data } = await calRows(s.A, D4);
      ok(data.length === 1 && data[0].class_id === s.c1.id, `A6 남은 하루만 반 휴원 (got ${data.length})`);
    }

    // A7 여러 날 전체 휴원 → 그 날들의 반 휴원을 치운다
    const many2 = await s.d.rpc('add_calendar_many', { p_dates: [D4], p_kind: 'closed', p_note: '전체', p_class: null });
    ok(!many2.error && many2.data === 1, `A7 전체 휴원 1일 넣음 (got ${many2.data}, ${err(many2)})`);
    {
      const { data } = await calRows(s.A, D4);
      ok(data.length === 1 && data[0].class_id === null, `A7 그 날의 반 휴원은 사라진다 (got ${data.length})`);
    }

    // A8 원장 아닌 사람은 못 부른다
    const pph = phone(); const pid = await mkUser('학부모 ' + rnd(), pph);
    const { data: st } = await admin.from('students').insert({ academy_id: s.A, name: '박지훈' }).select().single();
    const { data: pm } = await admin.from('memberships').insert({ user_id: pid, academy_id: s.A, role: 'parent', student_id: st.id }).select().single();
    await admin.from('users').update({ active_membership_id: pm.id }).eq('id', pid);
    await admin.from('guardians').insert({ student_id: st.id, user_id: pid });
    const p = await login(pph, pm.id);
    const notAllowed = await p.rpc('upsert_calendar_day', { p_date: D4, p_kind: 'closed', p_note: 'x', p_class: null });
    ok(/not allowed/.test(err(notAllowed)), `A8 학부모는 휴원일을 못 넣는다 (${err(notAllowed) || '통과해 버림'})`);
  }

  // ============================================================ B. 같은 내용 알림 묶기 (INT-11)
  sec('B. 같은 내용 알림은 줄에 한 번만 (INT-11)');
  {
    const s = await setup('dup');
    const { data: st } = await admin.from('students').insert({ academy_id: s.A, name: '박지훈' }).select().single();
    const pph = phone(); const pid = await mkUser('박지훈 어머님', pph);
    const { data: pm } = await admin.from('memberships').insert({ user_id: pid, academy_id: s.A, role: 'parent', student_id: st.id }).select().single();
    await admin.from('users').update({ active_membership_id: pm.id }).eq('id', pid);
    await admin.from('guardians').insert({ student_id: st.id, user_id: pid });

    const REF = uuid();
    const noti = (title, ref) => admin.from('notifications').insert({
      academy_id: s.A, user_id: pid, kind: 'inquiry', title, body: '본문', link: 'ask-mine:' + (ref ?? REF) });
    const box = async () => (await admin.from('outbox').select('id, channel, template_code, link_ref').eq('academy_id', s.A)).data;

    // B1 내용이 똑같은 알림 두 줄 → 줄은 하나
    ok(!(await noti('답변이 달렸어요')).error, 'B1 알림 1');
    ok(!(await noti('답변이 달렸어요')).error, 'B1 같은 내용 알림 2');
    {
      const b = await box();
      ok(b.length === 1 && b[0].channel === 'alimtalk', `B1 카톡 줄은 1개 (전에는 2개였다) (got ${b.length})`);
      const { count } = await admin.from('notifications').select('id', { count: 'exact', head: true }).eq('academy_id', s.A);
      ok(count === 2, `B1 앱 알림·종 배지는 그대로 2건 (got ${count})`);
    }

    // B2 가리키는 것이 다르면 따로 나간다 — 제목이 같아도 다른 문의면 묶이지 않는다
    ok(!(await noti('답변이 달렸어요', uuid())).error, 'B2 링크가 다른 알림');
    {
      const b = await box();
      ok(b.length === 2, `B2 link_ref 가 다르면 줄이 따로 선다 (got ${b.length})`);
    }

    // B3 10분 밖이면 다시 나간다 — 앞 줄을 11분 전으로 밀고 같은 알림을 한 번 더
    await admin.from('outbox').update({ created_at: new Date(Date.now() - 11 * 60e3).toISOString() }).eq('academy_id', s.A).eq('link_ref', REF);
    ok(!(await noti('답변이 달렸어요')).error, 'B3 11분 뒤 같은 알림');
    {
      const b = await box();
      ok(b.length === 3, `B3 10분이 지났으면 다시 줄에 선다 (got ${b.length})`);
    }

    // B4 푸시도 같은 규칙
    await dropOutbox(s.A);
    await admin.from('push_subscriptions').insert({ user_id: pid, endpoint: 'https://example.com/p/' + rnd(), p256dh: 'x'.repeat(20), auth: 'y'.repeat(16) });
    const REF2 = uuid();
    ok(!(await noti('푸시 묶기', REF2)).error, 'B4 알림 1');
    ok(!(await noti('푸시 묶기', REF2)).error, 'B4 같은 내용 알림 2');
    {
      const b = await box();
      ok(b.length === 1 && b[0].channel === 'push', `B4 푸시 줄도 1개 (got ${b.length} · ${b.map(x => x.channel).join(',')})`);
    }
    await dropOutbox(s.A);
  }

  // ============================================================ C. 명부에서 빠진 사람의 묵은 알림 (INT-26)
  sec('C. 명부에서 빠지면 옛 알림도 안 읽힌다 (INT-26)');
  {
    const s = await setup('rls');
    const { data: st } = await admin.from('students').insert({ academy_id: s.A, name: '박지훈' }).select().single();
    const pph = phone(); const pid = await mkUser('박지훈 어머님', pph);
    const { data: pm } = await admin.from('memberships').insert({ user_id: pid, academy_id: s.A, role: 'parent', student_id: st.id }).select().single();
    await admin.from('users').update({ active_membership_id: pm.id }).eq('id', pid);
    await admin.from('guardians').insert({ student_id: st.id, user_id: pid });
    await admin.from('notifications').insert({ academy_id: s.A, user_id: pid, kind: 'notice', title: '옛 공지 알림', body: '', link: 'notice-view:' + uuid() });
    await admin.from('notifications').insert({ academy_id: s.A, user_id: s.dirId, kind: 'notice', title: '원장 알림', body: '', link: 'notice-view:' + uuid() });
    await dropOutbox(s.A);

    const p = await login(pph, pm.id);
    {
      const { data } = await p.from('notifications').select('id, title');
      ok(data?.length === 1, `C1 명부에 있는 동안은 자기 알림이 보인다 (got ${data?.length})`);
    }
    {
      const { data } = await s.d.from('notifications').select('id, title');
      ok(data?.length === 1, `C2 원장도 자기 알림이 보인다 (got ${data?.length})`);
    }

    // 명부에서 뺀다 — 소속·보호자만 지우고 알림은 남긴다(퇴원 뒤 기록 보존과 같은 상태)
    await admin.from('guardians').delete().eq('user_id', pid);
    await admin.from('memberships').delete().eq('id', pm.id);
    {
      const { data, error } = await p.from('notifications').select('id, title');   // 같은(아직 안 만료된) JWT
      ok((data?.length ?? 0) === 0, `C3 소속이 사라지면 남은 세션으로도 0건 (got ${data?.length} ${error?.message ?? ''})`);
    }
    {
      const { data } = await s.d.from('notifications').select('id, title');
      ok(data?.length === 1, `C4 남아 있는 원장은 그대로 보인다 (got ${data?.length})`);
      const { count } = await admin.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', pid);
      ok(count === 1, `C5 알림 행 자체는 지워지지 않는다 (got ${count})`);
    }
  }

  // ============================================================ D. 010 은 11자리 (INP-36)
  sec('D. 명부 번호 — 010 은 11자리 (INP-36)');
  {
    const s = await setup('phone');
    const { data: st } = await admin.from('students').insert({ academy_id: s.A, name: '박지훈' }).select().single();
    const bad = await admin.from('roster_phones').insert({ academy_id: s.A, student_id: st.id, phone: '0101234567', role: 'parent', name: '어머님' });
    ok(/roster_phones_phone_ck|violates check/.test(err(bad)), `D1 010 + 7자리는 거절 (${err(bad) || '들어가 버림'})`);
    const good = await admin.from('roster_phones').insert({ academy_id: s.A, student_id: st.id, phone: '01012345678', role: 'parent', name: '어머님' });
    ok(!good.error, `D2 010 + 8자리는 그대로 들어간다 (${err(good)})`);
    const old = await admin.from('roster_phones').insert({ academy_id: s.A, student_id: st.id, phone: '0111234567', role: 'student', name: '박지훈' });
    ok(!old.error, `D3 011 같은 옛 10자리는 여전히 받는다 (${err(old)})`);
  }
} catch (e) {
  console.error('\n예상 못 한 오류:', e);
  fails.push('예외: ' + (e?.message ?? e));
} finally {
  for (const id of made.academies) { const { error } = await admin.from('academies').delete().eq('id', id); if (error) console.log('  ! academy', error.message); }
  for (const id of made.users) { await admin.auth.admin.deleteUser(id).catch(() => {}); await admin.from('users').delete().eq('id', id); }
  if (tickUrl) await admin.from('app_settings').upsert({ key: 'outbox_url', value: tickUrl.value });
  console.log(`\n정리: 학원 ${made.academies.length}, 사용자 ${made.users.length}` + (tickUrl ? ' · outbox_url 되돌림' : ''));
}

console.log(fails.length ? `\n실패 ${fails.length}건:\n- ` + fails.join('\n- ') : '\n모두 통과');
process.exit(fails.length ? 1 : 0);
