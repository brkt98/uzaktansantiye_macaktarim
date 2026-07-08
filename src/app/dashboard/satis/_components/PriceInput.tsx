"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  defaultValue?: string | null;
  onBlurValue: (raw: string) => void;
  id?: string;
  placeholder?: string;
  className?: string;
};

const formatTr = (raw: string): string => {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("tr-TR");
};

const stripFormatting = (s: string): string => s.replace(/\D/g, "");

export default function PriceInput({
  defaultValue,
  onBlurValue,
  id,
  placeholder,
  className,
}: Props) {
  const [display, setDisplay] = useState<string>(formatTr(String(defaultValue ?? "")));
  const last = useRef(defaultValue ?? "");

  useEffect(() => {
    setDisplay(formatTr(String(defaultValue ?? "")));
    last.current = defaultValue ?? "";
  }, [defaultValue]);

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      value={display}
      placeholder={placeholder}
      onChange={(e) => setDisplay(formatTr(e.target.value))}
      onBlur={() => {
        const raw = stripFormatting(display);
        if (raw !== String(last.current ?? "")) {
          last.current = raw;
          onBlurValue(raw);
        }
      }}
      className={className}
    />
  );
}
