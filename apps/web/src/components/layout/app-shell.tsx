"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { SubscriptionBanner } from "@/components/billing/subscription-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/hooks/use-auth";
import { usePathname, useRouter } from "@/i18n/navigation";
import { ApiError, api, setSessionExpiredHandler } from "@/lib/api";
import { CommandPalette } from "./command-palette";
import { Sidebar, SidebarFooter, SidebarNav, WorkspaceHeader } from "./sidebar";
import { Topbar } from "./topbar";

const COLLAPSE_KEY = "sf.sidebar.collapsed";

function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh">
      <div className="bg-sidebar hidden w-60 border-r p-4 lg:block">
        <Skeleton className="mb-8 h-8 w-36" />
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="mb-2 h-8 w-full" />
        ))}
      </div>
      <div className="flex-1 p-6">
        <Skeleton className="mb-6 h-9 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("nav");
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const me = useMe();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);

  const toLogin = useCallback(() => {
    qc.clear();
    router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
  }, [qc, router]);

  useEffect(() => setSessionExpiredHandler(toLogin), [toLogin]);

  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) toLogin();
    // Platform operators can use the console without setting up their own company first.
    const inConsole = me.data?.platformAdmin && pathname.startsWith("/admin");
    if (me.data && !inConsole && !me.data.organization.onboardingCompleted && me.data.permissions.includes("organization.manage"))
      router.replace("/onboarding");
  }, [me.error, me.data, router, toLogin, pathname]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    qc.clear();
    router.replace("/login");
  }

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* storage unavailable */
      }
      return !c;
    });
  }

  if (!me.data) return <ShellSkeleton />;
  const user = me.data;

  return (
    <div className="flex min-h-dvh">
      <Sidebar user={user} collapsed={collapsed} onToggle={toggleCollapsed} onLogout={logout} />

      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <AnimatePresence>
          {mobileOpen && (
            <DialogPrimitive.Portal forceMount>
              <DialogPrimitive.Overlay asChild forceMount>
                <motion.div
                  className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] lg:hidden"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                />
              </DialogPrimitive.Overlay>
              <DialogPrimitive.Content asChild forceMount>
                <motion.div
                  className="bg-sidebar fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col shadow-2xl lg:hidden"
                  initial={{ x: "-100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "-100%" }}
                  transition={{ type: "spring", stiffness: 380, damping: 36 }}
                >
                  <DialogPrimitive.Title className="sr-only">{t("label")}</DialogPrimitive.Title>
                  <div className="flex h-14 items-center gap-2 border-b px-2.5">
                    <div className="min-w-0 flex-1">
                      <WorkspaceHeader user={user} />
                    </div>
                    <DialogPrimitive.Close className="text-muted-foreground hover:bg-accent rounded-md p-2" aria-label={t("close")}>
                      <X className="size-4" />
                    </DialogPrimitive.Close>
                  </div>
                  <div className="flex-1 overflow-y-auto px-2.5 py-3">
                    <SidebarNav user={user} onNavigate={() => setMobileOpen(false)} />
                  </div>
                  <div className="border-t p-2.5">
                    <SidebarFooter user={user} onLogout={logout} onNavigate={() => setMobileOpen(false)} />
                  </div>
                </motion.div>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          )}
        </AnimatePresence>
      </DialogPrimitive.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <SubscriptionBanner user={user} />
        <Topbar user={user} onMenu={() => setMobileOpen(true)} onSearch={() => setPaletteOpen(true)} />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
      <CommandPalette user={user} open={paletteOpen} onOpenChange={setPaletteOpen} onLogout={logout} />
    </div>
  );
}
