// 알림 못 받는 사람(roster_entry_status 의 push · kakao_ok) 점검.
// node --env-file=../.env.local notify-status-test.mjs
// 보는 것: 들어온 사람인데 구독이 없으면 push=false → 구독을 넣으면 true →
//          failed_at 이 last_ok_at 보다 뒤면 다시 false → last_ok_at 을 뒤로 밀면 true.
//          kakao_ok 는 문자 대행사가 붙기 전(app_settings 에 sms_provider 키 없음)이라 늘 false.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
const admin = createClient(URL, SVC, { auth: { persistSession: false } });
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const rnd = Math.random().toString(36).slice(2, 8);
const num = () => String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
const PW = 'ns-' + rnd; const email = p => `${p}@auth.yeongeo.local`;
async function mkUser(name, phone) {
  const { data, error } = await admin.auth.admin.createUser({ email: email(phone), password: PW, email_confirm: true }); if (error) throw error;
  await admin.from('users').insert({ id: data.user.id, name, phone }); return data.user.id;
}

const { data: ac } = await admin.from('academies').insert({ slug: `ns-${rnd}`, name: '알림 현황 테스트' }).select().single(); const A = ac.id;
const { data: c1 } = await admin.from('classes').insert({ academy_id: A, name: '고1 A' }).select().single();

// 원장
const P_DIR = '0109' + num() + '3'; const dirId = await mkUser('원장', P_DIR);
const { data: dm } = await admin.from('memberships').insert({ user_id: dirId, academy_id: A, role: 'director' }).select().single();
await admin.from('users').update({ active_membership_id: dm.id }).eq('id', dirId);
const d = createClient(URL, ANON, { auth: { persistSession: false } });
ok(!(await d.auth.signInWithPassword({ email: email(P_DIR), password: PW })).error, '원장 로그인');

// 학생 + 학부모 둘: 엄마는 들어온 사람, 아빠는 아직 안 들어온 번호
const P_MOM = '0109' + num() + '2', P_DAD = '0109' + num() + '4';
let r = await d.rpc('roster_save_student', { sid: null, p_name: '박지훈', p_class_ids: [c1.id], p_student_phone: '', p_parent_phones: [P_MOM, P_DAD] });
ok(!r.error, '명부 저장: ' + r.error?.message); const SID = r.data;
const momId = await mkUser('박지훈 어머님', P_MOM);
const { data: mm } = await admin.from('memberships').insert({ user_id: momId, academy_id: A, role: 'parent', student_id: SID }).select().single();
await admin.from('guardians').insert({ student_id: SID, user_id: momId });
await admin.from('users').update({ active_membership_id: mm.id }).eq('id', momId);

const status = async () => {
  const q = await d.rpc('roster_entry_status');
  ok(!q.error, 'roster_entry_status: ' + q.error?.message);
  return (q.data ?? []).find(x => x.phone === P_MOM);
};

// ---- A. 칸이 늘었고, 들어왔지만 구독이 없으면 push=false
let mom = await status();
ok(mom && 'push' in mom && 'kakao_ok' in mom, 'push · kakao_ok 칸이 있다');
ok(mom?.entered === true, '엄마 entered true');
ok(mom?.push === false, `구독 없으면 push=false (got ${mom?.push})`);
ok(mom?.kakao_ok === false, `문자 대행사 전이라 kakao_ok=false (got ${mom?.kakao_ok})`);
const dad = (await d.rpc('roster_entry_status')).data?.find(x => x.phone === P_DAD);
ok(dad?.entered === false && dad?.push === false, '아직 안 들어온 번호는 entered·push 둘 다 false');

// ---- B. 구독을 넣으면 push=true
const endpoint = `https://fcm.googleapis.com/fcm/send/ns-${rnd}-${num()}`;
r = await admin.from('push_subscriptions').insert({ user_id: momId, endpoint, p256dh: 'p256dh-' + rnd, auth: 'auth-' + rnd });
ok(!r.error, '구독 insert: ' + r.error?.message);
mom = await status();
ok(mom?.push === true, `구독이 있으면 push=true (got ${mom?.push})`);

// ---- C. failed_at 이 last_ok_at 보다 뒤면 죽은 구독 → push=false
const t0 = new Date();
r = await admin.from('push_subscriptions').update({ last_ok_at: new Date(t0.getTime() - 60e3).toISOString(), failed_at: t0.toISOString() }).eq('endpoint', endpoint);
ok(!r.error, 'failed_at 갱신: ' + r.error?.message);
mom = await status();
ok(mom?.push === false, `failed_at 이 last_ok_at 보다 뒤면 push=false (got ${mom?.push})`);

// last_ok_at 이 아예 없어도(한 번도 성공 못 함) 죽은 것으로 본다
await admin.from('push_subscriptions').update({ last_ok_at: null }).eq('endpoint', endpoint);
mom = await status();
ok(mom?.push === false, `last_ok_at 이 없고 failed_at 만 있으면 push=false (got ${mom?.push})`);

// ---- D. 다시 성공해서 last_ok_at 이 failed_at 보다 뒤면 push=true
r = await admin.from('push_subscriptions').update({ last_ok_at: new Date(t0.getTime() + 60e3).toISOString() }).eq('endpoint', endpoint);
ok(!r.error, 'last_ok_at 갱신: ' + r.error?.message);
mom = await status();
ok(mom?.push === true, `last_ok_at 이 failed_at 보다 뒤면 push=true (got ${mom?.push})`);

// 살아 있는 구독이 하나라도 있으면 된다 — 죽은 기기 하나가 있어도 true
await admin.from('push_subscriptions').update({ failed_at: new Date(t0.getTime() + 120e3).toISOString() }).eq('endpoint', endpoint);
await admin.from('push_subscriptions').insert({ user_id: momId, endpoint: endpoint + '-2', p256dh: 'p256dh2-' + rnd, auth: 'auth2-' + rnd });
mom = await status();
ok(mom?.push === true, `죽은 기기 + 산 기기면 push=true (got ${mom?.push})`);

// ---- E. 여전히 원장만 (0011 의 규칙이 살아 있나)
const p = createClient(URL, ANON, { auth: { persistSession: false } });
ok(!(await p.auth.signInWithPassword({ email: email(P_MOM), password: PW })).error, '엄마 로그인');
ok((await p.rpc('roster_entry_status')).error, '학부모는 거절');

// ---- 뒷정리
for (const id of [dirId, momId]) await admin.auth.admin.deleteUser(id);
await admin.from('academies').delete().eq('id', A);

if (fails.length) { console.error('FAIL\n- ' + fails.join('\n- ')); process.exitCode = 1; } else console.log('PASS: notify status (push · kakao_ok)');
