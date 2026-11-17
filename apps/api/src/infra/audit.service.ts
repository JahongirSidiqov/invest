import { Injectable } from '@nestjs/common';
import type { Tx } from './prisma.service';

export interface AuditEntry {
  actorId: string | null;
  actorType: 'user' | 'admin' | 'system';
  action: string;
  entity: string;
  entityId?: string;
  ip?: string;
}

/** Writes to the append-only audit_logs table. Never put PII or amounts in an entry. */
@Injectable()
export class AuditService {
  async record(tx: Tx, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({ data: entry });
  }
}
