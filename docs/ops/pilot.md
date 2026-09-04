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
   출력에 앱 주소·원장 번호·**원장 초대 링크**·다음 할 일이 나온다. slug 가 이미 있으면 거절한다.
   초대 링크(`…/pwa/?a=<slug>&i=<token>`)는 이 화면에만 나온다 — 바로 복사해 두고, 원장님께 카톡으로 보낸다.
   원장님은 이 링크만 누르면 문자 인증 없이 원장으로 들어간다. 7일 안에 눌러야 하고, 지나면 같은 명령으로는 못 만든다
   (그땐 원장 번호로 OTP 로그인하거나, SQL 로 `invite_tokens` 행을 새로 넣는다).

   씨앗(데모) 데이터가 들어있던 학원을 재활용하는 경우엔 먼저 비운다(§4 참고):
   ```
   SEED_DEMO_WIPE=1 node --env-file=../.env.local pilot-reset.mjs <slug>
   ```

2. 실제 명부 CSV 적재 (`roster.sample.csv` 와 같은 형식 — 반,요일,시작,끝,학생,학생번호,보호자,보호자번호,관계):
   ```
   node --env-file=../.env.local seed-roster.mjs <csv 경로> <slug> "<학원 이름>"
   ```
   출력에 반 수·학생 수·명부 행 수가 나온다. 컬럼이 안 맞으면 여기서 바로 드러난다.

3. 원장 로그인 확인 — 초대 링크를 시크릿 창에서 열어 본다(그러면 그 토큰이 쓰인다: 10분 안에는 원장님도 그대로 다시 열 수 있다).
   확인만 하고 싶으면 원장 번호로 OTP 로 들어가 본다. 안 되면 `roster_phones` 에 원장 번호가 정확히(숫자만) 들어갔는지 확인.

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
- 더보기 → **알림** 에서 "이 기기로 알림 받기" 를 켠다(홈 화면에 추가한 뒤에야 켤 수 있다 — 특히 아이폰). 켜면 카톡 대신 푸시로 간다. 둘 다 받고 싶으면 "카톡도 같이 받기" 도 켠다.
- 명부에서 **초대 링크 복사** — 학부모·학생·강사마다 개인 링크가 클립보드에 복사된다. 카톡으로 그 사람에게 보내면 문자 없이 바로 들어온다(7일 만료).
- 더보기 → **학부모 초대 문구 복사**(학원 공용 주소) 는 그대로 있다. 단톡방에 한 번에 뿌릴 때 쓴다.
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

## 실기기에서만 확인되는 것 (파일럿 첫날)
- 카톡 내장 브라우저에서 사진 고르기(공지 사진·로고)와 내려받기(CSV·JSON)가 되는지, 안 되면 "브라우저로 열기" 로 안내.
- 홈 화면 추가 뒤 알림톡 링크가 앱으로 열리는지, 탭을 죽였다 살려도 제한 세션이 전체 세션으로 남지 않는지.

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

(리셋은 DB 행뿐 아니라 그 학원의 저장소 파일 — 공지 사진·로고 — 도 함께 지우고 `logo_path` 를 비운다.)

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
| `tools/vapid-keygen.mjs` | 웹 푸시 서명 키(VAPID) 한 쌍 생성. 값은 화면에 한 번만 — `docs/ops/outbox.md` "웹 푸시" 참고 |
| `tools/push-test.mjs` | 알림 → 채널 push 매핑·구독 RLS·(배포 뒤) 발송 확인 |
| `tools/invite-test.mjs` | `create_invite` RPC + `invite-login` 확인 |

## 안 들어온 사람 다시 부르기

원장 화면 명부의 "아직 앱에 안 들어온 N명" 각 행에서 **초대 링크 복사** 를 누르면 그 사람만의 링크가 만들어진다(`create_invite`).
번호가 그 학원 명부에 있어야 하고, 원장만 만들 수 있다. 같은 번호로 다시 만들면 앞의 링크는 그 자리에서 죽는다 — 늘 마지막 링크 하나만 산다.

## 개발용 고정 인증번호 (대행사 연결 전)

