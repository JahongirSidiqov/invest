import { Body, Controller, HttpCode, Ip, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { otpRequestSchema, otpVerifySchema, refreshSchema } from '@invest/shared';
import { z } from 'zod';
import { bodySchema, responseSchema, ZodPipe } from '../../common/zod';
import { Auth, AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import type { AccessClaims } from './token.service';

const verifyBody = otpVerifySchema.extend({
  locale: otpRequestSchema.shape.locale,
});

const tokenPair = z.object({
  accessToken: z.string(),
  accessTokenExpiresIn: z.number().int(),
  refreshToken: z.string(),
  refreshTokenExpiresIn: z.number().int(),
});
const loginResult = tokenPair.extend({ userId: z.uuid(), isNewUser: z.boolean() });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('otp/request')
  @HttpCode(200)
  @ApiBody({ schema: bodySchema(otpRequestSchema) })
  @ApiOkResponse({ schema: responseSchema(z.object({ resendIn: z.number().int() })) })
  requestOtp(
    @Body(new ZodPipe(otpRequestSchema)) body: z.output<typeof otpRequestSchema>,
    @Ip() ip: string,
  ) {
    return this.auth.requestOtp(body.phone, body.locale, ip);
  }

  @Post('otp/verify')
  @HttpCode(200)
  @ApiBody({ schema: bodySchema(verifyBody) })
  @ApiOkResponse({ schema: responseSchema(loginResult) })
  verifyOtp(@Body(new ZodPipe(verifyBody)) body: z.output<typeof verifyBody>, @Ip() ip: string) {
    return this.auth.verifyOtp(body.phone, body.code, body.device, body.locale, ip);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiBody({ schema: bodySchema(refreshSchema) })
  @ApiOkResponse({ schema: responseSchema(tokenPair) })
  refresh(
    @Body(new ZodPipe(refreshSchema)) body: z.output<typeof refreshSchema>,
    @Ip() ip: string,
  ) {
    return this.auth.refresh(body.refreshToken, ip);
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  async logout(@Auth() auth: AccessClaims): Promise<void> {
    await this.auth.logout(auth.userId, auth.deviceId);
  }

  @Post('logout-all')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  async logoutAll(@Auth() auth: AccessClaims, @Ip() ip: string): Promise<void> {
    await this.auth.logoutAll(auth.userId, ip);
  }
}
