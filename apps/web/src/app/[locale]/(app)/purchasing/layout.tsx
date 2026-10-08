"use client";

import { Banknote, ClipboardList, FilePlus2, FileText, PackageCheck, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { ModuleLayout } from "@/components/commerce/module-layout";

export default function PurchasingLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("commerce.purchasing");
  return (
    <ModuleLayout
      title={t("title")}
      description={t("subtitle")}
      actions={[{ href: "/purchasing/orders/new", label: t("newOrder"), icon: FilePlus2, permission: "purchasing.manage", primary: true }]}
      tabs={[
        { href: "/purchasing", label: t("nav.orders"), icon: ClipboardList, exact: true },
        { href: "/purchasing/receipts", label: t("nav.receipts"), icon: PackageCheck, permission: "inventory.view" },
        { href: "/purchasing/bills", label: t("nav.bills"), icon: FileText },
        { href: "/purchasing/payments", label: t("nav.payments"), icon: Banknote, permission: "finance.view" },
        { href: "/purchasing/returns", label: t("nav.returns"), icon: Undo2 },
      ]}
    >
      {children}
    </ModuleLayout>
  );
}
