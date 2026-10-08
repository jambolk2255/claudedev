import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

/** At least 10 chars with upper, lower and a digit. Max 128 to bound hashing cost. */
export const passwordSchema = z
  .string()
  .min(10, "password.min")
  .max(128, "password.max")
  .regex(/[a-z]/, "password.lower")
  .regex(/[A-Z]/, "password.upper")
  .regex(/[0-9]/, "password.digit");

export const personNameSchema = z.string().trim().min(2).max(100);

export const registerOwnerSchema = z.object({
  companyName: z.string().trim().min(2).max(150),
  name: personNameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterOwnerInput = z.infer<typeof registerOwnerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
  totp: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(512).optional() });

export const totpCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });
export type TotpCodeInput = z.infer<typeof totpCodeSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

export const acceptInviteSchema = z.object({
  token: z.string().min(20).max(256),
  name: personNameSchema,
  password: passwordSchema,
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  locale: "en" | "si";
  twoFactorEnabled: boolean;
  organization: {
    id: string;
    name: string;
    onboardingCompleted: boolean;
    mode: "simple" | "advanced";
    modules: string[];
    currency: string;
  };
  role: { id: string; key: string | null; name: string };
  permissions: string[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
