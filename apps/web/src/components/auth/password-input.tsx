"use client";

import { Eye, EyeOff } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const PasswordInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => {
  const t = useTranslations("auth");
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input ref={ref} type={visible ? "text" : "password"} className={cn("pr-10", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 grid w-10 place-content-center transition"
        aria-label={visible ? t("hidePassword") : t("showPassword")}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";

export function passwordScore(pw: string) {
  let score = 0;
  if (pw.length >= 10) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 16) score++;
  return score;
}

const COLORS = ["bg-destructive", "bg-destructive", "bg-warning", "bg-success", "bg-success"];

export function PasswordStrength({ value }: { value: string }) {
  const t = useTranslations("auth.strength");
  const score = passwordScore(value);
  const labels = [t("weak"), t("weak"), t("fair"), t("good"), t("strong")];
  if (!value) return null;
  return (
    <div className="grid gap-1.5" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-muted h-1 flex-1 overflow-hidden rounded-full">
            <motion.div className={cn("h-full", COLORS[score])} initial={false} animate={{ width: i < score ? "100%" : "0%" }} transition={{ duration: 0.3 }} />
          </div>
        ))}
      </div>
      <span className="text-muted-foreground text-xs">{labels[score]}</span>
    </div>
  );
}
