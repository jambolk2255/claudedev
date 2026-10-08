"use client";

import type { Permission } from "@stockflow/schemas";
import type { LucideIcon } from "lucide-react";
import { SubNav } from "@/components/data/list";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { useCan } from "@/hooks/use-auth";
import { Link, usePathname } from "@/i18n/navigation";

export interface ModuleAction {
  href: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
  primary?: boolean;
}

/** Title, primary actions and tabs for a module area (Purchasing, Sales, Finance, Reports). */
export function ModuleLayout({
  title,
  description,
  tabs,
  actions = [],
  children,
}: {
  title: string;
  description: string;
  tabs: { href: string; label: string; icon: LucideIcon; exact?: boolean; permission?: Permission }[];
  actions?: ModuleAction[];
  children: React.ReactNode;
}) {
  const can = useCan();
  const pathname = usePathname();
  const onForm = /\/(new|edit)$/.test(pathname);
  const visible = actions.filter((a) => can(a.permission));
  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          !onForm &&
          visible.length > 0 &&
          visible.map((a) => (
            <Button key={a.href} size="sm" variant={a.primary ? "default" : "outline"} asChild>
              <Link href={a.href}>
                <a.icon /> {a.label}
              </Link>
            </Button>
          ))
        }
      />
      <SubNav items={tabs.filter((tb) => !tb.permission || can(tb.permission))} />
      {children}
    </>
  );
}
