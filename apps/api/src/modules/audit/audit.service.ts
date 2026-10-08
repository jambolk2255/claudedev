import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export interface AuditEntry {
  organizationId: string;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
}

const SECRET_KEYS = new Set(["password", "passwordHash", "twoFactorSecret", "tokenHash", "token"]);

function redact(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value, (key, v) => (SECRET_KEYS.has(key) ? "[redacted]" : v))) as Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Writes an audit row. Failures are logged, never thrown, so auditing can't break a request. */
  async record(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    try {
      await client.auditLog.create({
        data: {
          organizationId: entry.organizationId,
          userId: entry.userId ?? null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          before: redact(entry.before),
          after: redact(entry.after),
          ip: entry.ip,
          userAgent: entry.userAgent,
        },
      });
    } catch (err) {
      if (tx) throw err;
      this.logger.error(`Failed to write audit log: ${(err as Error).message}`);
    }
  }
}
