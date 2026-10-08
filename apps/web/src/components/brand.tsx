"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  // Unique per instance: several logos can be on a page and a hidden one would break a shared id.
  const gradientId = `sf-logo-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 64 64" className={cn("size-8", className)} aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5b4bdb" />
          <stop offset=".55" stopColor="#7a4fd6" />
          <stop offset="1" stopColor="#3aa0d8" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${gradientId})`} />
      <path d="M18 24l14-8 14 8v16l-14 8-14-8z M18 24l14 8 14-8M32 32v16" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-semibold tracking-tight", className)}>
      <LogoMark />
      {withText && <span className="text-[17px]">StockFlow</span>}
    </span>
  );
}
