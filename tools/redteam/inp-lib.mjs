// 적대적 입력 점검 공용 — 자기 학원(slug rt-inp-*)만 만들고 지운다.
// 실행: cd tools && node --env-file=../.env.local redteam/inp-01-notices.mjs
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

export const URL_ = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
export const admin = createClient(URL_, SVC, { auth: { persistSession: false } });
export const PW = 'rt-inp-' + Math.random().toString(36).slice(2, 10);
export const email = (p) => `${p}@auth.yeongeo.local`;
export const rnd = () => Math.random().toString(36).slice(2, 8);
export const num = () => String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
export const kst = (off = 0) => new Date(Date.now() + 9 * 3600e3 + off * 86400e3).toISOString().slice(0, 10);

export const findings = [];
export const F = (id, sev, what, repro, evidence) => findings.push({ id, sev, what, repro, evidence });
export const HELD = [];
export const held = (what, evidence) => HELD.push({ what, evidence });

// 학원 이름에 ']' 와 줄바꿈을 심어 둔다 — params['학원'] 이 모든 outbox 행에 흘러간다.
export const HOSTILE_ACADEMY_NAME = 'rt-inp] 테스트\n둘째줄';

export async function mkUser(name, phone) {
  const { data, error } = await admin.auth.admin.createUser({ email: email(phone), password: PW, email_confirm: true });
  if (error) throw error;
  await admin.from('users').insert({ id: data.user.id, name, phone });
  return data.user.id;
}

/** 학원 + 반 + 원장 + 학생 + 학부모. 원장/학부모 익명 클라이언트를 로그인시켜 돌려준다. */
export async function setup(tag, { academyName = HOSTILE_ACADEMY_NAME } = {}) {
  const r = rnd();
  const { data: ac, error } = await admin.from('academies').insert({ slug: `rt-inp-${tag}-${r}`, name: academyName }).select().single();
  if (error) throw error;
  const A = ac.id;
  const { data: cls } = await admin.from('classes').insert({ academy_id: A, name: '적대 반', schedule: [{ dow: 1, start: '19:00', end: '21:00' }, { dow: 3, start: '19:00', end: '21:00' }] }).select().single();
  const P_DIR = '0109' + num() + '3', P_MOM = '0109' + num() + '2', P_ST = '0109' + num() + '1';
  const dirId = await mkUser('원장', P_DIR);
  const { data: dm } = await admin.from('memberships').insert({ user_id: dirId, academy_id: A, role: 'director' }).select().single();
  await admin.from('users').update({ active_membership_id: dm.id }).eq('id', dirId);
  await admin.from('roster_phones').insert({ academy_id: A, phone: P_DIR, role: 'director', name: '원장' });
  const { data: st } = await admin.from('students').insert({ academy_id: A, name: '박지훈' }).select().single();
  await admin.from('enrollments').insert({ student_id: st.id, class_id: cls.id });
  const momId = await mkUser('박지훈 어머님', P_MOM);
  const { data: mm } = await admin.from('memberships').insert({ user_id: momId, academy_id: A, role: 'parent', student_id: st.id }).select().single();
  await admin.from('users').update({ active_membership_id: mm.id }).eq('id', momId);
  await admin.from('guardians').insert({ student_id: st.id, user_id: momId });
  await admin.from('roster_phones').insert([
    { academy_id: A, phone: P_MOM, role: 'parent', name: '박지훈 학부모', student_id: st.id },
    { academy_id: A, phone: P_ST, role: 'student', name: '박지훈', student_id: st.id },
  ]);
  const d = createClient(URL_, ANON, { auth: { persistSession: false } });
  const p = createClient(URL_, ANON, { auth: { persistSession: false } });
  const e1 = (await d.auth.signInWithPassword({ email: email(P_DIR), password: PW })).error;
  const e2 = (await p.auth.signInWithPassword({ email: email(P_MOM), password: PW })).error;
  if (e1 || e2) throw new Error('login: ' + (e1 ?? e2)?.message);
  return { A, slug: ac.slug, academyName, cls, student: st, d, p, dirId, momId, P_DIR, P_MOM, P_ST };
}

/** 이 학원의 outbox 를 읽고 곧바로 지운다 — pg_cron(1분)이 실제로 보내지 않도록. */
export async function drainOutbox(A) {
  const { data } = await admin.from('outbox').select('*').eq('academy_id', A);
  if (data?.length) await admin.from('outbox').delete().eq('academy_id', A);
  return data ?? [];
}
export async function notifsOf(A) {
  const { data } = await admin.from('notifications').select('*').eq('academy_id', A).order('created_at');
  return data ?? [];
}

