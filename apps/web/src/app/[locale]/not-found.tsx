import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("errors");
  return (
    <div className="grid min-h-[60dvh] place-content-center gap-4 text-center">
      <p className="text-brand text-7xl font-bold">404</p>
      <h1 className="text-xl font-semibold">{t("notFound")}</h1>
      <Button asChild variant="outline">
        <Link href="/dashboard">{t("home")}</Link>
      </Button>
    </div>
  );
}
