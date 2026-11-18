import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { TokenPair } from '@invest/shared';
import { jwtVerify, SignJWT } from 'jose';
import { AppError } from '../../common/problem.filter';
import { ENV, type Env } from '../../config/env';
import { AuditService } from '../../infra/audit.service';
import { CryptoService } from '../../infra/crypto.service';
import { PrismaService, type Tx } from '../../infra/prisma.service';

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 30 * 24 * 3600;
const ISSUER = 'invest-api';

export interface AccessClaims {
  userId: string;
  deviceId: string;
}

@Injectable()
export class TokenService {
  private readonly key: Uint8Array;

  constructor(
    @Inject(ENV) env: Pick<Env, 'JWT_SECRET'>,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {
    this.key = new TextEncoder().encode(env.JWT_SECRET);
  }

  /** Issues a fresh pair inside the caller's transaction. */
  async issue(tx: Tx, userId: string, deviceId: string, rotatedFrom?: string): Promise<TokenPair> {
    const refreshToken = this.crypto.randomToken();
    await tx.refreshToken.create({
      data: {
        userId,
        deviceId,
        tokenHash: this.crypto.sha256(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
        rotatedFrom: rotatedFrom ?? null,
      },
    });
    const accessToken = await new SignJWT({ did: deviceId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
      .sign(this.key);
    return {
      accessToken,
      accessTokenExpiresIn: ACCESS_TTL_SECONDS,
      refreshToken,
      refreshTokenExpiresIn: REFRESH_TTL_SECONDS,
    };
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        algorithms: ['HS256'],
      });
      if (typeof payload.sub !== 'string' || typeof payload.did !== 'string') throw new Error();
      return { userId: payload.sub, deviceId: payload.did };
    } catch {
      throw new AppError(HttpStatus.UNAUTHORIZED, 'invalid_token');
    }
  }

  /**
   * Exchanges a refresh token for a new pair. A token can be used once.
   * Presenting an already-used or revoked token means it leaked, so every
   * session of that user is revoked.
   */
  async rotate(refreshToken: string, ip?: string): Promise<TokenPair> {
    const tokenHash = this.crypto.sha256(refreshToken);

    type Outcome = { error: 'invalid_token' | 'token_reused' } | { pair: TokenPair };
    const outcome = await this.prisma.asSystem(async (tx): Promise<Outcome> => {
      const current = await tx.refreshToken.findUnique({
        where: { tokenHash },
        include: { device: true },
      });
      if (!current) return { error: 'invalid_token' as const };

      // A token that was already exchanged is being replayed: treat as theft.
      // A token that was only revoked (logout, or an earlier theft response) is just invalid.
      if (current.usedAt) {
        await this.revokeAll(tx, current.userId);
        await this.audit.record(tx, {
          actorId: current.userId,
          actorType: 'system',
          action: 'refresh_token_reuse',
          entity: 'refresh_tokens',
          entityId: current.id,
          ip,
        });
        return { error: 'token_reused' as const };
      }
      if (current.revokedAt || current.expiresAt <= new Date() || current.device.revokedAt) {
        return { error: 'invalid_token' as const };
      }

      // Conditional update: two concurrent refreshes with the same token cannot both win.
      const claimed = await tx.refreshToken.updateMany({
        where: { id: current.id, usedAt: null, revokedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) return { error: 'invalid_token' as const };

      await tx.device.update({
        where: { id: current.deviceId },
        data: { lastSeenAt: new Date() },
      });
      return { pair: await this.issue(tx, current.userId, current.deviceId, current.id) };
    });

    if ('error' in outcome) {
      throw new AppError(HttpStatus.UNAUTHORIZED, outcome.error);
    }
    return outcome.pair;
  }

  async revokeDevice(tx: Tx, userId: string, deviceId: string): Promise<void> {
    const now = new Date();
    await tx.refreshToken.updateMany({
      where: { userId, deviceId, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.device.updateMany({
      where: { id: deviceId, userId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  async revokeAll(tx: Tx, userId: string): Promise<void> {
    const now = new Date();
    await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.device.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
  }
}