export async function teardown(ctx) {
  await drainOutbox(ctx.A);
  const { data: ms } = await admin.from('memberships').select('user_id').eq('academy_id', ctx.A);
  const uids = [...new Set((ms ?? []).map((m) => m.user_id))];
  const { error } = await admin.from('academies').delete().eq('id', ctx.A);
  if (error) console.error('academy delete', ctx.slug, error.message);
  for (const u of uids) await admin.auth.admin.deleteUser(u).catch(() => {});
}

/* ───────── 앱 코드 사본 (순수 함수) ───────── */
// app/src/lib/phone.ts · supabase/functions/_shared/sms.ts
export const normalizePhone = (p) => (p ?? '').replace(/[^0-9]/g, '');
export const isValidMobile = (p) => /^01[016789]\d{7,8}$/.test(normalizePhone(p));

// supabase/functions/_shared/alimtalk.ts TEMPLATES
export const TEMPLATES = {
  NOTICE_NEW: { text: (p) => `[${p['학원'] ?? '학원'}] 새 공지가 올라왔어요. ${p['제목'] ?? ''}`, button: '앱에서 보기' },
  NOTICE_REMIND: { text: (p) => `[${p['학원'] ?? '학원'}] 아직 확인하지 않은 공지가 있어요. ${p['제목'] ?? ''}`, button: '앱에서 보기' },
  INQUIRY_ANSWERED: { text: (p) => `[${p['학원'] ?? '학원'}] 문의에 답변이 도착했어요.`, button: '답변 보기' },
  MAKEUP_CONFIRMED: { text: (p) => `[${p['학원'] ?? '학원'}] ${p['날짜'] ?? ''} 결석 보강이 정해졌어요. ${p['보강'] ?? ''}`, button: '확인하기' },
  ATTENDANCE: { text: (p) => `[${p['학원'] ?? '학원'}] ${p['학생'] ?? ''} 오늘 출결이 기록됐어요. ${p['상태'] ?? ''}`, button: '확인하기' },
};
export const renderSms = (code, params, url) => `${TEMPLATES[code]?.text(params) ?? `[${params['학원'] ?? '학원'}] 알림이 있어요.`} ${url}`;

// supabase/functions/_shared/push.ts pushPayload
export function pushPayload(o) {
  const p = o.params ?? {};
  const t = TEMPLATES[o.template_code];
  let body = t ? t.text(p).replace(/^\[[^\]]*\]\s*/, '') : (p['알림'] ?? '새 알림이 있어요.');
  const why = (p['사유'] ?? '').trim();
  if (o.template_code === 'ATTENDANCE' && why) body = body.trim() + ' · ' + why;
  return { title: p['학원'] ?? '학원', body: body.trim(), view: o.link_view ?? 'home', ref: o.link_ref ?? null };
}
export const bytes = (s) => new TextEncoder().encode(s).length;

// app/src/lib/attendance.ts
export function hmToMin(hm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hm ?? '').trim());
  if (!m) return null;
  const h = +m[1], mm = +m[2];
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}
const todaySlots = (c, dow) => (c.schedule ?? []).filter((s) => s.dow === dow)
  .map((s) => ({ start: hmToMin(s.start), end: hmToMin(s.end) }))
  .filter((s) => s.start !== null && s.end !== null).sort((a, b) => a.start - b.start);
export function pickInitialClass(classes, dow, nowMin) {
  let now, nowStart = Infinity, next, nextStart = Infinity;
  for (const c of classes) for (const s of todaySlots(c, dow)) {
    if (s.start - 30 <= nowMin && nowMin <= s.end) { if (s.start < nowStart) { now = c; nowStart = s.start; } }
    else if (s.start > nowMin && s.start < nextStart) { next = c; nextStart = s.start; }
  }
  return now ?? next ?? classes[0];
}

// app/src/lib/dates.ts
export const DOW = ['일', '월', '화', '수', '목', '금', '토'];
export const dowOf = (iso) => new Date(iso + 'T00:00:00Z').getUTCDay();
export function fmtDateLong(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [, m, d] = iso.split('-');
  return `${+m}월 ${+d}일 (${DOW[dowOf(iso)]})`;
}
export function fmtTime12(hm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return hm;
  const h = +m[1];
  if (h > 23) return hm;
  return `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${m[2]}`;
}

