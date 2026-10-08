import { getTranslations } from "next-intl/server";
import { AuthShowcase } from "@/components/auth/auth-showcase";
import { Logo } from "@/components/brand";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("auth");
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <div className="relative flex flex-col px-4 py-6 sm:px-10">
        <header className="flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-1">
            <LocaleSwitcher />
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</main>
        <footer className="text-muted-foreground text-center text-xs">{t("footer")}</footer>
      </div>
      <AuthShowcase />
    </div>
  );
}
