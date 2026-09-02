# 영어의 집 데모 v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 원장이 요구한 기본 4개(출결·공지·문의·제한 입장)를 세 역할(원장·학부모·학생)의 폰 앱 화면으로 증명하는 정적 데모를, 「영어의 집」 로고 기준 디자인으로 다시 짓는다.

**Architecture:** `index.html` 한 파일. 입장 게이트(`g-*`) → 역할 상태 `ROLE`('d'|'p'|'s') → 역할별 탭 뷰(`d-today` 등)와 진입 뷰. 라우터는 `enter/tab/push/back/logout` 다섯 함수, 탭바는 `TABS[ROLE]`에서 그린다. 화면 내용은 정적 마크업이고, 화면 간 숫자 정합은 테스트가 DOM에서 읽어 대조한다.

**Tech Stack:** HTML/CSS/JS(ES5 문법, 빌드 없음) · Pretendard(jsdelivr) · 로고 PNG(Pillow로 추출) · 검증은 Chrome headless + `tests/run-mobile-nav-test.ps1`.

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-09-02-yeongeo-jip-demo-v2-design.md`
- 학원명은 **영어의 집**. `한빛영어학원`·`한` 칩은 한 글자도 남기지 않는다.
- 서체는 **Pretendard 하나**. Gowun Batang 링크와 `--voice` 변수를 제거한다.
- 색 토큰: `--ink #1C1C1C` · `--paper #FFFFFF` · `--rule #E6E6E3` · `--warn #B8860B` · `--danger #C0392B` · `--brand` 기본값 `#1C1C1C`(강조색 미정 → 먹).
- 면은 **윤곽선**. 카드·입력창은 `1px solid var(--ink)`, 주 버튼만 먹으로 채움.
- 출석부 기호 `○ △ ✕` 유지.
- 뷰 id 규칙: `g-*`(게이트), `d-*`(원장), `p-*`(학부모), `s-*`(학생). 탭 뷰 이름은 `TABS`에 있는 것만.
- 데모 입장 번호: 원장 `010-1000-0001` · 학부모 `010-1234-0001` · 학생 `010-1234-0104`. 그 외 번호는 `g-deny`.
- 화면 간 정합: 원장 문의함 배지 `1` = 미답변 1건 = 정하윤 어머님 문의. 학부모 종 `2`, 원장 종 `1`, 학생 종 `1`.
- 목업 사진 `KakaoTalk_*.jpg`는 커밋 금지(`.gitignore`).
- 파일 인코딩 UTF-8. 저장소는 CRLF 자동 변환 경고가 나오지만 무시해도 된다.
- 커밋 메시지 끝: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
- 푸시는 마지막 Task에서만, 사용자가 시킨 경우에만.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `tools/extract-logo.py` | `_05.jpg` 마스터 → 투명 PNG 2종(먹·흰) 생성. 한 번 실행 |
| `assets/logo/yeongeo-jip.png` | 먹 로고, 폭 1600, 투명 배경 |
| `assets/logo/yeongeo-jip-white.png` | 흰 로고(지금 미사용, 함께 생성) |
| `.gitignore` | `KakaoTalk_*.jpg` |
| `index.html` | 앱 전체. 순서: `<style>` → 게이트 뷰 → 원장 뷰 → 학부모 뷰 → 학생 뷰 → 탭바 → `<script>` |
| `tests/mobile-nav-test.html` | iframe 안에서 게이트·역할·탭·정합 검사. `<pre id="result">`에 PASS/FAIL |
| `tests/run-mobile-nav-test.ps1` | 기존 러너, 수정 없음 |
| `tests/app-verify.png` | 최종 3역할 스크린샷 시트 |
| `og.png` | 로고 + "영어의 집 · 우리 학원 앱" |

`index.html`은 한 파일이지만 Task마다 **한 역할 또는 한 기능 블록**만 추가한다. 각 Task 끝에서 테스트가 PASS여야 한다.

---

### Task 1: 로고 자산과 .gitignore

**Files:**
- Create: `tools/extract-logo.py`
- Create: `assets/logo/yeongeo-jip.png`, `assets/logo/yeongeo-jip-white.png` (스크립트가 생성)
- Create: `.gitignore`

**Interfaces:**
- Produces: `assets/logo/yeongeo-jip.png` — 이후 모든 Task가 `<img src="assets/logo/yeongeo-jip.png">`로 쓴다.

- [ ] **Step 1: 실패하는 검사 — 아직 파일이 없다**

Run:
```bash
python -c "from PIL import Image; im=Image.open('assets/logo/yeongeo-jip.png'); print(im.mode, im.size)"
```
Expected: `FileNotFoundError`

- [ ] **Step 2: 추출 스크립트 작성**

`tools/extract-logo.py`:
```python
"""_05 마스터(검정 선 / 흰 배경)에서 배경을 빼 투명 PNG 2종을 만든다."""
from PIL import Image, ImageOps
import os

SRC = "KakaoTalk_20260902_132228178_05.jpg"
OUT = "assets/logo"
WIDTH = 1600

os.makedirs(OUT, exist_ok=True)
g = ImageOps.grayscale(Image.open(SRC))

# 선이 있는 곳만 남기고 여백을 자른다 (검정 < 128)
bw = g.point(lambda v: 0 if v < 128 else 255)
bbox = ImageOps.invert(bw).getbbox()
g = g.crop(bbox)

# 비율 유지해 폭 1600
h = round(g.height * WIDTH / g.width)
g = g.resize((WIDTH, h), Image.LANCZOS)

# 알파 = 어두울수록 불투명
alpha = ImageOps.invert(g)

ink = Image.new("RGBA", g.size, (0x1C, 0x1C, 0x1C, 0))
ink.putalpha(alpha)
ink.save(f"{OUT}/yeongeo-jip.png", optimize=True)

white = Image.new("RGBA", g.size, (255, 255, 255, 0))
white.putalpha(alpha)
white.save(f"{OUT}/yeongeo-jip-white.png", optimize=True)

print("ok", ink.size)
```

- [ ] **Step 3: 실행**

Run:
```bash
python tools/extract-logo.py
```
Expected: `ok (1600, N)` — N은 900~1200 사이.

- [ ] **Step 4: 검사 통과 확인**

Run:
```bash
python -c "from PIL import Image; im=Image.open('assets/logo/yeongeo-jip.png'); print(im.mode, im.size, im.getpixel((0,0)))"
```
Expected: `RGBA (1600, N) (28, 28, 28, 0)` — 모서리 픽셀 알파 0(투명).

- [ ] **Step 5: 눈으로 확인**

`assets/logo/yeongeo-jip.png`를 Read 도구로 열어 집 윤곽과 「영어의 집」이 잘리지 않았는지 본다. 잘렸으면 Step 2의 임계값 `128`을 `160`으로 올리고 다시 실행.

- [ ] **Step 6: .gitignore**

`.gitignore`:
```
KakaoTalk_*.jpg
```

Run: `git status --short`
Expected: `KakaoTalk_*.jpg` 여섯 줄이 사라지고 `?? assets/`, `?? tools/`, `?? .gitignore`만 남는다.

- [ ] **Step 7: 커밋**

```bash
git add .gitignore tools/extract-logo.py assets/logo/
git commit -m "chore: 영어의 집 로고 자산 — 마스터에서 투명 PNG 추출, 목업 사진은 커밋 제외

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: 셸·토큰·게이트·라우터 (index.html 재작성)

이 Task가 `index.html`을 **통째로 새로 쓴다.** 이후 Task는 이 파일에 뷰를 추가만 한다.

**Files:**
- Rewrite: `index.html`
- Rewrite: `tests/mobile-nav-test.html`

**Interfaces:**
- Produces (JS 전역): `ROLE`, `TABS`, `TITLE`, `NOTI`, `enter(role)`, `tab(name)`, `push(name)`, `back()`, `logout()`, `toast(msg)`, `gatePhone(v)`, `gateGo()`, `gateCode()`, `att(el,kind)`, `setBrand(color,el)`.
- Produces (CSS): `.appbar .bk .logo .bell .badge` · `.view .view.on` · `.tabbar` · `.gate .gate-logo .field .input` · `.btn .btn.line .btn.sm` · `.lab .lab .r` · `.box` · `.rw .bd .t .s .go` · `.nm` · `.tag .tag.warn .tag.danger .tag.ok` · `.marks` · `.week` · `.big` · `.legend` · `.credit` · `.toast`.
- 뷰 마크업 규칙: 탭 뷰는 `<section class="view" id="{role}-{name}">`, 진입 뷰도 같다. 라우터가 `TABS`로 탭/진입을 구분한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/mobile-nav-test.html` 전체:
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>영어의 집 app shell test</title>
  <style>iframe { width: 390px; height: 844px; border: 0; }</style>
