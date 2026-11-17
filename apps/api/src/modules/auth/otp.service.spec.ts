import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { CryptoService } from '../../infra/crypto.service';
import { FakeRedis } from '../../testing/fake-redis';
import { OtpService } from './otp.service';
import type { SmsSender } from './sms';

const PHONE = '+998901234567';
const IP = '10.0.0.1';

class CapturingSms implements SmsSender {
  last: string | null = null;
  async sendOtp(_phone: string, code: string) {
    this.last = code;
  }
}

function setup() {
  const redis = new FakeRedis();
  const sms = new CapturingSms();
  const crypto = new CryptoService({
    PII_ENC_KEY: randomBytes(32).toString('base64'),
    PII_HASH_KEY: randomBytes(32).toString('base64'),
  });
  return { redis, sms, otp: new OtpService(redis, sms, crypto) };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ response: expect.objectContaining({ code }) });
}

describe('OtpService', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('sends a 6-digit code and accepts it once', async () => {
    await ctx.otp.request(PHONE, 'uz', IP);
    expect(ctx.sms.last).toMatch(/^\d{6}$/);
    await ctx.otp.verify(PHONE, ctx.sms.last!);
    await expectCode(ctx.otp.verify(PHONE, ctx.sms.last!), 'otp_expired');
  });

  it('rejects a wrong code', async () => {
    await ctx.otp.request(PHONE, 'uz', IP);
    const wrong = ctx.sms.last === '000000' ? '111111' : '000000';
    await expectCode(ctx.otp.verify(PHONE, wrong), 'otp_invalid');
  });

  it('expires the code after 5 minutes', async () => {
    await ctx.otp.request(PHONE, 'uz', IP);
    ctx.redis.advance(5 * 60);
    await expectCode(ctx.otp.verify(PHONE, ctx.sms.last!), 'otp_expired');
  });

  it('burns the code after 5 failed attempts', async () => {
    await ctx.otp.request(PHONE, 'uz', IP);
    const good = ctx.sms.last!;
    const wrong = good === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await expectCode(ctx.otp.verify(PHONE, wrong), 'otp_invalid');
    await expectCode(ctx.otp.verify(PHONE, good), 'otp_attempts_exceeded');
    await expectCode(ctx.otp.verify(PHONE, good), 'otp_expired');
  });

  it('enforces the 60 s resend cooldown', async () => {
    await ctx.otp.request(PHONE, 'uz', IP);
    await expectCode(ctx.otp.request(PHONE, 'uz', IP), 'otp_cooldown');
    ctx.redis.advance(60);
    await expect(ctx.otp.request(PHONE, 'uz', IP)).resolves.toEqual({ resendIn: 60 });
  });

  it('allows at most 5 requests per number per hour', async () => {
    for (let i = 0; i < 5; i++) {
      await ctx.otp.request(PHONE, 'uz', `10.0.0.${i}`);
      ctx.redis.advance(60);
    }
    await expectCode(ctx.otp.request(PHONE, 'uz', '10.0.1.1'), 'rate_limited');
    ctx.redis.advance(3600);
    await expect(ctx.otp.request(PHONE, 'uz', '10.0.1.1')).resolves.toBeDefined();
  });

  it('limits requests per IP across numbers', async () => {
    for (let i = 0; i < 20; i++) {
      await ctx.otp.request(`+9989012345${String(i).padStart(2, '0')}`, 'uz', IP);
    }
    await expectCode(ctx.otp.request('+998939999999', 'uz', IP), 'rate_limited');
  });
});
