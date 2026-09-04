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
export const normalizePhone = (p) => {
  const t = (p ?? '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const d = t.replace(/[^0-9+]/g, '').replace(/(?!^)\+/g, '');
  const m = /^\+?82(\d+)$/.exec(d);
  return m ? '0' + m[1].replace(/^0+/, '') : d.replace(/\+/g, '');
};
export const isValidMobile = (p) => {
  const d = normalizePhone(p);
  return /^01[016789]\d{7,8}$/.test(d) && !(d.startsWith('010') && d.length !== 11);
};

// supabase/functions/_shared/alimtalk.ts TEMPLATES
export const TEMPLATES = {
  NOTICE_NEW: { text: (p) => `[${p['학원'] ?? '학원'}] 새 공지가 올라왔어요. ${p['제목'] ?? ''}`, button: '앱에서 보기' },
  NOTICE_REMIND: { text: (p) => `[${p['학원'] ?? '학원'}] 아직 확인하지 않은 공지가 있어요. ${p['제목'] ?? ''}`, button: '앱에서 보기' },
  INQUIRY_ANSWERED: { text: (p) => `[${p['학원'] ?? '학원'}] 문의에 답변이 도착했어요.`, button: '답변 보기' },
  MAKEUP_CONFIRMED: { text: (p) => `[${p['학원'] ?? '학원'}] ${p['날짜'] ?? ''} 결석 보강이 정해졌어요. ${p['보강'] ?? ''}`, button: '확인하기' },
  ATTENDANCE: { text: (p) => `[${p['학원'] ?? '학원'}] ${p['학생'] ?? ''} 오늘 출결이 기록됐어요. ${p['상태'] ?? ''}`, button: '확인하기' },
};
export const TEXT_MAX = 1000, SMS_MAX_BYTES = 2000;
export const PARAM_MAX = { 학원: 40, 제목: 80, 보강: 80, 날짜: 20, 학생: 20, 상태: 20, 사유: 100, 알림: 200 };
export const cut = (s, n) => (s.length > n ? s.slice(0, Math.max(0, n - 1)).trimEnd() + '…' : s);
export function cutBytes(s, maxBytes) {
  const enc = new TextEncoder();
  if (enc.encode(s).length <= maxBytes) return s;
  let out = s;
  while (out.length > 0 && enc.encode(out + '…').length > maxBytes) out = out.slice(0, -1);
  return out.trimEnd() + '…';
}
const oneLine = (s) => s.replace(/\s+/g, ' ').trim();
export function clampParams(p) {
  const out = {};
  for (const [k, v] of Object.entries(p ?? {})) out[k] = cut(oneLine(String(v ?? '')), PARAM_MAX[k] ?? 200);
  return out;
}
export function renderTemplate(code, params) {
  const p = clampParams(params);
  const t = TEMPLATES[code];
  return cut(t ? t.text(p) : `[${p['학원'] ?? '학원'}] 알림이 있어요.`, TEXT_MAX);
}
export function renderSms(code, params, url) {
  const room = SMS_MAX_BYTES - new TextEncoder().encode(' ' + url).length;
  return `${cutBytes(renderTemplate(code, params), Math.max(0, room))} ${url}`;
}

// supabase/functions/_shared/push.ts pushPayload
export const PUSH_TITLE_MAX = 60, PUSH_BODY_MAX = 200;
export function pushPayload(o) {
  const p = clampParams(o.params);
  const academy = p['학원'] ?? '학원';
  let body = TEMPLATES[o.template_code] ? renderTemplate(o.template_code, p) : (p['알림'] ?? '새 알림이 있어요.');
  const head = `[${academy}] `;
  body = body.startsWith(head) ? body.slice(head.length) : body.replace(/^\[[^\]]*\]\s*/, '');
  const why = (p['사유'] ?? '').trim();
  if (o.template_code === 'ATTENDANCE' && why) body = body.trim() + ' · ' + why;
  return { title: cut(academy, PUSH_TITLE_MAX), body: cut(body.trim(), PUSH_BODY_MAX), view: o.link_view ?? 'home', ref: o.link_ref ?? null };
}
export const bytes = (s) => new TextEncoder().encode(s).length;