</head>
<body>
  <pre id="result">FAIL: page did not load</pre>
  <iframe id="app" src="../index.html"></iframe>
  <script>
    document.getElementById('app').addEventListener('load', function () {
      const w = this.contentWindow, d = w.document;
      const fails = [];
      const on = () => d.querySelector('.view.on') && d.querySelector('.view.on').id;
      const text = (sel) => (d.querySelector(sel) || {}).textContent || '';
      const visible = (sel) => { const e = d.querySelector(sel); return !!e && e.getBoundingClientRect().height > 0; };

      // ── 게이트 ──
      if (on() !== 'g-phone') fails.push('start view=' + on());
      if (visible('.tabbar')) fails.push('tabbar visible on gate');
      if (!visible('.gate-logo')) fails.push('gate logo missing');
      w.gatePhone('010-9999-9999'); w.gateGo();
      if (on() !== 'g-deny') fails.push('unknown phone should deny, got ' + on());
      w.back();
      w.gatePhone('010-1000-0001'); w.gateGo();
      if (on() !== 'g-code') fails.push('known phone should go to code, got ' + on());
      w.gateCode();
      if (w.ROLE !== 'd') fails.push('ROLE after director code=' + w.ROLE);
      if (on() !== 'd-today') fails.push('director lands on ' + on());

      // ── 원장 셸 ──
      const tabs = d.querySelectorAll('.tabbar a');
      if (tabs.length !== 4) fails.push('director tabs=' + tabs.length);
      if (!visible('.tabbar')) fails.push('tabbar hidden for director');
      const bar = d.querySelector('.tabbar').getBoundingClientRect();
      if (Math.abs(bar.bottom - w.innerHeight) > 2) fails.push('tabbar not at bottom');
      const de = d.documentElement;
      if (de.scrollWidth > de.clientWidth) fails.push('h-overflow');
      if (text('.appbar .badge') !== '1') fails.push('director bell badge=' + text('.appbar .badge'));

      // ── 라우터 ──
      w.tab('more');
      if (on() !== 'd-more') fails.push('tab(more) -> ' + on());
      w.tab('today'); w.push('roster');
      if (on() !== 'd-roster') fails.push('push(roster) -> ' + on());
      if (d.getElementById('bk').style.display !== 'grid') fails.push('back button hidden on sub view');
      w.back();
      if (on() !== 'd-today') fails.push('back -> ' + on());
      w.logout();
      if (on() !== 'g-phone' || w.ROLE !== null) fails.push('logout failed');

      // ── 학부모 / 학생 진입 ──
      w.gatePhone('010-1234-0001'); w.gateGo(); w.gateCode();
      if (w.ROLE !== 'p' || on() !== 'p-child') fails.push('parent lands on ' + on());
      if (d.querySelectorAll('.tabbar a').length !== 4) fails.push('parent tabs');
      w.logout();
      w.gatePhone('010-1234-0104'); w.gateGo(); w.gateCode();
      if (w.ROLE !== 's' || on() !== 's-me') fails.push('student lands on ' + on());
      if (d.querySelectorAll('.tabbar a').length !== 3) fails.push('student tabs');

      // ── 이름 교체 ──
      if (d.body.innerHTML.indexOf('한빛') >= 0) fails.push('한빛 remains');
      if (d.head.innerHTML.indexOf('Gowun') >= 0) fails.push('Gowun Batang link remains');

      const result = fails.length === 0
        ? 'PASS: gate + 3 roles + router + overflow'
        : 'FAIL: ' + fails.join(' | ');
      document.getElementById('result').textContent = result;
      document.title = result.startsWith('PASS:') ? 'PASS' : 'FAIL';
    });
  </script>
</body>
</html>
```

- [ ] **Step 2: 실패 확인**

Run:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-mobile-nav-test.ps1
```
Expected: `FAIL: start view=t-today | ...` (기존 index.html 기준)

- [ ] **Step 3: index.html 전체를 새로 쓴다**

아래를 `index.html`로 저장한다. 뷰는 게이트 3개와 각 역할의 **첫 탭 뷰 + 더보기 + 알림 + 명부**만 껍데기로 넣는다(내용은 Task 3~7). 그래야 이 Task의 테스트가 돈다.

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>영어의 집 · 우리 학원 앱</title>
<meta name="description" content="출결·공지·문의를 폰 하나로. 등원생과 학부모만 들어오는 우리 학원 앱.">
<meta name="theme-color" content="#FFFFFF">
<meta property="og:url" content="https://kiddongwook.github.io/bright-demo/">
<meta property="og:image" content="https://kiddongwook.github.io/bright-demo/og.png">
<meta property="og:type" content="website">
<meta property="og:title" content="영어의 집 · 우리 학원 앱">
<meta property="og:description" content="출결·공지·문의를 폰 하나로. 등원생과 학부모만 들어오는 우리 학원 앱.">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="assets/logo/yeongeo-jip.png">
<link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" rel="stylesheet">
<style>
:root{
  --paper:#FFFFFF; --ground:#F7F7F5;
  --ink:#1C1C1C; --ink2:#5A5A57; --ink3:#9A9A96;
  --rule:#E6E6E3; --rule2:#F0F0ED;
  --warn:#B8860B; --warn-soft:#FBF4E0;
  --danger:#C0392B; --danger-soft:#FAE9E6;
  --ok:#1C1C1C; --ok-soft:#EDEDEA;
  --brand:#1C1C1C; --brand-soft:#EDEDEA;   /* 학원 강조색 — 미정, 먹 */
  --ui:"Pretendard Variable","Pretendard",system-ui,sans-serif;
}
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{background:var(--ground);color:var(--ink);font-family:var(--ui);-webkit-font-smoothing:antialiased;font-feature-settings:"tnum"}
.num{font-variant-numeric:tabular-nums;letter-spacing:-.02em}
a{color:inherit;text-decoration:none}
button,input{font-family:inherit;color:inherit}
button{cursor:pointer;border:none;background:none}
:focus-visible{outline:2px solid var(--ink);outline-offset:2px;border-radius:6px}

/* ── 셸 ── */
.shell{width:100%;height:100dvh}
.app{height:100%;display:flex;flex-direction:column;background:var(--paper);overflow:hidden}
.appbar{flex:0 0 auto;background:var(--paper);border-bottom:1px solid var(--rule);
  padding:calc(12px + env(safe-area-inset-top)) 18px 12px;display:flex;align-items:center;gap:10px;min-height:56px}
