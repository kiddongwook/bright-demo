/* 공지 쓰기 템플릿 — 중괄호 자리는 원장님이 직접 고쳐 쓴다.
   내용을 채워 넣기만 하고, 보낼 때 검사하거나 바꾸지 않는다. */
export type NoticeTemplate = { key: string; label: string; title: string; body: string };

export const TEMPLATES: NoticeTemplate[] = [
  {
    key: 'closed', label: '휴원 안내',
    title: '{날짜} 휴원 안내',
    body: '{날짜}은(는) {사유}로 휴원합니다. 보강은 {보강일}에 진행해요.',
  },
  {
    key: 'exam', label: '시험 안내',
    title: '{날짜} {시험명} 안내',
    body: '{날짜} {시험명}을 봅니다.\n범위: {범위}\n준비물: {준비물}\n시간: {시간}',
  },
  {
    key: 'stuff', label: '준비물',
    title: '{날짜} 준비물 안내',
    body: '{날짜} 수업에 아래 준비물을 챙겨 주세요.\n- {준비물 1}\n- {준비물 2}',
  },
  {
    key: 'special', label: '특강',
    title: '{날짜} 특강 안내',
    body: '{날짜}에 특강을 엽니다.\n시간: {시간}\n장소: {장소}\n대상: {대상}',
  },
  { key: 'free', label: '자유', title: '', body: '' },
];
