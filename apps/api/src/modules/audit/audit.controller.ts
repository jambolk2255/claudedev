import { Controller, Get, Query } from "@nestjs/common";
import { paginationSchema } from "@stockflow/schemas";
import { z } from "zod";
import { CurrentUser, RequirePermissions } from "../../common/decorators";
import type { RequestUser } from "../../common/request-user";
import { ZodPipe } from "../../common/zod.pipe";
import { PrismaService } from "../../prisma/prisma.service";

const auditQuerySchema = paginationSchema.extend({ entity: z.string().max(50).optional() });

@Controller("audit")
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions("audit.view")
  async list(@CurrentUser() user: RequestUser, @Query(new ZodPipe(auditQuerySchema)) q: z.infer<typeof auditQuerySchema>) {
    const db = this.prisma.tenant(user.organizationId);
    const where = {
      ...(q.entity ? { entity: q.entity } : {}),
      ...(q.search ? { action: { contains: q.search, mode: "insensitive" as const } } : {}),
    };
    const [items, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      db.auditLog.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
}
