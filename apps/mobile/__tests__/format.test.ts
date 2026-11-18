import { describe, expect, it } from '@jest/globals';
import { formatSum, groupDigits, localDate, parseSumInput } from '../src/records/format';

describe('amount input', () => {
  it('groups digits while typing', () => {
    expect(groupDigits('4000000')).toBe('4 000 000');
    expect(groupDigits('40 0a00')).toBe('40 000');
    expect(groupDigits('007')).toBe('7');
    expect(groupDigits('')).toBe('');
  });

  it("parses whole so'm into tiyin", () => {
    expect(parseSumInput('40 000')).toBe(4_000_000);
    expect(parseSumInput('')).toBeNull();
    expect(parseSumInput('0')).toBeNull();
    expect(parseSumInput('99999999999999999')).toBeNull();
  });

  it('formats with sign', () => {
    expect(formatSum(4_000_000, '-')).toBe('−40 000');
    expect(formatSum(850_000_000, '+')).toBe('+8 500 000');
  });
});

describe('localDate', () => {
  it('gives today and yesterday as calendar dates', () => {
    const now = new Date(2026, 0, 1, 0, 30); // 1 Jan 00:30 local
    expect(localDate(0, now)).toBe('2026-01-01');
    expect(localDate(-1, now)).toBe('2025-12-31');
  });
});
