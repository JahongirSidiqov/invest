import { Logger } from '@nestjs/common';
import type { Locale } from '@invest/shared';

export interface SmsSender {
  sendOtp(phoneE164: string, code: string, locale: Locale): Promise<void>;
}

export const SMS_SENDER = Symbol('SMS_SENDER');

const TEXT: Record<Locale, (code: string) => string> = {
  uz: (code) => `Tasdiqlash kodi: ${code}. Uni hech kimga bermang.`,
  ru: (code) => `Код подтверждения: ${code}. Никому его не сообщайте.`,
  en: (code) => `Your code: ${code}. Do not share it with anyone.`,
};

export function otpText(code: string, locale: Locale): string {
  return TEXT[locale](code);
}

/** Development only: prints the code instead of sending it. Refused in production by env validation. */
export class ConsoleSmsSender implements SmsSender {
  private readonly logger = new Logger('SMS');

  async sendOtp(phoneE164: string, code: string, locale: Locale): Promise<void> {
    this.logger.log(`[dev] OTP for ***${phoneE164.slice(-2)}: ${otpText(code, locale)}`);
  }
}
