import { z } from "zod";
import { CURRENCIES, DOCUMENT_TYPES, INDUSTRIES, VALUATION_METHODS, type DocumentType } from "./presets";
import { MODULE_KEYS } from "./modules";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal("").transform(() => undefined));

export const companyStepSchema = z.object({
  name: z.string().trim().min(2).max(150),
  legalName: optionalText(200),
  registrationNo: optionalText(50),
  vatNo: optionalText(50),
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  phone: optionalText(30),
  address: optionalText(300),
  city: optionalText(100),
  country: z.string().trim().length(2).default("LK"),
});

export const industryStepSchema = z.object({ industry: z.enum(INDUSTRIES) });

export const modulesStepSchema = z.object({
  mode: z.enum(["simple", "advanced"]),
  modules: z.array(z.enum(MODULE_KEYS)).max(MODULE_KEYS.length),
});

export const financeStepSchema = z.object({
  currency: z.enum(CURRENCIES),
  /** Month 1-12 the fiscal year starts. Sri Lanka uses April. */
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  vatRegistered: z.boolean(),
  vatRate: z.number().min(0).max(100),
  ssclEnabled: z.boolean(),
  ssclRate: z.number().min(0).max(100),
  valuationMethod: z.enum(VALUATION_METHODS),
  allowNegativeStock: z.boolean(),
});

export const latitudeSchema = z.number().min(-90).max(90);
export const longitudeSchema = z.number().min(-180).max(180);

export const warehouseInputSchema = z.object({
  name: z.string().trim().min(2).max(100),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,12}$/),
  address: optionalText(300),
  latitude: latitudeSchema.nullable().optional(),
  longitude: longitudeSchema.nullable().optional(),
  isDefault: z.boolean().default(false),
});
export type WarehouseInput = z.infer<typeof warehouseInputSchema>;

export const warehousesStepSchema = z.object({
  warehouses: z
    .array(warehouseInputSchema)
    .min(1)
    .max(50)
    .refine((ws) => new Set(ws.map((w) => w.code)).size === ws.length, { message: "warehouse.duplicateCode" }),
});

const prefixSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{1,6}$/);
export const numberingStepSchema = z.object({
  prefixes: z.record(z.enum(DOCUMENT_TYPES as [DocumentType, ...DocumentType[]]), prefixSchema),
  includeYear: z.boolean(),
  padding: z.number().int().min(3).max(8),
});

export const teamStepSchema = z.object({
  invites: z.array(z.object({ email: z.string().trim().toLowerCase().email().max(254), roleKey: z.string().min(2).max(40) })).max(50),
});

export const dataStepSchema = z.object({ start: z.enum(["empty", "demo"]) });

export const ONBOARDING_STEPS = ["company", "industry", "modules", "finance", "warehouses", "numbering", "team", "data"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const onboardingStepSchemas = {
  company: companyStepSchema,
  industry: industryStepSchema,
  modules: modulesStepSchema,
  finance: financeStepSchema,
  warehouses: warehousesStepSchema,
  numbering: numberingStepSchema,
  team: teamStepSchema,
  data: dataStepSchema,
} satisfies Record<OnboardingStep, z.ZodTypeAny>;

export type OnboardingData = { [K in OnboardingStep]?: z.infer<(typeof onboardingStepSchemas)[K]> };

export interface OnboardingState {
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  data: OnboardingData;
  completed: boolean;
}
