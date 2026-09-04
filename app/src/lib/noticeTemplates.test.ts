import { describe, it, expect } from 'vitest';
import { TEMPLATES, templateOf, missingField, type NoticeTemplate } from './noticeTemplates';

const t = (key: string): NoticeTemplate => { const x = templateOf(key); if (!x) throw new Error(key); return x; };

describe('휴원 안내', () => {
  it('날짜만 채우면 사유·보강 문장이 빠진다', () => {
    expect(t('closed').render({ 날짜: '2026-09-11' })).toEqual({
      title: '9월 11일 (금) 휴원 안내',
      body: '9월 11일 (금)은 휴원합니다.',
    });
  });
  it('사유와 보강일까지', () => {
    expect(t('closed').render({ 날짜: '2026-09-11', 사유: '추석 연휴', 보강일: '2026-09-12' })).toEqual({
      title: '9월 11일 (금) 휴원 안내',
      body: '9월 11일 (금)은 추석 연휴로 휴원합니다.\n보강은 9월 12일 (토)에 합니다.',
    });
  });
  it('아무것도 없어도 어색한 조각이 남지 않는다', () => {
    expect(t('closed').render({})).toEqual({ title: '휴원 안내', body: '휴원합니다.' });
  });
  it('달력에 넣을 수 있는 틀이다', () => {
    expect(t('closed').calendar).toEqual({ kind: 'closed', label: '휴원일에도 등록하기' });
  });
});

describe('시험 안내', () => {
  it('범위가 없으면 범위 줄이 빠진다', () => {
    expect(t('exam').render({ 날짜: '2026-09-11', 시험명: '단어 시험' })).toEqual({
      title: '9월 11일 (금) 단어 시험 안내',
      body: '9월 11일 (금)에 단어 시험을 봅니다.',
    });
  });
  it('범위까지, 받침 없는 이름은 를', () => {
    expect(t('exam').render({ 날짜: '2026-09-11', 시험명: '중간고사', 범위: '1~3과' })).toEqual({
      title: '9월 11일 (금) 중간고사 안내',
      body: '9월 11일 (금)에 중간고사를 봅니다.\n범위: 1~3과',
    });
  });
  it('빈 칸만 있으면', () => {
    expect(t('exam').render({})).toEqual({ title: '안내', body: '시험을 봅니다.' });
  });
  it('달력과는 엮이지 않는다', () => { expect(t('exam').calendar).toBeUndefined(); });
});

describe('준비물', () => {
  it('쉼표로 나눠 한 줄에 하나씩', () => {
    expect(t('stuff').render({ 날짜: '2026-09-11', 준비물: '워크북, 색연필' })).toEqual({
      title: '9월 11일 (금) 준비물 안내',
      body: '9월 11일 (금) 수업에 아래 준비물을 챙겨 주세요.\n- 워크북\n- 색연필',
    });
  });
  it('준비물이 없으면 목록 줄이 없다', () => {
    expect(t('stuff').render({ 날짜: '2026-09-11' })).toEqual({
      title: '9월 11일 (금) 준비물 안내',
      body: '9월 11일 (금) 수업에 아래 준비물을 챙겨 주세요.',
    });
  });
});

describe('특강', () => {
  it('시간·장소가 없으면 한 줄만', () => {
    expect(t('special').render({ 날짜: '2026-09-11' })).toEqual({
      title: '9월 11일 (금) 특강 안내',
      body: '9월 11일 (금)에 특강을 엽니다.',
    });
  });
  it('시간은 오전·오후로 적힌다', () => {
    expect(t('special').render({ 날짜: '2026-09-11', 시간: '19:00', 장소: '2층 강의실' })).toEqual({
      title: '9월 11일 (금) 특강 안내',
      body: '9월 11일 (금)에 특강을 엽니다.\n시간: 오후 7:00\n장소: 2층 강의실',
    });
  });
  it('달력에 넣을 수 있는 틀이다', () => {
    expect(t('special').calendar).toEqual({ kind: 'special', label: '특강 날짜도 등록하기' });
  });
});

describe('자유', () => {
  it('묻는 칸이 없고 비워서 시작한다', () => {
    expect(t('free').fields).toEqual([]);
    expect(t('free').render({})).toEqual({ title: '', body: '' });
  });
});

describe('missingField', () => {
  it('꼭 채워야 하는 빈 칸을 찾아 준다', () => {
    expect(missingField(t('exam'), {})?.key).toBe('날짜');
    expect(missingField(t('exam'), { 날짜: '2026-09-11' })?.key).toBe('시험명');
    expect(missingField(t('exam'), { 날짜: '2026-09-11', 시험명: '  ' })?.key).toBe('시험명');
    expect(missingField(t('exam'), { 날짜: '2026-09-11', 시험명: '단어' })).toBeNull();
    expect(missingField(t('free'), {})).toBeNull();
    expect(missingField(null, {})).toBeNull();
  });
});

describe('틀 목록', () => {
  it('다섯 가지 · 열쇠가 겹치지 않는다', () => {
    expect(TEMPLATES.map(x => x.key)).toEqual(['closed', 'exam', 'stuff', 'special', 'free']);
    expect(new Set(TEMPLATES.map(x => x.label)).size).toBe(TEMPLATES.length);
  });
  it('없는 열쇠는 null', () => { expect(templateOf('nope')).toBeNull(); expect(templateOf(null)).toBeNull(); });
});
