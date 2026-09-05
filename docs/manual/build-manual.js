// BRIGHT 원장님 사용 설명서 (.docx) — 제품 문서다. 학원 이름은 원장님이 앱의 "우리 학원" 화면에서 정한다.
const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType, BorderStyle, LevelFormat, PageBreak, TableOfContents } = require('docx');

const SHOT = 'C:/Users/user/AppData/Local/Temp/claude/E--KID-Study-bright-demo/34aa45f7-c823-4782-808a-498e4f2c69d5/scratchpad/sweep/out/';
const OUT = 'E:/KID/Study/bright-demo/docs/manual/BRIGHT-원장님-사용설명서.docx';
const FONT = 'Malgun Gothic';
const INK = '111318', INK2 = '6F7480', BRAND = '2F5BEA', SOFT = 'F5F6FA', TILE = 'DCE9FF';

const t = (text, opts = {}) => new TextRun({ text, font: FONT, size: opts.size ?? 22, bold: opts.bold, color: opts.color ?? INK });
const p = (text, opts = {}) => new Paragraph({ children: typeof text === 'string' ? [t(text, opts)] : text, spacing: { after: opts.after ?? 120, line: 320 }, alignment: opts.align });
const h1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [t(text, { size: 34, bold: true })], spacing: { before: 360, after: 160 } });
const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t(text, { size: 26, bold: true, color: BRAND })], spacing: { before: 240, after: 100 } });
const bullet = (text) => new Paragraph({ numbering: { reference: 'bul', level: 0 }, children: typeof text === 'string' ? [t(text)] : text, spacing: { after: 60, line: 300 } });
let stepRef = 0; const newSteps = () => { stepRef++; };
const step = (text) => new Paragraph({ numbering: { reference: 'num' + stepRef, level: 0 }, children: typeof text === 'string' ? [t(text)] : text, spacing: { after: 60, line: 300 } });
const note = (text) => new Paragraph({ shading: { type: ShadingType.CLEAR, fill: SOFT, color: 'auto' }, children: [t('TIP  ', { bold: true, color: BRAND }), t(text, { color: INK2 })], spacing: { before: 80, after: 160, line: 300 }, indent: { left: 200, right: 200 } });

function shot(file, caption, widthIn = 2.1) {
  const f = path.join(SHOT, file);
  if (!fs.existsSync(f)) return [p(`(화면: ${caption})`, { color: INK2 })];
  const buf = fs.readFileSync(f); const iw = buf.readUInt32BE(16), ih = buf.readUInt32BE(20); const w = Math.round(widthIn * 96), h = Math.round(w * ih / iw);
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data: buf, transformation: { width: w, height: h } })], spacing: { before: 80, after: 40 } }),
    p(caption, { size: 18, color: INK2, align: AlignmentType.CENTER, after: 200 }),
  ];
}
// 두 장 나란히
function shots2(a, ca, b, cb) {
  const cell = (file, cap) => new TableCell({ width: { size: 4680, type: WidthType.DXA }, borders: none(), children: shot(file, cap, 2.0) });
  return new Table({ columnWidths: [4680, 4680], width: { size: 9360, type: WidthType.DXA }, rows: [new TableRow({ children: [cell(a, ca), cell(b, cb)] })] });
}
const none = () => ({ top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } });

function table(rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  return new Table({
    columnWidths: widths, width: { size: total, type: WidthType.DXA },
    rows: rows.map((r, i) => new TableRow({ children: r.map((c, j) => new TableCell({ width: { size: widths[j], type: WidthType.DXA }, shading: i === 0 ? { type: ShadingType.CLEAR, fill: TILE, color: 'auto' } : undefined, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [t(c, { bold: i === 0, size: 20 })] })] })) })),
  });
}

