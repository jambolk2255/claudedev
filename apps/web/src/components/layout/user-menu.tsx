"use client";

import type { AuthUser } from "@stockflow/schemas";
import { ChevronsUpDown, Languages, LogOut, Monitor, Moon, ShieldCheck, Sun } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePathname, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Account menu at the bottom of the sidebar: profile, appearance, language and sign out. */
export function UserMenu({ user, collapsed, onLogout }: { user: AuthUser; collapsed?: boolean; onLogout: () => void }) {
  const t = useTranslations("userMenu");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  function changeLocale(next: string) {
    if (next === locale) return;
    void api("/users/me", { method: "PATCH", body: { locale: next } }).catch(() => undefined);
    router.replace(pathname, { locale: next as "en" | "si" });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("open")}
          className={cn(
            "hover:bg-accent focus-visible:ring-ring focus-visible:ring-3 flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors focus-visible:outline-none",
            collapsed && "justify-center",
          )}
        >
          <Avatar name={user.name} className="size-8" />
          {!collapsed && (
            <>
              <span className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate text-sm font-medium">{user.name}</span>
                <span className="text-muted-foreground truncate text-xs">{user.role.name}</span>
              </span>
              <ChevronsUpDown className="text-muted-foreground size-4" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-64">
        <div className="px-2.5 py-2">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="text-muted-foreground truncate text-xs">{user.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/settings/security")}>
          <ShieldCheck /> {t("security")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("theme")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            <Sun /> {t("light")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon /> {t("dark")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor /> {t("system")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-1.5">
          <Languages className="size-3.5" /> {t("language")}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={locale} onValueChange={changeLocale}>
          <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="si">සිංහල</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={onLogout}>
          <LogOut /> {t("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
