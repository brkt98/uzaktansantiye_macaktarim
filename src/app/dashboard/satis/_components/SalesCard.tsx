"use client";

import type { HTMLAttributes, ReactNode } from "react";

type Props = HTMLAttributes<HTMLDivElement> & {
  hover?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
  children: ReactNode;
};

const PAD_CLS = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

export default function SalesCard({
  hover = true,
  padding = "md",
  className = "",
  children,
  ...rest
}: Props) {
  return (
    <div
      className={`rounded-2xl bg-white shadow-sm border border-slate-200 ${
        hover ? "hover:shadow-md transition-shadow" : ""
      } ${PAD_CLS[padding]} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
