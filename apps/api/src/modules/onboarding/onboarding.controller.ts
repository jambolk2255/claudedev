import { Body, Controller, Get, HttpCode, Param, ParseEnumPipe, Post, Put } from "@nestjs/common";
import { ONBOARDING_STEPS, type OnboardingStep } from "@stockflow/schemas";
import { Ctx, CurrentUser, RequirePermissions } from "../../common/decorators";
import type { RequestContext, RequestUser } from "../../common/request-user";
import { OnboardingService } from "./onboarding.service";

const STEP_ENUM = Object.fromEntries(ONBOARDING_STEPS.map((s) => [s, s]));

@Controller("onboarding")
@RequirePermissions("organization.manage")
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  state(@CurrentUser() user: RequestUser) {
    return this.onboarding.getState(user.organizationId);
  }

  @Put(":step")
  save(@CurrentUser() user: RequestUser, @Param("step", new ParseEnumPipe(STEP_ENUM)) step: OnboardingStep, @Body() body: unknown) {
    return this.onboarding.saveStep(user.organizationId, step, body);
  }

  @Post("complete")
  @HttpCode(200)
  complete(@Ctx() ctx: RequestContext) {
    return this.onboarding.complete(ctx);
  }
}
