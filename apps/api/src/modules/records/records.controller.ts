import { Body, Controller, Get, Headers, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  CATEGORY_KINDS,
  NECESSITY,
  SYNC_ENTITIES,
  type SyncEntity,
  syncAssetSchema,
  syncCategorySchema,
  syncLiabilitySchema,
  syncRequestSchema,
  syncTransactionSchema,
  syncValuationSchema,
} from '@invest/shared';
import { z } from 'zod';
import { bodySchema, responseSchema, ZodPipe } from '../../common/zod';
import { Auth, AuthGuard } from '../auth/auth.guard';
import type { AccessClaims } from '../auth/token.service';
import { type ListQuery, listQuerySchema, RecordsService } from './records.service';
import { type ParsedSyncRequest, SyncService } from './sync.service';

const categoryView = z.object({
  ref: z.string(),
  builtIn: z.boolean(),
  kind: z.enum(CATEGORY_KINDS),
  name: z.string().nullable(),
  necessity: z.enum(NECESSITY).nullable(),
  icon: z.string().nullable(),
});

const transactionPage = z.object({
  items: z.array(syncTransactionSchema),
  nextCursor: z.string().nullable(),
});

const entityLists = <T extends z.ZodType>(item: T) =>
  z.object(
    Object.fromEntries(SYNC_ENTITIES.map((e) => [e, z.array(item)])) as Record<
      SyncEntity,
      z.ZodArray<T>
    >,
  );

const syncResponse = z.object({
  cursor: z.string(),
  hasMore: z.boolean(),
  accepted: entityLists(z.uuid()),
  rejected: z.array(
    z.object({ entity: z.enum(SYNC_ENTITIES), clientId: z.uuid(), code: z.string() }),
  ),
  changes: z.object({
    category: z.array(syncCategorySchema),
    asset: z.array(syncAssetSchema),
    liability: z.array(syncLiabilitySchema),
    valuation: z.array(syncValuationSchema),
    transaction: z.array(syncTransactionSchema),
  }),
});

const wealthView = z.object({
  positions: z.array(
    z.object({
      asset: syncAssetSchema,
      currentValueMinor: z.number().int(),
      valuedOn: z.iso.date(),
      investedMinor: z.number().int(),
      withdrawnDividendsMinor: z.number().int(),
      capitalisedDividendsMinor: z.number().int(),
      gainMinor: z.number().int(),
      roi: z.number().nullable(),
    }),
  ),
  summary: z.object({
    liquidMinor: z.number().int(),
    productiveMinor: z.number().int(),
    liabilitiesMinor: z.number().int(),
    netWorthMinor: z.number().int(),
    waitingToInvestMinor: z.number().int(),
  }),
});

@ApiTags('records')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class RecordsController {
  constructor(
    private readonly records: RecordsService,
    private readonly syncService: SyncService,
  ) {}

  @Get('categories')
  @ApiOkResponse({ schema: responseSchema(z.array(categoryView)) })
  listCategories(@Auth() auth: AccessClaims) {
    return this.records.listCategories(auth.userId);
  }

  @Get('transactions')
  @ApiOkResponse({ schema: responseSchema(transactionPage) })
  listTransactions(
    @Auth() auth: AccessClaims,
    @Query(new ZodPipe(listQuerySchema)) query: ListQuery,
  ) {
    return this.records.listTransactions(auth.userId, query);
  }

  /** Asset positions and net worth, computed with the same shared code as the phone. */
  @Get('assets')
  @ApiOkResponse({ schema: responseSchema(wealthView) })
  wealth(@Auth() auth: AccessClaims) {
    return this.records.wealth(auth.userId);
  }

  /**
   * The single write path for every syncable entity. Offline clients push
   * pending changes and pull everything newer than their cursor.
   */
  @Post('sync')
  @HttpCode(200)
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: '8–64 chars [A-Za-z0-9_-]' })
  @ApiBody({ schema: bodySchema(syncRequestSchema) })
  @ApiOkResponse({ schema: responseSchema(syncResponse) })
  sync(
    @Auth() auth: AccessClaims,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodPipe(syncRequestSchema)) body: ParsedSyncRequest,
  ) {
    return this.syncService.syncIdempotent(auth.userId, idempotencyKey, body);
  }
}
