// 이음새 검증 S1~S18 — docs/superpowers/plans/2026-09-04-seam-verification.md §1
// 화면 단위가 아니라 "데이터가 서로 맞물리는 자리" 를 본다. 화면이 여러 번 나눠 부르는 자리(공지 → 달력,
// 기간 넣기의 중복 거르기, 답변 → FAQ)는 앱과 같은 순서로 같은 함수를 부른다 — 원장·학부모 JWT 로 (RLS 도 함께 본다).
// node --env-file=../.env.local seam-test.mjs
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY, ANON = process.env.SUPABASE_ANON_KEY, KEY = process.env.OUTBOX_KEY;
const admin = createClient(URL, SVC, { auth: { persistSession: false } });
const rnd = Math.random().toString(36).slice(2, 8);
const num = () => String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
const PW = 'seam-' + rnd;
const email = p => `${p}@auth.yeongeo.local`;
const sha = s => createHash('sha256').update(s).digest('hex');

/* ── 앱(app/src/lib)의 순수 함수들 — node 에서 import 할 수 없어 여기 그대로 옮겨 둔다 ── */
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const kstDate = off => new Date(Date.now() + 9 * 3600e3 + off * 86400e3).toISOString().slice(0, 10);
const dowOf = iso => new Date(iso + 'T00:00:00Z').getUTCDay();
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
const spanDays = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400e3) + 1;
/** api.ts nextClassDays */
function nextClassDays(schedule, count, closed) {
  const nowK = new Date(Date.now() + 9 * 3600e3);
  const hm = `${String(nowK.getUTCHours()).padStart(2, '0')}:${String(nowK.getUTCMinutes()).padStart(2, '0')}`;
  const out = [];
  for (let i = 0; out.length < count && i < 60; i++) {
    const iso = kstDate(i), dow = dowOf(iso);
    if (closed?.has(iso)) continue;
    if (schedule.some(s => s.dow === dow && (i > 0 || s.start > hm))) out.push(iso);
  }
  return out;
}
/** api.ts closedFor */
const closedFor = (c, classId) => { const s = new Set(c?.all ?? []); for (const d of c?.byClass.get(classId) ?? []) s.add(d); return s; };
/** api.ts nextClassDaysFor */
function nextClassDaysFor(classes, count, closed) {
  const all = new Set();
  for (const c of classes) for (const d of nextClassDays(c.schedule ?? [], count, closedFor(closed, c.id))) all.add(d);
  return [...all].sort().slice(0, count);
}
/** director/Makeup.tsx makeupSlots */
function makeupSlots(classes, closed, count, skipDate) {
  const seen = new Set(); const out = [];
  for (const c of classes) for (const d of nextClassDays(c.schedule ?? [], count, closedFor(closed, c.id))) {
    if (d === skipDate) continue;
    const start = (c.schedule ?? []).filter(s => s.dow === dowOf(d)).map(s => s.start).sort()[0];
    if (!start) continue;
    const k = d + 'T' + start; if (seen.has(k)) continue;
    seen.add(k); out.push({ date: d, time: start });
  }
  out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return out.slice(0, count);
}
/** inbox.ts faqQuestion */
const faqQuestion = body => { const s = body.trim().replace(/\s+/g, ' '); return s.length > 60 ? s.slice(0, 59) + '…' : s; };

