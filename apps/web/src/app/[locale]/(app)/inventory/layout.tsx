"use client";

import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, LayoutGrid, Package, ScrollText, Warehouse } from "lucide-react";
import { useTranslations } from "next-intl";
import { SubNav } from "@/components/data/list";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { useCan } from "@/hooks/use-auth";
import { Link, usePathname } from "@/i18n/navigation";

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("inventory");
  const can = useCan();
  const pathname = usePathname();
  const onForm = pathname.startsWith("/inventory/documents/new");

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          !onForm && (
            <>
              {can("inventory.stock_out") && (
                <Button variant="outline" size="sm" asChild>
                  <Link href="/inventory/documents/new?type=stock_out">
                    <ArrowUpFromLine /> {t("docTypes.stock_out")}
                  </Link>
                </Button>
              )}
              {can("inventory.stock_in") && (
                <Button size="sm" asChild>
                  <Link href="/inventory/documents/new?type=stock_in">
                    <ArrowDownToLine /> {t("docTypes.stock_in")}
                  </Link>
                </Button>
              )}
            </>
          )
        }
      />
      <SubNav
        items={[
          { href: "/inventory", label: t("nav.overview"), icon: LayoutGrid, exact: true },
          { href: "/inventory/products", label: t("nav.products"), icon: Package },
          { href: "/inventory/documents", label: t("nav.documents"), icon: ArrowLeftRight },
          { href: "/inventory/movements", label: t("nav.movements"), icon: ScrollText },
          { href: "/inventory/warehouses", label: t("nav.warehouses"), icon: Warehouse },
        ]}
      />
      {children}
    </>
  );
}
