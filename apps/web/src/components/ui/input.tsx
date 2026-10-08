import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "border-input bg-card shadow-xs placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:ring-ring aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20 flex h-10 w-full rounded-lg border px-3 py-2 text-sm transition-[border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "border-input bg-card shadow-xs placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:ring-ring flex min-h-20 w-full rounded-lg border px-3 py-2 text-sm transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-4",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "border-input bg-card bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22 viewBox=%220 0 24 24%22><path d=%22m6 9 6 6 6-6%22/></svg>')] shadow-xs focus-visible:border-primary focus-visible:ring-ring flex h-10 w-full appearance-none rounded-lg border bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat px-3 pr-9 text-sm transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-4",
      className,
    )}
    {...props}
  />
));
NativeSelect.displayName = "NativeSelect";
