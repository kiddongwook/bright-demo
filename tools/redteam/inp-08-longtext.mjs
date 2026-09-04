// inp-08 긴 글·이상한 이름 — attendance.note 5,000자 · client_errors 1MB · bank_info 줄바꿈 · 학생 이름
import { admin, setup, teardown, drainOutbox, notifsOf, F, held, report, pushPayload, bytes, callName, withSubject, givenName } from './inp-lib.mjs';

const ctx = await setup('long');
console.log('academy', ctx.slug);
const PUSH_MAX = 4078;

console.log('--- attendance.note 5,000자 ---');
{
  // 학부모가 푸시 구독을 갖고 있는 상태로 (푸시 줄이 생기게)
  const sub = await ctx.p.from('push_subscriptions').insert({ user_id: ctx.momId, endpoint: 'https://fcm.example/rt-' + Date.now(), p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) }).select('id').single();
  const note = '병'.repeat(5000);
  const r = await ctx.d.from('attendance').upsert({ academy_id: ctx.A, class_id: ctx.cls.id, date: '2026-09-02', student_id: ctx.student.id, status: 'late', note, marked_by: ctx.dirId }, { onConflict: 'student_id,class_id,date' }).select('id, note').single();
  if (r.error) held('attendance.note 5,000자 거절', r.error.message.slice(0, 80));
  else {
    const ns = await notifsOf(ctx.A);
    const ob = await drainOutbox(ctx.A);
    const push = ob.find(o => o.channel === 'push');
    const pp = push ? pushPayload(push) : null;
    console.log(JSON.stringify({ noteLen: r.data.note.length, notifTitleLen: ns[0]?.title.length, notifBodyLen: ns[0]?.body.length, pushParams: push ? Object.keys(push.params) : null, pushBytes: pp ? bytes(JSON.stringify(pp)) : null, pushBodyHead: pp?.body.slice(0, 30) }));
    F('INP-70', '중간', 'attendance.note(출결 사유) 에 길이 제한이 없다 — 5,000자가 알림 제목·본문에 통째로 붙는다 (0015 trg_attendance: title || \' · \' || note)',
      'tools/redteam/inp-08-longtext.mjs (attendance.note)',
      `note ${r.data.note.length}자 → notifications.title ${ns[0]?.title.length}자 · body ${ns[0]?.body.length}자`);
    if (push && Object.keys(push.params).includes('사유')) {
      F('INP-71', '중간', "0016 이 사유를 푸시 줄의 params['사유'] 에 실으면서, 5,000자 사유가 pushPayload 본문에 그대로 붙어 푸시 4KB 한도를 넘긴다 — INP-02 와 같은 dead(문자 대체 없음) 길",
        'tools/redteam/inp-08-longtext.mjs', `push params ${JSON.stringify(Object.keys(push.params))}, 페이로드 ${bytes(JSON.stringify(pp))}바이트 > ${PUSH_MAX}`);
    } else if (pp) {
      held("0016 미배포 — 푸시 줄 params 에 '사유' 없음. 학부모 푸시 본문은 템플릿 문구뿐이라 4KB 를 넘지 않는다", `params ${JSON.stringify(Object.keys(push?.params ?? {}))}, ${bytes(JSON.stringify(pp))}바이트`);
    }
    await admin.from('attendance').delete().eq('id', r.data.id);
    await admin.from('notifications').delete().eq('academy_id', ctx.A);
  }
  await admin.from('push_subscriptions').delete().eq('user_id', ctx.momId);
  await drainOutbox(ctx.A);
}

console.log('--- client_errors 1MB ---');
{
  // client_errors 에는 select 정책이 없다 → .select() 를 붙이면 RLS 위반으로 보인다. 앱(report.ts)처럼 select 없이 넣는다.
  const big = 'E'.repeat(1024 * 1024);
  const r = await ctx.p.from('client_errors').insert({ academy_id: ctx.A, user_id: ctx.momId, message: big, stack: big, screen: 'rt', ua: 'rt' });
  const { data: rows } = await admin.from('client_errors').select('id').eq('academy_id', ctx.A);
  console.log('1MB insert →', r.error?.message?.slice(0, 90) ?? 'ok', '남은 행', rows?.length);
  if (r.error) held('client_errors 1MB 거절', r.error.message.slice(0, 100));
  else {
    await admin.from('client_errors').delete().eq('academy_id', ctx.A);
    F('INP-72', '중간', 'client_errors 에 크기 제한도 사용자별 건수 제한도 없다 — 로그인한 아무나 1MB(message+stack 2MB) 짜리 행을 반복해서 넣어 DB 를 부풀릴 수 있다. 살림(housekeeping)은 30일 뒤에야 지운다',
      'tools/redteam/inp-08-longtext.mjs (client_errors)', `message 1,048,576자 + stack 1,048,576자 insert 성공 (0009 RLS client_errors_ins 는 user_id = auth.uid() 만 본다)`);
  }
}

