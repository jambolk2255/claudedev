"use client";

import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { visibleSettings } from "@/components/layout/nav";
import { useMe } from "@/hooks/use-auth";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("settings");
  const tn = useTranslations("nav.items");
  const pathname = usePathname();
  const { data: me } = useMe();
  const items = me ? visibleSettings(me.permissions) : [];

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid gap-6 lg:grid-cols-[200px_1fr] lg:gap-10">
        <nav aria-label={t("title")} className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
          <ul className="flex gap-1 border-b pb-px lg:sticky lg:top-20 lg:grid lg:border-0 lg:pb-0">
            {items.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-9 items-center gap-2 whitespace-nowrap rounded-md px-2.5 text-sm transition-colors",
                      active ? "bg-accent text-foreground font-medium" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                    )}
                  >
                    <item.icon className={cn("size-4", active && "text-primary")} />
                    {tn(item.key)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}
