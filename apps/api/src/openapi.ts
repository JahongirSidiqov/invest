import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { buildOpenApi, configureApp } from './bootstrap';
import { ENV } from './config/env';
import { PrismaService } from './infra/prisma.service';
import { REDIS } from './infra/redis';

/**
 * Writes apps/api/openapi.json from the controllers. No database or Redis needed.
 * CI regenerates it and fails if the committed file differs.
 */
async function generate(): Promise<void> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue({
      JWT_SECRET: 'openapi-generation-only-not-a-real-secret',
      PII_ENC_KEY: Buffer.alloc(32).toString('base64'),
      PII_HASH_KEY: Buffer.alloc(32).toString('base64'),
    })
    .overrideProvider(PrismaService)
    .useValue({})
    .overrideProvider(REDIS)
    .useValue({ quit: async () => 'OK' })
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  const doc = buildOpenApi(app);
  writeFileSync(join(__dirname, '..', 'openapi.json'), `${JSON.stringify(doc, null, 2)}\n`);
  await app.close();
}

void generate();