// app/src/lib/attendance.ts
export const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isValidHm = (s) => HM_RE.test((s ?? '').trim());
export function normHm(s) {
  const t = (s ?? '').trim();
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(t);
  return m ? `${m[1].padStart(2, '0')}:${m[2].padStart(2, '0')}` : t;
}
export function hmToMin(hm) {
  const t = (hm ?? '').trim();
  if (!HM_RE.test(t)) return null;
  return +t.slice(0, 2) * 60 + +t.slice(3, 5);
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
export function isValidIso(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '')) return false;
  const t = Date.parse(iso + 'T00:00:00Z');
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === iso;
}
export function fmtDateLong(iso) {
  if (!isValidIso(iso)) return '';
  const [, m, d] = iso.split('-');
  return `${+m}월 ${+d}일 (${DOW[dowOf(iso)]})`;
}
export function fmtTime12(hm) {
  const t = (hm ?? '').trim();
  if (!HM_RE.test(t)) return '';
  const h = +t.slice(0, 2);
  return `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${t.slice(3, 5)}`;
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
    const r = { line, cls: g('반'), dows: parseDows(g('요일')), start: normHm(g('시작')), end: normHm(g('끝')), student: g('학생'), student_phone: normalizePhone(g('학생번호')), parent: g('보호자'), parent_phone: normalizePhone(g('보호자번호')) };
    if (!r.cls) errors.push({ line, msg: '반이 비었어요' });
    if (!r.student) errors.push({ line, msg: '학생 이름이 비었어요' });
    if (r.student.length > 20) errors.push({ line, msg: '학생 이름은 20자까지예요' });
    if (r.student_phone && !isValidMobile(r.student_phone)) errors.push({ line, msg: `학생번호 모양이 이상해요 (${g('학생번호')})` });
    if (r.parent_phone && !isValidMobile(r.parent_phone)) errors.push({ line, msg: `보호자번호 모양이 이상해요 (${g('보호자번호')})` });
    if (!isValidHm(r.start) || !isValidHm(r.end)) errors.push({ line, msg: '시작·끝은 19:00 처럼 (00:00~23:59)' });
    else if (r.end <= r.start) errors.push({ line, msg: '끝나는 시간이 시작보다 늦어야 해요' });
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
    const s = st.get(key) ?? { key, name: r.student, student_phone: r.student_phone, classes: [], parent_phones: [], lines: [] };
    if (!s.classes.includes(r.cls)) s.classes.push(r.cls);
    if (r.parent_phone && !s.parent_phones.includes(r.parent_phone)) s.parent_phones.push(r.parent_phone);
    if (!s.lines.includes(r.line)) s.lines.push(r.line);
    st.set(key, s);
  }
  return { students: [...st.values()], classes: [...cls.values()] };
}

// 동명이인 짝짓기 (INP-62) — cands 는 이름이 같은 활성 학생들
export function matchStudent(s, cands) {
  if (!cands.length) return { kind: 'new' };
  if (s.student_phone) {
    const exact = cands.filter((c) => c.student_phone === s.student_phone);
    if (exact.length === 1) return { kind: 'update', id: exact[0].id };
    if (exact.length > 1) return { kind: 'ambiguous' };
    const blank = cands.filter((c) => !c.student_phone);
    if (blank.length === 1) return { kind: 'merge', id: blank[0].id };
    if (blank.length > 1) return { kind: 'ambiguous' };
    return { kind: 'new' };
  }
  if (cands.length > 1) return { kind: 'ambiguous' };
  return { kind: 'merge', id: cands[0].id };
}
export const mergePhones = (before, add) => {
  const out = [...before];
  for (const p of add) if (p && !out.includes(p)) out.push(p);
  return out;
};
export function planImport(students, existing) {
  const by = new Map(); const merges = []; const errors = [];
  for (const s of students) {
    const r = matchStudent(s, existing.filter((e) => e.name === s.name));
    by.set(s.key, r);
    if (r.kind === 'ambiguous') errors.push({ line: s.lines[0] ?? 1, msg: `동명이인이 있어 학생 번호가 필요해요 (${s.lines.join('·')}줄)` });
    if (r.kind === 'merge') merges.push(`기존 학생 ${s.name}에 합쳐요`);
  }
  return { by, merges, errors };
}

export function report(title) {
  console.log('\n===== ' + title + ' =====');
  for (const h of HELD) console.log(`  OK   ${h.what}${h.evidence ? ' — ' + h.evidence : ''}`);
  for (const f of findings) console.log(`  ${f.sev.padEnd(4)} [${f.id}] ${f.what}\n         근거: ${f.evidence}`);
  if (!findings.length) console.log('  (발견 없음)');
}
