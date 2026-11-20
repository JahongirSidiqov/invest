import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { SMS_SENDER, type SmsSender } from '../src/modules/auth/sms';

export class CapturingSms implements SmsSender {
  readonly codes = new Map<string, string>();
  async sendOtp(phone: string, code: string): Promise<void> {
    this.codes.set(phone, code);
  }
}

export async function createTestApp(): Promise<{ app: INestApplication; sms: CapturingSms }> {
  const sms = new CapturingSms();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_SENDER)
    .useValue(sms)
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return { app, sms };
}

/** Empties tables (as owner, bypassing RLS) and the test Redis database. */
export async function resetState(): Promise<void> {
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  await pg.query(
    'TRUNCATE users, devices, refresh_tokens, consents, audit_logs, user_settings, categories, transactions, assets, asset_valuations, liabilities RESTART IDENTITY CASCADE',
  );
  await pg.end();
  const redis = new Redis(process.env.REDIS_URL!);
  await redis.flushdb();
  await redis.quit();
}

/** Runs SQL as the database owner, for assertions that must see every row. */
export async function ownerQuery<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
) {
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  try {
    return (await pg.query<T>(sql, params)).rows;
  } finally {
    await pg.end();
  }
}
