// 개발용 씨앗: 영어의 집(yeongeo)에 원장·학부모 사용자와 공지·FAQ·할 것·문의·결석·오늘 출결을 넣는다. 멱등.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const kst = (off = 0) => new Date(Date.now() + 9 * 3600e3 + off * 86400e3).toISOString().slice(0, 10);
// 수업 요일에 맞는 날짜 — 고1 A 월수금(1,3,5), 고2 B 화목(2,4). off 부터 앞(+1)/뒤(-1) 방향으로 찾는다.
const onDow = (dows, off, dir = 1) => { for (let i = 0; i < 14; i++) { const d = kst(off + i * dir); if (dows.includes(new Date(d + 'T09:00:00Z').getUTCDay())) return d; } return kst(off); };
const A_DAYS = [1, 3, 5], B_DAYS = [2, 4];
const { data: ac } = await sb.from('academies').select('id').eq('slug', 'yeongeo').single();
if (!ac) { console.log('FAIL: 먼저 seed-roster 를 돌리세요'); process.exit(1); }
const A = ac.id;
const cls = Object.fromEntries((await sb.from('classes').select('id, name').eq('academy_id', A)).data.map(c => [c.name, c.id]));
const st = Object.fromEntries((await sb.from('students').select('id, name').eq('academy_id', A)).data.map(s => [s.name, s.id]));

// 사용자(원장·학부모) — OTP 로그인이 만들 것과 같은 규칙(이메일 = 번호@auth.yeongeo.local)
async function ensureUser(phone, name, role, studentName) {
  let { data: u } = await sb.from('users').select('id').eq('phone', phone).maybeSingle();
  if (!u) {
    const { data: au, error } = await sb.auth.admin.createUser({ email: `${phone}@auth.yeongeo.local`, password: crypto.randomUUID() + 'x', email_confirm: true });
    if (error) throw error;
    await sb.from('users').insert({ id: au.user.id, name, phone }); u = { id: au.user.id };
  }
  const student_id = studentName ? st[studentName] : null;
  await sb.from('memberships').upsert({ user_id: u.id, academy_id: A, role, student_id }, { onConflict: 'user_id,academy_id,role,student_id', ignoreDuplicates: true });
  if (role === 'parent' && student_id) await sb.from('guardians').upsert({ student_id, user_id: u.id }, { onConflict: 'student_id,user_id', ignoreDuplicates: true });
  if (role === 'student' && student_id) await sb.from('students').update({ user_id: u.id }).eq('id', student_id).is('user_id', null);
  const { data: rp } = await sb.from('roster_phones').select('id').eq('academy_id', A).eq('phone', phone).eq('role', role).maybeSingle();
  if (!rp) await sb.from('roster_phones').insert({ academy_id: A, phone, role, name, student_id });
  const { data: m } = await sb.from('memberships').select('id').eq('user_id', u.id).eq('academy_id', A).eq('role', role).limit(1).single();
  await sb.from('users').update({ active_membership_id: m.id }).eq('id', u.id).is('active_membership_id', null);
  return u.id;
}
const dir = await ensureUser('01010000001', '김지영 원장', 'director', null);
const pJ = await ensureUser('01012340001', '박지훈 어머님', 'parent', '박지훈');
const pC = await ensureUser('01012340002', '최유나 어머님', 'parent', '최유나');
const pJH = await ensureUser('01012340005', '정하윤 어머님', 'parent', '정하윤');
const pH = await ensureUser('01012340006', '한지우 어머님', 'parent', '한지우');
await ensureUser('01012340104', '김민수', 'student', '김민수');

