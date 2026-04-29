import * as React from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "sm" | "md" | "lg";

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-forest-600 text-white hover:bg-forest-700 active:bg-forest-800 disabled:bg-forest-600/50",
  secondary:
    "bg-white text-sand-900 border border-sand-200 hover:bg-sand-50 hover:border-sand-300 active:bg-sand-100 disabled:opacity-50",
  ghost:
    "bg-transparent text-sand-700 hover:bg-sand-100 active:bg-sand-200 disabled:opacity-50",
  destructive:
    "bg-clay-600 text-white hover:bg-clay-700 active:bg-clay-800 disabled:bg-clay-600/50",
};

const sizeStyles: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-sm",
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
        "inline-flex items-center justify-center gap-2 rounded font-medium transition-colors duration-150 disabled:cursor-not-allowed",
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
