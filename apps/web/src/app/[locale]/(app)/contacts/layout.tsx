"use client";

import { Contact, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import { SubNav } from "@/components/data/list";
import { PageHeader } from "@/components/layout/page-header";
import { useCan } from "@/hooks/use-auth";

export default function ContactsLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("contacts");
  const can = useCan();
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <SubNav
        items={[
          ...(can("sales.view") ? [{ href: "/contacts/customers", label: t("customers"), icon: Contact }] : []),
          ...(can("purchasing.view") ? [{ href: "/contacts/suppliers", label: t("suppliers"), icon: Truck }] : []),
        ]}
      />
      {children}
    </>
  );
}
