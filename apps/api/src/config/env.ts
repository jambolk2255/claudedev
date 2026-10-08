import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().url(),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  WEB_URL: z.string().url().default("http://localhost:3000"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  ENCRYPTION_KEY: z.string().refine((v) => Buffer.from(v, "base64").length === 32, "ENCRYPTION_KEY must be 32 bytes, base64 encoded"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  /** Requests per minute per IP on login/register/2FA endpoints. */
  AUTH_RATE_LIMIT: z.coerce.number().int().min(1).default(10),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  /** MVP is single-company. Set to true when the platform becomes SaaS. */
  ALLOW_MULTI_ORG_SIGNUP: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  /** SaaS mode: open self sign-up, free trial, plans/limits and subscription billing. */
  SAAS_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  TRIAL_DAYS: z.coerce.number().int().min(0).max(365).default(14),
  /** Plan given to new sign-ups during the trial. */
  TRIAL_PLAN: z.string().default("business"),
  /** Comma-separated emails of platform operators (access to the /admin console). */
  PLATFORM_ADMIN_EMAILS: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  PAYHERE_MERCHANT_ID: z.string().optional(),
  PAYHERE_MERCHANT_SECRET: z.string().optional(),
  PAYHERE_SANDBOX: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  /** Public URL PayHere calls back (notify_url). Defaults to WEB_URL, which proxies /api. */
  API_PUBLIC_URL: z.string().url().optional(),
  /** Shown to tenants who pay by bank transfer (account name, bank, branch, number). */
  BANK_TRANSFER_DETAILS: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
      throw new Error(`Invalid environment configuration:\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}
