import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ProblemFilter } from './common/problem.filter';
import { InfraModule } from './infra/infra.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthController } from './modules/health/health.controller';
import { RecordsModule } from './modules/records/records.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [InfraModule, AuthModule, UsersModule, RecordsModule],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: ProblemFilter }],
})
export class AppModule {}
