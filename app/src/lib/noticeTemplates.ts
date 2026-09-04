import { fmtDateLong, fmtTime12, withEul } from './dates';

/* 공지 쓰기 틀 — 틀을 고르면 그 틀이 묻는 칸(날짜·사유·범위…)만 뜨고,
   칸을 채울 때마다 제목·내용이 저절로 다시 채워진다(원장님이 직접 고치기 전까지).
   render 는 순수 함수다: 빈 칸은 문장에서 통째로 빠진다 — "은 휴원합니다." 같은 말이 남지 않게. */

export type FieldKey = '날짜' | '사유' | '보강일' | '시험명' | '범위' | '준비물' | '시간' | '장소';
export type FieldType = 'date' | 'time' | 'text';
export type TemplateField = { key: FieldKey; label: string; type: FieldType; required?: boolean; placeholder?: string };
export type Fields = Partial<Record<FieldKey, string>>;
/** 달력에도 함께 넣을 수 있는 틀 — 체크 상자 문구와 넣을 종류 */
export type TemplateCalendar = { kind: 'closed' | 'special'; label: string };
export type NoticeTemplate = {
  key: string; label: string;
  fields: TemplateField[];
  calendar?: TemplateCalendar;
  render: (f: Fields) => { title: string; body: string };
};

const v = (f: Fields, k: FieldKey) => (f[k] ?? '').trim();
/** 날짜 칸 → '9월 11일 (금)', 비었으면 '' */
const dv = (f: Fields, k: FieldKey) => { const s = v(f, k); return s ? fmtDateLong(s) : ''; };
/** 시간 칸 → '오후 7:00', 비었으면 '' */
const tv = (f: Fields, k: FieldKey) => { const s = v(f, k); return s ? fmtTime12(s) : ''; };
/** 빈 조각을 버리고 잇는다 — 칸이 비어도 문장이 어색해지지 않는다 */
const words = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ');
const lines = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join('\n');

export const TEMPLATES: NoticeTemplate[] = [
  {
    key: 'closed', label: '휴원 안내',
    fields: [
      { key: '날짜', label: '휴원일', type: 'date', required: true },
      { key: '사유', label: '사유', type: 'text', placeholder: '예) 추석 연휴' },
      { key: '보강일', label: '보강일', type: 'date', placeholder: '없으면 비워 두세요' },
    ],
    calendar: { kind: 'closed', label: '휴원일에도 등록하기' },
    render: f => {
      const d = dv(f, '날짜'), why = v(f, '사유'), mk = dv(f, '보강일');
      return {
        title: words(d, '휴원 안내'),
        body: lines(words(d && `${d}은`, why && `${why}로`, '휴원합니다.'), mk && `보강은 ${mk}에 합니다.`),
      };
    },
  },
  {
    key: 'exam', label: '시험 안내',
    fields: [
      { key: '날짜', label: '시험일', type: 'date', required: true },
      { key: '시험명', label: '시험 이름', type: 'text', required: true, placeholder: '예) 단어 시험' },
      { key: '범위', label: '범위', type: 'text', placeholder: '예) 1~3과' },
    ],
    render: f => {
      const d = dv(f, '날짜'), name = v(f, '시험명'), range = v(f, '범위');
      return {
        title: words(d, name, '안내'),
        body: lines(words(d && `${d}에`, name ? `${withEul(name)} 봅니다.` : '시험을 봅니다.'), range && `범위: ${range}`),
      };
    },
  },
  {
    key: 'stuff', label: '준비물',
    fields: [
      { key: '날짜', label: '수업일', type: 'date', required: true },
      { key: '준비물', label: '준비물', type: 'text', required: true, placeholder: '예) 워크북, 색연필' },
    ],
    render: f => {
      const d = dv(f, '날짜');
      /* 쉼표나 줄바꿈으로 나눠 한 줄에 하나씩 — 학부모가 훑기 좋게 */
      const items = v(f, '준비물').split(/[,\n]/).map(s => s.trim()).filter(Boolean);
      return {
        title: words(d, '준비물 안내'),
        body: lines(words(d, '수업에 아래 준비물을 챙겨 주세요.'), ...items.map(s => `- ${s}`)),
      };
    },
  },
  {
    key: 'special', label: '특강',
    fields: [
      { key: '날짜', label: '특강일', type: 'date', required: true },
      { key: '시간', label: '시간', type: 'time' },
      { key: '장소', label: '장소', type: 'text', placeholder: '예) 2층 강의실' },
    ],
    calendar: { kind: 'special', label: '특강 날짜도 등록하기' },
    render: f => {
      const d = dv(f, '날짜'), at = tv(f, '시간'), where = v(f, '장소');
      return {
        title: words(d, '특강 안내'),
        body: lines(words(d && `${d}에`, '특강을 엽니다.'), at && `시간: ${at}`, where && `장소: ${where}`),
      };
    },
  },
  { key: 'free', label: '자유', fields: [], render: () => ({ title: '', body: '' }) },
];

export const templateOf = (key: string | null) => TEMPLATES.find(t => t.key === key) ?? null;
/** 채워야 하는데 빈 칸 — 없으면 null */
export const missingField = (t: NoticeTemplate | null, f: Fields): TemplateField | null =>
  t?.fields.find(x => x.required && !(f[x.key] ?? '').trim()) ?? null;
