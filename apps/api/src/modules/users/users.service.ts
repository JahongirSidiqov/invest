import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type consentSchema,
  type Locale,
  maskUzPhone,
  type onboardingSchema,
  type updateMeSchema,
} from '@invest/shared';
import type { z } from 'zod';
import { AppError } from '../../common/problem.filter';
import { AuditService } from '../../infra/audit.service';
import { CryptoService } from '../../infra/crypto.service';
import { PrismaService } from '../../infra/prisma.service';

export interface MeView {
  id: string;
  name: string | null;
  phoneMasked: string;
  locale: Locale;
  incomeRange: string | null;
  goal: string | null;
  halalPref: string | null;
  riskProfile: string | null;
  planTier: string;
  onboarded: boolean;
}

export interface ConsentView {
  type: string;
  version: string;
  grantedAt: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  getMe(userId: string): Promise<MeView> {
    return this.prisma.asUser(userId, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || user.deletedAt) throw new AppError(HttpStatus.NOT_FOUND, 'user_not_found');
      return {
        id: user.id,
        name: user.nameEnc ? this.crypto.decrypt(user.nameEnc) : null,
        phoneMasked: maskUzPhone(this.crypto.decrypt(user.phoneEnc)),
        locale: user.locale as Locale,
        incomeRange: user.incomeRange,
        goal: user.goal,
        halalPref: user.halalPref,
        riskProfile: user.riskProfile,
        planTier: user.planTier,
        onboarded: user.onboardedAt !== null,
      };
    });
  }

  async updateMe(userId: string, input: z.output<typeof updateMeSchema>): Promise<MeView> {
    await this.prisma.asUser(userId, (tx) =>
      tx.user.update({
        where: { id: userId },
        data: {
          ...(input.name !== undefined ? { nameEnc: this.crypto.encrypt(input.name) } : {}),
          ...(input.locale !== undefined ? { locale: input.locale } : {}),
        },
      }),
    );
    return this.getMe(userId);
  }

  async saveOnboarding(userId: string, input: z.output<typeof onboardingSchema>): Promise<MeView> {
    await this.prisma.asUser(userId, (tx) =>
      tx.user.update({
        where: { id: userId },
        data: {
          incomeRange: input.incomeRange,
          goal: input.goal,
          halalPref: input.halalPref,
          onboardedAt: new Date(),
        },
      }),
    );
    return this.getMe(userId);
  }

  /** Granting adds a history row; revoking closes the open one. History is never deleted. */
  setConsent(
    userId: string,
    input: z.output<typeof consentSchema>,
    ip: string,
  ): Promise<ConsentView[]> {
    return this.prisma.asUser(userId, async (tx) => {
      const open = await tx.consent.findFirst({
        where: { userId, type: input.type, revokedAt: null },
        orderBy: { grantedAt: 'desc' },
      });
      const changed = input.granted ? !open || open.version !== input.version : open !== null;

      if (changed) {
        if (open) {
          await tx.consent.update({ where: { id: open.id }, data: { revokedAt: new Date() } });
        }
        if (input.granted) {
          await tx.consent.create({ data: { userId, type: input.type, version: input.version } });
        }
        await this.audit.record(tx, {
          actorId: userId,
          actorType: 'user',
          action: input.granted ? 'consent_granted' : 'consent_revoked',
          entity: 'consents',
          entityId: `${input.type}@${input.version}`,
          ip,
        });
      }

      const active = await tx.consent.findMany({
        where: { userId, revokedAt: null },
        orderBy: { type: 'asc' },
      });
      return active.map((c) => ({
        type: c.type,
        version: c.version,
        grantedAt: c.grantedAt.toISOString(),
      }));
    });
  }
}