const children = [];
// 표지
children.push(new Paragraph({ spacing: { before: 2400 } }));
children.push(p([t('BRIGHT', { size: 60, bold: true })], { align: AlignmentType.CENTER, after: 120 }));
children.push(p([t('원장님 사용 설명서', { size: 36, bold: true, color: BRAND })], { align: AlignmentType.CENTER, after: 400 }));
children.push(p([t('학원 이름은 우리 학원 화면에서 정합니다', { size: 24, color: INK2 })], { align: AlignmentType.CENTER, after: 2400 }));
children.push(p([t('2026년 9월 · 앱 주소: https://kiddongwook.github.io/bright-demo/pwa/', { size: 18, color: INK2 })], { align: AlignmentType.CENTER }));
children.push(new Paragraph({ children: [new PageBreak()] }));

// 목차
children.push(h1('차례'));
children.push(new TableOfContents('차례', { hyperlink: true, headingStyleRange: '1-2' }));
children.push(new Paragraph({ children: [new PageBreak()] }));

// 1
children.push(h1('1. 이 앱이 하는 일'));
children.push(p('출결·공지·문의·수강료를 폰 하나로 봅니다. 원장님이 출석을 누르면 학부모에게 알림이 가고, 공지를 올리면 반 학부모·학생에게 알림이 갑니다. 학부모는 문의를 보내고, 원장님은 앱에서 답합니다.'));
children.push(table([
  ['누가', '무엇을 봅니다'],
  ['원장님', '홈(출석부·요약), 공지, 문의, 더보기(명부·반·휴원일·수강료·설정)'],
  ['강사', '자기 반의 출석부·공지·문의만'],
  ['학부모', '우리 아이(다음 수업·이번 주 출결·할 것·수강료), 공지, 문의'],
  ['학생', '나(할 것 체크·다음 수업·이번 주 출결), 공지'],
], [1800, 7560]));
children.push(note('설치는 필요 없지만, 홈 화면에 추가하면 앱처럼 열리고 알림을 받을 수 있어요. 더보기 → "홈 화면에 추가"에 안내가 있습니다.'));

// 2
children.push(h1('2. 처음 시작하기'));
children.push(h2('2-1. 들어오기')); newSteps();
children.push(step('운영자가 보낸 초대 링크를 카톡에서 누릅니다. 바로 원장님 화면이 열립니다.'));
children.push(step('아이폰이면 사파리 공유 버튼 → "홈 화면에 추가". 안드로이드는 크롬 메뉴 ⋮ → "홈 화면에 추가".'));
children.push(step('한 번 들어오면 같은 폰에서는 다시 로그인하지 않아도 됩니다.'));
children.push(h2('2-2. 첫걸음 네 가지'));
newSteps(); children.push(p('학원을 막 열면 홈에 "시작하기" 카드가 뜹니다. 순서대로 누르면 됩니다.'));
children.push(step([t('반 만들기', { bold: true }), t(' — 더보기 → 반·시간표 → 반 추가. 반 이름, 요일, 시작·끝 시간을 고릅니다.')]));
children.push(step([t('학생·학부모 넣기', { bold: true }), t(' — 더보기 → 명부 → 학생 추가. 이름, 반, 학생 번호, 학부모 번호. 여럿이면 CSV로 한 번에 올려도 됩니다.')]));
children.push(step([t('초대 링크 보내기', { bold: true }), t(' — 명부의 "아직 앱에 안 들어온 N명"에서 사람마다 "초대 링크 복사" → 카톡으로 보냅니다. 링크는 7일 안에 한 번 쓸 수 있어요.')]));
children.push(step([t('첫 공지 올리기', { bold: true }), t(' — 공지 탭 → 공지 쓰기.')]));
children.push(...shot('director-light-08-roster.png', '명부 — 반별 학생, 편집, 초대 링크', 2.0));