// app/src/lib/name.ts
const HANGUL = /^[가-힣]+$/;
const DOUBLE_SURNAMES = ['남궁', '독고', '제갈', '선우', '사공', '서문', '황보', '동방', '망절', '어금', '장곡'];
export function givenName(name) {
  const n = (name ?? '').trim();
  if (!HANGUL.test(n) || n.length < 2) return n;
  const ds = DOUBLE_SURNAMES.find((s) => n.startsWith(s));
  if (ds && n.length >= 4) return n.slice(2);
  return n.slice(1);
}
export function callName(name) {
  const g = givenName(name);
  if (!HANGUL.test(g)) return g;
  const last = g.charCodeAt(g.length - 1) - 0xac00;
  return last % 28 !== 0 ? g + '이' : g;
}
export function withSubject(name) {
  const c = callName(name);
  if (!HANGUL.test(c)) return c + '이';
  const last = c.charCodeAt(c.length - 1) - 0xac00;
  return c + (last % 28 !== 0 ? '이' : '가');
}

// app/src/lib/csv.ts
const DOW_KO = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
const HEAD = ['반', '요일', '시작', '끝', '학생', '학생번호', '보호자', '보호자번호'];
export function splitCsv(text) {
  const out = []; let row = []; let cell = ''; let q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.some((x) => x.trim() !== ''));
}
export const parseDows = (s) => [...s].map((ch) => DOW_KO[ch]).filter((d) => d !== undefined);
export function parseRosterCsv(text) {
  const lines = splitCsv(text); const errors = []; const rows = [];
  if (!lines.length) return { rows, errors: [{ line: 1, msg: '비어 있어요' }] };
  const head = lines[0].map((h) => h.trim());
  const idx = Object.fromEntries(HEAD.map((h) => [h, head.indexOf(h)]));
  const missing = HEAD.filter((h) => idx[h] < 0);
  if (missing.length) return { rows, errors: [{ line: 1, msg: `머리글에 ${missing.join('·')} 이 없어요` }] };
  lines.slice(1).forEach((l, i) => {
    const line = i + 2; const g = (h) => (l[idx[h]] ?? '').trim();
    const r = { line, cls: g('반'), dows: parseDows(g('요일')), start: g('시작'), end: g('끝'), student: g('학생'), student_phone: normalizePhone(g('학생번호')), parent: g('보호자'), parent_phone: normalizePhone(g('보호자번호')) };
    if (!r.cls) errors.push({ line, msg: '반이 비었어요' });
    if (!r.student) errors.push({ line, msg: '학생 이름이 비었어요' });
    if (r.student_phone && !/^01[016789]\d{7,8}$/.test(r.student_phone)) errors.push({ line, msg: `학생번호 모양이 이상해요 (${g('학생번호')})` });
    if (r.parent_phone && !/^01[016789]\d{7,8}$/.test(r.parent_phone)) errors.push({ line, msg: `보호자번호 모양이 이상해요 (${g('보호자번호')})` });
    if (!/^\d{2}:\d{2}$/.test(r.start) || !/^\d{2}:\d{2}$/.test(r.end)) errors.push({ line, msg: '시작·끝은 19:00 처럼' });
    if (!r.dows.length) errors.push({ line, msg: '요일은 월수금 처럼' });
    rows.push(r);
  });
  return { rows, errors };
}
export function groupRoster(rows) {
  const st = new Map(); const cls = new Map();
  for (const r of rows) {
    if (!cls.has(r.cls)) cls.set(r.cls, { name: r.cls, dows: r.dows, start: r.start, end: r.end });
    const key = r.student + '|' + r.student_phone;
    const s = st.get(key) ?? { key, name: r.student, student_phone: r.student_phone, classes: [], parent_phones: [] };
    if (!s.classes.includes(r.cls)) s.classes.push(r.cls);
    if (r.parent_phone && !s.parent_phones.includes(r.parent_phone)) s.parent_phones.push(r.parent_phone);
    st.set(key, s);
  }
  return { students: [...st.values()], classes: [...cls.values()] };
}

export function report(title) {
  console.log('\n===== ' + title + ' =====');
  for (const h of HELD) console.log(`  OK   ${h.what}${h.evidence ? ' — ' + h.evidence : ''}`);
  for (const f of findings) console.log(`  ${f.sev.padEnd(4)} [${f.id}] ${f.what}\n         근거: ${f.evidence}`);
  if (!findings.length) console.log('  (발견 없음)');
}
