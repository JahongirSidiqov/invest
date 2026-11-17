import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type CapturingSms, createTestApp, ownerQuery, resetState } from './app';

const PHONE_A = '+998901234567';
const PHONE_B = '+998931112233';

let app: INestApplication;
let sms: CapturingSms;

async function login(phone: string) {
  await request(app.getHttpServer())
    .post('/v1/auth/otp/request')
    .send({ phone, locale: 'ru' })
    .expect(200);
  const res = await request(app.getHttpServer())
    .post('/v1/auth/otp/verify')
    .send({ phone, code: sms.codes.get(phone), device: { platform: 'android' } })
    .expect(200);
  return res.body as {
    accessToken: string;
    refreshToken: string;
    userId: string;
    isNewUser: boolean;
  };
}

beforeAll(async () => {
  ({ app, sms } = await createTestApp());
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetState();
  sms.codes.clear();
});

describe('auth flow', () => {
  it('signs up with an OTP, then logs in to the same account', async () => {
    const first = await login(PHONE_A);
    expect(first.isNewUser).toBe(true);

    // Resend cooldown is per number; wait it out by clearing Redis.
    await resetRedisOnly();
    const second = await login(PHONE_A);
    expect(second.isNewUser).toBe(false);
    expect(second.userId).toBe(first.userId);
  });

  it('stores the phone encrypted, never in plain text', async () => {
    await login(PHONE_A);
    const rows = await ownerQuery<{ phone_enc: Buffer; phone_hash: string }>(
      'SELECT phone_enc, phone_hash FROM users',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.phone_enc.toString('latin1')).not.toContain('901234567');
    expect(rows[0]!.phone_hash).not.toContain('901234567');
  });

  it('returns problem+json for a wrong code', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/otp/request')
      .send({ phone: PHONE_A })
      .expect(200);
    const res = await request(app.getHttpServer())
      .post('/v1/auth/otp/verify')
      .send({ phone: PHONE_A, code: '000000', device: { platform: 'ios' } });
    // The real code could be 000000 one time in a million.
    if (sms.codes.get(PHONE_A) !== '000000') {
      expect(res.status).toBe(401);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body).toMatchObject({ status: 401, code: 'otp_invalid' });
    }
  });

  it('rejects an invalid phone with field errors', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/otp/request')
      .send({ phone: '123' })
      .expect(400);
    expect(res.body).toMatchObject({
      code: 'validation_failed',
      errors: [{ path: 'phone', code: 'invalid_phone' }],
    });
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const { refreshToken, accessToken } = await login(PHONE_A);

    const rotated = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken })
      .expect(200);
    expect(rotated.body.refreshToken).not.toBe(refreshToken);

    // Reusing the old token revokes every session, including the new one.
    const reuse = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken })
      .expect(401);
    expect(reuse.body.code).toBe('token_reused');

    await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: rotated.body.refreshToken })
      .expect(401);

    const audit = await ownerQuery<{ action: string }>(
      "SELECT action FROM audit_logs WHERE action = 'refresh_token_reuse'",
    );
    expect(audit).toHaveLength(1);
    expect(accessToken).toBeTruthy();
  });

  it('logout-all revokes refresh tokens on every device', async () => {
    const phone = PHONE_A;
    const deviceOne = await login(phone);
    await resetRedisOnly();
    const deviceTwo = await login(phone);

    await request(app.getHttpServer())
      .post('/v1/auth/logout-all')
      .set('Authorization', `Bearer ${deviceOne.accessToken}`)
      .expect(204);

    for (const session of [deviceOne, deviceTwo]) {
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(401);
    }
  });

  it('requires a bearer token for /me', async () => {
    await request(app.getHttpServer()).get('/v1/me').expect(401);
    await request(app.getHttpServer())
      .get('/v1/me')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);
  });
});

describe('profile and consents', () => {
  it('reads and updates the profile with a masked phone', async () => {
    const { accessToken } = await login(PHONE_A);
    const auth = { Authorization: `Bearer ${accessToken}` };

    const me = await request(app.getHttpServer()).get('/v1/me').set(auth).expect(200);
    expect(me.body).toMatchObject({
      phoneMasked: '+998 90 ••• •• 67',
      locale: 'ru',
      onboarded: false,
    });

    const updated = await request(app.getHttpServer())
      .patch('/v1/me')
      .set(auth)
      .send({ name: 'Дильбар', locale: 'uz' })
      .expect(200);
    expect(updated.body).toMatchObject({ name: 'Дильбар', locale: 'uz' });

    const onboarded = await request(app.getHttpServer())
      .put('/v1/me/onboarding')
      .set(auth)
      .send({ incomeRange: '3to6m', goal: null, halalPref: 'only' })
      .expect(200);
    expect(onboarded.body).toMatchObject({ onboarded: true, incomeRange: '3to6m' });
  });

  it('keeps consent history', async () => {
    const { accessToken, userId } = await login(PHONE_A);
    const auth = { Authorization: `Bearer ${accessToken}` };

    await request(app.getHttpServer())
      .post('/v1/me/consents')
      .set(auth)
      .send({ type: 'privacy', version: '1', granted: true })
      .expect(200);
    const afterRevoke = await request(app.getHttpServer())
      .post('/v1/me/consents')
      .set(auth)
      .send({ type: 'privacy', version: '1', granted: false })
      .expect(200);
    expect(afterRevoke.body).toEqual([]);

    const history = await ownerQuery<{ revoked_at: Date | null }>(
      'SELECT revoked_at FROM consents WHERE user_id = $1',
      [userId],
    );
    expect(history).toHaveLength(1);
    expect(history[0]!.revoked_at).not.toBeNull();
  });
});

describe('row-level security', () => {
  it('the application role cannot read another user’s rows', async () => {
    const a = await login(PHONE_A);
    const b = await login(PHONE_B);
    const { Client } = await import('pg');

    const pg = new Client({ connectionString: process.env.APP_DATABASE_URL });
    await pg.connect();
    try {
      await pg.query('BEGIN');
      await pg.query("SELECT set_config('app.user_id', $1, true)", [a.userId]);
      const users = await pg.query('SELECT id FROM users');
      const devices = await pg.query('SELECT user_id FROM devices');
      await pg.query('COMMIT');
      expect(users.rows.map((r) => r.id)).toEqual([a.userId]);
      expect(devices.rows.every((r) => r.user_id === a.userId)).toBe(true);

      // Without any setting the role sees nothing (fails closed).
      const none = await pg.query('SELECT id FROM users');
      expect(none.rows).toEqual([]);

      // The audit log is append-only for the application role.
      await expect(pg.query('DELETE FROM audit_logs')).rejects.toThrow(/permission denied/);
    } finally {
      await pg.end();
    }
    expect(b.userId).not.toBe(a.userId);
  });
});

async function resetRedisOnly() {
  const { default: Redis } = await import('ioredis');
  const redis = new Redis(process.env.REDIS_URL!);
  await redis.flushdb();
  await redis.quit();
}
