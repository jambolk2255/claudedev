import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { inviteUserSchema, paginationSchema, updateProfileSchema, updateUserSchema } from "@stockflow/schemas";
import type { z } from "zod";
import { Ctx, CurrentUser, RequirePermissions } from "../../common/decorators";
import type { RequestContext, RequestUser } from "../../common/request-user";
import { ZodPipe } from "../../common/zod.pipe";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions("users.view")
  list(@CurrentUser() user: RequestUser, @Query(new ZodPipe(paginationSchema)) q: z.infer<typeof paginationSchema>) {
    return this.users.list(user.organizationId, q);
  }

  @Patch("me")
  updateProfile(@Ctx() ctx: RequestContext, @Body(new ZodPipe(updateProfileSchema)) body: z.infer<typeof updateProfileSchema>) {
    return this.users.updateProfile(ctx, body);
  }

  @Get("invitations")
  @RequirePermissions("users.view")
  invitations(@CurrentUser() user: RequestUser) {
    return this.users.listInvitations(user.organizationId);
  }

  @Post("invitations")
  @RequirePermissions("users.invite")
  invite(@Ctx() ctx: RequestContext, @Body(new ZodPipe(inviteUserSchema)) body: z.infer<typeof inviteUserSchema>) {
    return this.users.invite(ctx, body.email, body.roleId);
  }

  @Delete("invitations/:id")
  @HttpCode(204)
  @RequirePermissions("users.invite")
  revokeInvitation(@Ctx() ctx: RequestContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.users.revokeInvitation(ctx, id);
  }

  @Patch(":id")
  @RequirePermissions("users.manage")
  update(@Ctx() ctx: RequestContext, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(updateUserSchema)) body: z.infer<typeof updateUserSchema>) {
    return this.users.update(ctx, id, body);
  }
}
