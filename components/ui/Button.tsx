import * as React from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "sm" | "md" | "lg";

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-forest-600 text-white hover:bg-forest-700 active:bg-forest-800 disabled:bg-forest-600/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_1px_2px_rgba(0,0,0,0.1)]",
  secondary:
    "bg-sand-100 text-sand-800 hover:bg-sand-200 active:bg-sand-300 disabled:opacity-50",
  ghost:
    "bg-transparent text-sand-700 hover:bg-sand-100/80 hover:text-sand-900 active:bg-sand-200 disabled:opacity-50",
  destructive:
    "bg-clay-600 text-white hover:bg-clay-700 active:bg-clay-800 disabled:bg-clay-600/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_1px_2px_rgba(0,0,0,0.1)]",
};

const sizeStyles: Record<Size, string> = {
  sm: "h-8 px-3 py-1.5 text-xs",
  md: "h-10 px-4 py-2 text-sm",
  lg: "h-12 px-5 py-2.5 text-sm",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all duration-150 disabled:cursor-not-allowed hover:scale-[1.01] focus-visible:ring-2 focus-visible:ring-forest-600/30 focus-visible:ring-offset-2 focus-visible:outline-none",
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    >
      {loading && (
        <span
          className={cn(
            "h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent",
            variant === "secondary" || variant === "ghost" ? "" : "border-white/40 border-t-white",
          )}
          aria-hidden
        />
      )}
      {children}
    </button>
  ),
);
Button.displayName = "Button";
