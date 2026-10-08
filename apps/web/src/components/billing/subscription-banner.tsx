"use client";

import type { AuthUser } from "@stockflow/schemas";
import { AlertTriangle, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** Trial countdown, renewal reminder or read-only notice above every page (SaaS mode). */
export function SubscriptionBanner({ user }: { user: AuthUser }) {
  const t = useTranslations("billing.banner");
  const pathname = usePathname();
  const s = user.subscription;
  if (!s || pathname.startsWith("/settings/billing")) return null;
  const urgent = s.readOnly || s.status === "past_due";
  const show =
    urgent || (s.status === "trialing" && s.daysLeft !== null && s.daysLeft <= 7) || (s.status === "active" && s.daysLeft !== null && s.daysLeft <= 5);
  if (!show) return null;
  const key = s.blocked ? "suspended" : s.readOnly ? "expired" : s.status === "past_due" ? "pastDue" : s.status === "trialing" ? "trial" : "renew";
  const canPay = user.permissions.includes("organization.manage");
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-sm print:hidden",
        urgent ? "bg-destructive text-white" : "bg-primary/10 text-foreground",
      )}
    >
      {urgent ? <AlertTriangle className="size-4" /> : <Sparkles className="text-primary size-4" />}
      <span>{t(key, { days: Math.max(0, s.daysLeft ?? 0), plan: s.planName })}</span>
      {canPay && (
        <Link href="/settings/billing" className={cn("font-semibold underline-offset-4 hover:underline", !urgent && "text-primary")}>
          {t(s.status === "trialing" && !s.readOnly ? "upgrade" : "pay")}
        </Link>
      )}
    </div>
  );
}
