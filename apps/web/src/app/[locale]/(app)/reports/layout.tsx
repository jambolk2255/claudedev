"use client";

import { Boxes, FileUp, Percent, ShoppingCart, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import { ModuleLayout } from "@/components/commerce/module-layout";

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("reports");
  return (
    <ModuleLayout
      title={t("title")}
      description={t("subtitle")}
      tabs={[
        { href: "/reports", label: t("nav.sales"), icon: ShoppingCart, exact: true },
        { href: "/reports/purchases", label: t("nav.purchases"), icon: Truck },
        { href: "/reports/margins", label: t("nav.margins"), icon: Percent },
        { href: "/reports/valuation", label: t("nav.valuation"), icon: Boxes },
        { href: "/reports/import", label: t("nav.import"), icon: FileUp },
      ]}
    >
      {children}
    </ModuleLayout>
  );
}
