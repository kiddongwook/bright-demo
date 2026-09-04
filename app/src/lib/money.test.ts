import { describe, it, expect } from 'vitest';
import { fmtComma, fmtWon, parseWon } from './money';

describe('parseWon', () => {
  it('만 단위 말을 숫자로 읽는다', () => {
    expect(parseWon('15만')).toBe(150000);
    expect(parseWon('1만5천')).toBe(15000);
  });
  it('세 자리 콤마를 떼고 읽는다', () => {
    expect(parseWon('150,000')).toBe(150000);
  });
  it('자리를 잘못 끊은 콤마도 그냥 읽는다', () => {
    expect(parseWon('15,0000')).toBe(150000);
  });
  it("'원'과 공백이 붙어도 읽는다", () => {
    expect(parseWon(' 150000원 ')).toBe(150000);
  });
  it('숫자가 없으면 0', () => {
    expect(parseWon('')).toBe(0);
    expect(parseWon('금액')).toBe(0);
    expect(parseWon(null)).toBe(0);
  });
  it('음수 기호는 무시하고 0 밑으로 내려가지 않는다', () => {
    expect(parseWon('-5000')).toBe(5000);
    expect(parseWon(-5000)).toBe(0);
  });
});

describe('fmtWon · fmtComma', () => {
  it('세 자리마다 끊고 원을 붙인다', () => {
    expect(fmtWon(150000)).toBe('150,000원');
    expect(fmtComma(150000)).toBe('150,000');
  });
  it('빈 칸은 빈 채로 둔다 — 0 을 그려 넣어 지우기를 막지 않는다', () => {
    expect(fmtComma('')).toBe('');
    expect(fmtComma(0)).toBe('');
  });
});
