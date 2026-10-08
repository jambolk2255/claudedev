"use client";

import { Banknote, ClipboardList, FilePlus2, FileText, MonitorSmartphone, ScrollText, Truck, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { ModuleLayout } from "@/components/commerce/module-layout";

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("commerce.sales");
  return (
    <ModuleLayout
      title={t("title")}
      description={t("subtitle")}
      actions={[
        { href: "/sales/pos", label: t("quickSale"), icon: MonitorSmartphone, permission: "sales.dispatch" },
        { href: "/sales/orders/new", label: t("newOrder"), icon: FilePlus2, permission: "sales.manage", primary: true },
      ]}
      tabs={[
        { href: "/sales", label: t("nav.orders"), icon: ClipboardList, exact: true },
        { href: "/sales/quotations", label: t("nav.quotations"), icon: ScrollText },
        { href: "/sales/deliveries", label: t("nav.deliveries"), icon: Truck, permission: "inventory.view" },
        { href: "/sales/invoices", label: t("nav.invoices"), icon: FileText },
        { href: "/sales/receipts", label: t("nav.receipts"), icon: Banknote, permission: "finance.view" },
        { href: "/sales/returns", label: t("nav.returns"), icon: Undo2 },
        { href: "/sales/pos", label: t("nav.pos"), icon: MonitorSmartphone, permission: "sales.dispatch" },
      ]}
    >
      {children}
    </ModuleLayout>
  );
}