// 3
children.push(h1('3. 홈 — 매일 하는 출석'));
newSteps(); children.push(p('홈은 오늘 날짜가 제목입니다. 위에 오늘 수업·답변 대기·결석 신청 숫자가 있고, 그 아래가 출석부입니다. 지금 수업 중인 반이 자동으로 골라집니다.'));
children.push(step('학생 타일을 누릅니다. 누를 때마다 출석 → 지각 → 결석 → 미기록 순으로 바뀝니다.'));
children.push(step('대부분 출석이면 "전원 출석"을 먼저 누르고 예외만 고칩니다.'));
children.push(step('타일을 길게 누르면(또는 오른쪽 위 ⋯) 사유를 적을 수 있어요. 지각 10분, 병원 같은 칩을 누르면 됩니다.'));
children.push(step('아래에 "저장하고 알리기"가 올라오면 누릅니다. 지각·결석 학부모에게 사유까지 알림이 갑니다.'));
children.push(shots2('director-light-02-today-dirty.png', '홈 — 타일을 누르면 저장 단추가 올라옵니다', 'director-light-26-att-reason.png', '길게 누르면 사유 칩'));
children.push(h2('결석 신청 처리'));
children.push(p('학부모가 미리 알린 결석은 홈 아래 "결석 신청"에 쌓입니다. 누르면 보강 날짜 후보(그 반의 다음 수업)가 칩으로 뜹니다. 하나 고르고 "확정하고 알리기"를 누르면 학부모에게 보강 안내가 갑니다. 자료로 대체할 수도 있습니다.'));
children.push(...shot('director-light-25-makeup-chips.png', '결석 신청 — 보강 후보 칩', 2.0));
children.push(h2('이번 주 할 것'));
children.push(p('홈의 "이번 주 할 것 관리"에서 숙제·시험을 넣습니다. 제목은 최근 것과 자주 쓰는 틀을 칩으로 고를 수 있고, 마감은 그 반 다음 수업일이 기본입니다. 학생이 앱에서 체크하고 원장님도 대신 체크할 수 있어요.'));

// 4
children.push(h1('4. 공지')); newSteps();
children.push(step('공지 탭 → "공지 쓰기".'));
children.push(step('틀을 고릅니다: 휴원 안내 · 시험 안내 · 준비물 · 특강 · 자유. 틀을 고르면 날짜·사유 같은 칸이 뜨고, 채우면 제목과 내용이 저절로 써집니다.'));
children.push(step('대상 반을 고릅니다(전체 또는 반 하나). "N명에게 알림이 가요"가 보입니다.'));
children.push(step('미리보기를 펼쳐 학부모 화면 모양을 확인하고 "올리고 알리기".'));
children.push(note('휴원 안내 공지를 올리면 휴원일에도 자동으로 등록됩니다(체크 해제 가능). 그날은 학부모의 다음 수업·결석 신청 후보에서 빠집니다.'));
children.push(p('올린 공지를 누르면 읽은 사람이 보이고, 안 읽은 사람에게 "다시 알리기"를 보낼 수 있습니다. 사진은 3장까지 붙일 수 있어요.'));
children.push(shots2('director-light-04-notices.png', '공지 목록 — 반·날짜·읽은 사람 수', 'director-light-05-notice-new.png', '공지 쓰기 — 틀·대상·미리보기'));

// 5
children.push(h1('5. 문의'));
children.push(p('학부모의 1:1 문의가 "답변 대기"에 쌓입니다. 누르면 답변 화면입니다.'));
children.push(bullet('자주 쓰는 답이 칩으로 있어 누르면 들어갑니다. 최근에 보낸 답도 칩으로 뜹니다.'));
children.push(bullet('"학생 기록 보기"를 누르면 그 아이의 출결·결석·문의·메모가 시간순으로 보입니다.'));
children.push(bullet('"자주 묻는 질문에도 올리기"를 켜면 같은 질문을 학부모가 먼저 볼 수 있게 됩니다. "메모로도 남기기"를 켜면 상담 메모로 남습니다.'));
children.push(bullet('답하면 그 학부모에게만 알림이 갑니다.'));
children.push(shots2('director-light-06-inbox.png', '문의 — 답변 대기·완료', 'director-light-27-inbox-answer.png', '답변 — 칩·기록 보기·FAQ·메모'));

