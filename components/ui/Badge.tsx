import * as React from "react";
import { cn } from "./cn";

type Variant = "neutral" | "success" | "warning" | "danger" | "info" | "outline";

const variants: Record<Variant, string> = {
  neutral: "bg-sand-100 text-sand-700",
  success: "bg-forest-50 text-forest-700",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-clay-50 text-clay-700",
  info: "bg-blue-50 text-blue-800",
  outline: "border border-sand-300 text-sand-700",
};

export function Badge({
  className,
  variant = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.08em]",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
