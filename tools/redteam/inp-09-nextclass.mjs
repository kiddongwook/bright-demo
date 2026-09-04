// inp-09 nextClassDays 는 시각을 문자열로 비교한다 — 이상한 시각·앞 0 없는 시각이 "다음 수업" 을 틀리게 만든다
// api.ts nextClassDays 사본 (kstDate·dowOf 는 inp-lib 의 dates 사본)
import { F, held, report, dowOf, hmToMin } from './inp-lib.mjs';

const kstDate = (n) => new Date(Date.now() + 9 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);
function nextClassDays(schedule, count, closed, nowHm) {
  const nowK = new Date(Date.now() + 9 * 3600e3);
  const hm = nowHm ?? `${String(nowK.getUTCHours()).padStart(2, '0')}:${String(nowK.getUTCMinutes()).padStart(2, '0')}`;
  const out = [];
  for (let i = 0; out.length < count && i < 60; i++) {
    const iso = kstDate(i); const dow = dowOf(iso);
    if (closed?.has(iso)) continue;
    if (schedule.some((s) => s.dow === dow && (i > 0 || s.start > hm))) out.push(iso);
  }
  return out;
}

const todayDow = dowOf(kstDate(0));
const at = (start) => nextClassDays([{ dow: todayDow, start, end: '21:00' }], 3, undefined, '23:30');
const cases = [['19:00', '정상'], ['7:00', '앞 0 없음'], ['25:00', '25시'], ['09:00', '오전 9시'], ['9:00', '앞 0 없는 오전 9시']];
const rows = cases.map(([s, why]) => ({ why, start: s, hmToMin: hmToMin(s), '23:30에 오늘 포함': at(s)[0] === kstDate(0) }));
console.log(JSON.stringify(rows, null, 1));

const bad = rows.filter(r => r['23:30에 오늘 포함'] && (r.hmToMin === null || r.hmToMin < 23 * 60 + 30));
if (bad.length) {
  F('INP-80', '중간', "nextClassDays 가 시각을 문자열로 비교한다(s.start > hm) — '7:00'·'9:00'(앞 0 없음)이나 '25:00' 이 시간표에 있으면 밤 11시 30분에도 \"다음 수업 오늘\" 로 뜬다. hmToMin 을 쓰는 pickInitialClass 는 같은 값을 아예 버려서, 같은 화면 안에서 두 판단이 어긋난다",
    'tools/redteam/inp-09-nextclass.mjs',
    `nowHm='23:30' 에서 오늘이 후보로 잡힌 시각: ${JSON.stringify(bad.map(b => b.start))} (문자열 비교라 '7'>'2', '25:00'>'23:30'). app/src/lib/api.ts nextClassDays 336줄`);
} else held('nextClassDays 가 이상한 시각에 흔들리지 않는다', JSON.stringify(rows));

// dow 가 0~6 밖이면 조용히 빠진다
const none = nextClassDays([{ dow: 9, start: '19:00', end: '21:00' }], 3, undefined, '00:00');
if (!none.length) held('dow 9 같은 값은 어떤 날에도 안 맞아 "다음 수업 없음" 이 된다 (조용한 실패)', `nextClassDays([{dow:9}]) → ${JSON.stringify(none)}`);

report('inp-09 다음 수업일');
