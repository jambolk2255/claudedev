"use client";

import type { AuthUser } from "@stockflow/schemas";
import { Command } from "cmdk";
import { Languages, LogOut, Moon, Search, Sun } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { usePathname, useRouter } from "@/i18n/navigation";
import { visibleNav, visibleSettings } from "./nav";

const itemClass =
  "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground";

export function CommandPalette({
  user,
  open,
  onOpenChange,
  onLogout,
}: {
  user: AuthUser;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onLogout: () => void;
}) {
  const t = useTranslations("command");
  const tn = useTranslations("nav");
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const { resolvedTheme, setTheme } = useTheme();
  const groups = [...visibleNav(user.organization.modules, user.permissions), { key: "settings", items: visibleSettings(user.permissions) }];

  function run(fn: () => void) {
    onOpenChange(false);
    fn();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="max-w-xl gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">{t("title")}</DialogTitle>
        <Command loop className="grid">
          <div className="flex items-center gap-2 border-b px-4">
            <Search className="text-muted-foreground size-4" />
            <Command.Input
              autoFocus
              placeholder={t("placeholder")}
              className="placeholder:text-muted-foreground h-14 flex-1 bg-transparent text-sm outline-none"
            />
            <kbd className="bg-muted text-muted-foreground rounded border px-1.5 py-0.5 text-[10px]">ESC</kbd>
          </div>
          <Command.List className="max-h-[60dvh] overflow-y-auto p-2">
            <Command.Empty className="text-muted-foreground py-10 text-center text-sm">{t("empty")}</Command.Empty>
            {groups.map((g) => (
              <Command.Group
                key={g.key}
                heading={tn(`groups.${g.key}`)}
                className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium"
              >
                {g.items.map((item) => (
                  <Command.Item
                    key={item.key}
                    value={`${tn(`items.${item.key}`)} ${item.key}`}
                    onSelect={() => run(() => router.push(item.href))}
                    className={itemClass}
                  >
                    <item.icon /> {tn(`items.${item.key}`)}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
            <Command.Group
              heading={t("actions")}
              className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium"
            >
              <Command.Item value="theme dark light" onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))} className={itemClass}>
                {resolvedTheme === "dark" ? <Sun /> : <Moon />} {t("toggleTheme")}
              </Command.Item>
              <Command.Item
                value="language sinhala english සිංහල"
                onSelect={() => run(() => router.replace(pathname, { locale: locale === "en" ? "si" : "en" }))}
                className={itemClass}
              >
                <Languages /> {locale === "en" ? "සිංහලට මාරු වන්න" : "Switch to English"}
              </Command.Item>
              <Command.Item value="logout sign out" onSelect={() => run(onLogout)} className={itemClass}>
                <LogOut /> {t("logout")}
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
