import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { ENV, type Env } from '../config/env';
import { PrismaClient } from '../generated/prisma/client';

export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/**
 * All queries on user-owned tables go through asUser() or asSystem().
 * They open a transaction and set the Postgres settings the RLS policies read:
 *   app.user_id    – the authenticated user; policies only expose that user's rows
 *   app.rls_bypass – 'on' for trusted internal flows that run before a user is known
 *                    (OTP login, refresh-token lookup). Never reachable from request input.
 * A query outside these helpers sees no user rows, which fails closed.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Pick<Env, 'APP_DATABASE_URL'>) {
    super({ adapter: new PrismaPg({ connectionString: env.APP_DATABASE_URL }) });
  }

  asUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
      return fn(tx);
    });
  }

  asSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.rls_bypass', 'on', true)`;
      return fn(tx);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
