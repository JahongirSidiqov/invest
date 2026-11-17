import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  OTP_LENGTH,
  OTP_MAX_REQUESTS_PER_HOUR,
  OTP_MAX_VERIFY_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_SECONDS,
  type Locale,
} from '@invest/shared';
import { randomInt } from 'node:crypto';
import { AppError } from '../../common/problem.filter';
import { CryptoService } from '../../infra/crypto.service';
import { REDIS, type RedisLike } from '../../infra/redis';
import { SMS_SENDER, type SmsSender } from './sms';

export const OTP_MAX_REQUESTS_PER_IP_PER_HOUR = 20;
const HOUR = 3600;

/**
 * One-time codes in Redis. Keys use the keyed phone hash, never the number itself.
 *   otp:code:{h}  HMAC of the code, TTL 5 min
 *   otp:att:{h}   failed verify attempts for the current code
 *   otp:cool:{h}  resend cooldown
 *   otp:req:{h}   requests in the current hour (max 5)
 *   otp:ip:{ip}   requests per IP in the current hour
 */
@Injectable()
export class OtpService {
  constructor(
    @Inject(REDIS) private readonly redis: RedisLike,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
    private readonly crypto: CryptoService,
  ) {}

  async request(phone: string, locale: Locale, ip: string): Promise<{ resendIn: number }> {
    const h = this.crypto.hmac(phone);

    await this.hitLimit(`otp:ip:${this.crypto.hmac(ip)}`, OTP_MAX_REQUESTS_PER_IP_PER_HOUR);

    const cooldownSet = await this.redis.set(
      `otp:cool:${h}`,
      '1',
      'EX',
      OTP_RESEND_COOLDOWN_SECONDS,
      'NX',
    );
    if (cooldownSet === null) {
      const ttl = await this.redis.ttl(`otp:cool:${h}`);
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, 'otp_cooldown', {
        retryAfter: Math.max(ttl, 1),
      });
    }

    await this.hitLimit(`otp:req:${h}`, OTP_MAX_REQUESTS_PER_HOUR);

    const code = randomInt(0, 10 ** OTP_LENGTH)
      .toString()
      .padStart(OTP_LENGTH, '0');
    await this.redis.set(`otp:code:${h}`, this.crypto.hmac(`${h}:${code}`), 'EX', OTP_TTL_SECONDS);
    await this.redis.del(`otp:att:${h}`);
    await this.sms.sendOtp(phone, code, locale);

    return { resendIn: OTP_RESEND_COOLDOWN_SECONDS };
  }

  /** Consumes the code on success. Throws on a wrong, expired or exhausted code. */
  async verify(phone: string, code: string): Promise<void> {
    const h = this.crypto.hmac(phone);
    const stored = await this.redis.get(`otp:code:${h}`);
    if (!stored) {
      throw new AppError(HttpStatus.UNAUTHORIZED, 'otp_expired');
    }

    const attempts = await this.redis.incr(`otp:att:${h}`);
    if (attempts === 1) await this.redis.expire(`otp:att:${h}`, OTP_TTL_SECONDS);
    if (attempts > OTP_MAX_VERIFY_ATTEMPTS) {
      await this.redis.del(`otp:code:${h}`, `otp:att:${h}`);
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, 'otp_attempts_exceeded');
    }

    if (!this.crypto.safeEqual(stored, this.crypto.hmac(`${h}:${code}`))) {
      throw new AppError(HttpStatus.UNAUTHORIZED, 'otp_invalid');
    }

    await this.redis.del(`otp:code:${h}`, `otp:att:${h}`);
  }

  private async hitLimit(key: string, max: number): Promise<void> {
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, HOUR);
    if (count > max) {
      const ttl = await this.redis.ttl(key);
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, 'rate_limited', {
        retryAfter: Math.max(ttl, 1),
      });
    }
  }
}
