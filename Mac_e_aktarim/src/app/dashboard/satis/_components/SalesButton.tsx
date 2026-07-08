"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "success" | "ghost";
type Size = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
};

const VARIANT_CLS: Record<Variant, string> = {
  primary:
    "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md hover:shadow-lg active:shadow-sm",
  secondary:
    "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 active:bg-slate-100",
  danger:
    "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 active:bg-rose-200",
  success:
    "bg-gradient-to-r from-emerald-600 to-green-700 text-white shadow-md hover:shadow-lg active:shadow-sm",
  ghost: "bg-transparent text-slate-600 hover:bg-slate-100 active:bg-slate-200",
};

const SIZE_CLS: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs gap-1",
  md: "px-4 py-2.5 text-sm gap-1.5",
  lg: "px-5 py-3 text-base gap-2",
};

const SalesButton = forwardRef<HTMLButtonElement, Props>(function SalesButton(
  { variant = "primary", size = "md", icon, loading, children, className = "", disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLS[variant]} ${SIZE_CLS[size]} ${className}`}
      {...rest}
    >
      {loading ? (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
});

export default SalesButton;
