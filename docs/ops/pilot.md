# 파일럿 런북 — 학원 하나를 실제로 돌리기

원장님 한 분과 시작할 때 순서대로 따라가는 문서. 명령은 모두 `tools/` 안에서 실행한다(`cd tools`).
앱 주소는 도메인 확보 전 임시로 **https://kiddongwook.github.io/bright-demo/pwa/** 를 쓴다.

---

## 1. Day-0 (원장님 만나기 전날)

1. 학원 개설 — 이미 있는 씨앗 학원을 쓸 게 아니면 새로 연다:
   ```
   cd tools
   node --env-file=../.env.local new-academy.mjs <slug> "<학원 이름>" <원장 번호> "<원장 이름>" [#색]
   ```
   출력에 앱 주소·원장 번호·다음 할 일이 나온다. slug 가 이미 있으면 거절한다.

   씨앗(데모) 데이터가 들어있던 학원을 재활용하는 경우엔 먼저 비운다(§4 참고):
   ```
   SEED_DEMO_WIPE=1 node --env-file=../.env.local pilot-reset.mjs <slug>
   ```

2. 실제 명부 CSV 적재 (`roster.sample.csv` 와 같은 형식 — 반,요일,시작,끝,학생,학생번호,보호자,보호자번호,관계):
   ```
   node --env-file=../.env.local seed-roster.mjs <csv 경로> <slug> "<학원 이름>"
   ```
   출력에 반 수·학생 수·명부 행 수가 나온다. 컬럼이 안 맞으면 여기서 바로 드러난다.

3. 원장 번호로 로그인 확인 — 실제 주소에서 OTP 로 들어가 본다. 안 되면 `roster_phones` 에 원장 번호가 정확히(숫자만) 들어갔는지 확인.

4. 공지 1개 올려서 화면이 도는지 확인.

5. `APP_URL` 이 실제 주소를 가리키는지 확인 (docs/ops/deploy.md 의 "알림톡 링크 주소" 항목). 아니면:
   ```
   node --env-file=../.env.local setup-outbox.mjs https://kiddongwook.github.io/bright-demo/pwa
   ```

6. 더보기 → **앱 정보·진단** 화면을 열어 서버 연결·서비스워커가 정상인지 미리 본다.

7. 학부모·학생에게 주는 주소는 `https://kiddongwook.github.io/bright-demo/pwa/?a=<slug>` (초대 문구 복사가 자동으로 붙인다); 주소에 `?a=` 가 없으면 마지막에 열었던 학원, 그것도 없으면 `yeongeo`.

---

## 2. Day-0 (미팅)

- 원장님 폰에서 앱 주소를 열고 **홈 화면에 추가** (더보기 → 홈 화면에 추가).
- 더보기 → **우리 학원** 에서 강조색을 고른다.
- 더보기 → **학부모 초대 문구 복사** — 문구가 클립보드에 복사된다. 카톡 단톡방이나 개별 메시지로 그대로 붙여 보낸다.
- 첫 공지를 하나 올린다 (반별이든 전체든, 원장님이 직접 눌러 보게 한다).

---

## 3. 첫 주

매일 아침 SQL 에디터에서 두 줄만 본다(§5 참고): `outbox` 상태 분포, `client_errors` 최근 몇 건.

학부모 진입률(등록된 번호 중 실제로 들어온 비율)을 하루 이틀 뒤 확인해서 원장님께 전달한다:
```sql
select
  (select count(*) from roster_phones where academy_id = '<academy-id>' and role = 'parent') as 등록된_학부모,
  (select count(distinct m.user_id) from memberships m where m.academy_id = '<academy-id>' and m.role = 'parent') as 들어온_학부모;
```

안 들어온 학부모 명단(번호가 명부엔 있는데 아직 앱에 안 들어온 사람):
```sql
select rp.name, rp.phone
from roster_phones rp
left join users u on u.phone = rp.phone
left join memberships m on m.user_id = u.id and m.academy_id = rp.academy_id and m.role = 'parent'
where rp.academy_id = '<academy-id>' and rp.role = 'parent' and m.id is null
order by rp.name;
```
`<academy-id>` 는 `select id from academies where slug = '<slug>';` 로 찾는다. 이 명단을 원장님께 전달해서 다시 안내하게 한다.

