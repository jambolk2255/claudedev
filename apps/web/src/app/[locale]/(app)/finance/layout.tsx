"use client";

import { ArrowDownLeft, ArrowUpRight, BookOpen, FileSpreadsheet, LayoutGrid, ListTree, ScrollText } from "lucide-react";
import { useTranslations } from "next-intl";
import { ModuleLayout } from "@/components/commerce/module-layout";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("finance");
  return (
    <ModuleLayout
      title={t("title")}
      description={t("subtitle")}
      tabs={[
        { href: "/finance", label: t("nav.overview"), icon: LayoutGrid, exact: true },
        { href: "/finance/receivables", label: t("nav.receivables"), icon: ArrowDownLeft },
        { href: "/finance/payables", label: t("nav.payables"), icon: ArrowUpRight },
        { href: "/finance/cheques", label: t("nav.cheques"), icon: ScrollText },
        { href: "/finance/journal", label: t("nav.journal"), icon: BookOpen },
        { href: "/finance/accounts", label: t("nav.accounts"), icon: ListTree },
        { href: "/finance/statements", label: t("nav.statements"), icon: FileSpreadsheet },
      ]}
    >
      {children}
    </ModuleLayout>
  );
}
