import { z } from "zod";
import { ALL_PERMISSIONS, type Permission } from "./permissions";

export const inviteUserSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  roleId: z.string().uuid(),
});

export const updateUserSchema = z.object({
  roleId: z.string().uuid().optional(),
  active: z.boolean().optional(),
});

export const roleInputSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).optional(),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]])).max(ALL_PERMISSIONS.length),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  locale: z.enum(["en", "si"]).optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
});

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
