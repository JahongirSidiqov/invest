import { Injectable } from '@nestjs/common';
import { DEFAULT_SETTINGS, type Settings } from '@invest/shared';
import { PrismaService } from '../../infra/prisma.service';
import { toSafeNumber } from '../records/mappers';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the defaults until the user saves settings for the first time. */
  get(userId: string): Promise<Settings> {
    return this.prisma.asUser(userId, async (tx) => {
      const row = await tx.userSettings.findUnique({ where: { userId } });
      if (!row) return DEFAULT_SETTINGS;
      return {
        reserveMinor: toSafeNumber(row.reserveMinor),
        inflationRate: row.inflationRate === null ? null : Number(row.inflationRate),
        returnRate: row.returnRate === null ? null : Number(row.returnRate),
      };
    });
  }

  async put(userId: string, settings: Settings): Promise<Settings> {
    const data = {
      reserveMinor: BigInt(settings.reserveMinor),
      inflationRate: settings.inflationRate,
      returnRate: settings.returnRate,
    };
    await this.prisma.asUser(userId, (tx) =>
      tx.userSettings.upsert({ where: { userId }, create: { userId, ...data }, update: data }),
    );
    return this.get(userId);
  }
}