// 6
children.push(h1('6. 더보기 — 학원 운영'));
children.push(...shot('director-light-07-more.png', '더보기 — 매일 쓰는 것 / 설정 / 준비 중', 2.0));
children.push(h2('명부'));
children.push(bullet('학생 추가: 이름·반·학생 번호·학부모 번호(여럿 가능). 번호가 있는 사람만 앱에 들어올 수 있어요.'));
children.push(bullet('편집·퇴원 처리는 학생 이름을 누른 뒤 "편집". 퇴원해도 기록은 남고, 다시 다니면 "다시 다니기".'));
children.push(bullet('"아직 앱에 안 들어온 N명": 사람마다 초대 링크 복사. "알림 못 받는 N명": 들어왔지만 알림을 안 켠 사람 — 안내 문구를 복사해 보내세요.'));
children.push(bullet('CSV 올리기: 엑셀에서 반, 요일, 시작, 끝, 학생, 학생번호, 보호자, 보호자번호 순으로 저장해 올립니다. 동명이인이 있으면 학생 번호가 꼭 필요합니다.'));
children.push(h2('반·시간표'));
children.push(bullet('반을 누르면 요일·시간·담당 강사를 고칩니다. 요일마다 시간이 다르면 "요일마다 시간이 달라요"를 켜세요.'));
children.push(bullet('강사를 배정하면 그 강사는 자기 반만 봅니다. 강사는 더보기 → 강사에서 넣습니다.'));
children.push(h2('휴원일·특강'));
children.push(bullet('하루 · 기간(예: 추석 연휴) · 매주(예: 매주 일요일) 세 가지로 넣습니다. 이미 있는 날은 건너뜁니다.'));
children.push(bullet('연속된 날은 한 줄로 묶여 보이고, 한꺼번에 지울 수 있어요.'));
children.push(h2('수강료')); newSteps();
children.push(step('"수강료 설정"에서 요금제(반별 또는 학원 공통 금액), 청구일·납기일, 형제 할인, 계좌 안내를 정합니다.'));
children.push(step('달마다 "이번 달 청구서 만들기". 활성 학생마다 한 장, 형제 할인은 자동입니다. 다시 눌러도 이미 있는 학생은 건너뜁니다.'));
children.push(step('통장에 들어오면 학생을 눌러 "전액 납부 확인"(계좌이체·현금·카드) 또는 부분 금액. 남은 금액보다 많이는 받을 수 없어요.'));
children.push(step('"미납 안내 보내기"를 누르면 미납 학부모에게 계좌 안내와 함께 알림이 갑니다(하루 한 번).'));
children.push(shots2('director-light-23-billing.png', '수강료 — 이번 달 청구서', 'director-light-24-billing-settings.png', '수강료 설정 — 요금제·규칙·계좌'));
children.push(note('결제는 앱을 거치지 않습니다. 돈은 학원 계좌로 직접 받고, 앱은 누가 냈는지만 기록합니다. 학부모 화면에는 이번 달 금액·납기·계좌 안내가 보입니다.'));
children.push(h2('우리 학원 · 알림 설정 · 앱 정보'));
children.push(bullet('우리 학원: 이름, 강조색(5가지), 로고. 로고를 올리면 앱바와 학부모 화면에 보입니다.'));
children.push(bullet('알림 설정: "이 기기로 알림 받기"를 켜면 이 폰으로 알림이 옵니다(아이폰은 홈 화면에 추가한 앱에서만). "카톡도 같이 받기"는 대행사 연결 뒤에 뜻이 있습니다.'));
children.push(bullet('앱 정보·진단: 버전 확인, 문제 보내기. "학원 데이터 내려받기"로 전체 데이터를 파일로 받을 수 있습니다.'));

