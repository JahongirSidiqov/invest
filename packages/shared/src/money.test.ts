import { describe, expect, it } from 'vitest';
import { add, formatMajor, money, parseMajor, percentOf, sum } from './money';

describe('money', () => {
  it('rejects non-integer minor units', () => {
    expect(() => money(10.5, 'UZS')).toThrow(RangeError);
  });

  it('parses major-unit strings without floating point', () => {
    expect(parseMajor('40000', 'UZS')).toEqual({ amountMinor: 4_000_000, currency: 'UZS' });
    expect(parseMajor('0.1', 'USD').amountMinor).toBe(10);
    expect(parseMajor('12,05', 'USD').amountMinor).toBe(1205);
    expect(parseMajor('8 500 000', 'UZS').amountMinor).toBe(850_000_000);
    expect(parseMajor('-25', 'UZS').amountMinor).toBe(-2500);
  });

  it('rejects malformed amounts', () => {
    expect(() => parseMajor('12.345', 'USD')).toThrow();
    expect(() => parseMajor('abc', 'UZS')).toThrow();
    expect(() => parseMajor('', 'UZS')).toThrow();
  });

  it('adds only the same currency', () => {
    expect(add(money(100, 'UZS'), money(250, 'UZS')).amountMinor).toBe(350);
    expect(() => add(money(1, 'UZS'), money(1, 'USD'))).toThrow(TypeError);
  });

  it('sums a list', () => {
    expect(sum([money(1, 'USD'), money(2, 'USD')], 'USD').amountMinor).toBe(3);
    expect(sum([], 'UZS').amountMinor).toBe(0);
  });

  it('computes integer percentages like the budget mockup', () => {
    // 1 900 000 of 2 000 000 -> 95%
    expect(percentOf(parseMajor('1900000', 'UZS'), parseMajor('2000000', 'UZS'))).toBe(95);
    // 4 420 000 of 4 250 000 -> 104%
    expect(percentOf(parseMajor('4420000', 'UZS'), parseMajor('4250000', 'UZS'))).toBe(104);
    expect(percentOf(money(5, 'UZS'), money(0, 'UZS'))).toBe(0);
  });

  it('formats with non-breaking thousands separators', () => {
    expect(formatMajor(parseMajor('3260000', 'UZS'))).toBe('3 260 000');
    expect(formatMajor(parseMajor('-40000', 'UZS'))).toBe('−40 000');
    expect(formatMajor(parseMajor('8500000', 'UZS'), { signed: true })).toBe('+8 500 000');
    expect(formatMajor(parseMajor('12.5', 'USD'))).toBe('12,50');
  });
});
