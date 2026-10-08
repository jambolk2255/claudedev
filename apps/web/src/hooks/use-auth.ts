"use client";

import type { AuthUser, Permission } from "@stockflow/schemas";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { api } from "@/lib/api";

export const ME_KEY = ["auth", "me"] as const;

export function useMe() {
  return useQuery({ queryKey: ME_KEY, queryFn: () => api<AuthUser>("/auth/me"), staleTime: 60_000, retry: false });
}

export function useCan() {
  const { data } = useMe();
  return useCallback((...perms: Permission[]) => !!data && perms.every((p) => data.permissions.includes(p)), [data]);
}

export function useSetMe() {
  const qc = useQueryClient();
  return useCallback((user: AuthUser) => qc.setQueryData(ME_KEY, user), [qc]);
}