// 7
children.push(h1('7. 학부모·학생은 무엇을 보나요'));
children.push(shots2('parent-light-01-home.png', '학부모 — 우리 아이', 'student-light-01-me.png', '학생 — 나'));
children.push(bullet('학부모: 다음 수업, 이번 주 출결, 이번 달 수강료, 할 것, 최근 공지, 미리 알린 결석. "결석 미리 알리기"로 결석을 미리 보냅니다.'));
children.push(bullet('학생: 할 것을 직접 체크하고, 다음 수업과 이번 주 출결을 봅니다.'));
children.push(bullet('학부모·학생은 각자 자기 번호로 들어옵니다. 자녀가 둘이면 아이를 바꿔 볼 수 있어요.'));

// 8
children.push(h1('8. 자주 묻는 것'));
children.push(table([
  ['질문', '답'],
  ['인증번호가 안 와요', '지금은 문자 대행사가 연결되기 전이라 초대 링크로 들어오는 것이 기본입니다. 링크가 만료됐으면 원장님이 명부에서 새로 복사해 보내면 됩니다.'],
  ['알림이 안 와요', '더보기 → 알림 설정 → "이 기기로 알림 받기"가 켜져 있는지, 아이폰이면 홈 화면에 추가한 앱으로 열었는지 확인하세요. 명부의 "알림 못 받는 N명"에서 누구인지 볼 수 있습니다.'],
  ['뒤로가기를 하면 앱이 꺼져요', '화면 안에서는 뒤로 제스처가 한 단계씩 돌아갑니다. 첫 화면(홈)에서 더 뒤로 가면 앱이 닫히는 것이 정상입니다.'],
  ['학생이 퇴원했어요', '명부 → 학생 → 편집 → 퇴원 처리. 기록은 남고 알림은 끊깁니다. 다시 다니면 "다시 다니기".'],
  ['공지를 잘못 올렸어요', '공지를 지우면 관련 알림도 함께 지워집니다. 이미 카톡·푸시로 나간 것은 되돌릴 수 없으니 정정 공지를 올려 주세요.'],
  ['휴원일을 넣었는데 다음 수업에 그날이 나와요', '반을 골라 넣었으면 그 반만 쉽니다. 모든 반이 쉬면 "전체"로 넣으세요.'],
  ['어두운 화면으로 보고 싶어요', '폰의 다크 모드를 켜면 앱도 따라갑니다.'],
  ['데이터를 가져가고 싶어요', '더보기 → 학원 데이터 내려받기(JSON). 반별 출결표는 CSV로 내려받을 수 있습니다.'],
], [2600, 6760]));

children.push(h1('9. 도움이 필요할 때'));
children.push(p('더보기 → 앱 정보·진단 → "문제 보내기"로 화면과 함께 보내 주시면 확인합니다. 운영자에게 카톡으로 말씀 주셔도 됩니다.'));
children.push(p([t('이 설명서는 앱이 바뀌면 함께 고칩니다. 마지막 수정: 2026년 9월 5일.', { size: 18, color: INK2 })]));

const doc = new Document({
  creator: 'BRIGHT',
  title: 'BRIGHT 원장님 사용 설명서',
  styles: { default: { document: { run: { font: FONT, size: 22 } } } },
  numbering: { config: [
    { reference: 'bul', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 480, hanging: 240 } } } }] },
    ...Array.from({ length: 12 }, (_, i) => ({ reference: 'num' + (i + 1), levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 480, hanging: 300 } } } }] })),
  ] },
  sections: [{ properties: { page: { margin: { top: 1200, bottom: 1200, left: 1300, right: 1300 } } }, children }],
});
fs.mkdirSync(path.dirname(OUT), { recursive: true });
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(OUT, buf); console.log('wrote', OUT, buf.length); });
