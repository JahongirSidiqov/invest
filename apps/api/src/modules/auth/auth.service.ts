import { Injectable } from '@nestjs/common';
import type { Locale, TokenPair } from '@invest/shared';
import { AuditService } from '../../infra/audit.service';
import { CryptoService } from '../../infra/crypto.service';
import { PrismaService } from '../../infra/prisma.service';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';

export interface LoginResult extends TokenPair {
  userId: string;
  isNewUser: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  requestOtp(phone: string, locale: Locale, ip: string) {
    return this.otp.request(phone, locale, ip);
  }

  async verifyOtp(
    phone: string,
    code: string,
    device: { platform: string; name?: string | undefined },
    locale: Locale,
    ip: string,
  ): Promise<LoginResult> {
    await this.otp.verify(phone, code);
    const phoneHash = this.crypto.hmac(phone);

    // System context: the user is not known until the phone hash is looked up.
    return this.prisma.asSystem(async (tx) => {
      let user = await tx.user.findUnique({ where: { phoneHash } });
      const isNewUser = !user;
      if (!user) {
        user = await tx.user.create({
          data: { phoneHash, phoneEnc: this.crypto.encrypt(phone), locale },
        });
      } else if (user.deletedAt) {
        // Logging in during the 30-day grace period restores the account.
        user = await tx.user.update({ where: { id: user.id }, data: { deletedAt: null } });
      }

      const created = await tx.device.create({
        data: { userId: user.id, platform: device.platform, name: device.name ?? null },
      });
      await this.audit.record(tx, {
        actorId: user.id,
        actorType: 'user',
        action: isNewUser ? 'signup' : 'login',
        entity: 'devices',
        entityId: created.id,
        ip,
      });
      const pair = await this.tokens.issue(tx, user.id, created.id);
      return { ...pair, userId: user.id, isNewUser };
    });
  }

  refresh(refreshToken: string, ip: string) {
    return this.tokens.rotate(refreshToken, ip);
  }

  logout(userId: string, deviceId: string) {
    return this.prisma.asUser(userId, (tx) => this.tokens.revokeDevice(tx, userId, deviceId));
  }

  logoutAll(userId: string, ip: string) {
    return this.prisma.asUser(userId, async (tx) => {
      await this.tokens.revokeAll(tx, userId);
      await this.audit.record(tx, {
        actorId: userId,
        actorType: 'user',
        action: 'logout_all',
        entity: 'users',
        entityId: userId,
        ip,
      });
    });
  }
}
