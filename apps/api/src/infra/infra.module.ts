import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { ENV, loadEnv, type Env } from '../config/env';
import { AuditService } from './audit.service';
import { CryptoService } from './crypto.service';
import { PrismaService } from './prisma.service';
import { REDIS, type RedisLike } from './redis';

@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: () => loadEnv() },
    {
      provide: REDIS,
      inject: [ENV],
      useFactory: (env: Env): RedisLike => new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 }),
    },
    PrismaService,
    CryptoService,
    AuditService,
  ],
  exports: [ENV, REDIS, PrismaService, CryptoService, AuditService],
})
export class InfraModule implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: RedisLike) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