/* ── 시험 뼈대 ── */
const results = []; const notes = [];
function must(r, what) { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; }
function assert(c, msg) { if (!c) throw new Error(msg); }
function eq(got, want, msg) { if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`${msg} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
async function S(name, fn) {
  try { const ev = await fn(); results.push({ name, ok: true, ev: ev ?? '' }); console.log(`${name} PASS${ev ? ' — ' + ev : ''}`); }
  catch (e) { results.push({ name, ok: false, ev: e.message }); console.log(`${name} FAIL: ${e.message}`); }
}

/* ── 앱과 같은 호출 순서 (client = 원장/학부모 JWT) ── */
const createNotice = async (c, A, uid, title, body, targetClassId) =>
  must(await c.from('notices').insert({ academy_id: A, author_id: uid, title, body, target_class_id: targetClassId, photos: [] }).select('id, title').single(), 'createNotice');
async function addCalendar(c, A, date, kind, note, classId) {          // api.ts addCalendar 그대로
  let q = c.from('calendar').select('id').eq('date', date).eq('kind', kind);
  q = classId ? q.eq('class_id', classId) : q.is('class_id', null);
  const ex = must(await q.maybeSingle(), 'addCalendar(find)');
  if (ex) must(await c.from('calendar').update({ note: note || null }).eq('id', ex.id), 'addCalendar(update)');
  else must(await c.from('calendar').insert({ academy_id: A, date, kind, note: note || null, class_id: classId }), 'addCalendar(insert)');
}
const listCalendar = async (c, from) => must(await c.from('calendar').select('id, date, kind, note, class_id').gte('date', from).order('date'), 'listCalendar');
const addCalendarMany = async (c, A, dates, kind, note, classId) => {
  if (!dates.length) return;
  must(await c.from('calendar').insert(dates.map(date => ({ academy_id: A, date, kind, note: note || null, class_id: classId }))), 'addCalendarMany');
};
async function closedByClass(c) {                                        // api.ts closedByClass
  const rows = must(await c.from('calendar').select('date, class_id').eq('kind', 'closed').gte('date', kstToday()).lte('date', kstDate(60)), 'closedByClass');
  const all = new Set(); const byClass = new Map();
  for (const r of rows) { if (!r.class_id) all.add(r.date); else { if (!byClass.has(r.class_id)) byClass.set(r.class_id, new Set()); byClass.get(r.class_id).add(r.date); } }
  return { all, byClass };
}
const listStudents = async c => (must(await c.from('students').select('id, name, status, enrollments(classes(id, name, schedule))'), 'listStudents'))
  .map(r => ({ id: r.id, name: r.name, status: r.status, classes: (r.enrollments ?? []).map(e => e.classes).filter(Boolean) }));
const saveAttendanceWithNotes = async (c, A, uid, classId, date, rows) =>  // attendance.ts saveAttendanceWithNotes
  must(await c.from('attendance').upsert(rows.map(r => ({
    academy_id: A, class_id: classId, date, student_id: r.student_id,
    status: r.status, note: r.note?.trim() ? r.note.trim() : null, marked_by: uid,
  })), { onConflict: 'student_id,class_id,date' }), 'saveAttendanceWithNotes');
const listFaqs = async c => must(await c.from('faqs').select('id, q, a, sort').order('sort'), 'listFaqs');
/* inbox.ts saveFaqDedup — 같은 질문(대소문자·앞뒤 공백 무시)이 있으면 답만 바꾸고, 없으면 새로 넣는다 */
const saveFaqDedup = async (c, A, q, a) => {
  const list = await listFaqs(c);
  const key = q.trim().toLowerCase();
  const hit = list.find(f => (f.q ?? '').trim().toLowerCase() === key);
  if (hit) return must(await c.from('faqs').update({ q: q.trim(), a }).eq('id', hit.id), 'saveFaqDedup(update)'), 'updated';
  must(await c.from('faqs').insert({ academy_id: A, q: q.trim(), a, sort: list.length + 1 }), 'saveFaqDedup(insert)');
  return 'added';
};

/* ── 조회 거들기 (service key — 확인용) ── */
const cal = async (A, date, kind, classId) => must(await admin.from('calendar').select('id, note').eq('academy_id', A).eq('date', date).eq('kind', kind).eq('class_id', classId), 'cal');
const notifs = async (uid, kind, link) => must(await admin.from('notifications').select('id, title, body, link').eq('user_id', uid).eq('kind', kind).eq('link', link), 'notifs');
const obKey = async key => must(await admin.from('outbox').select('id, channel, template_code, params, link_view, link_ref').eq('idempotency_key', key), 'obKey');

async function mkUser(name, phone) {
  const { data, error } = await admin.auth.admin.createUser({ email: email(phone), password: PW, email_confirm: true });
  if (error) throw error;
  await admin.from('users').insert({ id: data.user.id, name, phone });
  return data.user.id;
}
async function signIn(phone) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: email(phone), password: PW });
  if (error) throw new Error('로그인 실패 ' + phone + ': ' + error.message);
  return c;
}

/** 배포된 outbox-send 의 푸시 본문을 확인한다 (PASS/FAIL 이 아니라 NOTE — 배포는 부르는 쪽이 한다) */
async function pushBodyProbe() {
  try {
    if (!KEY || !n5) { notes.push('푸시 본문 확인 건너뜀 — OUTBOX_KEY 또는 S5 알림이 없습니다.'); return; }
    const [row] = await obKey('push:' + n5.id);
    if (!row) { notes.push('푸시 본문 확인 건너뜀 — ATTENDANCE push 줄이 없습니다.'); return; }
    await admin.from('outbox').update({ status: 'queued', attempts: 0, next_attempt_at: null }).eq('id', row.id);
    const r = await fetch(`${URL}/functions/v1/outbox-send`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Outbox-Key': KEY }, body: '{}' });
    if (!r.ok) { notes.push(`푸시 본문 확인 건너뜀 — outbox-send ${r.status}`); return; }
    const b = await r.json().catch(() => ({}));
    const mine = (b.debug ?? []).filter(x => x.channel === 'push' && x.template_code === 'ATTENDANCE' && String(x.body ?? '').includes('박첫째'));
    const after = must(await admin.from('outbox').select('status, last_error').eq('id', row.id).single(), 'push row after');
    if (!mine.length) {
      notes.push(`푸시 본문 확인 건너뜀 — 발송기가 이 줄을 안 돌려줬습니다 (status=${after.status} ${after.last_error ?? ''}). PUSH_DRY_RUN=1 과 새 outbox-send 배포가 필요합니다.`);
    } else if (!String(mine[0].body).includes(' · 10분')) {
      notes.push(`푸시 본문에 사유가 없습니다 — 배포된 outbox-send 가 아직 옛 _shared/push.ts 입니다: npx supabase functions deploy outbox-send --no-verify-jwt (got body="${mine[0].body}")`);
    } else {
      notes.push(`푸시 본문 확인 OK — "${mine[0].body}"`);
    }
  } catch (e) { notes.push('푸시 본문 확인 건너뜀 — ' + e.message); }
}

let A = null; const madeUsers = []; const madePhones = [];
let att1 = null, n5 = null;   // S5 가 채운다 — pushBodyProbe 가 읽는다
const YM = kstToday().slice(0, 7);
const YM2 = (() => { const [y, m] = YM.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; })();

try {
  /* ═══ 준비: 학원 하나(seam- 접두어), 반 하나(매일 19:00), 원장, 형제 둘, 그 엄마 ═══ */
  const ac = must(await admin.from('academies').insert({ slug: `seam-${rnd}`, name: '이음새 학원' }).select().single(), '학원');
  A = ac.id;
  const SCHED = [0, 1, 2, 3, 4, 5, 6].map(dow => ({ dow, start: '19:00', end: '21:00' }));
  const c1 = must(await admin.from('classes').insert({ academy_id: A, name: '고1 A', schedule: SCHED }).select().single(), '반');
  const P_DIR = '0109' + num() + '3', P_MOM = '0109' + num() + '1', P_INV = '0109' + num() + '7';
  madePhones.push(P_DIR, P_MOM, P_INV);
  const dirId = await mkUser('김지영', P_DIR); madeUsers.push(dirId);
  const dm = must(await admin.from('memberships').insert({ user_id: dirId, academy_id: A, role: 'director' }).select().single(), '원장 소속');
  await admin.from('users').update({ active_membership_id: dm.id }).eq('id', dirId);
  const d = await signIn(P_DIR);

  const ST1 = must(await d.rpc('roster_save_student', { sid: null, p_name: '박첫째', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [P_MOM] }), '첫째 저장');
  const ST2 = must(await d.rpc('roster_save_student', { sid: null, p_name: '박둘째', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [P_MOM] }), '둘째 저장');
  const momId = await mkUser('박첫째 어머님', P_MOM); madeUsers.push(momId);
  const mm1 = must(await admin.from('memberships').insert({ user_id: momId, academy_id: A, role: 'parent', student_id: ST1 }).select().single(), '엄마 소속1');
  await admin.from('memberships').insert({ user_id: momId, academy_id: A, role: 'parent', student_id: ST2 });
  await admin.from('guardians').insert([{ student_id: ST1, user_id: momId }, { student_id: ST2, user_id: momId }]);
  await admin.from('users').update({ active_membership_id: mm1.id }).eq('id', momId);
  const p = await signIn(P_MOM);

  /* ═══ S1. 공지 ↔ 휴원일 — 휴원 안내 공지(날짜 D, 보강일 M, 반 C) ═══
     Notices.tsx: createNotice → (틀이 closed 이고 '휴원일에도 등록하기' 체크) addCalendar(D,'closed') + addCalendar(M,'makeup') */
  const D = kstDate(3), M = kstDate(5), WHY = '추석 연휴';
  const NT = `${D} 휴원 안내 ${rnd}`;
  async function postClosedNotice() {
    await createNotice(d, A, dirId, NT, `${D}은 ${WHY}로 휴원합니다.\n보강은 ${M}에 합니다.`, c1.id);
    await addCalendar(d, A, D, 'closed', WHY, c1.id);
    await addCalendar(d, A, M, 'makeup', `보강 · ${WHY}`, c1.id);
  }
  await S('S1', async () => {
    await postClosedNotice();
    const n = must(await admin.from('notices').select('id').eq('academy_id', A).eq('title', NT), 'notices');
    eq(n.length, 1, '공지 1행');
    eq((await cal(A, D, 'closed', c1.id)).length, 1, `휴원 calendar(${D}, 반) 1행`);
    eq((await cal(A, M, 'makeup', c1.id)).length, 1, `보강 calendar(${M}, 반) 1행`);
    return `notices 1 · closed(${D}) 1 · makeup(${M}) 1`;
  });

  /* ═══ S2. 같은 날짜로 한 번 더 — 공지는 2행(중복 허용), calendar 는 그대로 1행씩 ═══ */
  await S('S2', async () => {
    await postClosedNotice();
    const n = must(await admin.from('notices').select('id').eq('academy_id', A).eq('title', NT), 'notices');
    eq(n.length, 2, '공지 2행(중복 허용)');
    eq((await cal(A, D, 'closed', c1.id)).length, 1, '휴원 calendar 여전히 1행');
    eq((await cal(A, M, 'makeup', c1.id)).length, 1, '보강 calendar 여전히 1행');
    notes.push('S2 — DB 는 기대대로(공지 2 · 달력 1+1). 화면(Notices.tsx)은 이제 같은 날·갈래·반이 이미 있으면 달력을 건드리지 않고 "공지를 올렸어요 · 휴원일은 이미 있어서 그대로 뒀어요" 로 알린다.');
    return 'notices 2 · calendar 1+1 (UI 는 "이미 있어요" 안내)';
  });

  /* ═══ S3. 휴원일 → 학부모: D 가 다음 수업·결석 신청 후보에서 빠진다 ═══ */
  await S('S3', async () => {
    const kids = await listStudents(p);
    const child = kids.find(k => k.id === ST1);
    assert(child, '학부모가 자녀를 본다');
    const closed = await closedByClass(p);
    const withClosed = nextClassDaysFor(child.classes, 6, closed);
    const without = nextClassDaysFor(child.classes, 6, undefined);
    assert(without.includes(D), `휴원을 빼기 전에는 D(${D}) 가 후보에 있다 — got ${JSON.stringify(without)}`);
    assert(!withClosed.includes(D), `휴원일 D(${D}) 가 후보에서 빠진다 — got ${JSON.stringify(withClosed)}`);
    assert(closed.byClass.get(c1.id)?.has(D), '반별 휴원으로 잡힌다');
    return `nextClassDaysFor ${JSON.stringify(withClosed)} 에 ${D} 없음`;
  });

  /* ═══ S4. 휴원일 기간·반복 — Calendar.tsx add() 그대로 (listCalendar 로 이미 있는 날 거르고 addCalendarMany) ═══ */
  await S('S4', async () => {
    async function addRange(days) {
      const had = new Set((await listCalendar(d, days[0])).filter(x => x.kind === 'closed' && x.class_id === c1.id).map(x => x.date));
      const fresh = days.filter(x => !had.has(x));
      await addCalendarMany(d, A, fresh, 'closed', '기간 휴원', c1.id);
      return { fresh: fresh.length, skipped: days.length - fresh.length };
    }
    const R0 = kstDate(10);
    const range = Array.from({ length: spanDays(R0, kstDate(12)) }, (_, i) => addDays(R0, i));
    eq(range.length, 3, '기간 3일');
    const a1 = await addRange(range);
    eq(a1, { fresh: 3, skipped: 0 }, '첫 번째 기간 3행');
    const a2 = await addRange(range);
    eq(a2, { fresh: 0, skipped: 3 }, '두 번째 기간 0행(건너뜀 3)');
    eq(must(await admin.from('calendar').select('id').eq('academy_id', A).eq('kind', 'closed').eq('class_id', c1.id).in('date', range), 'range rows').length, 3, '기간 행은 3행 그대로');
    // 매주 4주 — 시작 날짜의 요일로 4번
    const W0 = kstDate(20);
    const weekly = Array.from({ length: 4 }, (_, i) => addDays(W0, i * 7));
    const a3 = await addRange(weekly);
    eq(a3, { fresh: 4, skipped: 0 }, '매주 4행');
    eq(must(await admin.from('calendar').select('id').eq('academy_id', A).eq('kind', 'closed').eq('class_id', c1.id).in('date', weekly), 'weekly rows').length, 4, '매주 행 4행');
    return '기간 3 → 0(건너뜀 3) · 매주 4';
  });

  /* ═══ S5. 출석 사유 ↔ 알림 — 지각 + 사유 "10분" ═══ */
  const DATE = kstToday();
  await S('S5', async () => {
    // 학부모가 푸시를 구독한다 (학부모 JWT — RLS: 본인 행만)
    const sub = must(await p.from('push_subscriptions').insert({
      user_id: momId, endpoint: `https://fcm.example.invalid/seam/${rnd}-mom`,
      p256dh: 'BJxc' + 'A'.repeat(83), auth: 'Zm9vYmFyYmF6cXV4MTIz', ua: 'seam-test',
    }).select().single(), 'push 구독(학부모 JWT)');
    assert(sub.user_id === momId, '본인 구독');

    await saveAttendanceWithNotes(d, A, dirId, c1.id, DATE, [{ student_id: ST1, status: 'late', note: '10분' }]);
    att1 = must(await admin.from('attendance').select('id, note, status').eq('student_id', ST1).eq('class_id', c1.id).eq('date', DATE).single(), 'attendance');
    eq(att1.note, '10분', 'attendance.note');
    const ns = await notifs(momId, 'attendance', 'child:' + att1.id);
    eq(ns.length, 1, '학부모 알림 1행');
    n5 = ns[0];
    assert(n5.title.includes('10분'), `알림 제목에 사유 — got ${n5.title}`);
    assert(n5.body.includes('10분'), `알림 본문에 사유 — got ${n5.body}`);
    const push = await obKey('push:' + n5.id);
    eq(push.length, 1, '구독했으니 outbox push 행 1');
    eq(push[0].template_code, 'ATTENDANCE', 'push 템플릿');
    eq((await obKey('n:' + n5.id)).length, 0, '푸시로 갔으니 카톡 행은 없다');
    assert(push[0].params['사유'] === '10분', `push params['사유'] 에 사유가 실린다 (0016 + push.ts 가 본문에 ' · 사유' 를 붙인다) — got ${JSON.stringify(push[0].params)}`);
    return `note='10분' · 알림 1행(제목·본문에 사유) · push 행 1 params['사유']='10분'`;
  });

  /* ── 참고(NOTE 만): 배포된 outbox-send 가 푸시 본문에 사유를 붙이는지. PUSH_DRY_RUN=1 + 새 push.ts 배포가 있어야 한다.
        1분 틱이 먼저 줄을 가져갔을 수 있어 그 한 줄만 다시 queued 로 돌려 놓고 부른다. ── */
  await pushBodyProbe();

  /* ═══ S6. 같은 날 같은 학생을 두 번 저장(상태 동일) — attendance 1행(upsert), 알림 1행(멱등) ═══ */
  await S('S6', async () => {
    assert(att1, 'S5 가 먼저 서야 한다');
    await saveAttendanceWithNotes(d, A, dirId, c1.id, DATE, [{ student_id: ST1, status: 'late', note: '10분' }]);
    const rows = must(await admin.from('attendance').select('id').eq('student_id', ST1).eq('class_id', c1.id).eq('date', DATE), 'attendance rows');
    eq(rows.length, 1, 'attendance 1행(upsert)');
    eq((await notifs(momId, 'attendance', 'child:' + att1.id)).length, 1, `알림 (학부모, attendance, ${att1.id}) 1행`);
    eq((await obKey('push:' + n5.id)).length, 1, 'outbox push 행도 1행');
    return 'attendance 1 · notifications 1 · outbox 1';
  });

  /* ═══ S7. 출석 → 결석으로 바꿔 저장 — attendance 1행 갱신, 새 알림 1행 ═══ */
  await S('S7', async () => {
    await saveAttendanceWithNotes(d, A, dirId, c1.id, DATE, [{ student_id: ST2, status: 'present', note: '' }]);
    const a0 = must(await admin.from('attendance').select('id, status').eq('student_id', ST2).eq('class_id', c1.id).eq('date', DATE).single(), 'attendance(present)');
    eq((await notifs(momId, 'attendance', 'child:' + a0.id)).length, 0, '출석은 알림이 없다');
    await saveAttendanceWithNotes(d, A, dirId, c1.id, DATE, [{ student_id: ST2, status: 'absent', note: '아픔' }]);
    const rows = must(await admin.from('attendance').select('id, status, note').eq('student_id', ST2).eq('class_id', c1.id).eq('date', DATE), 'attendance rows');
    eq(rows.length, 1, 'attendance 1행 갱신');
    eq(rows[0].status, 'absent', '상태 결석');
    eq(rows[0].id, a0.id, '같은 행을 고쳤다');
    const ns = await notifs(momId, 'attendance', 'child:' + a0.id);
    eq(ns.length, 1, '상태가 바뀌어 새 알림 1행');
    assert(ns[0].title.includes('결석') && ns[0].title.includes('아픔'), `새 알림에 새 상태·사유 — got ${ns[0].title}`);
    return 'attendance 1행 갱신 · 새 알림 1행(결석 · 아픔)';
  });

  /* ═══ S8. 수강료 ↔ 학생 — 형제 둘 + 반 요금제 → issue_invoices 두 번 ═══ */
  await S('S8', async () => {
    must(await d.from('billing_rules').upsert({ academy_id: A, billing_day: 1, due_day: 5, sibling_discount_pct: 10, bank_info: '국민 123-45 이음새' }), 'billing_rules');
    must(await d.from('fee_plans').insert({ academy_id: A, class_id: c1.id, name: '고1 정규', amount: 150000 }), 'fee_plans');
    eq(must(await d.rpc('issue_invoices', { p_ym: YM }), 'issue_invoices'), 2, '첫 번째 → 2행');
    const invs = must(await admin.from('invoices').select('student_id, amount, discount, total, status').eq('academy_id', A).eq('period_ym', YM), 'invoices');
    eq(invs.length, 2, '청구서 2장');
    eq(invs.filter(i => i.discount === 15000 && i.total === 135000).length, 1, '형제 할인 한 장');
    eq(invs.filter(i => i.discount === 0 && i.total === 150000).length, 1, '먼저 등록한 아이는 할인 없음');
    eq(must(await d.rpc('issue_invoices', { p_ym: YM }), 'issue_invoices 2'), 0, '두 번째 → 0행');
    return '첫 2행(형제 할인 1) · 두 번째 0행';
  });

  /* ═══ S9. 퇴원생은 청구 제외, 재입학 뒤 다시 청구 ═══ */
  await S('S9', async () => {
    must(await d.rpc('student_leave', { sid: ST2 }), 'student_leave');
    const n1 = must(await d.rpc('issue_invoices', { p_ym: YM2 }), `issue_invoices(${YM2})`);
    eq(n1, 1, `퇴원 뒤 ${YM2} 는 남은 학생 1장만`);
    eq(must(await admin.from('invoices').select('id').eq('student_id', ST2).eq('period_ym', YM2), 'ST2 invoices').length, 0, '퇴원생 청구서 0');
    must(await d.rpc('roster_save_student', { sid: ST2, p_name: '박둘째', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [P_MOM] }), '재입학');
    eq(must(await admin.from('students').select('status').eq('id', ST2).single(), 'ST2 status').status, 'active', '재입학 → active');
    const n2 = must(await d.rpc('issue_invoices', { p_ym: YM2 }), `issue_invoices(${YM2}) 2`);
    eq(n2, 1, '재입학 뒤 → 1행');
    eq(must(await admin.from('invoices').select('id').eq('student_id', ST2).eq('period_ym', YM2), 'ST2 invoices 2').length, 1, '재입학생 청구서 1');
    return `퇴원 뒤 ${YM2} issue 1(퇴원생 0) · 재입학 뒤 1`;
  });

  /* ═══ S10. 납부: 부분 → 전액 ═══ */
  let inv1 = null;
  await S('S10', async () => {
    inv1 = must(await admin.from('invoices').select('id, total').eq('student_id', ST1).eq('period_ym', YM).single(), 'inv1');
    must(await d.rpc('record_payment', { p_invoice: inv1.id, p_amount: 50000, p_method: 'transfer' }), 'record_payment(부분)');
    eq(must(await admin.from('invoices').select('status').eq('id', inv1.id).single(), 'inv1 status').status, 'partial', '부분 → partial');
    let mine = must(await p.rpc('my_invoice', { p_ym: YM }), 'my_invoice(부분)');
    eq(mine[0]?.status, 'partial', '학부모 my_invoice 도 partial');
    eq(mine[0]?.paid, 50000, '학부모 카드 납부 합계 50,000');
    must(await d.rpc('record_payment', { p_invoice: inv1.id, p_amount: inv1.total - 50000, p_method: 'cash' }), 'record_payment(나머지)');
    const got = must(await admin.from('invoices').select('status, paid_at').eq('id', inv1.id).single(), 'inv1 paid');
    eq(got.status, 'paid', '전액 → paid');
    assert(!!got.paid_at, 'paid_at 기록');
    const pays = must(await admin.from('payments').select('amount').eq('invoice_id', inv1.id), 'payments');
    eq(pays.reduce((a, x) => a + x.amount, 0), inv1.total, 'payments 합계 = total');
    mine = must(await p.rpc('my_invoice', { p_ym: YM }), 'my_invoice(전액)');
    eq(mine[0]?.status, 'paid', '학부모 my_invoice 상태 일치');
    eq(mine[0]?.paid, inv1.total, '학부모 카드 납부 합계 = total');
    return `partial → paid · payments 합 ${inv1.total} = total · my_invoice paid`;
  });

  /* ═══ S11. 미납 안내 remind_unpaid 두 번(20시간 안) ═══ */
  await S('S11', async () => {
    const n1 = must(await d.rpc('remind_unpaid', { p_ym: YM }), 'remind_unpaid');
    eq(n1, 1, '첫 번째 → 1 (ST1 은 완납, ST2 만 미납)');
    const bills = must(await admin.from('notifications').select('id, user_id, title').eq('academy_id', A).eq('kind', 'billing'), 'billing notifs');
    eq(bills.length, 1, '학부모 알림 1행');
    eq(bills[0].user_id, momId, '받는 사람은 엄마');
    const n2 = must(await d.rpc('remind_unpaid', { p_ym: YM }), 'remind_unpaid 2');
    eq(n2, 0, '20시간 안에 두 번째 → 0');
    eq(must(await admin.from('notifications').select('id').eq('academy_id', A).eq('kind', 'billing'), 'billing notifs 2').length, 1, '알림도 늘지 않는다');
    return '첫 1 · 두 번째 0 · notifications 1';
  });

  /* ═══ S12. 초대 ↔ 명부 — 토큰 발급 뒤 명부에서 번호 삭제 → 링크 사용 ═══ */
  const inviteCall = body => fetch(`${URL}/functions/v1/invite-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + ANON }, body: JSON.stringify(body),
  });
  const ST3 = must(await d.rpc('roster_save_student', { sid: null, p_name: '박셋째', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [P_INV] }), '셋째 저장');
  await S('S12', async () => {
    const tok = must(await d.rpc('create_invite', { p_phone: P_INV }), 'create_invite');
    assert(/^[0-9a-f]{32}$/.test(tok), '32 hex 토큰');
    // 명부에서 그 번호를 뺀다 — 명부 화면이 부르는 RPC 그대로 (번호를 빼고 다시 저장)
    must(await d.rpc('roster_save_student', { sid: ST3, p_name: '박셋째', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [] }), 'roster 번호 삭제');
    eq(must(await admin.from('roster_phones').select('id').eq('academy_id', A).eq('phone', P_INV), 'roster').length, 0, '명부 행 삭제됨');
    const r = await inviteCall({ token: tok });
    const j = await r.json().catch(() => ({}));
    assert([401, 404].includes(r.status), `명부에 없는 번호의 링크는 거절 — got ${r.status} ${JSON.stringify(j)}`);
    assert(j.error === 'not_in_roster', `error=not_in_roster — got ${JSON.stringify(j)}`);
    if (r.status !== 401) notes.push(`S12 — 계획서는 401 을 적었지만 실제 응답은 ${r.status} not_in_roster 다 (_shared/auth.ts ensureUser 가 명부 0행에서 AuthFail(404) 를 던진다). 거절이라는 뜻은 같다.`);
    return `invite-login ${r.status} ${j.error}`;
  });

  /* ═══ S13. 재발급 — 옛 토큰 401 used/expired, 새 토큰 200 ═══ */
  await S('S13', async () => {
    must(await d.rpc('roster_save_student', { sid: ST3, p_name: '박셋째', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [P_INV] }), 'roster 번호 복구');
    const tokA = must(await d.rpc('create_invite', { p_phone: P_INV }), 'create_invite A');
    const tokB = must(await d.rpc('create_invite', { p_phone: P_INV }), 'create_invite B');
    assert(tokA !== tokB, '새 토큰은 다른 값');
    const rA = await inviteCall({ token: tokA }); const jA = await rA.json().catch(() => ({}));
    eq([rA.status, jA.error], [401, 'expired'], `옛 토큰은 401 expired — got ${rA.status} ${JSON.stringify(jA)}`);
    const rB = await inviteCall({ token: tokB }); const jB = await rB.json().catch(() => ({}));
    eq(rB.status, 200, `새 토큰은 200 — got ${rB.status} ${JSON.stringify(jB).slice(0, 160)}`);
    assert(jB.session?.access_token && jB.session?.refresh_token, '정식 세션이 나온다');
    eq(jB.academy_id, A, '이 학원으로 열린다');
    if (jB.user_id) madeUsers.push(jB.user_id);
    // 다시 쓰면(10분 안) used_at 이 서고, 11분 뒤에는 401 used
    await admin.from('invite_tokens').update({ used_at: new Date(Date.now() - 11 * 60e3).toISOString() }).eq('token_hash', sha(tokB));
    const rC = await inviteCall({ token: tokB }); const jC = await rC.json().catch(() => ({}));
    eq([rC.status, jC.error], [401, 'used'], `11분 뒤 옛 토큰은 401 used — got ${rC.status} ${JSON.stringify(jC)}`);
    return '옛 토큰 401 expired · 새 토큰 200(세션) · 11분 뒤 401 used';
  });

  /* ═══ S14. 푸시 ↔ 카톡 — 구독 없음 / 구독 / kakao_also / 구독 삭제 ═══ */
  await S('S14', async () => {
    const subs = must(await p.from('push_subscriptions').select('id'), 'my subs');
    for (const s of subs) must(await p.from('push_subscriptions').delete().eq('id', s.id), '구독 삭제(학부모 JWT)');
    eq(must(await admin.from('push_subscriptions').select('id').eq('user_id', momId), 'subs after del').length, 0, '구독 0');

    async function noticeAndLook(tag) {
      const n = await createNotice(d, A, dirId, `S14 ${tag} ${rnd}`, '본문', c1.id);
      const [row] = await notifs(momId, 'notice', 'notice-view:' + n.id);
      assert(row, `${tag}: 학부모 알림이 선다`);
      return { push: (await obKey('push:' + row.id)).length, kakao: (await obKey('n:' + row.id)).length };
    }
    eq(await noticeAndLook('a'), { push: 0, kakao: 1 }, '구독 없음 → 카톡(sms)만');
    const sub = must(await p.from('push_subscriptions').insert({
      user_id: momId, endpoint: `https://fcm.example.invalid/seam/${rnd}-mom2`,
      p256dh: 'BJxc' + 'A'.repeat(83), auth: 'Zm9vYmFyYmF6cXV4MTIz', ua: 'seam-test',
    }).select().single(), '구독 넣기(학부모 JWT)');
    eq(await noticeAndLook('b'), { push: 1, kakao: 0 }, '구독 → 푸시만');
    must(await p.from('users').update({ prefs: { kakao_also: true } }).eq('id', momId), 'prefs kakao_also(학부모 JWT)');
    eq(await noticeAndLook('c'), { push: 1, kakao: 1 }, 'kakao_also → 푸시 + 카톡');
    must(await p.from('users').update({ prefs: {} }).eq('id', momId), 'prefs 되돌리기');
    must(await p.from('push_subscriptions').delete().eq('id', sub.id), '구독 삭제(학부모 JWT)');
    eq(await noticeAndLook('d'), { push: 0, kakao: 1 }, '구독 삭제 → 다시 카톡');
    return 'sms / push / push+sms / sms';
  });

  /* ═══ S15. 보강 칩 ↔ 결석 — 결석 신청에 보강일 칩 → 확정 ═══ */
  await S('S15', async () => {
    const ABS_DATE = kstDate(1);
    const ab = must(await p.from('absence_requests').insert({ academy_id: A, student_id: ST1, requested_by: momId, date: ABS_DATE, reason: '병원' }).select('id').single(), 'requestAbsence(학부모 JWT)');
    // Makeup.tsx: studentDetail + closedByClass → makeupSlots(4) 의 첫 칩
    const st = must(await d.from('students').select('id, enrollments(classes(id, name, schedule))').eq('id', ST1).single(), 'studentDetail');
    const classes = (st.enrollments ?? []).map(e => e.classes).filter(Boolean);
    const closed = await closedByClass(d);
    const slots = makeupSlots(classes, closed, 4, ABS_DATE);
    assert(slots.length > 0, '보강 칩 후보가 있다');
    assert(!slots.some(s => s.date === D), `보강 칩에 휴원일 ${D} 는 없다 — got ${JSON.stringify(slots)}`);
    const chip = slots[0];
    const at = `${chip.date}T${chip.time}:00+09:00`;
    must(await d.from('absence_requests').update({ status: 'confirmed', makeup_kind: 'saturday', makeup_at: at, decided_by: dirId }).eq('id', ab.id), 'confirmMakeup(원장 JWT)');
    const got = must(await admin.from('absence_requests').select('makeup_at, status').eq('id', ab.id).single(), 'absence');
    eq(got.status, 'confirmed', '확정');
    eq(Date.parse(got.makeup_at), Date.parse(at), `makeup_at = 칩 시각(${at})`);
    const ns = await notifs(momId, 'absence', 'child:' + ab.id);
    eq(ns.length, 1, 'MAKEUP_CONFIRMED 학부모 알림 1행');
    const ob = [...(await obKey('push:' + ns[0].id)), ...(await obKey('n:' + ns[0].id))];
    eq(ob.length, 1, '보낼 줄 1행');
    eq(ob[0].template_code, 'MAKEUP_CONFIRMED', 'MAKEUP_CONFIRMED');
    return `makeup_at=${at} · 알림 1행 · outbox MAKEUP_CONFIRMED 1행`;
  });

  /* ═══ S16. 답변 → FAQ — "FAQ 에도 올리기" 체크 → 답변, 두 번 눌러도 faq 1행 ═══ */
  await S('S16', async () => {
    const BODY = `보강은 언제 하나요? ${rnd}`;
    const q = must(await p.from('inquiries').insert({ academy_id: A, student_id: ST1, asked_by: momId, topic: '보강 문의', body: BODY }).select('id').single(), 'createInquiry(학부모 JWT)');
    const ANSWER = '네, 확인했어요. 그날 보강 잡아 드릴게요.';
    // Inbox.tsx send(): answerInquiry → (toFaq) saveFaqDedup(faqQuestion(body), answer) — 있으면 답만 바꾼다
    // (0017 의 unique index faqs(academy_id, lower(btrim(q))) 가 마지막 방어)
    async function send() {
      must(await d.from('inquiries').update({ answer: ANSWER, answered_by: dirId, answered_at: new Date().toISOString() }).eq('id', q.id), 'answerInquiry');
      return saveFaqDedup(d, A, faqQuestion(BODY), ANSWER);
    }
    await send();
    const inq = must(await admin.from('inquiries').select('answer, answered_at').eq('id', q.id).single(), 'inquiry');
    assert(inq.answer === ANSWER && !!inq.answered_at, '문의가 answered 로 바뀐다');
    eq(must(await admin.from('faqs').select('id').eq('academy_id', A), 'faqs').length, 1, 'faq 1행');
    const second = await send();
    eq(must(await admin.from('faqs').select('id').eq('academy_id', A), 'faqs 2').length, 1, '두 번 눌러도 faq 1행');
    eq(second, 'updated', '두 번째는 새로 넣지 않고 답만 바꾼다');
    // DB 도 막는지 — 같은 질문을 대문자로 바꿔 곧바로 insert 하면 unique index 가 거절해야 한다
    const dupe = await d.from('faqs').insert({ academy_id: A, q: faqQuestion(BODY).toUpperCase(), a: ANSWER, sort: 9 });
    assert(!!dupe.error, `대소문자만 다른 같은 질문은 DB 가 막는다 (got ${dupe.error?.code ?? 'no error'})`);
    return 'inquiries answered · faq 1행 (두 번 눌러도) · 중복 insert 는 DB 가 거절';
  });

  /* ═══ S17. 반 자동 선택 — 순수 함수 단위 테스트(app/src/lib/attendance.test.ts pickInitialClass) ═══ */
  results.push({ name: 'S17', ok: true, ev: 'SKIP — 순수 함수라 vitest 로 이미 본다 (app/src/lib/attendance.test.ts pickInitialClass)', skip: true });
  console.log('S17 SKIP — 순수 함수 단위 테스트(app/src/lib/attendance.test.ts pickInitialClass)');

  /* ═══ S18. 뷰잉 일치 — 원장 화면 합계 = invoices total 합 = 학부모 카드 금액 ═══ */
  await S('S18', async () => {
    // billing.ts listInvoices (원장 JWT)
    const rows = must(await d.from('invoices')
      .select('id, student_id, period_ym, amount, discount, textbook, total, due_date, status, paid_at, reminded_at, memo, students(name), payments(amount)')
      .eq('period_ym', YM), 'listInvoices(원장 JWT)');
    const view = rows.map(r => ({ id: r.id, student_id: r.student_id, student_name: r.students?.name ?? '', total: r.total, paid: (r.payments ?? []).reduce((a, x) => a + (x.amount ?? 0), 0) }));
    const viewSum = view.reduce((a, x) => a + x.total, 0);
    const dbRows = must(await admin.from('invoices').select('total').eq('academy_id', A).eq('period_ym', YM), 'db invoices');
    const dbSum = dbRows.reduce((a, x) => a + x.total, 0);
    eq(viewSum, dbSum, `원장 화면 합계 = invoices total 합 (${viewSum} vs ${dbSum})`);
    eq(view.length, dbRows.length, '장수도 같다');
    const mine = must(await p.rpc('my_invoice', { p_ym: YM }), 'my_invoice(학부모 JWT)');
    assert(mine.length === 1, '학부모 카드 한 장');
    const forChild = view.find(v => v.student_id === ST1);
    eq([mine[0].total, mine[0].paid, mine[0].status], [forChild.total, forChild.paid, rows.find(r => r.student_id === ST1).status], '학부모 카드 = 원장 화면의 그 줄');
    return `합계 ${viewSum}원 (RPC/화면/DB 동일) · 학부모 카드 ${mine[0].total}원`;
  });

} catch (e) {
  results.push({ name: '준비', ok: false, ev: e.message });
  console.log('준비 FAIL: ' + e.message);
} finally {
  /* ── 정리: 학원(cascade) 먼저, 그다음 이 시험이 만든 auth 사용자 ── */
  if (A) { const { error } = await admin.from('academies').delete().eq('id', A); if (error) console.log('정리 실패(학원): ' + error.message); }
  const { data: leftovers } = await admin.from('users').select('id').in('phone', madePhones);
  for (const u of [...new Set([...madeUsers, ...(leftovers ?? []).map(x => x.id)])]) {
    const { error } = await admin.auth.admin.deleteUser(u); if (error) console.log('정리 실패(사용자 ' + u + '): ' + error.message);
  }
}

console.log('\n— 결과 —');
for (const r of results) console.log(`${r.name.padEnd(4)} ${r.skip ? 'SKIP' : r.ok ? 'PASS' : 'FAIL'}  ${r.ev}`);
for (const n of notes) console.log('NOTE: ' + n);
const failed = results.filter(r => !r.ok);
if (failed.length) { console.error(`\nFAIL ${failed.length}건: ` + failed.map(r => r.name).join(', ')); process.exitCode = 1; }
else console.log('\nPASS: seam S1~S18');