.appbar .bk{width:28px;height:30px;margin-left:-8px;display:grid;place-items:center;font-size:26px;line-height:1;color:var(--ink)}
.appbar .logo{height:22px;width:auto;display:block}
.appbar .an{font-size:17px;font-weight:600;letter-spacing:-.02em}
.appbar .ad{margin-left:auto;font-size:12px;font-weight:500;color:var(--ink3)}
.appbar .bell{position:relative;width:32px;height:32px;display:grid;place-items:center;margin-right:-6px}
.appbar .bell svg{width:22px;height:22px}
.appbar .badge{position:absolute;top:2px;right:2px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;
  background:var(--danger);color:#fff;font-size:10.5px;font-weight:700;display:grid;place-items:center}
.appbar .badge:empty{display:none}
.appbar.gatebar{justify-content:center;border-bottom:0}
.view{flex:1 1 auto;overflow-y:auto;-webkit-overflow-scrolling:touch;display:none;padding:0 0 34px;background:var(--paper)}
.view.on{display:block;animation:rise .24s cubic-bezier(.2,.7,.3,1)}
@keyframes rise{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}
.tabbar{flex:0 0 auto;background:var(--paper);border-top:1px solid var(--rule);display:flex;padding:7px 6px calc(7px + env(safe-area-inset-bottom))}
.tabbar a{flex:1;text-align:center;font-size:10.5px;font-weight:600;color:var(--ink3);padding:4px 0;display:flex;flex-direction:column;align-items:center;gap:3px}
.tabbar a svg{width:22px;height:22px;display:block}
.tabbar a.on{color:var(--ink)}
.tabbar[hidden]{display:none}
@media(min-width:641px){
  body{display:grid;place-items:center;min-height:100vh;background:#E3E3DF;padding:26px 0}
  .shell{width:390px;height:min(812px,calc(100vh - 64px));background:#111;padding:13px;border-radius:46px;box-shadow:0 40px 90px rgba(0,0,0,.26)}
  .app{border-radius:34px}
  .appbar{padding-top:14px}
  .tabbar{padding-bottom:9px}
  .credit{position:fixed;bottom:15px;left:0;right:0;text-align:center;font-size:11.5px;color:#8E8B84;font-weight:600}
}
@media(max-width:640px){.credit{display:none}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}

/* ── 게이트 ── */
.gate{padding:34px 24px 0;display:flex;flex-direction:column;align-items:center;text-align:center}
.gate-logo{width:200px;height:auto;margin:22px 0 26px}
.gate h1{font-size:20px;font-weight:600;letter-spacing:-.02em;line-height:1.4}
.gate p{font-size:13.5px;color:var(--ink2);line-height:1.7;margin-top:8px}
.field{width:100%;text-align:left;margin-top:26px}
.field label{display:block;font-size:11.5px;font-weight:600;color:var(--ink3);margin-bottom:7px}
.input{width:100%;border:1px solid var(--ink);border-radius:10px;padding:14px 15px;font-size:17px;font-weight:500;letter-spacing:.02em;background:var(--paper)}
.input:focus{outline:none;box-shadow:0 0 0 2px var(--paper),0 0 0 3px var(--ink)}
.demo-keys{width:100%;margin-top:30px;border-top:1px solid var(--rule);padding-top:16px;text-align:left}
.demo-keys .lab{padding:0;margin-bottom:8px}
.demo-keys button{display:flex;justify-content:space-between;width:100%;padding:11px 0;border-bottom:1px solid var(--rule2);font-size:14px;text-align:left}
.demo-keys button:last-child{border-bottom:0}
.demo-keys button b{font-weight:600}
.demo-keys button span{color:var(--ink3);font-size:13px}

/* ── 종이 ── */
.head{padding:24px 20px 18px}
.hello{font-size:22px;font-weight:600;letter-spacing:-.03em;line-height:1.4}
.lede{font-size:14px;line-height:1.75;color:var(--ink2);margin-top:6px}
.lede b{color:var(--ink);font-weight:600}
.lab{font-size:11.5px;font-weight:600;letter-spacing:.02em;color:var(--ink3);padding:0 20px;margin:22px 0 9px;display:flex;align-items:baseline;gap:8px}
.lab.first{margin-top:0}
.lab .r{margin-left:auto;font-weight:500}
.box{margin:0 20px;border:1px solid var(--ink);border-radius:12px;overflow:hidden;background:var(--paper)}
.box.soft{border-color:var(--rule)}
.rw{display:flex;align-items:center;gap:13px;width:100%;text-align:left;padding:14px 16px;border-bottom:1px solid var(--rule)}
.rw:last-child{border-bottom:0}
.rw:active{background:var(--rule2)}
.rw .bd{flex:1;min-width:0;display:block}
.rw .t{display:block;font-size:15px;font-weight:600;letter-spacing:-.02em}
.rw .s{display:block;font-size:12.5px;color:var(--ink3);margin-top:3px;line-height:1.45}
.rw .go{color:var(--ink3);font-size:18px;flex:0 0 auto}
.nm{width:34px;height:34px;border-radius:50%;border:1px solid var(--ink);display:grid;place-items:center;font-size:13px;font-weight:600;flex:0 0 auto}
.tag{display:inline-flex;align-items:center;font-size:11px;font-weight:600;padding:3px 8px;border-radius:5px;border:1px solid currentColor;flex:0 0 auto}
.tag.ok{color:var(--ink)}
.tag.warn{color:var(--warn)}
.tag.danger{color:var(--danger)}
.tag.muted{color:var(--ink3)}
.big{display:flex;align-items:baseline;gap:8px;padding:0 20px;flex-wrap:wrap}
.big b{font-size:30px;font-weight:600;letter-spacing:-.04em}
.big b i{font-size:14px;font-style:normal;font-weight:600}
.big span{font-size:13px;font-weight:500;color:var(--ink3)}
.para{padding:0 20px;font-size:14.5px;line-height:1.85;color:var(--ink)}
.para+.para{margin-top:10px}
.muted{font-size:12.5px;color:var(--ink3);line-height:1.65}

/* ── 버튼 ── */
.btn{display:block;width:100%;background:var(--ink);color:#fff;font-weight:600;font-size:15px;padding:14px;border-radius:11px;letter-spacing:-.02em;text-align:center}
.btn.line{background:var(--paper);color:var(--ink);border:1px solid var(--ink)}
.btn.sm{width:auto;flex:0 0 auto;padding:8px 13px;font-size:12.5px;border-radius:8px}
.btn:active{opacity:.82}
.btnrow{display:flex;gap:9px;padding:20px 20px 0}
.btnrow .btn{flex:1}

/* ── 출석부 ○△✕ ── */
.marks{display:flex;gap:5px;flex:0 0 auto}
.marks button{width:34px;height:34px;border-radius:50%;border:1px solid var(--rule);font-size:16px;line-height:1;color:var(--ink3)}
.marks button.on.p{border-color:var(--ink);background:var(--ink);color:#fff}
.marks button.on.l{border-color:var(--warn);background:var(--warn);color:#fff}
.marks button.on.a{border-color:var(--danger);background:var(--danger);color:#fff}
.legend{display:flex;gap:14px;padding:12px 20px 0;font-size:11.5px;color:var(--ink3);font-weight:500}
.legend b{color:var(--ink2);font-weight:600;margin-right:3px}
.week{display:flex;gap:5px;padding:12px 16px 14px}
.week i{flex:1;aspect-ratio:1;border-radius:50%;border:1px solid var(--rule);display:grid;place-items:center;font-size:11.5px;font-weight:500;color:var(--ink3);font-style:normal}
.week i.p{border-color:var(--ink);color:var(--ink)}
.week i.l{border-color:var(--warn);color:var(--warn)}
.week i.a{border-color:var(--danger);color:var(--danger)}

/* ── 공지 / 문의 ── */
.post{padding:16px;border-bottom:1px solid var(--rule)}
.post:last-child{border-bottom:0}
.post .pt{font-size:15px;font-weight:600;letter-spacing:-.02em;line-height:1.45}
.post .pm{font-size:12px;color:var(--ink3);margin-top:5px;display:flex;gap:6px;flex-wrap:wrap}
.post .pm b{color:var(--ink2);font-weight:600}
.post.new .pt::before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--danger);margin-right:7px;vertical-align:middle}
.faq summary{list-style:none;cursor:pointer;padding:14px 16px;font-size:14.5px;font-weight:600;letter-spacing:-.02em;display:flex;gap:10px;align-items:center}
.faq summary::before{content:"Q";font-size:12px;font-weight:700;color:var(--ink3);flex:0 0 auto}
.faq summary::-webkit-details-marker{display:none}
.faq[open] summary{border-bottom:1px solid var(--rule2)}
.faq .a{padding:12px 16px 16px 36px;font-size:13.5px;line-height:1.75;color:var(--ink2)}
.faq{border-bottom:1px solid var(--rule)}
.faq:last-child{border-bottom:0}
.bubble{margin:0 20px;border:1px solid var(--rule);border-radius:12px;padding:14px 16px;font-size:14px;line-height:1.75}
.bubble.me{border-color:var(--ink)}
.bubble .who{font-size:11.5px;font-weight:600;color:var(--ink3);margin-bottom:5px}
.bubble+.bubble{margin-top:10px}
textarea.input{min-height:120px;resize:none;font-size:15px;line-height:1.6;font-weight:400}
.seg{display:flex;gap:6px;padding:0 20px}
.seg button{flex:1;padding:10px;border:1px solid var(--rule);border-radius:9px;font-size:13px;font-weight:600;color:var(--ink3)}
.seg button.on{border-color:var(--ink);color:var(--ink)}

/* ── 더보기 ── */
.chips{display:flex;gap:10px;padding:2px 0}
.chip{width:30px;height:30px;border-radius:50%;border:1px solid rgba(0,0,0,.1);position:relative}
.chip.on::after{content:"";position:absolute;inset:-4px;border:1px solid var(--ink);border-radius:50%}
.appicon{width:70px;height:70px;border-radius:19px;border:1px solid var(--ink);background:var(--paper);display:grid;place-items:center;margin:0 auto}
.appicon img{width:52px;height:auto}
.homescr{padding:26px 20px 22px;text-align:center;border-bottom:1px solid var(--rule)}
.homescr .hl{font-size:12.5px;font-weight:600;margin-top:9px}
.homescr .hc{font-size:13px;color:var(--ink2);margin-top:14px;line-height:1.7}
.madeby{text-align:center;font-size:11.5px;color:var(--ink3);margin-top:28px;line-height:1.75}

.credit{display:none}
.toast{position:fixed;left:50%;bottom:96px;transform:translateX(-50%) translateY(14px);background:var(--ink);color:#fff;font-size:13.5px;font-weight:500;padding:12px 18px;border-radius:9px;opacity:0;pointer-events:none;transition:.26s cubic-bezier(.2,.7,.3,1);z-index:99;max-width:300px;text-align:center;line-height:1.5}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
</style>
</head>
<body>
<div class="shell"><div class="app">

<header class="appbar" id="appbar">
  <button class="bk" id="bk" onclick="back()" style="display:none" aria-label="뒤로">&lsaquo;</button>
  <img class="logo" id="logo" src="assets/logo/yeongeo-jip.png" alt="영어의 집">
  <span class="an" id="an" style="display:none"></span>
  <span class="ad" id="ad"></span>
  <button class="bell" id="bell" onclick="push('noti')" aria-label="알림">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>
    <span class="badge" id="badge"></span>
  </button>
</header>

<!-- ════ 게이트 ════ -->
<section class="view on" id="g-phone">
  <div class="gate">
    <img class="gate-logo" src="assets/logo/yeongeo-jip.png" alt="영어의 집">
    <h1>등원생과 학부모만<br>들어올 수 있어요</h1>
    <p>원장님이 명부에 등록한 전화번호로 들어옵니다.</p>
    <div class="field">
      <label>전화번호</label>
      <input class="input" id="phone" inputmode="tel" placeholder="010-0000-0000" oninput="gatePhone(this.value)">
    </div>
    <div class="btnrow" style="padding-left:0;padding-right:0;width:100%"><button class="btn" onclick="gateGo()">인증번호 받기</button></div>
    <div class="demo-keys">
      <div class="lab">데모로 들어가기</div>
      <button onclick="gatePhone('010-1000-0001');gateGo()"><b>원장</b><span>010-1000-0001</span></button>
      <button onclick="gatePhone('010-1234-0001');gateGo()"><b>학부모 · 박지훈 어머님</b><span>010-1234-0001</span></button>
      <button onclick="gatePhone('010-1234-0104');gateGo()"><b>학생 · 김민수</b><span>010-1234-0104</span></button>
    </div>
  </div>
</section>

<section class="view" id="g-code">
  <div class="gate">
    <img class="gate-logo" src="assets/logo/yeongeo-jip.png" alt="영어의 집">
    <h1>인증번호를 보냈어요</h1>
    <p id="code-to">010-0000-0000 으로 6자리를 보냈습니다.</p>
    <div class="field">
      <label>인증번호</label>
      <input class="input" inputmode="numeric" value="482913" readonly>
    </div>
    <div class="btnrow" style="padding-left:0;padding-right:0;width:100%"><button class="btn" onclick="gateCode()">들어가기</button></div>
    <p class="muted" style="margin-top:14px">데모라 인증번호가 미리 채워져 있어요.</p>
  </div>
</section>

<section class="view" id="g-deny">
  <div class="gate">
    <img class="gate-logo" src="assets/logo/yeongeo-jip.png" alt="영어의 집">
    <h1>명부에 없는 번호예요</h1>
    <p>영어의 집 등원생과 학부모만 들어올 수 있습니다.<br>원장님께 등록을 요청해 주세요.</p>
    <div class="btnrow" style="padding-left:0;padding-right:0;width:100%"><button class="btn line" onclick="back()">다른 번호로</button></div>
  </div>
</section>

<!-- ════ 원장 (Task 3~5에서 채움) ════ -->
<section class="view" id="d-today"><div class="head"><h1 class="hello">오늘</h1></div></section>
<section class="view" id="d-notice"><div class="head"><h1 class="hello">공지</h1></div></section>
<section class="view" id="d-inbox"><div class="head"><h1 class="hello">문의</h1></div></section>
<section class="view" id="d-more"><div class="head"><h1 class="hello">더보기</h1></div></section>
<section class="view" id="d-roster"><div class="head"><h1 class="hello">명부</h1></div></section>
<section class="view" id="d-noti"><div class="head"><h1 class="hello">알림</h1></div></section>

<!-- ════ 학부모 (Task 6) ════ -->
<section class="view" id="p-child"><div class="head"><h1 class="hello">우리 아이</h1></div></section>
<section class="view" id="p-notice"><div class="head"><h1 class="hello">공지</h1></div></section>
<section class="view" id="p-ask"><div class="head"><h1 class="hello">문의</h1></div></section>
<section class="view" id="p-more"><div class="head"><h1 class="hello">더보기</h1></div></section>
<section class="view" id="p-noti"><div class="head"><h1 class="hello">알림</h1></div></section>

<!-- ════ 학생 (Task 7) ════ -->
<section class="view" id="s-me"><div class="head"><h1 class="hello">나</h1></div></section>
<section class="view" id="s-notice"><div class="head"><h1 class="hello">공지</h1></div></section>
<section class="view" id="s-more"><div class="head"><h1 class="hello">더보기</h1></div></section>
<section class="view" id="s-noti"><div class="head"><h1 class="hello">알림</h1></div></section>

<nav class="tabbar" id="tabbar" hidden></nav>

</div></div>
<div class="credit">영어의 집 · 학원 앱 데모 — PC에서는 폰 화면으로 보여드립니다</div>
<div class="toast" id="toast"></div>

<script>
/* ── 데모 명부: 번호 → 역할 ── */
var PHONES={'010-1000-0001':'d','010-1234-0001':'p','010-1234-0104':'s'};
var TABS={d:['today','notice','inbox','more'], p:['child','notice','ask','more'], s:['me','notice','more']};
var NOTI={d:1,p:2,s:1};
var ICON={
  list:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M5 7h14M5 12h14M5 17h9"/></svg>',
  notice:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9v6h3l6 4V5L8 9z"/><path d="M17 9.5a3.5 3.5 0 0 1 0 5"/></svg>',
  chat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16v10H9l-5 4z"/></svg>',
  house:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V9.6L12 4l8 5.6V20"/><path d="M15 6.5V4h2v4"/></svg>'
};
var TABMETA={today:['오늘','list'],child:['우리 아이','list'],me:['나','list'],notice:['공지','notice'],inbox:['문의','chat'],ask:['문의','chat'],more:['더보기','house']};
/* 진입 뷰 제목 [제목, 오른쪽] — 탭 뷰는 로고를 보인다 */
var TITLE={
  'd-roster':['명부','반별'],'d-noti':['알림',''],'d-academy':['우리 학원',''],'d-notice-new':['공지 쓰기',''],
  'd-answer':['문의','정하윤 어머님'],'d-faq':['자주 묻는 질문','관리'],
  'p-noti':['알림',''],'p-notice-view':['공지',''],'p-ask-new':['직접 문의하기',''],'p-ask-mine':['내 문의',''],
  's-noti':['알림',''],'s-notice-view':['공지','']
};
var ROLE=null, cur='g-phone', hist=[], phoneVal='';

function isTab(id){ return ROLE && TABS[ROLE].indexOf(id.slice(2))>=0; }
function render(){
  var vs=document.querySelectorAll('.view');
  for(var i=0;i<vs.length;i++) vs[i].classList.remove('on');
  document.getElementById(cur).classList.add('on');
  var gate=cur.charAt(0)==='g';
  var sub=!gate && !isTab(cur);
  var bar=document.getElementById('appbar');
  bar.classList.toggle('gatebar',gate);
  bar.style.display=gate?'none':'flex';
  document.getElementById('bk').style.display=sub?'grid':'none';
  document.getElementById('logo').style.display=sub?'none':'block';
  var an=document.getElementById('an');
  an.style.display=sub?'block':'none';
  an.textContent=sub&&TITLE[cur]?TITLE[cur][0]:'';
  document.getElementById('ad').textContent=sub?(TITLE[cur]?TITLE[cur][1]:''):'6월 17일 화';
  document.getElementById('badge').textContent=ROLE?String(NOTI[ROLE]):'';
  document.getElementById('bell').style.display=(ROLE&&cur.slice(2)!=='noti')?'grid':'none';
  var tb=document.getElementById('tabbar');
  if(gate){ tb.hidden=true; }
  else{
    tb.hidden=false;
    var base=(hist.length?hist[0]:cur).slice(2), html='';
    for(var j=0;j<TABS[ROLE].length;j++){
      var t=TABS[ROLE][j], m=TABMETA[t];
      html+='<a href="#" data-t="'+t+'" class="'+(t===base?'on':'')+'" onclick="tab(\''+t+'\');return false">'+ICON[m[1]]+m[0]+'</a>';
    }
    tb.innerHTML=html;
  }
  document.getElementById(cur).scrollTop=0;
}
function enter(role){ ROLE=role; hist=[]; cur=role+'-'+TABS[role][0]; render(); }
function tab(t){ hist=[]; cur=ROLE+'-'+t; render(); }
function push(v){ hist.push(cur); cur=(v.charAt(0)==='g'?v:ROLE+'-'+v); render(); }
function back(){ cur=hist.pop()||(ROLE?ROLE+'-'+TABS[ROLE][0]:'g-phone'); render(); }
function logout(){ ROLE=null; hist=[]; cur='g-phone'; phoneVal=''; document.getElementById('phone').value=''; render(); }

/* ── 게이트 ── */
function gatePhone(v){ phoneVal=v; document.getElementById('phone').value=v; }
function gateGo(){
  if(PHONES[phoneVal]){ document.getElementById('code-to').textContent=phoneVal+' 으로 6자리를 보냈습니다.'; hist.push('g-phone'); cur='g-code'; }
  else { hist.push('g-phone'); cur='g-deny'; }
  render();
}
function gateCode(){ enter(PHONES[phoneVal]); }

/* ── 조각 ── */
var toastT;
function toast(msg){ var t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(function(){t.classList.remove('show')},2600); }
function att(el,kind){ var row=el.parentNode.querySelectorAll('button'); for(var i=0;i<row.length;i++) row[i].className=''; el.className='on '+kind; }
function hex(c){c=c.replace('#','');return [parseInt(c.substr(0,2),16),parseInt(c.substr(2,2),16),parseInt(c.substr(4,2),16)];}
function tint(c,p){var a=hex(c);return '#'+a.map(function(v){return Math.round(v+(255-v)*p).toString(16).padStart(2,'0')}).join('');}
function setBrand(color,el){
  var r=document.documentElement.style; r.setProperty('--brand',color); r.setProperty('--brand-soft',tint(color,.9));
  var cs=el.parentNode.querySelectorAll('.chip'); for(var i=0;i<cs.length;i++) cs[i].classList.remove('on'); el.classList.add('on');
  toast('강조색이 바뀌었어요. 원장님이 고르면 앱 전체에 적용됩니다.');
}

/* 해시 딥링크: #d-today 처럼 역할-뷰 로 바로 연다 */
(function(){
  var h=location.hash.replace('#','');
  if(h && document.getElementById(h) && h.charAt(0)!=='g'){ ROLE=h.charAt(0); hist=isTab(h)?[]:[ROLE+'-'+TABS[ROLE][0]]; cur=h; }
  render();
})();
</script>
</body>
</html>
```

- [ ] **Step 4: 테스트 통과 확인**

Run:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-mobile-nav-test.ps1
```
Expected: `PASS: gate + 3 roles + router + overflow`

- [ ] **Step 5: 눈으로 확인 — 게이트 3장**

Run (Git Bash):
```bash
SP="$TMP/yj"; mkdir -p "$SP"
cat > _s.html <<'EOF'
<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#fff}.w{display:flex;gap:16px;padding:14px}iframe{width:390px;height:812px;border:1px solid #ddd;border-radius:8px}</style>
<div class="w"><iframe src="index.html"></iframe><iframe src="index.html#d-today"></iframe><iframe src="index.html#p-child"></iframe><iframe src="index.html#s-me"></iframe></div>
EOF
"C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu --hide-scrollbars --no-first-run --user-data-dir="$SP/p" --virtual-time-budget=8000 --window-size=1680,900 --screenshot="$SP/t2.png" "file:///E:/KID/Study/bright-demo/_s.html"
rm _s.html
```
Read `$SP/t2.png`. 확인: 게이트에 로고 200px, 입력창 윤곽선, 데모 번호 3줄. 역할 3개는 앱바에 로고 + 종, 탭 4/4/3개.

- [ ] **Step 6: 커밋**

```bash
git add index.html tests/mobile-nav-test.html
git commit -m "feat: 영어의 집 셸 — 입장 게이트, 역할 라우터, 로고 기준 토큰

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 원장 — 오늘(출결) · 더보기 · 명부 · 우리 학원 · 알림

**Files:**
- Modify: `index.html` — `#d-today`, `#d-more`, `#d-roster`, `#d-noti` 껍데기를 교체, `#d-academy` 추가
- Modify: `tests/mobile-nav-test.html` — 원장 셸 블록 뒤에 검사 추가

**Interfaces:**
- Consumes: `push('roster')`, `push('academy')`, `push('noti')`, `att`, `setBrand`, `toast`, `logout`.
- Produces: 뷰 `d-academy`. 더보기의 "준비 중" 행 4개(`.rw.soon`).

- [ ] **Step 1: 실패하는 검사 추가**

`tests/mobile-nav-test.html`의 `// ── 라우터 ──` 바로 앞에 삽입:
```javascript
      // ── 원장: 오늘 / 더보기 ──
      if (d.querySelectorAll('#d-today .marks').length !== 3) fails.push('today ledger rows != 3 (고2 B)');
      if (d.querySelectorAll('#d-today .marks button.on.l').length !== 1) fails.push('김민수 지각 not marked');
      if (d.querySelectorAll('#d-today .marks button.on.a').length !== 1) fails.push('한지우 결석 not marked');
      if (d.querySelectorAll('#d-more .rw.soon').length !== 4) fails.push('준비 중 modules != 4');
      if (!d.querySelector('#d-roster') || d.querySelectorAll('#d-roster .rw').length !== 6) fails.push('roster rows != 6');
      if (!d.querySelector('#d-academy .appicon img')) fails.push('academy app icon missing');
```

- [ ] **Step 2: 실패 확인**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-mobile-nav-test.ps1`
Expected: `FAIL: today ledger rows != 3 (고2 B) | ...`

- [ ] **Step 3: 원장 뷰 마크업**

`index.html`에서 `<!-- ════ 원장 (Task 3~5에서 채움) ════ -->` 아래의 `#d-today`, `#d-more`, `#d-roster`, `#d-noti` 네 줄을 지우고 아래로 바꾼다. `#d-notice`, `#d-inbox` 껍데기는 그대로 둔다.

```html
<section class="view" id="d-today">
  <div class="head">
    <h1 class="hello">오늘 · 고2 B</h1>
    <p class="lede">화목 8시 · 3명. 이름 옆을 누르면 바로 저장돼요.<br>결석·지각은 <b>학부모 알림까지 한 번에</b> 나갑니다.</p>
  </div>
  <div class="seg">
    <button onclick="toast('고1 A는 월수금 수업이에요. 오늘은 수업이 없습니다.')">고1 A</button>
    <button class="on">고2 B</button>
  </div>
  <div class="lab">출석부<span class="r">6월 17일 화</span></div>
  <div class="box">
    <div class="rw"><span class="nm">김</span><span class="bd"><span class="t">김민수</span></span>
      <span class="marks"><button onclick="att(this,'p')" aria-label="출석">○</button><button class="on l" onclick="att(this,'l')" aria-label="지각">△</button><button onclick="att(this,'a')" aria-label="결석">✕</button></span></div>
    <div class="rw"><span class="nm">정</span><span class="bd"><span class="t">정하윤</span></span>
      <span class="marks"><button class="on p" onclick="att(this,'p')" aria-label="출석">○</button><button onclick="att(this,'l')" aria-label="지각">△</button><button onclick="att(this,'a')" aria-label="결석">✕</button></span></div>
    <div class="rw"><span class="nm">한</span><span class="bd"><span class="t">한지우</span></span>
      <span class="marks"><button onclick="att(this,'p')" aria-label="출석">○</button><button onclick="att(this,'l')" aria-label="지각">△</button><button class="on a" onclick="att(this,'a')" aria-label="결석">✕</button></span></div>
  </div>
  <div class="legend"><span><b>○</b>출석</span><span><b>△</b>지각</span><span><b>✕</b>결석</span></div>
  <div class="btnrow"><button class="btn" onclick="toast('출결을 저장하고, 김민수·한지우 학부모에게 알림을 보냈어요')">저장하고 알리기</button></div>

  <div class="lab">이번 주</div>
  <div class="box soft">
    <div class="rw" style="cursor:default"><span class="bd"><span class="t">고2 B 출석률</span><span class="s">화·목 2회 기준</span></span><b class="num" style="font-size:20px;font-weight:600">83%</b></div>
    <div class="rw" style="cursor:default"><span class="bd"><span class="t">고1 A 출석률</span><span class="s">월·수·금 3회 기준</span></span><b class="num" style="font-size:20px;font-weight:600">100%</b></div>
  </div>
</section>

<section class="view" id="d-more">
  <div class="head"><h1 class="hello">더보기</h1></div>
  <div class="lab first" style="margin-top:0">운영</div>
  <div class="box">
    <button class="rw" onclick="push('roster')"><span class="bd"><span class="t">학생·학부모 명부</span><span class="s">여기 있는 번호만 앱에 들어올 수 있어요</span></span><span class="go">›</span></button>
    <button class="rw" onclick="push('academy')"><span class="bd"><span class="t">우리 학원</span><span class="s">로고 · 이름 · 강조색 · 앱 아이콘</span></span><span class="go">›</span></button>
    <button class="rw" onclick="push('faq')"><span class="bd"><span class="t">자주 묻는 질문 관리</span><span class="s">학부모 문의 화면 맨 위에 보여요</span></span><span class="go">›</span></button>
  </div>

  <div class="lab">준비 중<span class="r">필요할 때 켭니다</span></div>
  <div class="box soft">
    <button class="rw soon" onclick="toast('준비 중인 기능이에요')"><span class="bd"><span class="t">수강료</span><span class="s">미납 안내를 원장님 톤으로</span></span><span class="tag muted">준비 중</span></button>
    <button class="rw soon" onclick="toast('준비 중인 기능이에요')"><span class="bd"><span class="t">첨삭</span><span class="s">AI가 짚고 원장님이 확정</span></span><span class="tag muted">준비 중</span></button>
    <button class="rw soon" onclick="toast('준비 중인 기능이에요')"><span class="bd"><span class="t">편지</span><span class="s">채점 결과를 원장님 말투로</span></span><span class="tag muted">준비 중</span></button>
    <button class="rw soon" onclick="toast('준비 중인 기능이에요')"><span class="bd"><span class="t">성장 기록</span><span class="s">틀리던 것이 줄어드는 추이</span></span><span class="tag muted">준비 중</span></button>
  </div>

  <div class="btnrow"><button class="btn line" onclick="logout()">로그아웃</button></div>
  <div class="madeby">영어의 집 앱 · BRIGHT로 만들어졌습니다 · 데모</div>
</section>

<section class="view" id="d-roster">
  <div class="head"><p class="lede">명부에 있는 전화번호로만 앱에 들어올 수 있어요.<br>학생과 학부모는 <b>각자 번호로</b> 들어옵니다.</p></div>
  <div class="lab first">고1 A<span class="r">월수금 7시 · 3명</span></div>
  <div class="box">
    <div class="rw"><span class="nm">박</span><span class="bd"><span class="t">박지훈</span><span class="s">학생 010-1234-0101 · 어머님 010-1234-0001</span></span></div>
    <div class="rw"><span class="nm">최</span><span class="bd"><span class="t">최유나</span><span class="s">학생 010-1234-0102 · 어머님 010-1234-0002</span></span></div>
    <div class="rw"><span class="nm">이</span><span class="bd"><span class="t">이서연</span><span class="s">학생 010-1234-0103 · 어머님 010-1234-0003</span></span></div>
  </div>
  <div class="lab">고2 B<span class="r">화목 8시 · 3명</span></div>
  <div class="box">
    <div class="rw"><span class="nm">김</span><span class="bd"><span class="t">김민수</span><span class="s">학생 010-1234-0104 · 어머님 010-1234-0004</span></span></div>
    <div class="rw"><span class="nm">정</span><span class="bd"><span class="t">정하윤</span><span class="s">학생 010-1234-0105 · 어머님 010-1234-0005</span></span></div>
    <div class="rw"><span class="nm">한</span><span class="bd"><span class="t">한지우</span><span class="s">학생 010-1234-0106 · 어머님 010-1234-0006</span></span></div>
  </div>
  <div class="btnrow"><button class="btn line" onclick="toast('학생 추가는 실제 버전에서 열려요')">학생 추가</button></div>
</section>

<section class="view" id="d-academy">
  <div class="homescr">
    <div class="appicon"><img src="assets/logo/yeongeo-jip.png" alt=""></div>
    <div class="hl">영어의 집</div>
    <p class="hc">원장님과 학부모, 학생 폰 홈 화면에<br>이렇게 놓입니다.</p>
  </div>
  <div class="lab">앱에 보이는 것</div>
  <div class="box">
    <div class="rw" style="cursor:default"><span class="bd"><span class="t">학원 이름</span><span class="s">영어의 집</span></span></div>
    <div class="rw" style="cursor:default"><span class="bd"><span class="t">강조색</span><span class="s">아직 정하지 않았어요 — 로고 컬러웨이 중 고르세요</span></span>
      <span class="chips">
        <button class="chip on" style="background:#1C1C1C" onclick="setBrand('#1C1C1C',this)" aria-label="먹"></button>
        <button class="chip" style="background:#2A5BD7" onclick="setBrand('#2A5BD7',this)" aria-label="파랑"></button>
        <button class="chip" style="background:#E8912D" onclick="setBrand('#E8912D',this)" aria-label="주황"></button>
        <button class="chip" style="background:#5B7A5B" onclick="setBrand('#5B7A5B',this)" aria-label="초록"></button>
        <button class="chip" style="background:#9C8B74" onclick="setBrand('#9C8B74',this)" aria-label="황갈"></button>
      </span></div>
  </div>
  <p class="muted" style="padding:16px 20px 0;text-align:center">로고는 단색으로 두고, 강조색은 버튼과 표시에만 씁니다.</p>
</section>

<section class="view" id="d-noti">
  <div class="lab first" style="margin-top:20px">오늘</div>
  <div class="box">
    <div class="post new"><div class="pt">정하윤 어머님이 문의를 보냈어요</div><div class="pm"><b>문의</b><span>숙제 범위 확인 · 오후 1:20</span></div></div>
  </div>
  <div class="lab">어제</div>
  <div class="box soft">
    <div class="post"><div class="pt">박지훈 어머님 문의에 답했어요</div><div class="pm"><b>문의</b><span>다음 주 화요일 결석 예정 · 어제 오후 6:02</span></div></div>
    <div class="post"><div class="pt">공지 「6월 휴원일」을 올렸어요</div><div class="pm"><b>공지</b><span>전체 · 학부모 6명 중 5명 읽음</span></div></div>
  </div>
</section>
```

- [ ] **Step 4: 통과 확인**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-mobile-nav-test.ps1`
Expected: `PASS: gate + 3 roles + router + overflow`

- [ ] **Step 5: 눈으로 확인**

Task 2 Step 5의 스크린샷 명령을 iframe만 바꿔 실행: `index.html#d-today`, `#d-more`, `#d-roster`, `#d-academy`, `#d-noti`. 확인: 출석부 ○△✕에서 김민수 △가 황갈색 채움, 한지우 ✕가 빨강 채움. 더보기에 "준비 중" 4줄. 우리 학원에 앱 아이콘 안 로고.

- [ ] **Step 6: 커밋**

```bash
git add index.html tests/mobile-nav-test.html
git commit -m "feat: 원장 앱 — 오늘 출석부, 더보기(명부·우리 학원·준비 중), 알림

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: 원장 — 공지 목록 · 공지 쓰기

**Files:**
- Modify: `index.html` — `#d-notice` 교체, `#d-notice-new` 추가
- Modify: `tests/mobile-nav-test.html`

**Interfaces:**
- Consumes: `push('notice-new')`, `toast`, `back`.
- Produces: 공지 4건의 `.post` (id 없음, 순서 고정: 여름 특강 · 6월 휴원일 · 고2 B 단어시험 · 고1 A 견학).

- [ ] **Step 1: 실패하는 검사 추가**

`// ── 라우터 ──` 앞에 삽입:
```javascript
      // ── 원장: 공지 ──
      if (d.querySelectorAll('#d-notice .post').length !== 4) fails.push('director notices != 4');
      if (!d.querySelector('#d-notice-new textarea')) fails.push('notice-new textarea missing');
      if (d.querySelectorAll('#d-notice-new .seg button').length !== 3) fails.push('notice target seg != 3 (전체/고1 A/고2 B)');
```

- [ ] **Step 2: 실패 확인**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-mobile-nav-test.ps1`
Expected: `FAIL: director notices != 4 | ...`

- [ ] **Step 3: 마크업**

`#d-notice` 껍데기 한 줄을 아래 두 섹션으로 바꾼다.

```html
<section class="view" id="d-notice">
  <div class="head"><h1 class="hello">공지</h1><p class="lede">올리면 대상 반의 학부모와 학생에게 <b>알림이 갑니다.</b></p></div>
  <div class="btnrow" style="padding-top:0"><button class="btn" onclick="push('notice-new')">공지 쓰기</button></div>
  <div class="lab">올린 공지<span class="r">읽은 사람 수</span></div>
  <div class="box">
    <div class="post"><div class="pt">여름 특강 안내 — 7월 21일부터 2주</div><div class="pm"><b>전체</b><span>6월 16일</span><span>· 학부모 6명 중 4명 읽음</span></div></div>
    <div class="post"><div class="pt">6월 휴원일 — 6월 24일(화) 휴원합니다</div><div class="pm"><b>전체</b><span>6월 16일</span><span>· 학부모 6명 중 5명 읽음</span></div></div>
    <div class="post"><div class="pt">고2 B 단어시험 — 6월 19일(목) 51~75</div><div class="pm"><b>고2 B</b><span>6월 15일</span><span>· 3명 중 3명 읽음</span></div></div>
    <div class="post"><div class="pt">고1 A 모의고사 대비 — 6월 27일(금) 특강</div><div class="pm"><b>고1 A</b><span>6월 12일</span><span>· 3명 중 3명 읽음</span></div></div>
  </div>
</section>

<section class="view" id="d-notice-new">
  <div class="head"><p class="lede">대상을 고르고 올리면 그 반의 학부모와 학생에게 <b>알림이 갑니다.</b></p></div>
  <div class="lab first">대상</div>
  <div class="seg">
    <button class="on" onclick="var b=this.parentNode.querySelectorAll('button');for(var i=0;i<b.length;i++)b[i].className='';this.className='on'">전체</button>
    <button onclick="var b=this.parentNode.querySelectorAll('button');for(var i=0;i<b.length;i++)b[i].className='';this.className='on'">고1 A</button>
    <button onclick="var b=this.parentNode.querySelectorAll('button');for(var i=0;i<b.length;i++)b[i].className='';this.className='on'">고2 B</button>
  </div>
  <div class="lab">제목</div>
  <div style="padding:0 20px"><input class="input" value="7월 수업 시간 변경 안내"></div>
  <div class="lab">내용</div>
  <div style="padding:0 20px"><textarea class="input">7월부터 고2 B 수업이 화·목 8시 30분으로 30분 늦춰집니다. 여름 특강과 겹치지 않게 조정했어요. 불편한 점 있으시면 문의 주세요.</textarea></div>
  <div class="btnrow"><button class="btn line" onclick="back()">취소</button><button class="btn" onclick="toast('공지를 올리고 학부모 6명, 학생 6명에게 알렸어요');back()">올리고 알리기</button></div>
</section>
```

- [ ] **Step 4: 통과 확인**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-mobile-nav-test.ps1`
Expected: `PASS: ...`

- [ ] **Step 5: 커밋**

```bash
git add index.html tests/mobile-nav-test.html
git commit -m "feat: 원장 앱 — 공지 목록과 공지 쓰기(대상 반 선택)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: 원장 — 문의함 · 답변 · 자주 묻는 질문 관리

**Files:**
- Modify: `index.html` — `#d-inbox` 교체, `#d-answer`, `#d-faq` 추가
- Modify: `tests/mobile-nav-test.html`

**Interfaces:**
- Consumes: `push('answer')`, `push('faq')`, `toast`, `back`.
- Produces: 문의함의 미답변 행에 `.tag.danger`(텍스트 `답변 대기`) — 정합 검사가 이 수를 앱바 배지와 대조한다. `d-faq`의 `.faq` 5개.

- [ ] **Step 1: 실패하는 검사 추가**

`// ── 라우터 ──` 앞에 삽입:
```javascript
      // ── 원장: 문의 정합 ──
      const open = d.querySelectorAll('#d-inbox .tag.danger').length;
      if (open !== 1) fails.push('unanswered inquiries=' + open);
      if (String(open) !== text('.appbar .badge')) fails.push('inbox badge != unanswered');
      if (d.querySelectorAll('#d-inbox .rw').length !== 3) fails.push('inquiries != 3');
      if (d.querySelectorAll('#d-faq .faq').length !== 5) fails.push('faq items != 5');
      if (!d.querySelector('#d-answer textarea')) fails.push('answer textarea missing');
```

- [ ] **Step 2: 실패 확인**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-mobile-nav-test.ps1`
Expected: `FAIL: unanswered inquiries=0 | ...`

- [ ] **Step 3: 마크업**

`#d-inbox` 껍데기를 아래 세 섹션으로 바꾼다.

```html
<section class="view" id="d-inbox">
  <div class="head"><h1 class="hello">문의</h1><p class="lede">학부모가 보낸 1:1 문의예요. 답하면 <b>그 학부모에게만</b> 알림이 갑니다.</p></div>
  <div class="lab first">답변 대기<span class="r">1</span></div>
  <div class="box">
    <button class="rw" onclick="push('answer')"><span class="nm">정</span><span class="bd"><span class="t">정하윤 어머님</span><span class="s">숙제 범위 확인 · 오늘 오후 1:20</span></span><span class="tag danger">답변 대기</span></button>
  </div>
  <div class="lab">답변 완료</div>
  <div class="box soft">
    <button class="rw" onclick="toast('데모에서는 정하윤 어머님 문의만 열립니다')"><span class="nm">박</span><span class="bd"><span class="t">박지훈 어머님</span><span class="s">다음 주 화요일 결석 예정 · 어제</span></span><span class="tag muted">답변 완료</span></button>
    <button class="rw" onclick="toast('데모에서는 정하윤 어머님 문의만 열립니다')"><span class="nm">최</span><span class="bd"><span class="t">최유나 어머님</span><span class="s">레벨 테스트 언제 · 6월 14일</span></span><span class="tag muted">답변 완료</span></button>
  </div>
  <div class="btnrow"><button class="btn line" onclick="push('faq')">자주 묻는 질문 관리</button></div>
</section>

<section class="view" id="d-answer">
  <div class="head"><p class="lede">고2 B · 정하윤 어머님 · 오늘 오후 1:20</p></div>
  <div class="bubble"><div class="who">정하윤 어머님</div>안녕하세요 원장님. 하윤이가 목요일 단어시험 범위를 51~75라고 하는데 맞나요? 지난주 공지에는 41~75로 본 것 같아서 확인차 여쭤봅니다.</div>
  <div class="lab">답변</div>
  <div style="padding:0 20px"><textarea class="input">어머님 안녕하세요 :) 51~75가 맞아요. 지난주 공지는 41~75였는데 진도가 빨라서 범위를 줄였습니다. 하윤이가 정확히 알고 있네요. 목요일에 뵐게요!</textarea></div>
  <div class="btnrow"><button class="btn line" onclick="back()">나중에</button><button class="btn" onclick="toast('정하윤 어머님께 답변을 보냈어요');back()">답하고 알리기</button></div>
</section>

<section class="view" id="d-faq">
  <div class="head"><p class="lede">학부모 문의 화면 맨 위에 이 목록이 보여요.<br>자주 오는 질문을 미리 답해두면 <b>문의가 줄어듭니다.</b></p></div>
  <div class="box">
    <details class="faq"><summary>결석하면 보강이 되나요?</summary><div class="a">사전에 알려주신 결석은 같은 주 다른 요일에 보강해 드려요. 당일 결석은 자료로 대체합니다.</div></details>
    <details class="faq"><summary>수강료 납부일은 언제인가요?</summary><div class="a">매월 1일이에요. 5일까지는 괜찮습니다. 계좌이체 또는 카드 결제 모두 가능해요.</div></details>
    <details class="faq"><summary>교재는 어디서 사나요?</summary><div class="a">학원에서 일괄 구매해 드려요. 교재비는 학기 시작 때 한 번 안내드립니다.</div></details>
    <details class="faq"><summary>상담은 어떻게 신청하나요?</summary><div class="a">이 앱의 문의로 "상담 신청"이라고 보내주시면 원장님이 시간을 잡아 답해드려요.</div></details>
    <details class="faq"><summary>등하원 시간은요?</summary><div class="a">고1 A는 월수금 7시~9시, 고2 B는 화목 8시~10시이에요. 10분 전 도착을 권해요.</div></details>
  </div>
  <div class="btnrow"><button class="btn line" onclick="toast('질문 추가는 실제 버전에서 열려요')">질문 추가</button></div>
</section>
```

- [ ] **Step 4: 통과 확인**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-mobile-nav-test.ps1`
Expected: `PASS: ...`

- [ ] **Step 5: 커밋**

```bash
git add index.html tests/mobile-nav-test.html
git commit -m "feat: 원장 앱 — 문의함(미답변 배지 정합), 답변, 자주 묻는 질문 관리

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: 학부모 앱 — 우리 아이 · 공지 · 문의 · 더보기 · 알림

**Files:**
- Modify: `index.html` — `#p-child`, `#p-notice`, `#p-ask`, `#p-more`, `#p-noti` 교체, `#p-notice-view`, `#p-ask-new`, `#p-ask-mine` 추가
- Modify: `tests/mobile-nav-test.html`

**Interfaces:**
- Consumes: `push('notice-view')`, `push('ask-new')`, `push('ask-mine')`, `toast`, `logout`, `back`.
- Produces: `p-ask`의 `.faq` 5개(원장 `d-faq`와 **같은 문항**), `p-ask-mine`의 `.tag.danger` 0개(박지훈 어머님 문의는 답변됨).

- [ ] **Step 1: 실패하는 검사 추가**

`// ── 학부모 / 학생 진입 ──` 블록 안, `if (d.querySelectorAll('.tabbar a').length !== 4) fails.push('parent tabs');` 다음 줄에 삽입:
```javascript
      if (text('.appbar .badge') !== '2') fails.push('parent badge=' + text('.appbar .badge'));
      if (d.querySelectorAll('#p-child .week i').length !== 7) fails.push('child week != 7');
      if (d.querySelectorAll('#p-notice .post').length !== 3) fails.push('parent sees 3 notices (전체 2 + 고1 A 1), got ' + d.querySelectorAll('#p-notice .post').length);
      if (d.querySelectorAll('#p-ask .faq').length !== 5) fails.push('parent faq != 5');
      const dq = [...d.querySelectorAll('#d-faq .faq summary')].map(e => e.textContent.trim());
      const pq = [...d.querySelectorAll('#p-ask .faq summary')].map(e => e.textContent.trim());
      if (dq.join('|') !== pq.join('|')) fails.push('faq mismatch between director and parent');
      if (!d.querySelector('#p-ask-new textarea')) fails.push('ask-new textarea missing');
```

- [ ] **Step 2: 실패 확인**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-mobile-nav-test.ps1`
Expected: `FAIL: child week != 7 | ...`

- [ ] **Step 3: 마크업**

`<!-- ════ 학부모 (Task 6) ════ -->` 아래 다섯 줄을 아래로 바꾼다.

```html
<section class="view" id="p-child">
  <div class="head"><h1 class="hello">지훈이</h1><p class="lede">고1 A · 월수금 7시 · 오늘은 수업이 없는 날이에요.</p></div>
  <div class="lab first">이번 주<span class="r">6/16 – 6/22</span></div>
  <div class="box">
    <div class="week"><i class="p">월</i><i>화</i><i class="p">수</i><i>목</i><i>금</i><i>토</i><i>일</i></div>
    <div class="rw" style="cursor:default;border-top:1px solid var(--rule)"><span class="bd"><span class="t">6월 출석</span><span class="s">7회 중 7회 · 지각 0 · 결석 0</span></span><span class="tag ok">개근</span></div>
  </div>
  <div class="lab">다음 수업</div>
  <div class="box soft">
    <div class="rw" style="cursor:default"><span class="bd"><span class="t">6월 18일 수 · 4시</span><span class="s">고1 A · 모의고사 대비 특강 공지를 확인해 주세요</span></span></div>
  </div>
  <p class="muted" style="padding:18px 20px 0;text-align:center">결석·지각이 있으면 그날 바로 알림이 와요.</p>
</section>

<section class="view" id="p-notice">
  <div class="head"><h1 class="hello">공지</h1><p class="lede">전체 공지와 <b>고1 A</b> 공지만 보여요.</p></div>
  <div class="box">
    <button class="post new" style="width:100%;text-align:left" onclick="push('notice-view')"><div class="pt">여름 특강 안내 — 7월 21일부터 2주</div><div class="pm"><b>전체</b><span>6월 16일</span></div></button>
    <button class="post" style="width:100%;text-align:left" onclick="toast('데모에서는 첫 공지만 열립니다')"><div class="pt">6월 휴원일 — 6월 24일(화) 휴원합니다</div><div class="pm"><b>전체</b><span>6월 16일</span><span>· 읽음</span></div></button>
    <button class="post" style="width:100%;text-align:left" onclick="toast('데모에서는 첫 공지만 열립니다')"><div class="pt">고1 A 모의고사 대비 — 6월 27일(금) 특강</div><div class="pm"><b>고1 A</b><span>6월 12일</span><span>· 읽음</span></div></button>
  </div>
</section>

<section class="view" id="p-notice-view">
  <div class="head"><h1 class="hello">여름 특강 안내</h1><p class="lede">전체 · 6월 16일 · 김지영 원장</p></div>
  <p class="para">7월 21일(월)부터 2주 동안 여름 특강을 엽니다. 고1 A는 오전 10시, 고2 B는 오후 2시예요.</p>
  <p class="para">특강 기간에는 정규 수업이 쉬고, 특강 신청은 이 앱의 문의로 "특강 신청"이라고 보내주시면 됩니다. 7월 4일까지 알려주세요.</p>
  <p class="muted" style="padding:20px 20px 0">이 공지를 읽은 것으로 표시됐어요.</p>
</section>

<section class="view" id="p-ask">
  <div class="head"><h1 class="hello">문의</h1><p class="lede">자주 묻는 질문을 먼저 보시고, 없으면 <b>직접 문의</b>해 주세요. 원장님만 봅니다.</p></div>
  <div class="lab first">자주 묻는 질문</div>
  <div class="box">
    <details class="faq"><summary>결석하면 보강이 되나요?</summary><div class="a">사전에 알려주신 결석은 같은 주 다른 요일에 보강해 드려요. 당일 결석은 자료로 대체합니다.</div></details>
    <details class="faq"><summary>수강료 납부일은 언제인가요?</summary><div class="a">매월 1일이에요. 5일까지는 괜찮습니다. 계좌이체 또는 카드 결제 모두 가능해요.</div></details>
    <details class="faq"><summary>교재는 어디서 사나요?</summary><div class="a">학원에서 일괄 구매해 드려요. 교재비는 학기 시작 때 한 번 안내드립니다.</div></details>
    <details class="faq"><summary>상담은 어떻게 신청하나요?</summary><div class="a">이 앱의 문의로 "상담 신청"이라고 보내주시면 원장님이 시간을 잡아 답해드려요.</div></details>
    <details class="faq"><summary>등하원 시간은요?</summary><div class="a">고1 A는 월수금 7시~9시, 고2 B는 화목 8시~10시이에요. 10분 전 도착을 권해요.</div></details>
  </div>
  <div class="btnrow"><button class="btn line" onclick="push('ask-mine')">내 문의</button><button class="btn" onclick="push('ask-new')">직접 문의하기</button></div>
</section>

<section class="view" id="p-ask-new">
  <div class="head"><p class="lede">원장님만 봅니다. 답이 오면 <b>알림</b>으로 알려드려요.</p></div>
  <div class="lab first">문의 내용</div>
  <div style="padding:0 20px"><textarea class="input" placeholder="예) 다음 주 수요일 결석 예정입니다."></textarea></div>
  <div class="btnrow"><button class="btn line" onclick="back()">취소</button><button class="btn" onclick="toast('원장님께 문의를 보냈어요');back()">보내기</button></div>
</section>

<section class="view" id="p-ask-mine">
  <div class="head"><p class="lede">보낸 문의와 원장님 답변이에요.</p></div>
  <div class="lab first">어제</div>
  <div class="bubble me"><div class="who">나</div>다음 주 화요일(6월 24일) 지훈이 가족 행사로 결석 예정입니다. 보강 가능할까요?</div>
  <div class="bubble"><div class="who">김지영 원장 · 어제 오후 6:02</div>어머님 안녕하세요 :) 24일은 휴원일이라 원래 수업이 없어요. 걱정 안 하셔도 됩니다. 즐거운 행사 되세요!</div>
</section>

<section class="view" id="p-more">
  <div class="head"><h1 class="hello">더보기</h1></div>
  <div class="box">
    <div class="rw" style="cursor:default"><span class="nm">박</span><span class="bd"><span class="t">박지훈 어머님</span><span class="s">010-1234-0001 · 고1 A</span></span></div>
    <button class="rw" onclick="toast('알림 설정은 실제 버전에서 열려요')"><span class="bd"><span class="t">알림 설정</span><span class="s">공지 · 답변 · 출결</span></span><span class="go">›</span></button>
  </div>
  <div class="btnrow"><button class="btn line" onclick="logout()">로그아웃</button></div>
  <div class="madeby">영어의 집 앱 · BRIGHT로 만들어졌습니다 · 데모</div>
</section>

<section class="view" id="p-noti">
  <div class="lab first" style="margin-top:20px">오늘</div>
  <div class="box">
    <div class="post new"><div class="pt">새 공지 「여름 특강 안내」</div><div class="pm"><b>공지</b><span>전체 · 오전 9:10</span></div></div>
  </div>
  <div class="lab">어제</div>
  <div class="box">
    <div class="post new"><div class="pt">원장님이 문의에 답했어요</div><div class="pm"><b>문의</b><span>다음 주 화요일 결석 예정 · 오후 6:02</span></div></div>
  </div>
</section>
```

- [ ] **Step 4: 통과 확인**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-mobile-nav-test.ps1`
Expected: `PASS: ...`

- [ ] **Step 5: 눈으로 확인**

스크린샷 iframe: `#p-child`, `#p-notice`, `#p-ask`, `#p-ask-mine`, `#p-noti`. 확인: 문의 화면에 FAQ 5개 접힘 + 아래 버튼 둘. 종 배지 2.

- [ ] **Step 6: 커밋**

```bash
git add index.html tests/mobile-nav-test.html
git commit -m "feat: 학부모 앱 — 우리 아이 출결, 공지, 자주 묻는 질문 + 1:1 문의, 알림

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: 학생 앱 — 나 · 공지 · 더보기 · 알림

**Files:**
- Modify: `index.html` — `#s-me`, `#s-notice`, `#s-more`, `#s-noti` 교체, `#s-notice-view` 추가
- Modify: `tests/mobile-nav-test.html`

**Interfaces:**
- Consumes: `push('notice-view')`, `toast`, `logout`.
- Produces: 학생(김민수, 고2 B)은 공지 **3건**(전체 2 + 고2 B 1).

- [ ] **Step 1: 실패하는 검사 추가**

`if (d.querySelectorAll('.tabbar a').length !== 3) fails.push('student tabs');` 다음 줄에 삽입:
```javascript
      if (text('.appbar .badge') !== '1') fails.push('student badge=' + text('.appbar .badge'));
      if (d.querySelectorAll('#s-notice .post').length !== 3) fails.push('student notices != 3');
      if (!d.querySelector('#s-me .week i.l')) fails.push('김민수 오늘 지각 not shown');
```

- [ ] **Step 2: 실패 확인**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-mobile-nav-test.ps1`
Expected: `FAIL: student notices != 3 | ...`

- [ ] **Step 3: 마크업**

`<!-- ════ 학생 (Task 7) ════ -->` 아래 네 줄을 아래로 바꾼다.

```html
<section class="view" id="s-me">
  <div class="head"><h1 class="hello">민수</h1><p class="lede">고2 B · 화목 8시 · 오늘 수업 있어요.</p></div>
  <div class="lab first">이번 주<span class="r">6/16 – 6/22</span></div>
  <div class="box">
    <div class="week"><i>월</i><i class="l">화</i><i>수</i><i>목</i><i>금</i><i>토</i><i>일</i></div>
    <div class="rw" style="cursor:default;border-top:1px solid var(--rule)"><span class="bd"><span class="t">오늘</span><span class="s">8시 10분 도착 · 지각</span></span><span class="tag warn">지각</span></div>
  </div>
  <div class="lab">다음 수업</div>
  <div class="box soft">
    <div class="rw" style="cursor:default"><span class="bd"><span class="t">6월 19일 목 · 7시</span><span class="s">단어시험 51~75 — 공지 확인</span></span></div>
  </div>
</section>

<section class="view" id="s-notice">
  <div class="head"><h1 class="hello">공지</h1><p class="lede">전체 공지와 <b>고2 B</b> 공지만 보여요.</p></div>
  <div class="box">
    <button class="post new" style="width:100%;text-align:left" onclick="push('notice-view')"><div class="pt">고2 B 단어시험 — 6월 19일(목) 51~75</div><div class="pm"><b>고2 B</b><span>6월 15일</span></div></button>
    <button class="post" style="width:100%;text-align:left" onclick="toast('데모에서는 첫 공지만 열립니다')"><div class="pt">여름 특강 안내 — 7월 21일부터 2주</div><div class="pm"><b>전체</b><span>6월 16일</span><span>· 읽음</span></div></button>
    <button class="post" style="width:100%;text-align:left" onclick="toast('데모에서는 첫 공지만 열립니다')"><div class="pt">6월 휴원일 — 6월 24일(화) 휴원합니다</div><div class="pm"><b>전체</b><span>6월 16일</span><span>· 읽음</span></div></button>
  </div>
</section>

<section class="view" id="s-notice-view">
  <div class="head"><h1 class="hello">고2 B 단어시험</h1><p class="lede">고2 B · 6월 15일 · 김지영 원장</p></div>
  <p class="para">6월 19일(목) 수업 시작하고 바로 단어시험 봅니다. 범위는 단어장 <b>51~75</b>예요.</p>
  <p class="para">지난주에 41~75라고 했는데 진도가 빨라서 줄였어요. 25개, 뜻 쓰기 15개 + 영작 10개.</p>
  <p class="muted" style="padding:20px 20px 0">이 공지를 읽은 것으로 표시됐어요.</p>
</section>

<section class="view" id="s-more">
  <div class="head"><h1 class="hello">더보기</h1></div>
  <div class="box">
    <div class="rw" style="cursor:default"><span class="nm">김</span><span class="bd"><span class="t">김민수</span><span class="s">010-1234-0104 · 고2 B</span></span></div>
  </div>
  <div class="btnrow"><button class="btn line" onclick="logout()">로그아웃</button></div>
  <div class="madeby">영어의 집 앱 · BRIGHT로 만들어졌습니다 · 데모</div>
</section>

<section class="view" id="s-noti">
  <div class="lab first" style="margin-top:20px">6월 15일</div>
  <div class="box">
    <div class="post new"><div class="pt">새 공지 「고2 B 단어시험」</div><div class="pm"><b>공지</b><span>고2 B · 오후 8:40</span></div></div>
  </div>
</section>
```

- [ ] **Step 4: 통과 확인**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-mobile-nav-test.ps1`
Expected: `PASS: gate + 3 roles + router + overflow`

- [ ] **Step 5: 커밋**

```bash
git add index.html tests/mobile-nav-test.html
git commit -m "feat: 학생 앱 — 나(오늘 출결), 공지, 더보기, 알림

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: og.png · 스크린샷 시트 · 최종 검증 · 배포

**Files:**
- Rewrite: `og.png`
- Rewrite: `tests/app-verify.png`
- Verify: `index.html` 전체

**Interfaces:**
- Consumes: `assets/logo/yeongeo-jip.png`.

- [ ] **Step 1: 미정의 클래스·잔존 문자열 검사**

Run:
```bash
python - <<'PY'
import io,re
s=io.open('index.html',encoding='utf-8').read()
head=s.split('</style>')[0]
defined=set(re.findall(r'\.([a-zA-Z][\w-]*)',head))
used=set(c for a in re.findall(r'class="([^"]+)"',s) for c in a.split())
print("UNDEFINED:", sorted(used-defined) or "none")
for bad in ['한빛','Gowun','--voice','BRIGHT 학원 관리']:
    print(bad, 'present' if bad in s else 'absent')
PY
```
Expected: `UNDEFINED: none` · 네 문자열 모두 `absent`.
`UNDEFINED`에 뭔가 나오면 그 클래스를 `<style>`에 추가하거나 마크업에서 제거한다 — 어느 쪽인지는 그 클래스가 스타일이 필요한지로 정한다.

- [ ] **Step 2: 390px 실측**

Run (Git Bash):
```bash
SP="$TMP/yj"; mkdir -p "$SP"
cat > tests/_probe.html <<'EOF'
<!doctype html><meta charset="utf-8"><style>iframe{width:390px;height:844px;border:0}</style>
<pre id="result">FAIL</pre><iframe id="app" src="../index.html"></iframe>
<script>
document.getElementById('app').addEventListener('load',function(){
  const w=this.contentWindow,d=w.document,ids=[...d.querySelectorAll('.view')].map(v=>v.id),bad=[];
  ids.forEach(id=>{ if(id[0]==='g'){w.logout(); if(id!=='g-phone'){w.hist=['g-phone'];w.cur=id;w.render();}} else {w.ROLE=id[0];w.hist=w.isTab(id)?[]:[id[0]+'-'+w.TABS[id[0]][0]];w.cur=id;w.render();}
    const de=d.documentElement; if(de.scrollWidth>de.clientWidth) bad.push(id+':'+de.scrollWidth);
    d.querySelectorAll('#'+id+' *').forEach(el=>{const r=el.getBoundingClientRect(); if(r.right>de.clientWidth+1) bad.push(id+'>'+el.tagName+'.'+el.className);});
  });
  document.getElementById('result').textContent=bad.length?'FAIL: '+[...new Set(bad)].slice(0,12).join(' | '):'PASS: no overflow in '+ids.length+' views';
});
</script>
EOF
"C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu --allow-file-access-from-files --no-first-run --user-data-dir="$SP/q" --virtual-time-budget=6000 --dump-dom "file:///E:/KID/Study/bright-demo/tests/_probe.html" 2>/dev/null | grep -o '<pre id="result">[^<]*'
rm tests/_probe.html
```
Expected: `PASS: no overflow in 25 views` (뷰 수는 게이트 3 + 원장 10 + 학부모 8 + 학생 5 = 26; `d-academy`를 세면 26, 결과 숫자가 25~26이면 된다 — 정확한 수는 출력으로 확인).
FAIL이면 나온 요소에 `min-width:0` 또는 `white-space:normal`을 준다.

- [ ] **Step 3: og.png**

Run (Git Bash):
```bash
SP="$TMP/yj"; mkdir -p "$SP"
cat > _og.html <<'EOF'
<!doctype html><html lang="ko"><meta charset="utf-8">
<link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" rel="stylesheet">
<style>*{margin:0}body{width:1200px;height:630px;background:#fff;font-family:"Pretendard Variable",Pretendard,sans-serif;color:#1C1C1C;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:36px}
img{width:520px;height:auto}.t{font-size:30px;font-weight:500;letter-spacing:-.02em;color:#5A5A57}.t b{color:#1C1C1C;font-weight:600}</style>
<img src="assets/logo/yeongeo-jip.png" alt=""><div class="t"><b>영어의 집</b> · 우리 학원 앱 — 출결 · 공지 · 문의</div>
</html>
EOF
"C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu --hide-scrollbars --no-first-run --user-data-dir="$SP/og" --virtual-time-budget=9000 --window-size=1200,630 --screenshot="$SP/og.png" "file:///E:/KID/Study/bright-demo/_og.html"
rm _og.html; cp "$SP/og.png" og.png
```
Read `og.png`. 확인: 흰 바탕, 로고 520px, 아래 한 줄.

- [ ] **Step 4: 3역할 스크린샷 시트**

Run (Git Bash):
```bash
SP="$TMP/yj"
cat > _s.html <<'EOF'
<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#fff;font-family:system-ui}.w{display:flex;gap:14px;padding:14px}.c{font:700 12px system-ui;padding-bottom:6px;color:#333}iframe{width:390px;height:812px;border:1px solid #ddd;border-radius:8px;display:block}</style>
<div class="w">
<div><div class="c">입장</div><iframe src="index.html"></iframe></div>
<div><div class="c">원장 · 오늘</div><iframe src="index.html#d-today"></iframe></div>
<div><div class="c">원장 · 문의</div><iframe src="index.html#d-inbox"></iframe></div>
<div><div class="c">학부모 · 문의</div><iframe src="index.html#p-ask"></iframe></div>
<div><div class="c">학생 · 공지</div><iframe src="index.html#s-notice"></iframe></div>
</div>
EOF
"C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu --hide-scrollbars --no-first-run --user-data-dir="$SP/s" --virtual-time-budget=9000 --window-size=2060,900 --screenshot="$SP/sheet.png" "file:///E:/KID/Study/bright-demo/_s.html"
rm _s.html; cp "$SP/sheet.png" tests/app-verify.png
```
Read `tests/app-verify.png`. 다섯 화면이 모두 로고 기준 디자인(흰 바탕·윤곽선·먹)인지, 잘린 글자가 없는지 본다.

- [ ] **Step 5: 전체 테스트 한 번 더**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-mobile-nav-test.ps1`
Expected: `PASS: gate + 3 roles + router + overflow`

- [ ] **Step 6: 커밋**

```bash
git add og.png tests/app-verify.png
git commit -m "chore: 영어의 집 og.png와 3역할 검증 스크린샷

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 7: 푸시 (사용자가 시켰을 때만)**

```bash
git fetch origin && git status -sb && git push origin main
```
그 뒤 `curl -s https://kiddongwook.github.io/bright-demo/ | grep -o '<title>[^<]*'` 이 `영어의 집 · 우리 학원 앱`을 돌려주면 배포 완료.

---

## Self-Review

**Spec coverage**
- §5.1 게이트 3뷰 + 데모 번호 → Task 2 ✓
- §5.2 역할별 탭 4/4/3 → Task 2 `TABS` ✓
- §5.3 뷰 목록 26개 → Task 2(게이트 3, 껍데기), 3(d-today·more·roster·academy·noti), 4(d-notice·notice-new), 5(d-inbox·answer·faq), 6(p 8개), 7(s 5개) ✓
- §5.4 알림 규칙 → 각 행동의 토스트 문구 + `NOTI` 배지 + `*-noti` 뷰 ✓ (실제 발송은 범위 밖)
- §5.5 확장 영역 → Task 3 `d-more` "준비 중" 4행 ✓
- §6 디자인 → Task 2 토큰·윤곽선·Pretendard 단일·로고 실물 ✓, 상태색 △`#B8860B` ✕`#C0392B` ✓
- §7 로고 자산·gitignore·og → Task 1, Task 8 ✓
- §8 데모 데이터 → 명부(Task 3), 공지 4(Task 4), FAQ 5(Task 5·6 동일 문항 검사), 문의 3/미답변 1(Task 5), 출결(Task 3·6·7) ✓. 정합 검사: 배지=미답변(Task 5), 학부모 종 2(Task 6), 학생 종 1(Task 7) ✓
- §9 검증 → 셸 테스트(Task 2~7 누적), 스크린샷 시트·390px 실측·미정의 클래스(Task 8) ✓

**Placeholder scan** — "TBD/TODO/나중에 구현" 없음. 모든 코드 단계에 실제 코드. Task 8 Step 2의 뷰 수는 출력으로 확인하라고 명시.

**Type consistency** — 라우터 이름 `enter/tab/push/back/logout/gatePhone/gateGo/gateCode/att/setBrand/toast` 전 Task 동일. `push()` 인자는 역할 접두어 없는 뷰 이름(`'roster'`, `'notice-new'`)으로 통일. `TITLE` 키는 접두어 포함 id로 통일. 테스트의 `w.ROLE`, `w.TABS`, `w.isTab`, `w.render`, `w.cur`, `w.hist`는 Task 2 스크립트의 전역과 일치.