---

## 4. 문제가 나면

원장님께 부탁: **더보기 → 앱 정보·진단 → "문제 보내기"** 에 어떤 화면에서 뭐가 안 됐는지 적어서 보내 달라고 한다. 스크린샷보다 이 화면이 낫다(버전·환경·서비스워커·서버 연결이 같이 실린다).

확인 순서:
1. 오류가 실제로 들어왔는지 — SQL 에디터:
   ```sql
   select at, screen, env, message, version
   from client_errors
   where academy_id = '<academy-id>' or academy_id is null
   order by at desc limit 20;
   ```
2. 서버 쪽 함수 로그 — Supabase 대시보드 → Edge Functions → 문제가 될 만한 함수(otp-send, otp-verify, outbox-send 등) → Logs.
3. 알림톡이 안 갔다는 신고면 outbox 상태 확인(§5).
4. 그래도 안 잡히면 원장님 폰 환경(카톡 인앱 브라우저인지, 아이폰/안드로이드인지)을 "앱 정보·진단" 화면의 "환경" 값으로 확인 — 카톡 인앱 브라우저는 클립보드·서비스워커가 제한될 수 있다.

---

## 5. 주간 점검

살림(cron)이 매일 도는지:
```sql
select jobname, status, start_time
from cron.job_run_details
where jobname in ('housekeeping-daily', 'outbox-tick')
order by start_time desc limit 10;
```

outbox 상태 분포(막힌 게 쌓이지 않는지):
```sql
select status, channel, count(*) from outbox group by 1,2;
```
`failed`·`dead` 가 쌓여 있으면 `docs/ops/outbox.md` 의 "dead 처리" 참고(대개 번호 오타).

백업 겸 내려받기 1회: 원장님께 더보기 → **학원 데이터 내려받기** 를 눌러 보게 하거나, 직접 관리자 세션으로 내려받아 둔다(학생·출결·공지·문의 전부 JSON 한 파일).

알림톡 요율(대행사 계약 뒤): `provider_msg_id`·콜백 상태 기준으로 발송 대비 delivered 비율. 계약 전(콘솔 모드)엔 의미 없음.

---

## 6. 종료·이관

1. 더보기 → 학원 데이터 내려받기로 최종 JSON 을 원장님께 전달(또는 직접 내려받아 전달).
2. 계속 쓰지 않기로 하면:
   - 학원은 남기고 데이터만 비우려면: `SEED_DEMO_WIPE=1 node --env-file=../.env.local pilot-reset.mjs <slug>` (학원·원장 소속은 남는다. 다음 파일럿에 재사용 가능).
   - 학원 자체를 지우려면: `academies` 행을 서비스 키로 직접 삭제(연결된 모든 데이터가 cascade 로 같이 지워진다) — 되돌릴 수 없으니 위 내려받기를 먼저 반드시 한다.
3. 계속 쓰기로 하면: 아무것도 안 한다. 다음 달도 같은 §5 점검을 반복한다.

---

## 스크립트 요약

| 스크립트 | 하는 일 |
|---|---|
| `tools/new-academy.mjs <slug> "<이름>" <원장번호> "<원장이름>" [#색]` | 학원 개설 + 원장 명부 행 |
| `tools/seed-roster.mjs <csv> <slug> "<이름>"` | 명부 CSV → 반·학생·명부 행 적재(있으면 갱신) |
| `SEED_DEMO_WIPE=1 tools/pilot-reset.mjs <slug> [--yes <slug>]` | 학원 하나의 데이터를 전부 지움(학원·원장만 남김). 확인 문구를 slug 로 두 번 받는다 |
| `tools/onboard-test.mjs` | 위 세 스크립트가 맞물려 도는지 확인하는 통합 테스트 |
