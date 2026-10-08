"use client";

import type { AuthUser } from "@stockflow/schemas";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "@/i18n/navigation";
import { visibleCreateActions } from "./nav";

/** One entry point for every "new" action. Items for modules not shipped yet show their phase. */
export function CreateMenu({ user, compact }: { user: AuthUser; compact?: boolean }) {
  const t = useTranslations("create");
  const router = useRouter();
  const actions = visibleCreateActions(user.organization.modules, user.permissions);
  if (actions.length === 0) return null;
  const groups = [...new Set(actions.map((a) => a.group))];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="gap-1.5" aria-label={t("button")}>
          <Plus className="size-4" />
          {!compact && <span className="hidden sm:inline">{t("button")}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {groups.map((group, gi) => (
          <Fragment key={group}>
            {gi > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{t(`groups.${group}`)}</DropdownMenuLabel>
            {actions
              .filter((a) => a.group === group)
              .map((a) => (
                <DropdownMenuItem key={a.key} disabled={!a.href} onSelect={() => a.href && router.push(a.href)}>
                  <a.icon /> <span className="flex-1">{t(`actions.${a.key}`)}</span>
                  {a.phase && <span className="text-muted-foreground text-[10px] font-medium uppercase">{t("phase", { n: a.phase })}</span>}
                </DropdownMenuItem>
              ))}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
