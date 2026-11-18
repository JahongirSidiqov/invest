import { Body, Controller, Get, HttpCode, Ip, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { consentSchema, LOCALES, onboardingSchema, updateMeSchema } from '@invest/shared';
import { z } from 'zod';
import { bodySchema, responseSchema, ZodPipe } from '../../common/zod';
import { Auth, AuthGuard } from '../auth/auth.guard';
import type { AccessClaims } from '../auth/token.service';
import { UsersService } from './users.service';

const meView = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  phoneMasked: z.string(),
  locale: z.enum(LOCALES),
  incomeRange: z.string().nullable(),
  goal: z.string().nullable(),
  halalPref: z.string().nullable(),
  riskProfile: z.string().nullable(),
  planTier: z.string(),
  onboarded: z.boolean(),
});
const consentList = z.array(
  z.object({ type: z.string(), version: z.string(), grantedAt: z.iso.datetime() }),
);

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOkResponse({ schema: responseSchema(meView) })
  getMe(@Auth() auth: AccessClaims) {
    return this.users.getMe(auth.userId);
  }

  @Patch()
  @ApiBody({ schema: bodySchema(updateMeSchema) })
  @ApiOkResponse({ schema: responseSchema(meView) })
  updateMe(
    @Auth() auth: AccessClaims,
    @Body(new ZodPipe(updateMeSchema)) body: z.output<typeof updateMeSchema>,
  ) {
    return this.users.updateMe(auth.userId, body);
  }

  @Put('onboarding')
  @ApiBody({ schema: bodySchema(onboardingSchema) })
  @ApiOkResponse({ schema: responseSchema(meView) })
  saveOnboarding(
    @Auth() auth: AccessClaims,
    @Body(new ZodPipe(onboardingSchema)) body: z.output<typeof onboardingSchema>,
  ) {
    return this.users.saveOnboarding(auth.userId, body);
  }

  @Post('consents')
  @HttpCode(200)
  @ApiBody({ schema: bodySchema(consentSchema) })
  @ApiOkResponse({ schema: responseSchema(consentList) })
  setConsent(
    @Auth() auth: AccessClaims,
    @Body(new ZodPipe(consentSchema)) body: z.output<typeof consentSchema>,
    @Ip() ip: string,
  ) {
    return this.users.setConsent(auth.userId, body, ip);
  }
}