console.log('--- bank_info 줄바꿈 → 미납 안내 본문 ---');
{
  await ctx.d.from('billing_rules').upsert({ academy_id: ctx.A, billing_day: 1, due_day: 5, sibling_discount_pct: 0, bank_info: '국민 123-456\n예금주 김원장\r\n<script>x</script>\n' + '가'.repeat(3000) });
  const inv = await ctx.d.from('invoices').insert({ academy_id: ctx.A, student_id: ctx.student.id, period_ym: '2026-09', amount: 100000, discount: 0, textbook: 0, total: 100000, due_date: '2026-09-05', status: 'issued' }).select('id').single();
  const r = await ctx.d.rpc('remind_unpaid', { p_ym: '2026-09' });
  const ns = await notifsOf(ctx.A);
  const ob = await drainOutbox(ctx.A);
  console.log(JSON.stringify({ reminded: r.data, err: r.error?.message, notifTitle: ns[0]?.title?.slice(0, 60), notifBodyLen: ns[0]?.body?.length, outbox: ob.map(o => o.channel + ':' + o.template_code) }));
  if ((ns[0]?.body?.length ?? 0) > 3000) {
    F('INP-73', '낮음', 'billing_rules.bank_info 에 길이·줄바꿈 검사가 없다 — 통째로 미납 안내 알림 본문(notifications.body)이 된다. 지금은 카톡 템플릿이 없어 앱 알림·푸시 params 로만 가지만, 푸시 구독이 있으면 params 크기를 키운다',
      'tools/redteam/inp-08-longtext.mjs (bank_info)', `bank_info 3,0xx자 → notifications.body ${ns[0]?.body?.length}자, outbox ${JSON.stringify(ob.map(o => o.channel))}`);
  } else held('bank_info 가 알림 본문에 그대로 들어가지 않는다', `body ${ns[0]?.body?.length}자`);
  await admin.from('invoices').delete().eq('academy_id', ctx.A);
  await admin.from('notifications').delete().eq('academy_id', ctx.A);
  await admin.from('billing_rules').delete().eq('academy_id', ctx.A);
}

console.log('--- 학생 이름 ---');
{
  const NAMES = [['민', '한 글자'], ['가'.repeat(40), '40자'], ['박 지훈', '가운데 공백'], ['학생2', '숫자 섞임'], ['🎉지훈', '이모지'], ['   ', '공백만'], ['Kim Minsu', '영문'], ['남궁민수', '복성']];
  const out = [];
  for (const [n, why] of NAMES) {
    const r = await ctx.d.rpc('roster_save_student', { sid: null, p_name: n, p_class_ids: [ctx.cls.id], p_student_phone: '', p_parent_phones: [] });
    out.push({ why, name: JSON.stringify(n), saved: !r.error, err: r.error?.message?.slice(0, 40), givenName: givenName(n), callName: callName(n), withSubject: withSubject(n) });
    if (!r.error) await admin.from('students').delete().eq('id', r.data);
  }
  console.table ? console.log(JSON.stringify(out, null, 1)) : console.log(out);
  const blank = out.find(x => x.why === '공백만');
  if (!blank.saved) held('공백만 있는 이름은 roster_save_student 가 거절', blank.err);
  const one = out.find(x => x.why === '한 글자');
  if (one.saved && one.callName === '민') F('INP-74', '낮음', "한 글자 이름('민')은 callName 이 그대로 두어 알림 문구가 '민 오늘 지각으로…' 처럼 어색해진다 (성을 떼는 규칙이 두 글자 미만을 다루지 않는다)", 'tools/redteam/inp-08-longtext.mjs (이름)', `givenName('민')='${one.givenName}', callName='${one.callName}', withSubject='${one.withSubject}'`);
  const long = out.find(x => x.why === '40자');
  if (long.saved) F('INP-75', '낮음', '학생 이름 길이 제한이 없다 — 40자 이름이 저장되어 알림 제목·명부 줄을 밀어낸다', 'tools/redteam/inp-08-longtext.mjs (이름)', `students.name 40자 저장 성공, callName 40자`);
  const sp = out.find(x => x.why === '가운데 공백');
  if (sp.saved && sp.callName === sp.name.replace(/"/g, '')) held('공백·숫자·영문이 섞인 이름은 callName 이 손대지 않고 그대로 둔다(설계대로)', `callName('박 지훈')='${sp.callName}'`);
}

report('inp-08 긴 글·이름');
await teardown(ctx);
