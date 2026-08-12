import * as React from "react";
import { cn } from "./cn";

type Variant = "neutral" | "success" | "warning" | "danger" | "info" | "outline";

const variants: Record<Variant, string> = {
  neutral: "bg-sand-100 text-sand-600 border border-sand-200/60",
  success: "bg-forest-50 text-forest-700 border border-forest-200/60",
  warning: "bg-clay-50 text-clay-700 border border-clay-200/60",
  danger: "bg-red-50 text-red-700 border border-red-200/60",
  info: "bg-blue-50 text-blue-700 border border-blue-200/60",
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
        // whitespace-nowrap + shrink-0: a badge is usually a flex item beside a
        // longer title, and without these it gets squeezed until its label
        // wraps onto two lines, which reads as off-centre text in a cramped
        // pill. justify-center keeps the label centred if a width is ever set.
        "inline-flex items-center justify-center gap-1 whitespace-nowrap shrink-0 rounded-full px-2.5 py-1 text-[10px] leading-none font-medium uppercase tracking-[0.08em]",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
