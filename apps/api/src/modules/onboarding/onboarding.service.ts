import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  DEFAULT_DOCUMENT_PREFIXES,
  INDUSTRY_PRESETS,
  ONBOARDING_STEPS,
  SRI_LANKA_TAX_PRESETS,
  normalizeModules,
  onboardingStepSchemas,
  type OnboardingData,
  type OnboardingState,
  type OnboardingStep,
} from "@stockflow/schemas";
import { env } from "../../config/env";
import { randomToken, sha256 } from "../../common/crypto";
import type { RequestContext } from "../../common/request-user";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

/** Steps that must be saved before onboarding can be completed. The rest have defaults. */
const REQUIRED_STEPS: OnboardingStep[] = ["company", "industry", "modules", "finance", "warehouses"];

interface StoredState {
  currentStep?: OnboardingStep;
  completedSteps?: OnboardingStep[];
  data?: OnboardingData;
}

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getState(orgId: string): Promise<OnboardingState> {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    const stored = (org.onboardingState ?? {}) as StoredState;
    const data: OnboardingData = { ...stored.data };
    // Pre-fill the first step from the company created at registration.
    data.company ??= { name: org.name, country: org.country };
    return {
      currentStep: stored.currentStep ?? "company",
      completedSteps: stored.completedSteps ?? [],
      data,
      completed: org.onboardingCompletedAt !== null,
    };
  }

  async saveStep(orgId: string, step: OnboardingStep, payload: unknown): Promise<OnboardingState> {
    const parsed = onboardingStepSchemas[step].safeParse(payload);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Validation failed",
        code: "VALIDATION_ERROR",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const state = await this.getState(orgId);
    if (state.completed) throw new ConflictException({ message: "Onboarding is already completed", code: "ONBOARDING_DONE" });

    const index = ONBOARDING_STEPS.indexOf(step);
    const next: StoredState = {
      data: { ...state.data, [step]: parsed.data },
      completedSteps: Array.from(new Set([...state.completedSteps, step])),
      currentStep: ONBOARDING_STEPS[Math.min(index + 1, ONBOARDING_STEPS.length - 1)],
    };
    await this.prisma.organization.update({ where: { id: orgId }, data: { onboardingState: next as Prisma.InputJsonValue } });
    return { ...state, ...next, data: next.data!, completedSteps: next.completedSteps!, currentStep: next.currentStep! };
  }

  /** Applies every saved step in one transaction and marks the organization as ready. */
  async complete(ctx: RequestContext) {
    const orgId = ctx.user.organizationId;
    const state = await this.getState(orgId);
    if (state.completed) throw new ConflictException({ message: "Onboarding is already completed", code: "ONBOARDING_DONE" });
    const missing = REQUIRED_STEPS.filter((s) => !state.completedSteps.includes(s));
    if (missing.length) throw new BadRequestException({ message: "Some steps are not finished", code: "ONBOARDING_INCOMPLETE", missing });

    const { company, industry, modules, finance, warehouses, numbering, team, data } = state.data as Required<OnboardingData>;
    const preset = INDUSTRY_PRESETS[industry.industry];
    const invites: { email: string; inviteUrl: string }[] = [];

    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: orgId },
        data: {
          ...company,
          industry: industry.industry,
          mode: modules.mode,
          modules: normalizeModules(modules.mode, modules.modules),
          currency: finance.currency,
          fiscalYearStartMonth: finance.fiscalYearStartMonth,
          valuationMethod: finance.valuationMethod,
          allowNegativeStock: finance.allowNegativeStock,
          onboardingCompletedAt: new Date(),
        },
      });

      const hasDefault = warehouses.warehouses.some((w) => w.isDefault);
      for (const [i, w] of warehouses.warehouses.entries()) {
        const row = {
          name: w.name,
          address: w.address ?? null,
          latitude: w.latitude ?? null,
          longitude: w.longitude ?? null,
          isDefault: hasDefault ? w.isDefault : i === 0,
        };
        await tx.warehouse.upsert({
          where: { organizationId_code: { organizationId: orgId, code: w.code } },
          create: { organizationId: orgId, code: w.code, ...row },
          update: row,
        });
      }

      const taxes = SRI_LANKA_TAX_PRESETS.map((t) => ({
        ...t,
        rate: t.code === "VAT" ? finance.vatRate : t.code === "SSCL" ? finance.ssclRate : t.rate,
        active: t.code === "VAT" ? finance.vatRegistered : t.code === "SSCL" ? finance.ssclEnabled : true,
      }));
      for (const t of taxes) {
        await tx.taxRate.upsert({
          where: { organizationId_code: { organizationId: orgId, code: t.code } },
          create: { organizationId: orgId, code: t.code, name: t.name, rate: t.rate, active: t.active },
          update: { rate: t.rate, active: t.active },
        });
      }

      const prefixes = { ...DEFAULT_DOCUMENT_PREFIXES, ...(numbering?.prefixes ?? {}) };
      for (const [type, prefix] of Object.entries(prefixes)) {
        const settings = { prefix, includeYear: numbering?.includeYear ?? true, padding: numbering?.padding ?? 5 };
        await tx.documentSequence.upsert({
          where: { organizationId_type: { organizationId: orgId, type } },
          create: { organizationId: orgId, type, ...settings },
          update: settings,
        });
      }

      await tx.category.createMany({ data: preset.categories.map((name) => ({ organizationId: orgId, name })), skipDuplicates: true });
      await tx.unit.createMany({ data: preset.units.map((code) => ({ organizationId: orgId, code, name: code })), skipDuplicates: true });

      if (team?.invites.length) {
        const roles = await tx.role.findMany({ where: { organizationId: orgId } });
        for (const invite of team.invites) {
          const role = roles.find((r) => r.key === invite.roleKey && r.key !== "owner");
          if (!role) continue;
          const existing = await tx.user.findUnique({ where: { email: invite.email }, select: { id: true } });
          if (existing) continue;
          const token = randomToken(32);
          await tx.invitation.create({
            data: {
              organizationId: orgId,
              email: invite.email,
              roleId: role.id,
              tokenHash: sha256(token),
              invitedById: ctx.user.id,
              expiresAt: new Date(Date.now() + 7 * 86_400_000),
            },
          });
          invites.push({ email: invite.email, inviteUrl: `${env().WEB_URL}/invite/${token}` });
        }
      }

      await this.audit.record(
        {
          organizationId: orgId,
          userId: ctx.user.id,
          action: "onboarding.completed",
          entity: "Organization",
          entityId: orgId,
          after: { industry: industry.industry, mode: modules.mode, warehouses: warehouses.warehouses.length, start: data?.start ?? "empty" },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
    });

    return { completed: true, invites };
  }
}
