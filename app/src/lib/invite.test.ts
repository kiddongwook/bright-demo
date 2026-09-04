import { describe, it, expect, vi, beforeAll } from 'vitest';
import { personalInviteText } from './invite';

// node 환경에는 location 이 없다 — 문구가 쓰는 origin 만 세워 둔다 (BASE_URL 은 vitest 에서 '/')
beforeAll(() => { vi.stubGlobal('location', { origin: 'https://kiddongwook.github.io' }); });

const TOKEN = 'a'.repeat(32);

describe('personalInviteText', () => {
  it('첫 줄은 학원 이름과 7일 안내', () => {
    expect(personalInviteText('영어의 집', 'yeongeo', TOKEN, '지훈 학부모').split('\n')[0])
      .toBe('[영어의 집] 앱 초대 — 링크를 누르면 바로 들어와요 (7일 안에)');
  });
  it('링크에 학원 slug 와 초대 토큰이 붙는다', () => {
    expect(personalInviteText('영어의 집', 'yeongeo', TOKEN, '지훈 학부모'))
      .toContain(`https://kiddongwook.github.io/?a=yeongeo&i=${TOKEN}`);
  });
  it('slug 가 없으면 토큰만 붙는다', () => {
    const t = personalInviteText('영어의 집', null, TOKEN, '지훈 학생');
    expect(t).toContain(`https://kiddongwook.github.io/?i=${TOKEN}`);
    expect(t).not.toContain('a=');
  });
  it('누구 앞으로 가는 링크인지 문구에 들어간다', () => {
    expect(personalInviteText('영어의 집', 'yeongeo', TOKEN, '김영희 강사')).toContain('김영희 강사 초대 링크예요');
  });
});
