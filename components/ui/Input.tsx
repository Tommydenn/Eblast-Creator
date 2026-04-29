import * as React from "react";
import { cn } from "./cn";

const inputBase =
  "h-10 w-full rounded border border-sand-200 bg-white px-3 text-sm text-sand-900 placeholder:text-sand-400 hover:border-sand-300 focus:border-forest-600 focus:outline-none focus:ring-2 focus:ring-forest-600/20 disabled:cursor-not-allowed disabled:bg-sand-50 disabled:text-sand-500";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(inputBase, className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "min-h-[80px] w-full rounded border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 placeholder:text-sand-400 hover:border-sand-300 focus:border-forest-600 focus:outline-none focus:ring-2 focus:ring-forest-600/20 disabled:cursor-not-allowed disabled:bg-sand-50",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        inputBase,
        "appearance-none bg-no-repeat pr-9",
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22 fill=%22%2382704f%22><path d=%22M4.5 6L8 9.5 11.5 6%22 stroke=%22%2382704f%22 stroke-width=%221.4%22 fill=%22none%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/></svg>')]",
        "bg-[length:16px] bg-[right_10px_center]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";

export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn("mb-1.5 block text-xs font-medium text-sand-700", className)}
      {...props}
    />
  ),
);
Label.displayName = "Label";

export const FieldHint = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("mt-1 text-xs text-sand-500", className)} {...props} />
  ),
);
FieldHint.displayName = "FieldHint";
