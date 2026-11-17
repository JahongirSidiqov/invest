import { describe, expect, it } from 'vitest';
import { maskUzPhone, normaliseUzPhone, otpVerifySchema, phoneSchema } from './auth';

describe('normaliseUzPhone', () => {
  it.each([
    ['+998 90 123 45 67', '+998901234567'],
    ['998901234567', '+998901234567'],
    ['90 123-45-67', '+998901234567'],
    ['(33) 123 45 67', '+998331234567'],
  ])('%s -> %s', (input, expected) => {
    expect(normaliseUzPhone(input)).toBe(expected);
  });

  it.each(['', '12345', '+7 912 345 67 89', '9989012345678'])('rejects %s', (input) => {
    expect(normaliseUzPhone(input)).toBeNull();
  });
});

describe('maskUzPhone', () => {
  it('matches the profile mockup', () => {
    expect(maskUzPhone('+998901234567')).toBe('+998 90 ••• •• 67');
  });
});

describe('schemas', () => {
  it('phoneSchema normalises', () => {
    expect(phoneSchema.parse('90 123 45 67')).toBe('+998901234567');
    expect(phoneSchema.safeParse('123').success).toBe(false);
  });

  it('otpVerifySchema requires 6 digits', () => {
    const device = { platform: 'android' as const };
    expect(otpVerifySchema.safeParse({ phone: '901234567', code: '123456', device }).success).toBe(
      true,
    );
    expect(otpVerifySchema.safeParse({ phone: '901234567', code: '12345', device }).success).toBe(
      false,
    );
  });
});
