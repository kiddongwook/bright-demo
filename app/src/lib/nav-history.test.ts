import { describe, it, expect } from 'vitest';
import { backSnap, curEntry, pushSnap, readSnap, replaceSnap, rootSnap, sameSnap, tabSnap, type NavSnap } from './nav-history';

describe('스냅숏 옮기기', () => {
  it('밀고 들어간 만큼 뒤로가기로 돌아와 탭 뿌리에 선다', () => {
    let s: NavSnap = tabSnap('more');
    s = pushSnap(s, 'student', { id: '7' });
    s = pushSnap(s, 'student-edit', { id: '7' });
    expect(curEntry(s)).toEqual({ view: 'student-edit', params: { id: '7' } });
    s = backSnap(s);
    expect(curEntry(s)).toEqual({ view: 'student', params: { id: '7' } });
    s = backSnap(s);
    expect(s).toEqual({ tab: 'more', stack: [] });
    expect(curEntry(s)).toEqual({ view: 'more', params: {} });
    expect(backSnap(s)).toBe(s);   // 뿌리에서는 더 갈 곳이 없다
  });

  it('탭을 바꾸면 밀고 올라간 화면은 버려진다 (퇴원 처리 뒤 nav.tab("more"))', () => {
    const deep = pushSnap(pushSnap(tabSnap('today'), 'roster'), 'student', { id: '3' });
    expect(tabSnap('more')).toEqual({ tab: 'more', stack: [] });
    expect(rootSnap(deep)).toEqual({ tab: 'today', stack: [] });
  });

  it('replace 는 지금 화면만 갈아끼우고, 뿌리에서 부르면 한 칸이 생긴다', () => {
    const one = replaceSnap(tabSnap('more'), 'student-edit', { id: '9' });
    expect(one).toEqual({ tab: 'more', stack: [{ view: 'student-edit', params: { id: '9' } }] });
    const two = replaceSnap(pushSnap(tabSnap('more'), 'student', { id: '9' }), 'student-edit', { id: '9' });
    expect(two.stack).toHaveLength(1);
    expect(curEntry(two).view).toBe('student-edit');
  });

  it('sameSnap 은 탭·화면·params 를 모두 본다', () => {
    const a = pushSnap(tabSnap('more'), 'student', { id: '1' });
    expect(sameSnap(a, pushSnap(tabSnap('more'), 'student', { id: '1' }))).toBe(true);
    expect(sameSnap(a, pushSnap(tabSnap('more'), 'student', { id: '2' }))).toBe(false);
    expect(sameSnap(a, pushSnap(tabSnap('today'), 'student', { id: '1' }))).toBe(false);
    expect(sameSnap(tabSnap('more'), a)).toBe(false);
    expect(sameSnap(tabSnap('more'), tabSnap('more'))).toBe(true);
  });

  it('history 에서 읽은 값은 모양이 맞을 때만 받는다', () => {
    expect(readSnap({ tab: 'more', stack: [{ view: 'student', params: { id: '4' } }] }))
      .toEqual({ tab: 'more', stack: [{ view: 'student', params: { id: '4' } }] });
    expect(readSnap({ tab: 'notice', stack: [{ view: 'notice-view' }] }))
      .toEqual({ tab: 'notice', stack: [{ view: 'notice-view', params: {} }] });   // params 는 없어도 된다
    expect(readSnap(null)).toBeNull();
    expect(readSnap(undefined)).toBeNull();
    expect(readSnap({ stack: [] })).toBeNull();                                     // tab 이 없다
    expect(readSnap({ tab: 'more' })).toBeNull();                                   // stack 이 없다
    expect(readSnap({ tab: 'more', stack: [{ view: 'student', params: { id: 4 } }] })).toBeNull();   // 문자열이 아닌 params
    expect(readSnap({ tab: 'more', stack: [{ view: '' }] })).toBeNull();
    expect(readSnap({ sheet: true })).toBeNull();
  });
});
