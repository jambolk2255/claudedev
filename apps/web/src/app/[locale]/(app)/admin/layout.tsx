"use client";

import { LayoutGrid, Layers, ShieldAlert, Users, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { ModuleLayout } from "@/components/commerce/module-layout";
import { EmptyState } from "@/components/data/list";
import { Card } from "@/components/ui/card";
import { useMe } from "@/hooks/use-auth";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("platform");
  const { data: me } = useMe();
  if (me && !me.platformAdmin) {
    return (
      <Card>
        <EmptyState icon={ShieldAlert} title={t("denied")} />
      </Card>
    );
  }
  return (
    <ModuleLayout
      title={t("title")}
      description={t("subtitle")}
      tabs={[
        { href: "/admin", label: t("nav.overview"), icon: LayoutGrid, exact: true },
        { href: "/admin/tenants", label: t("nav.tenants"), icon: Users },
        { href: "/admin/payments", label: t("nav.payments"), icon: Wallet },
        { href: "/admin/plans", label: t("nav.plans"), icon: Layers },
      ]}
    >
      {children}
    </ModuleLayout>
  );
}
