/* 글자 수 상한 한 곳 — 화면(maxLength·세는 칸)과 DB check(0018_hardening.sql)가 같은 숫자를 본다.
   길이 제한이 어느 층에도 없어 2,000자 제목이 카톡·문자·푸시 문구까지 그대로 나가던 자리다 (INP-01/02/70/71/73/75). */
export const LIMITS = {
  noticeTitle: 80,        // 알림톡 params['제목'] 로 그대로 간다
  noticeBody: 2000,       // 본문은 앱 안에서만 보인다 — 넉넉히
  attendanceNote: 100,    // 알림 제목·푸시 본문에 ' · 사유' 로 붙는다
  bankInfo: 200,          // 미납 안내 알림 본문에 통째로 실린다
  personName: 20,         // 학생·강사 이름
  todoTitle: 80,
  inquiry: 1000,          // 문의·답변
  note: 500,              // 학생 메모
} as const;
