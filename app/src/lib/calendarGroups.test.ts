import { describe, it, expect } from 'vitest';
import { groupCalendar, type CalLike } from './calendarGroups';

const it_ = (id: string, date: string, extra: Partial<CalLike> = {}): CalLike =>
  ({ id, date, kind: 'closed', note: '추석 연휴', class_id: null, ...extra });

describe('groupCalendar', () => {
  it('하루짜리는 그대로 한 묶음', () => {
    const g = groupCalendar([it_('a', '2026-09-16')]);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ from: '2026-09-16', to: '2026-09-16' });
    expect(g[0].items.map(x => x.id)).toEqual(['a']);
  });

  it('연달아 붙은 사흘은 한 묶음', () => {
    const g = groupCalendar([it_('a', '2026-09-16'), it_('b', '2026-09-17'), it_('c', '2026-09-18')]);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ from: '2026-09-16', to: '2026-09-18', note: '추석 연휴' });
    expect(g[0].items.map(x => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('하루 비면 묶임이 끊긴다', () => {
    const g = groupCalendar([it_('a', '2026-09-16'), it_('b', '2026-09-17'), it_('c', '2026-09-19')]);
    expect(g).toHaveLength(2);
    expect(g[0]).toMatchObject({ from: '2026-09-16', to: '2026-09-17' });
    expect(g[1]).toMatchObject({ from: '2026-09-19', to: '2026-09-19' });
  });

  it('반이 다르면 붙어 있어도 끊긴다', () => {
    const g = groupCalendar([
      it_('a', '2026-09-16', { class_id: 'c1' }),
      it_('b', '2026-09-17', { class_id: 'c2' }),
      it_('c', '2026-09-18', { class_id: 'c1' }),
    ]);
    expect(g).toHaveLength(3);
    expect(g.map(x => x.from)).toEqual(['2026-09-16', '2026-09-17', '2026-09-18']);
  });

  it('종류·메모가 달라도 끊기고, 번갈아 나와도 각자 묶인다', () => {
    const g = groupCalendar([
      it_('a', '2026-09-16'), it_('b', '2026-09-16', { kind: 'special', note: '특강' }),
      it_('c', '2026-09-17'), it_('d', '2026-09-17', { kind: 'special', note: '특강' }),
    ]);
    expect(g).toHaveLength(2);
    expect(g[0]).toMatchObject({ kind: 'closed', from: '2026-09-16', to: '2026-09-17' });
    expect(g[1]).toMatchObject({ kind: 'special', from: '2026-09-16', to: '2026-09-17' });
  });

  it('달을 넘어가도 이어 붙는다', () => {
    const g = groupCalendar([it_('a', '2026-09-30'), it_('b', '2026-10-01')]);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ from: '2026-09-30', to: '2026-10-01' });
  });
});
