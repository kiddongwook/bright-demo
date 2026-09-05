// 4차 레드팀 1·2·3 — 예약 공지 유출 · 이중 뿌리기 · create_notice_v2 시그니처/극단값 (0027)
// cd tools && node --env-file=../.env.local redteam/rt-batch4-notices.mjs
import { admin, seedAcademy, mkUser, member, login, anonClient, check, pass, finding, note, report, cleanup, created, notisFor, drainOutbox, iso, err } from './b4-lib.mjs';

const A = await seedAcademy('ntc');
const B = await seedAcademy('ntc2');          // 다른 학원의 원장
try {
  const d = await login(A.dir.phone, A.dir.mid);
  const t = await login(A.tch.phone, A.tch.mid);        // C1 담당
  const p1 = await login(A.par1.phone, A.par1.mid);     // S1 ∈ C1 (대상)
  const p2 = await login(A.par2.phone, A.par2.mid);     // S2 ∈ C2 (대상 아님)
  const dB = await login(B.dir.phone, B.dir.mid);
  const anon = anonClient();
  // 학생 로그인 하나(S1) — 학생 경로도 본다
  const stu = await mkUser('ntc학생1'); stu.mid = await member(stu.uid, A.A, 'student', A.s1.id);
  await admin.from('students').update({ user_id: stu.uid }).eq('id', A.s1.id);
  const s = await login(stu.phone, stu.mid);

  console.log('\n[1] 예약 공지 유출 — 모든 읽기 길');
  const SECRET = `비밀예약${Date.now()}`;
  let r = await d.rpc('create_notice_v2', { p_title: SECRET, p_body: '아직 나가면 안 되는 본문', p_class_ids: [A.c1.id], p_publish_at: iso(3600e3) });
  if (r.error) throw new Error('create scheduled: ' + r.error.message);
  const N = r.data;
  // 사진 한 장을 공지 경로에 올린다(앱과 같은 자리) — 저장소 정책이 예약 상태를 보는지
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const photoPath = `${A.A}/${N}/1.png`;
  { const up = await admin.storage.from('notices').upload(photoPath, png, { contentType: 'image/png' }); if (up.error) throw new Error('upload ' + up.error.message); created.storage.push({ bucket: 'notices', path: photoPath }); }
  await admin.from('notices').update({ photos: [photoPath] }).eq('id', N);
  // 공지에 걸린 숙제(todos.notice_id) 도 하나
  const { data: todo } = await admin.from('todos').insert({ academy_id: A.A, class_id: A.c1.id, kind: 'homework', title: '공지에 걸린 숙제 ' + SECRET, due_date: iso(3 * 86400e3).slice(0, 10), notice_id: N }).select().single();

  for (const [who, c] of [['학부모(대상)', p1], ['학부모(비대상)', p2], ['학생(대상)', s], ['다른 학원 원장', dB], ['anon', anon]]) {
    let g = await c.from('notices').select('id, title, body').eq('id', N);
    check((g.data ?? []).length === 0, `${who}: notices select 로 예약 공지 안 보임`, 'B4-N1', '높음', `${who}: notices select 로 예약 공지 보임 ${JSON.stringify(g.data)}`);
    g = await c.from('notices').select('id').or(`title.eq.${SECRET},body.ilike.%아직%`);
    check((g.data ?? []).length === 0, `${who}: 필터 우회(or/ilike) 로도 안 보임`, 'B4-N1', '높음', `${who}: 필터로 예약 공지 보임`);
    g = await c.from('notice_targets').select('class_id').eq('notice_id', N);
    check((g.data ?? []).length === 0, `${who}: notice_targets 안 보임`, 'B4-N1', '높음', `${who}: notice_targets 보임`);
    g = await c.from('notice_reads').insert({ notice_id: N, user_id: c === anon ? A.par1.uid : (await c.auth.getUser()).data.user.id });
    check(!!g.error, `${who}: notice_reads insert 거절`, 'B4-N1', '중간', `${who}: 예약 공지에 읽음 표시 성공`);
    g = await c.rpc('notice_readers', { nid: N });
    check(!!g.error, `${who}: notice_readers 거절 (${(g.error?.message ?? '').slice(0, 30)})`, 'B4-N1', '중간', `${who}: notice_readers 성공`);
    // 0030 B4-N4: 헬퍼는 정책이 부르는 넷(notice_visible_of·notice_manage_of·notice_readable·notice_manage)만 authenticated 에 남고
    // notice_visible_to·notice_class_ids 등은 anon·authenticated 모두 execute 가 없다 → permission denied
    g = await c.rpc('notice_visible_to', { nid: N, uid: A.par1.uid });
    check(!!g.error, `${who}: notice_visible_to 거절 (${(g.error?.message ?? '').slice(0, 30)})`, 'B4-N4', '낮음', `${who}: notice_visible_to 호출 가능 → ${JSON.stringify(g.data)}`);
    g = await c.rpc('notice_class_ids', { nid: N });
    check(!!g.error, `${who}: notice_class_ids 거절 (${(g.error?.message ?? '').slice(0, 30)})`, 'B4-N4', '낮음', `${who}: notice_class_ids(nid) 호출 가능 → ${JSON.stringify(g.data)}`);
    // 저장소: 학원 폴더 목록 → 예약 공지 폴더가 보이나, 사진이 내려오나
    const ls = await c.storage.from('notices').list(A.A);
    const seesFolder = (ls.data ?? []).some(o => o.name === N);
    const dl = await c.storage.from('notices').download(photoPath);
    if (c === anon || c === dB) {
      check(!seesFolder && !dl.data, `${who}: 저장소 notices/<학원>/ 목록·내려받기 불가`, 'B4-N2', '높음', `${who}: 저장소 접근 성공 (folder ${seesFolder}, download ${!!dl.data})`);
    } else {
      check(!seesFolder, `${who}: 저장소 목록에 예약 공지 폴더 안 보임`, 'B4-N2', '중간', `${who}: storage.list('${A.A}') 에 예약 공지 폴더(${N}) 가 보인다`);
      check(!dl.data, `${who}: 예약 공지 사진 내려받기 불가`, 'B4-N2', '높음', `${who}: 예약 공지 사진(${photoPath}) 내려받기 성공 (${dl.data?.size ?? '?'} bytes)`);
    }
  }
  // todos.notice_id 로 걸린 숙제 — 설계 결정(따로 산다). 무엇이 보이는지 적는다
  {
    const g = await p1.from('todos').select('id, title, notice_id').eq('id', todo.id);
    if ((g.data ?? []).length) note(`학부모(대상): 공지에 걸린 숙제는 보인다(설계 결정) → title="${g.data[0].title}", notice_id 노출 — 숙제 제목에 공지 내용을 적으면 미리 새어 나간다`);
    else note('학부모(대상): 공지에 걸린 숙제 안 보임');
    const g2 = await p2.from('todos').select('id').eq('id', todo.id);
    check((g2.data ?? []).length === 0, '학부모(비대상): 다른 반 숙제 안 보임', 'B4-N1', '중간', '학부모(비대상): 다른 반 숙제 보임');
  }
  // 스태프 본인은 본다(대조)
  check(((await d.from('notices').select('id').eq('id', N)).data ?? []).length === 1, '원장: 예약 공지 보임(대조)', 'B4-N9', '낮음');
  check(((await t.from('notices').select('id').eq('id', N)).data ?? []).length === 1, '담당 강사: 예약 공지 보임(대조)', 'B4-N9', '낮음');
  // 발행 전 notifications · outbox 는 0
  check((await notisFor(A.A, 'notice-view:' + N)).length === 0, '발행 전 notifications 0', 'B4-N3', '높음', '발행 전 notifications 존재');
  {
    const ob = await drainOutbox(A.A);
    check(ob.filter(o => o.link_ref === N).length === 0, '발행 전 outbox 0', 'B4-N3', '높음', `발행 전 outbox ${ob.length}줄`);
  }

  console.log('\n[2] 이중 뿌리기');
  // 원장이 PostgREST 로 fanned_at / publish_at 을 만지면 → guard 트리거
  let u = await d.from('notices').update({ fanned_at: new Date().toISOString() }).eq('id', N).select();
  check(!!u.error || (u.data ?? []).length === 0, `원장 PostgREST fanned_at 미리 찍기 거절 (${(u.error?.message ?? '0행').slice(0, 30)})`, 'B4-D1', '중간', '원장이 fanned_at 을 직접 찍었다');
  u = await d.from('notices').update({ publish_at: iso(-60e3) }).eq('id', N).select();
  check(!!u.error || (u.data ?? []).length === 0, `원장 PostgREST publish_at 갱신 거절 (${(u.error?.message ?? '0행').slice(0, 30)})`, 'B4-D1', '중간', '원장이 publish_at 을 직접 바꿈');
  u = await d.from('notices').update({ body: '본문 고침' }).eq('id', N).select();
  check(!u.error && (u.data ?? []).length === 1, '원장 PostgREST 다른 칸(body) 갱신은 통과(대조)', 'B4-D9', '낮음', '원장이 body 도 못 고친다: ' + err(u));
  // 다른 학원 원장 · 담당 아닌 강사 · 학부모의 reschedule
  for (const [who, c] of [['다른 학원 원장', dB], ['학부모', p1], ['학생', s], ['anon', anon]]) {
    const x = await c.rpc('reschedule_notice', { p_notice: N, p_publish_at: null });
    check(!!x.error, `${who}: reschedule_notice(지금 보내기) 거절`, 'B4-D2', '높음', `${who}: reschedule_notice 성공`);
  }
  check((await notisFor(A.A, 'notice-view:' + N)).length === 0, '남의 reschedule 시도 뒤에도 알림 0', 'B4-D2', '높음');
  // 강사: 자기 담당 반(C1) 공지는 만질 수 있고, C2 공지는 못 만진다
  {
    const nc2 = await d.rpc('create_notice_v2', { p_title: 'C2 예약', p_body: '', p_class_ids: [A.c2.id], p_publish_at: iso(3600e3) });
    const x = await t.rpc('reschedule_notice', { p_notice: nc2.data, p_publish_at: iso(7200e3) });
    check(!!x.error, `강사(C1 담당): C2 공지 reschedule 거절 (${(x.error?.message ?? '').slice(0, 20)})`, 'B4-D2', '높음', '강사가 담당 아닌 반 공지 시각을 바꿨다');
    const y = await t.rpc('reschedule_notice', { p_notice: N, p_publish_at: iso(7200e3) });
    check(!y.error, '강사(C1 담당): C1 공지 reschedule 통과(대조)', 'B4-D9', '낮음', err(y));
    const far = await t.rpc('reschedule_notice', { p_notice: N, p_publish_at: iso(91 * 86400e3) });
    check(/bad_time/.test(err(far)), '91일 뒤 reschedule → bad_time', 'B4-D3', '낮음', 'got ' + err(far));
    const far2 = await d.rpc('reschedule_notice', { p_notice: N, p_publish_at: iso(89 * 86400e3) });
    check(!far2.error, '89일 뒤 reschedule 통과(대조)', 'B4-D9', '낮음', err(far2));
  }
  // 강제로 과거로 돌린 뒤 publish_due_notices 두 번 동시 + 한 번 더
  await admin.from('notices').update({ publish_at: iso(-60e3) }).eq('id', N);
  const [x1, x2] = await Promise.all([admin.rpc('publish_due_notices'), admin.rpc('publish_due_notices')]);
  const x3 = await admin.rpc('publish_due_notices');
  note(`publish_due_notices 동시 2회 → ${x1.data}/${x2.data}, 이어 1회 → ${x3.data}`);
  let nn = await notisFor(A.A, 'notice-view:' + N);
  const audience = new Set([A.par1.uid, stu.uid]);   // C1 대상: 학부모1 + 학생1
  check(nn.length === audience.size && nn.every(n => audience.has(n.user_id)) && new Set(nn.map(n => n.user_id)).size === nn.length,
    `뿌리기 뒤 알림 = 대상 ${audience.size}명에게 각 1건`, 'B4-D4', '높음', `알림 ${nn.length}건: ${JSON.stringify(nn.map(n => n.user_id))}`);
  {
    const ob = await drainOutbox(A.A);
    const mine = ob.filter(o => o.link_ref === N);
    const perUser = {};
    for (const o of mine) perUser[o.to_user_id + ':' + o.channel] = (perUser[o.to_user_id + ':' + o.channel] ?? 0) + 1;
    check(mine.filter(o => o.to_user_id === A.par1.uid && o.channel === 'push').length === 1, '푸시 구독 학부모: push outbox 딱 1줄', 'B4-D4', '높음', `outbox ${JSON.stringify(perUser)}`);
    check(mine.every(o => Object.values(perUser).every(v => v === 1)), '사람·채널별 outbox 1줄씩', 'B4-D4', '높음', JSON.stringify(perUser));
  }
  // 나간 뒤 fanned_at 을 비워 크론이 다시 뿌리게 하기 → guard
  u = await d.from('notices').update({ fanned_at: null }).eq('id', N).select();
  check(!!u.error || (u.data ?? []).length === 0, `원장 PostgREST fanned_at 비우기 거절 (${(u.error?.message ?? '0행').slice(0, 30)})`, 'B4-D1', '중간', '원장이 나간 공지의 fanned_at 을 비웠다');
  {
    const again = await admin.rpc('publish_due_notices');
    check(again.data === 0 && (await notisFor(A.A, 'notice-view:' + N)).length === audience.size, 'fanned_at 비우기 시도 뒤 크론 0 · 알림 그대로', 'B4-D1', '중간');
  }
  // 이미 나간 공지 reschedule
  r = await d.rpc('reschedule_notice', { p_notice: N, p_publish_at: iso(3600e3) });
  check(/already_published/.test(err(r)), '나간 공지 reschedule → already_published', 'B4-D5', '중간', 'got ' + err(r));
  // 나간 뒤 학부모가 본다 · 사진도 내려온다(대조)
  check(((await p1.from('notices').select('id').eq('id', N)).data ?? []).length === 1, '발행 뒤 학부모(대상) 보임(대조)', 'B4-D9', '낮음');
  check(((await p2.from('notices').select('id').eq('id', N)).data ?? []).length === 0, '발행 뒤에도 비대상 학부모는 안 보임', 'B4-D6', '높음');
  // 과거 시각 reschedule = 지금 보내기
  {
    const n2 = (await d.rpc('create_notice_v2', { p_title: '과거로 되돌리기', p_body: '', p_class_ids: [A.c1.id], p_publish_at: iso(3600e3) })).data;
    const x = await d.rpc('reschedule_notice', { p_notice: n2, p_publish_at: iso(-3600e3) });
    const row = (await admin.from('notices').select('publish_at, fanned_at').eq('id', n2).single()).data;
    check(!x.error && row.fanned_at && Math.abs(Date.parse(row.publish_at) - Date.now()) < 60e3, '과거 시각 reschedule → 지금 뿌리고 publish_at=now()', 'B4-D7', '중간', JSON.stringify(row));
    check((await notisFor(A.A, 'notice-view:' + n2)).length === audience.size, '과거 reschedule 알림 1회', 'B4-D7', '중간');
    await drainOutbox(A.A);
  }
  // 직접 insert 길 — 0030 B4-D8: guard 트리거가 insert 도 본다. 90일 밖 → bad_time, fanned_at 은 비워지고 publish_at 은 지금 → 정상 뿌림
  {
    const ins = await d.from('notices').insert({ academy_id: A.A, author_id: A.dir.uid, title: '9999년 예약', body: '', target_class_id: A.c1.id, publish_at: '9999-12-31T00:00:00Z' }).select('id, publish_at, fanned_at');
    check(/bad_time/.test(err(ins)), 'PostgREST insert publish_at=9999-12-31 → bad_time', 'B4-D8', '낮음', `원장이 PostgREST insert 로 90일 밖 예약 공지를 만들었다 → ${err(ins) || JSON.stringify(ins.data)}`);
    const ins2 = await d.from('notices').insert({ academy_id: A.A, author_id: A.dir.uid, title: '뿌린 척', body: '', target_class_id: A.c1.id, fanned_at: new Date().toISOString(), publish_at: iso(-86400e3) }).select('id, fanned_at, publish_at');
    if (!ins2.error && ins2.data?.length) {
      const row = ins2.data[0];
      const k = (await notisFor(A.A, 'notice-view:' + row.id)).length;
      check(k === audience.size && Math.abs(Date.parse(row.publish_at) - Date.now()) < 60e3,
        `PostgREST insert 에 fanned_at 미리 찍기·과거 publish_at → 트리거가 비우고 지금으로 → 정상 뿌림(알림 ${k}건, publish_at=now)`, 'B4-D8', '낮음',
        `PostgREST insert fanned_at 미리 찍기: 알림 ${k}건(기대 ${audience.size}), publish_at=${row.publish_at}`);
      await drainOutbox(A.A);
    } else finding('B4-D8', '낮음', 'PostgREST insert(fanned_at 미리 찍기) 자체가 거절됐다 — RLS 는 insert 를 허용해야 한다: ' + err(ins2));
    const ins3 = await d.from('notices').insert({ academy_id: A.A, author_id: A.dir.uid, title: '10일 뒤 직접 insert', body: '', target_class_id: A.c1.id, publish_at: iso(10 * 86400e3) }).select('id, fanned_at, publish_at');
    check(!ins3.error && ins3.data?.[0]?.fanned_at === null && Date.parse(ins3.data?.[0]?.publish_at) > Date.now() + 9 * 86400e3,
      'PostgREST insert 10일 뒤 예약 → 저장, fanned_at null (대조)', 'B4-D8', '낮음', err(ins3) || JSON.stringify(ins3.data));
  }

  console.log('\n[3] create_notice_v2 시그니처 · 극단값');
  {
    const old3 = await d.rpc('create_notice_v2', { p_title: '3인자', p_body: '', p_class_ids: [A.c1.id] });
    check(!old3.error, '3인자 호출(기본값) 통과, 모호성 없음', 'B4-S1', '중간', '3인자 호출 실패: ' + err(old3));
    if (!old3.error) { check(!!(await admin.from('notices').select('fanned_at').eq('id', old3.data).single()).data?.fanned_at, '3인자 = 바로 뿌림', 'B4-S1', '중간'); await drainOutbox(A.A); }
    const y9999 = await d.rpc('create_notice_v2', { p_title: '9999', p_body: '', p_class_ids: [A.c1.id], p_publish_at: '9999-12-31T23:59:59Z' });
    check(/bad_time/.test(err(y9999)), '9999년 → bad_time', 'B4-S2', '낮음', 'got ' + (err(y9999) || 'OK'));
    const inf = await d.rpc('create_notice_v2', { p_title: 'inf', p_body: '', p_class_ids: [A.c1.id], p_publish_at: 'infinity' });
    check(/bad_time/.test(err(inf)), "'infinity' → bad_time", 'B4-S2', '낮음', 'got ' + (err(inf) || 'OK'));
    // 0030 B4-S3: ±infinity 는 bad_time, 과거 시각은 now() 로 저장(reschedule_notice 와 같은 규칙)
    const ninf = await d.rpc('create_notice_v2', { p_title: '-inf', p_body: '', p_class_ids: [A.c1.id], p_publish_at: '-infinity' });
    if (!ninf.error) await drainOutbox(A.A);
    check(/bad_time/.test(err(ninf)), "'-infinity' → bad_time", 'B4-S3', '낮음', `p_publish_at='-infinity' 통과 (${err(ninf) || 'OK ' + ninf.data})`);
    { // 아직 안 나간 공지에 reschedule('-infinity') — 과거 분지("지금 뿌리기")로 떨어지지 않고 bad_time
      const n3 = (await d.rpc('create_notice_v2', { p_title: '재예약 -inf', p_body: '', p_class_ids: [A.c1.id], p_publish_at: iso(3600e3) })).data;
      const r3 = await d.rpc('reschedule_notice', { p_notice: n3, p_publish_at: '-infinity' });
      const row3 = (await admin.from('notices').select('fanned_at').eq('id', n3).single()).data;
      check(/bad_time/.test(err(r3)) && !row3?.fanned_at, "reschedule_notice('-infinity') → bad_time, 안 뿌려짐", 'B4-S3', '낮음', `reschedule -infinity: ${err(r3) || 'OK'}, fanned_at=${row3?.fanned_at}`);
    }
    const y1 = await d.rpc('create_notice_v2', { p_title: '0001', p_body: '', p_class_ids: [A.c1.id], p_publish_at: '0001-01-01T00:00:00Z' });
    if (!y1.error) {
      const row = (await admin.from('notices').select('publish_at, fanned_at').eq('id', y1.data).single()).data;
      check(!!row?.fanned_at && Math.abs(Date.parse(row.publish_at) - Date.now()) < 60e3, '과거 시각(0001-01-01) → publish_at=now() 로 저장·즉시 뿌림', 'B4-S3', '낮음', `0001-01-01 → publish_at=${row?.publish_at}`);
      await drainOutbox(A.A);
    } else finding('B4-S3', '낮음', '0001-01-01 이 거절됐다(과거 = 지금 뿌리기 규칙이어야 한다): ' + err(y1));
    const junk = await d.rpc('create_notice_v2', { p_title: 'junk', p_body: '', p_class_ids: [A.c1.id], p_publish_at: 'tomorrow-ish' });
    check(!!junk.error, '문자열 쓰레기 시각 거절: ' + err(junk).slice(0, 40), 'B4-S2', '낮음', '쓰레기 시각 통과');
    // 학부모·anon 은 create_notice_v2 자체를 못 부른다
    for (const [who, c] of [['학부모', p1], ['학생', s], ['anon', anon]]) {
      const x = await c.rpc('create_notice_v2', { p_title: 'x', p_body: '', p_class_ids: [A.c1.id], p_publish_at: null });
      check(!!x.error, `${who}: create_notice_v2 거절`, 'B4-S4', '높음', `${who}: 공지 생성 성공`);
    }
    // 다른 학원 원장이 우리 반 id 로 예약
    const cross = await dB.rpc('create_notice_v2', { p_title: 'x', p_body: '', p_class_ids: [A.c1.id], p_publish_at: iso(3600e3) });
    check(!!cross.error, '다른 학원 원장: 우리 반 id 로 공지 거절', 'B4-S4', '높음', '다른 학원 원장이 우리 반에 공지를 넣었다');
  }
  await drainOutbox(A.A);
} finally {
  await cleanup();
}
report('rt-batch4-notices');