async function once(table, where, row) {
  let q = sb.from(table).select('id').eq('academy_id', A); for (const [k, v] of Object.entries(where)) q = q.eq(k, v);
  const { data } = await q.maybeSingle(); if (data) return data.id;
  const { data: ins, error } = await sb.from(table).insert({ academy_id: A, ...row }).select('id').single(); if (error) throw error; return ins.id;
}
// 공지 4
const n1 = await once('notices', { title: '여름 특강 안내 — 7월 21일부터 2주' }, { author_id: dir, title: '여름 특강 안내 — 7월 21일부터 2주', body: '7월 21일(월)부터 2주 동안 여름 특강을 엽니다. 고1 A는 오전 10시, 고2 B는 오후 2시예요.\n\n특강 기간에는 정규 수업이 쉬고, 특강 신청은 이 앱의 문의로 "특강 신청"이라고 보내주시면 됩니다. 7월 4일까지 알려주세요.' });
await once('notices', { title: '6월 휴원일 — 6월 24일(화) 휴원합니다' }, { author_id: dir, title: '6월 휴원일 — 6월 24일(화) 휴원합니다', body: '6월 24일(화)은 휴원합니다. 보강은 없고, 그 주 나머지 수업은 정상 진행돼요.' });
const n3 = await once('notices', { title: '고2 B 단어시험 — 51~75' }, { author_id: dir, title: '고2 B 단어시험 — 51~75', body: '수업 시작하고 바로 단어시험 봅니다. 범위는 단어장 51~75예요.\n\n25개, 뜻 쓰기 15개 + 영작 10개.', target_class_id: cls['고2 B'] });
await once('notices', { title: '고1 A 모의고사 대비 특강' }, { author_id: dir, title: '고1 A 모의고사 대비 특강', body: '정규 수업 대신 모의고사 대비 특강을 합니다. 7시 시작, 교재는 학원에서 드려요.', target_class_id: cls['고1 A'] });
// 읽음 씨앗: 박지훈 어머님은 휴원일 공지를 읽음
const { data: n2 } = await sb.from('notices').select('id').eq('academy_id', A).eq('title', '6월 휴원일 — 6월 24일(화) 휴원합니다').single();
await sb.from('notice_reads').upsert({ notice_id: n2.id, user_id: pJ }, { ignoreDuplicates: true });
// FAQ 5
const faqs = [['결석하면 보강이 되나요?', '사전에 알려주신 결석은 같은 주 토요일에 보강해 드려요. 당일 결석은 자료로 대체합니다.'], ['수강료 납부일은 언제인가요?', '매월 1일이에요. 5일까지는 괜찮습니다. 계좌이체 또는 카드 결제 모두 가능해요.'], ['교재는 어디서 사나요?', '학원에서 일괄 구매해 드려요. 교재비는 학기 시작 때 한 번 안내드립니다.'], ['상담은 어떻게 신청하나요?', '이 앱의 문의로 "상담 신청"이라고 보내주시면 원장님이 시간을 잡아 답해드려요.'], ['등하원 시간은요?', '고1 A는 월수금 7시~9시, 고2 B는 화목 8시~10시예요. 10분 전 도착을 권해요.']];
for (let i = 0; i < faqs.length; i++) await once('faqs', { q: faqs[i][0] }, { q: faqs[i][0], a: faqs[i][1], sort: i });
// 할 것 5
// 지우고 다시 심는 건 개발 프로젝트에서만. 실제 학원 데이터가 있는 프로젝트에선 SEED_DEMO_WIPE=1 없이 절대 지우지 않는다.
if (process.env.SEED_DEMO_WIPE === '1') { await sb.from('todos').delete().eq('academy_id', A); await sb.from('absence_requests').delete().eq('academy_id', A); } else console.log('결석·할 것은 지우지 않고 없는 것만 심음 (지우려면 SEED_DEMO_WIPE=1)');
await once('todos', { title: '독해 워크북 p.42–45' }, { class_id: cls['고2 B'], kind: 'homework', title: '독해 워크북 p.42–45', due_date: onDow(B_DAYS, 1) });
await once('todos', { title: '단어시험 51~75' }, { class_id: cls['고2 B'], kind: 'exam', title: '단어시험 51~75', due_date: onDow(B_DAYS, 1), notice_id: n3 });
const tDone = await once('todos', { title: '영작 1편 — My Summer Plan' }, { class_id: cls['고2 B'], kind: 'homework', title: '영작 1편 — My Summer Plan', due_date: onDow(B_DAYS, 0) });
await sb.from('todo_done').upsert({ todo_id: tDone, student_id: st['김민수'] }, { ignoreDuplicates: true });
await once('todos', { title: '모의고사 기출 3회' }, { class_id: cls['고1 A'], kind: 'homework', title: '모의고사 기출 3회', due_date: onDow(A_DAYS, 3) });
const tA = await once('todos', { title: '단어장 26~50 외우기' }, { class_id: cls['고1 A'], kind: 'homework', title: '단어장 26~50 외우기', due_date: onDow(A_DAYS, 1) });
await sb.from('todo_done').upsert({ todo_id: tA, student_id: st['박지훈'] }, { ignoreDuplicates: true });
// 문의 3 (미답변 1)
await once('inquiries', { topic: '숙제 범위 확인' }, { student_id: st['정하윤'], asked_by: pJH, topic: '숙제 범위 확인', body: '안녕하세요 원장님. 하윤이가 목요일 단어시험 범위를 51~75라고 하는데 맞나요? 지난주 공지에는 41~75로 본 것 같아서 확인차 여쭤봅니다.' });
await once('inquiries', { topic: '다음 주 화요일 결석 예정' }, { student_id: st['박지훈'], asked_by: pJ, created_at: new Date(Date.now() - 2 * 86400e3).toISOString(), topic: '다음 주 화요일 결석 예정', body: '다음 주 화요일 지훈이 가족 행사로 결석 예정입니다. 보강 가능할까요?', answer: '어머님 안녕하세요 :) 그날은 휴원일이라 원래 수업이 없어요. 걱정 안 하셔도 됩니다. 즐거운 행사 되세요!', answered_by: dir, answered_at: new Date(Date.now() - 86400e3).toISOString() });
await once('inquiries', { topic: '레벨 테스트 언제' }, { student_id: st['최유나'], asked_by: pC, created_at: new Date(Date.now() - 4 * 86400e3).toISOString(), topic: '레벨 테스트 언제', body: '레벨 테스트는 언제 보나요?', answer: '다음 주 월요일 수업 끝나고 20분 정도 봐요. 따로 준비하실 건 없어요.', answered_by: dir, answered_at: new Date(Date.now() - 3 * 86400e3).toISOString() });
// 결석 2
await once('absence_requests', { student_id: st['최유나'], date: onDow(A_DAYS, 1) }, { student_id: st['최유나'], requested_by: pC, date: onDow(A_DAYS, 1), reason: '병원 진료' });
await once('absence_requests', { student_id: st['한지우'], date: onDow(B_DAYS, -1, -1) }, { student_id: st['한지우'], requested_by: pH, date: onDow(B_DAYS, -1, -1), reason: '가족 여행', status: 'confirmed', makeup_kind: 'saturday', makeup_at: new Date(onDow([6], 1) + 'T12:00:00+09:00').toISOString(), decided_by: dir });
// 이번 주 지난 수업일 출결 (고1 A 월수금) — 학부모 화면의 이번 주 줄이 비지 않게
{
  const monday = kst(-((new Date(kst(0) + 'T09:00:00Z').getUTCDay() + 6) % 7));
  for (let i = 0; i < 7; i++) {
    const d = new Date(new Date(monday + 'T09:00:00Z').getTime() + i * 86400e3).toISOString().slice(0, 10);
    if (d >= kst(0) || !A_DAYS.includes(new Date(d + 'T09:00:00Z').getUTCDay())) continue;
    for (const [name, status] of [['박지훈', i === 2 ? 'late' : 'present'], ['이서연', 'present'], ['최유나', 'present']]) {
      await sb.from('attendance').upsert({ academy_id: A, student_id: st[name], class_id: cls['고1 A'], date: d, status, marked_by: dir }, { onConflict: 'student_id,class_id,date' });
    }
  }
}
// 오늘 출결 (고2 B)
for (const [name, status] of [['김민수', 'late'], ['정하윤', 'present'], ['한지우', 'absent']]) {
  await sb.from('attendance').upsert({ academy_id: A, student_id: st[name], class_id: cls['고2 B'], date: kst(0), status, marked_by: dir }, { onConflict: 'student_id,class_id,date' });
}
const counts = {};
for (const t of ['notices', 'faqs', 'todos', 'inquiries', 'absence_requests', 'attendance', 'notifications']) { const { count } = await sb.from(t).select('*', { count: 'exact', head: true }).eq('academy_id', A); counts[t] = count; }
console.log('PASS seed-demo', JSON.stringify(counts));

// 씨앗을 다시 심으면 트리거가 같은 알림을 또 만든다 — 같은 사람·같은 제목·같은 링크는 최신 하나만 남긴다.
{
  const { data: ns } = await sb.from('notifications').select('id,user_id,title,link,created_at').eq('academy_id', A).order('created_at', { ascending: false });
  const seen = new Set(); const dup = [];
  for (const n of ns ?? []) { const k = `${n.user_id}|${n.title}|${n.link}`; if (seen.has(k)) dup.push(n.id); else seen.add(k); }
  if (dup.length) await sb.from('notifications').delete().in('id', dup);
  console.log(`중복 알림 정리: ${dup.length}건`);
}
