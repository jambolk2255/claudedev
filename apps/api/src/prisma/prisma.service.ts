import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";

/**
 * Models that belong to an organization and must always be filtered by it: every model with an
 * `organizationId` column. Derived from the schema so new models can't be forgotten.
 */
export const TENANT_MODELS = new Set<string>(Prisma.dmmf.datamodel.models.filter((m) => m.fields.some((f) => f.name === "organizationId")).map((m) => m.name));

const WHERE_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "upsert",
]);

function scopeArgs(orgId: string, operation: string, args: Record<string, any>) {
  if (WHERE_OPERATIONS.has(operation)) args.where = { ...args.where, organizationId: orgId };
  if (operation === "create") args.data = { ...args.data, organizationId: orgId };
  if (operation === "createMany" || operation === "createManyAndReturn") {
    const rows = Array.isArray(args.data) ? args.data : [args.data];
    args.data = rows.map((row: Record<string, unknown>) => ({ ...row, organizationId: orgId }));
  }
  if (operation === "upsert") args.create = { ...args.create, organizationId: orgId };
  return args;
}

function tenantExtension(orgId: string) {
  return Prisma.defineExtension({
    name: "tenant-scope",
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          return query(scopeArgs(orgId, operation, (args ?? {}) as Record<string, any>) as typeof args);
        },
      },
    },
  });
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly tenants = new Map<string, ReturnType<PrismaService["buildTenant"]>>();

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private buildTenant(orgId: string) {
    return this.$extends(tenantExtension(orgId));
  }

  /**
   * A client that automatically adds `organizationId` to every query on tenant models.
   * Creates must use scalar foreign keys (`roleId`), not nested `connect`.
   */
  tenant(orgId: string) {
    let client = this.tenants.get(orgId);
    if (!client) {
      client = this.buildTenant(orgId);
      this.tenants.set(orgId, client);
    }
    return client;
  }
}

export type TenantClient = ReturnType<PrismaService["tenant"]>;
