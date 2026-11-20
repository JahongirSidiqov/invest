import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { RecordsController } from './records.controller';
import { RecordsService } from './records.service';
import { SyncService } from './sync.service';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [RecordsController],
  providers: [RecordsService, SyncService],
  exports: [RecordsService],
})
export class RecordsModule {}
