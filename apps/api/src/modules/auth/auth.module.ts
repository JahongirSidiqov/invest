import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { ConsoleSmsSender, SMS_SENDER } from './sms';
import { TokenService } from './token.service';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    TokenService,
    AuthGuard,
    // Replace with the real adapter once [SMS_PROVIDER] is chosen; env validation
    // already refuses the console sender in production.
    { provide: SMS_SENDER, useClass: ConsoleSmsSender },
  ],
  exports: [AuthGuard, TokenService],
})
export class AuthModule {}
