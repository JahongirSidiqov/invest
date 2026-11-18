import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type CapturingSms, createTestApp, ownerQuery, resetState } from './app';

let app: INestApplication;
let sms: CapturingSms;

async function login(phone: string): Promise<{ token: string; userId: string }> {
  await request(app.getHttpServer()).post('/v1/auth/otp/request').send({ phone }).expect(200);
  const res = await request(app.getHttpServer())
    .post('/v1/auth/otp/verify')
    .send({ phone, code: sms.codes.get(phone), device: { platform: 'android' } })
    .expect(200);
  return { token: res.body.accessToken, userId: res.body.userId };
}

function expense(overrides: Record<string, unknown> = {}) {
  return {
    clientId: randomUUID(),
    type: 'expense',
    amountMinor: 4_000_000,
    currency: 'UZS',
    category: 'food',
    necessity: 'essential',
    occurredOn: '2026-11-18',
    note: 'Tushlik',
    source: 'manual',
    clientUpdatedAt: '2026-11-18T08:00:00.000Z',
    deleted: false,
    ...overrides,
  };
}

function sync(token: string, body: Record<string, unknown>, key: string = randomUUID()) {
  return request(app.getHttpServer())
    .post('/v1/sync')
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', key)
    .send(body);
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

describe('POST /v1/sync', () => {
  it('stores pushed records and returns them on pull', async () => {
    const { token } = await login('+998901234567');
    const t = expense();
    const res = await sync(token, { cursor: null, transactions: [t] }).expect(200);
    expect(res.body.accepted.transactions).toEqual([t.clientId]);
    expect(res.body.rejected).toEqual([]);
    expect(res.body.changes.transactions).toEqual([t]);
    expect(Number(res.body.cursor)).toBeGreaterThan(0);

    // Nothing new after the cursor.
    const again = await sync(token, { cursor: res.body.cursor }).expect(200);
    expect(again.body.changes.transactions).toEqual([]);
    expect(again.body.cursor).toBe(res.body.cursor);
  });

  it('never duplicates a resent record', async () => {
    const { token, userId } = await login('+998901234567');
    const t = expense();
    await sync(token, { cursor: null, transactions: [t] }).expect(200);
    await sync(token, { cursor: null, transactions: [t] }).expect(200);
    const rows = await ownerQuery('SELECT 1 FROM transactions WHERE user_id = $1', [userId]);
    expect(rows).toHaveLength(1);
  });

  it('keeps the newest write (last write wins)', async () => {
    const { token } = await login('+998901234567');
    const t = expense();
    await sync(token, {
      cursor: null,
      transactions: [{ ...t, amountMinor: 5_000_000, clientUpdatedAt: '2026-11-18T09:00:00.000Z' }],
    }).expect(200);
    // An older edit from another device arrives later and must not win.
    const res = await sync(token, {
      cursor: null,
      transactions: [{ ...t, amountMinor: 1_000_000, clientUpdatedAt: '2026-11-18T08:30:00.000Z' }],
    }).expect(200);
    expect(res.body.accepted.transactions).toEqual([t.clientId]);
    expect(res.body.changes.transactions[0].amountMinor).toBe(5_000_000);
  });

  it('propagates deletes as tombstones', async () => {
    const { token } = await login('+998901234567');
    const t = expense();
    const first = await sync(token, { cursor: null, transactions: [t] }).expect(200);
    const del = await sync(token, {
      cursor: first.body.cursor,
      transactions: [{ ...t, deleted: true, clientUpdatedAt: '2026-11-18T10:00:00.000Z' }],
    }).expect(200);
    expect(del.body.changes.transactions).toEqual([
      expect.objectContaining({ clientId: t.clientId, deleted: true }),
    ]);

    const list = await request(app.getHttpServer())
      .get('/v1/transactions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.items).toEqual([]);
  });

  it('accepts a record created and deleted offline without storing it', async () => {
    const { token, userId } = await login('+998901234567');
    const t = expense({ deleted: true });
    const res = await sync(token, { cursor: null, transactions: [t] }).expect(200);
    expect(res.body.accepted.transactions).toEqual([t.clientId]);
    expect(await ownerQuery('SELECT 1 FROM transactions WHERE user_id = $1', [userId])).toEqual([]);
  });

  it('syncs custom categories and checks references', async () => {
    const { token } = await login('+998901234567');
    const sport = {
      clientId: randomUUID(),
      kind: 'expense',
      name: 'Sport',
      necessity: 'non_essential',
      icon: 'activity',
      clientUpdatedAt: '2026-11-18T08:00:00.000Z',
      deleted: false,
    };
    const ok = expense({ category: sport.clientId, necessity: 'non_essential' });
    const unknown = expense({ category: randomUUID() });
    const res = await sync(token, {
      cursor: null,
      categories: [sport],
      transactions: [ok, unknown],
    }).expect(200);
    expect(res.body.accepted.categories).toEqual([sport.clientId]);
    expect(res.body.accepted.transactions).toEqual([ok.clientId]);
    expect(res.body.rejected).toEqual([
      { entity: 'transaction', clientId: unknown.clientId, code: 'unknown_category' },
    ]);

    const cats = await request(app.getHttpServer())
      .get('/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(cats.body).toContainEqual(
      expect.objectContaining({ ref: sport.clientId, builtIn: false, name: 'Sport' }),
    );
    expect(cats.body).toContainEqual(expect.objectContaining({ ref: 'food', builtIn: true }));
  });

  it('cannot reference another user’s category', async () => {
    const a = await login('+998901234567');
    const b = await login('+998931112233');
    const secret = {
      clientId: randomUUID(),
      kind: 'expense',
      name: 'A only',
      necessity: 'moderate',
      icon: null,
      clientUpdatedAt: '2026-11-18T08:00:00.000Z',
      deleted: false,
    };
    await sync(a.token, { cursor: null, categories: [secret] }).expect(200);
    const res = await sync(b.token, {
      cursor: null,
      transactions: [expense({ category: secret.clientId, necessity: 'moderate' })],
    }).expect(200);
    expect(res.body.rejected[0].code).toBe('unknown_category');
    // B's pull never contains A's rows.
    expect(res.body.changes.categories).toEqual([]);
  });

  it('pages large pulls with hasMore', async () => {
    const { token } = await login('+998901234567');
    const batch = Array.from({ length: 500 }, (_, i) =>
      expense({ amountMinor: 100 + i, note: null }),
    );
    await sync(token, { cursor: null, transactions: batch }).expect(200);
    await sync(token, { cursor: null, transactions: [expense()] }).expect(200);

    const first = await sync(token, { cursor: null }).expect(200);
    expect(first.body.changes.transactions).toHaveLength(500);
    expect(first.body.hasMore).toBe(true);
    const second = await sync(token, { cursor: first.body.cursor }).expect(200);
    expect(second.body.changes.transactions).toHaveLength(1);
    expect(second.body.hasMore).toBe(false);
  });

  it('requires an Idempotency-Key and replays the stored response', async () => {
    const { token } = await login('+998901234567');
    await request(app.getHttpServer())
      .post('/v1/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({ cursor: null })
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('idempotency_key_required'));

    const key = randomUUID();
    const t = expense();
    const first = await sync(token, { cursor: null, transactions: [t] }, key).expect(200);
    const replay = await sync(token, { cursor: null, transactions: [] }, key).expect(200);
    expect(replay.body).toEqual(first.body);
  });

  it('rejects invalid records with field errors', async () => {
    const { token } = await login('+998901234567');
    const res = await sync(token, {
      cursor: null,
      transactions: [expense({ necessity: null, amountMinor: 1.5 })],
    }).expect(400);
    expect(res.body.code).toBe('validation_failed');
  });
});

describe('settings and history', () => {
  it('returns defaults, then saved settings', async () => {
    const { token } = await login('+998901234567');
    const auth = { Authorization: `Bearer ${token}` };
    const defaults = await request(app.getHttpServer())
      .get('/v1/me/settings')
      .set(auth)
      .expect(200);
    expect(defaults.body).toEqual({
      reserveMinor: 100_000_000,
      inflationRate: null,
      returnRate: null,
    });

    const saved = await request(app.getHttpServer())
      .put('/v1/me/settings')
      .set(auth)
      .send({ reserveMinor: 200_000_000, inflationRate: 0.1, returnRate: 0.18 })
      .expect(200);
    expect(saved.body).toEqual({ reserveMinor: 200_000_000, inflationRate: 0.1, returnRate: 0.18 });
  });

  it('lists transactions newest first with a cursor and filters', async () => {
    const { token } = await login('+998901234567');
    const days = ['2026-11-15', '2026-11-16', '2026-11-17'];
    await sync(token, {
      cursor: null,
      transactions: [
        ...days.map((d) => expense({ occurredOn: d })),
        expense({
          type: 'income_active',
          category: 'salary',
          necessity: null,
          occurredOn: '2026-11-10',
        }),
      ],
    }).expect(200);

    const auth = { Authorization: `Bearer ${token}` };
    const page1 = await request(app.getHttpServer())
      .get('/v1/transactions?type=expense&limit=2')
      .set(auth)
      .expect(200);
    expect(page1.body.items.map((t: { occurredOn: string }) => t.occurredOn)).toEqual([
      '2026-11-17',
      '2026-11-16',
    ]);
    const page2 = await request(app.getHttpServer())
      .get(`/v1/transactions?type=expense&limit=2&cursor=${page1.body.nextCursor}`)
      .set(auth)
      .expect(200);
    expect(page2.body.items.map((t: { occurredOn: string }) => t.occurredOn)).toEqual([
      '2026-11-15',
    ]);
    expect(page2.body.nextCursor).toBeNull();

    const range = await request(app.getHttpServer())
      .get('/v1/transactions?from=2026-11-01&to=2026-11-12')
      .set(auth)
      .expect(200);
    expect(range.body.items).toHaveLength(1);
    expect(range.body.items[0].type).toBe('income_active');
  });
});
