import { Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import { categoryInputSchema, unitInputSchema } from "@stockflow/schemas";
import type { z } from "zod";
import { Ctx, CurrentUser, RequirePermissions } from "../../common/decorators";
import type { RequestContext, RequestUser } from "../../common/request-user";
import { ZodPipe } from "../../common/zod.pipe";
import { PrismaService } from "../../prisma/prisma.service";

type CategoryInput = z.infer<typeof categoryInputSchema>;
type UnitInput = z.infer<typeof unitInputSchema>;

/** Categories, units and tax rates used when defining products. */
@Controller()
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("categories")
  @RequirePermissions("products.view")
  categories(@CurrentUser() user: RequestUser) {
    return this.prisma.tenant(user.organizationId).category.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { products: true } } } });
  }

  @Post("categories")
  @RequirePermissions("products.manage")
  createCategory(@Ctx() ctx: RequestContext, @Body(new ZodPipe(categoryInputSchema)) body: CategoryInput) {
    return this.prisma
      .tenant(ctx.user.organizationId)
      .category.create({ data: { organizationId: ctx.user.organizationId, name: body.name, parentId: body.parentId ?? null } });
  }

  @Put("categories/:id")
  @RequirePermissions("products.manage")
  async updateCategory(@Ctx() ctx: RequestContext, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(categoryInputSchema)) body: CategoryInput) {
    return this.prisma.tenant(ctx.user.organizationId).category.update({ where: { id }, data: { name: body.name, parentId: body.parentId ?? null } });
  }

  @Delete("categories/:id")
  @HttpCode(204)
  @RequirePermissions("products.manage")
  async deleteCategory(@Ctx() ctx: RequestContext, @Param("id", ParseUUIDPipe) id: string) {
    const db = this.prisma.tenant(ctx.user.organizationId);
    const cat = await db.category.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
    if (!cat) throw new NotFoundException();
    if (cat._count.products) throw new ConflictException({ code: "IN_USE", message: "Move products to another category first" });
    await db.category.delete({ where: { id } });
  }

  @Get("units")
  @RequirePermissions("products.view")
  units(@CurrentUser() user: RequestUser) {
    return this.prisma.tenant(user.organizationId).unit.findMany({ orderBy: { code: "asc" } });
  }

  @Post("units")
  @RequirePermissions("products.manage")
  createUnit(@Ctx() ctx: RequestContext, @Body(new ZodPipe(unitInputSchema)) body: UnitInput) {
    return this.prisma.tenant(ctx.user.organizationId).unit.create({ data: { organizationId: ctx.user.organizationId, ...body } });
  }

  @Get("tax-rates")
  @RequirePermissions("products.view")
  taxRates(@CurrentUser() user: RequestUser) {
    return this.prisma.tenant(user.organizationId).taxRate.findMany({ where: { active: true }, orderBy: { code: "asc" } });
  }
}
