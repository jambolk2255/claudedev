import { cn, initials } from "@/lib/utils";

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden className={cn("bg-primary/12 text-primary grid size-8 shrink-0 place-content-center rounded-full text-xs font-semibold", className)}>
      {initials(name)}
    </span>
  );
}
