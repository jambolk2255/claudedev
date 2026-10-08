import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium [&_svg]:size-3", {
  variants: {
    variant: {
      default: "bg-primary/10 text-primary border-transparent",
      secondary: "bg-secondary text-secondary-foreground border-transparent",
      success: "bg-success/15 text-success border-transparent",
      warning: "bg-warning/20 text-warning-foreground dark:text-warning border-transparent",
      destructive: "bg-destructive/12 text-destructive border-transparent",
      outline: "text-muted-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
