import { cn } from "@/lib/utils";

/** Page title row. `section` is used for pages nested in a shell that already has a title (e.g. Settings). */
export function PageHeader({
  title,
  description,
  actions,
  className,
  level = "page",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  level?: "page" | "section";
}) {
  const Heading = level === "page" ? "h1" : "h2";
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", level === "page" ? "mb-6" : "mb-5", className)}>
      <div className="grid gap-1">
        <Heading className={cn("font-semibold tracking-tight", level === "page" ? "text-2xl" : "text-lg")}>{title}</Heading>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2 print:hidden">{actions}</div>}
    </div>
  );
}