- `otp-verify` 는 `SMS_PROVIDER` 가 `console`(기본) 일 때만, Edge 비밀값 `DEV_OTP_PHONES`(쉼표 구분 번호) 에 적힌 번호에 대해 `DEV_OTP_CODE` 를 인증번호로 받아 준다. 대행사를 켜면(`SMS_PROVIDER=http`) 자동으로 꺼진다.
- 설정: `npx supabase secrets set DEV_OTP_CODE=<6자리> DEV_OTP_PHONES=<번호>` → `npx supabase functions deploy otp-verify --no-verify-jwt`. 끄기: `npx supabase secrets unset DEV_OTP_CODE DEV_OTP_PHONES`.
- 코드 값은 저장소·문서에 적지 않는다. 현재는 원장 번호 1개만 등록.

## 0018 뒤로 달라진 것 (2026-09-04, 레드팀 뒷수습)

원장 화면에서 **거절당할 수 있는 자리**가 늘었다. 파일럿 중 이런 안내를 보면 버그가 아니라 규칙이다.

| 언제 | 무슨 말이 뜨나 | 무엇을 하라 |
|---|---|---|
| 남은 금액보다 많이 납부를 적을 때 | `overpay: 남은 금액 …원, 적으려는 금액 …원` | 금액을 남은 금액 이하로. 실제로 더 받았으면 청구액을 먼저 올린다 |
| 500만 원을 넘는 납부·청구액 | `over_cap` | 오타 확인. 진짜 그 금액이면 여러 달로 나눈다 |
| 이미 낸 돈보다 낮게 청구액을 고칠 때 | `below_paid: 이미 낸 돈 …원보다 낮은 총액 …원` | 환불하고 납부 기록을 지운 뒤 고친다 |
| 납부 기록이 있는 청구서를 면제할 때 | `has_payments: 납부 기록이 있는 청구서는 면제할 수 없습니다` | 환불·기록 삭제가 먼저. 아니면 금액을 0 이 아닌 값으로 조정 |
| 반에 **반 공지**가 걸린 채 반을 지울 때 | FK 오류(`notices_target_class_id_fkey`) | 그 반 공지를 먼저 지운다. 휴원일·요금제는 반과 함께 자동으로 사라진다 |
| 명부 번호가 휴대폰 모양이 아닐 때 | `bad_phone: …` | `01[016789]` + 7~8자리. CSV 로 들어온 `+82 10-…` 도 여기서 걸린다 |
| 공지 제목이 80자를 넘거나 비었을 때 | check 위반 | 제목은 80자까지 |
| 시간표에 `24:00`·`19:60`·`7:00`(앞 0 없음)·끝 ≤ 시작 | `bad schedule: {…}` | `HH:MM`(00:00~23:59), 끝이 시작보다 뒤 |

그 밖에 조용히 달라진 것:

- **부분 납부도 납기가 지나면 연체**로 바뀐다. 한 번 연체가 된 청구서는 그 뒤 부분 납부가 들어와도 연체로 남는다(다 내면 완납).
- **퇴원생 청구서는 연체로 안 뒤집히고 미납 안내도 안 간다.** 퇴원 시점의 **다음 달부터의 미납 청구서**는 자동으로 면제된다(낸 돈이 있는 것은 그대로 둔다).
- **퇴원 뒤 학부모 화면**: 자녀가 더 있으면 남은 자녀로 자동으로 옮겨진다(전에는 역할 선택 화면으로 돌아갔다). 어느 학원에도 소속이 없어지면 그 사람의 푸시 구독을 지우고, 명부에서 빠진 번호의 아직 안 쓴 초대 링크를 만료시킨다.
- **푸시 구독은 기기 5대까지.** 여섯 번째를 등록하면 가장 오래된 것이 조용히 빠진다.
- **공지를 지우면** 그 공지를 가리키던 종 알림과 아직 안 나간 발송 줄도 같이 정리된다.
- **강사·학부모 계정을 지울 수 있다.** 기록(메모·공지·출결·문의)은 남고 "누가" 만 비워진다.
- **여러 날 휴원 등록**은 `add_calendar_many` RPC 로 바뀐다 — 겹치는 날이 있어도 새 날짜는 들어간다("3일 중 1일 넣음, 2일은 이미 있어요").
