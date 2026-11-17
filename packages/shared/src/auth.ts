import { z } from 'zod';

export const LOCALES = ['uz', 'ru', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'uz';

export const OTP_LENGTH = 6;
export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_MAX_REQUESTS_PER_HOUR = 5;
export const OTP_MAX_VERIFY_ATTEMPTS = 5;
export const PIN_LENGTH = 4;
export const PIN_MAX_ATTEMPTS = 5;
export const AUTO_LOCK_SECONDS = 5 * 60;

/**
 * Normalises an Uzbek mobile number to E.164 (+998XXXXXXXXX).
 * Accepts "+998 90 123 45 67", "998901234567", "90 123-45-67".
 * Returns null when the input is not a 9-digit national number.
 */
export function normaliseUzPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  const national = digits.length === 12 && digits.startsWith('998') ? digits.slice(3) : digits;
  if (!/^\d{9}$/.test(national)) return null;
  return `+998${national}`;
}

/** "+998901234567" -> "+998 90 ••• •• 67", as on the profile mockup. */
export function maskUzPhone(e164: string): string {
  const national = e164.replace(/^\+998/, '');
  return `+998 ${national.slice(0, 2)} ••• •• ${national.slice(7)}`;
}

export const phoneSchema = z
  .string()
  .transform((value, ctx) => {
    const phone = normaliseUzPhone(value);
    if (!phone) {
      ctx.addIssue({ code: 'custom', message: 'invalid_phone' });
      return z.NEVER;
    }
    return phone;
  });

export const otpRequestSchema = z.object({
  phone: phoneSchema,
  locale: z.enum(LOCALES).default(DEFAULT_LOCALE),
});
export type OtpRequest = z.input<typeof otpRequestSchema>;

export const deviceSchema = z.object({
  platform: z.enum(['android', 'ios', 'web']),
  name: z.string().max(100).optional(),
});

export const otpVerifySchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), 'invalid_code'),
  device: deviceSchema,
});
export type OtpVerify = z.input<typeof otpVerifySchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(32).max(256),
});

export interface TokenPair {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresIn: number;
}
