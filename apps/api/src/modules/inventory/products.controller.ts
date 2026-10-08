import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { paginationSchema, productInputSchema, type ProductInput } from "@stockflow/schemas";
import { z } from "zod";
import { Ctx, CurrentUser, RequirePermissions } from "../../common/decorators";
import type { RequestContext, RequestUser } from "../../common/request-user";
import { ZodPipe } from "../../common/zod.pipe";
import { ProductsService } from "./products.service";

const listQuery = paginationSchema.extend({
  categoryId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  stock: z.enum(["all", "low", "out", "in"]).default("all"),
  active: z.enum(["true", "false", "all"]).default("true"),
});

@Controller("products")
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermissions("products.view")
  list(@CurrentUser() user: RequestUser, @Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) {
    return this.products.list(user.organizationId, q);
  }

  @Get("lookup")
  @RequirePermissions("products.view")
  lookup(@CurrentUser() user: RequestUser, @Query(new ZodPipe(z.object({ code: z.string().trim().min(1).max(64) }))) q: { code: string }) {
    return this.products.lookup(user.organizationId, q.code);
  }

  @Get(":id")
  @RequirePermissions("products.view")
  get(@CurrentUser() user: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.products.get(user.organizationId, id);
  }

  @Post()
  @RequirePermissions("products.manage")
  create(@Ctx() ctx: RequestContext, @Body(new ZodPipe(productInputSchema)) body: ProductInput) {
    return this.products.create(ctx, body);
  }

  @Put(":id")
  @RequirePermissions("products.manage")
  update(@Ctx() ctx: RequestContext, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(productInputSchema)) body: ProductInput) {
    return this.products.update(ctx, id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermissions("products.manage")
  remove(@Ctx() ctx: RequestContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.products.remove(ctx, id);
  }
}
