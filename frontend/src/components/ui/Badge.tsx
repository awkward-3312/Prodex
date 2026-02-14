import { cn } from "@/lib/cn";
import type { HTMLAttributes } from "react";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: "info" | "success" | "neutral";
};

const variants = {
  info: "border border-[#38BDF8]/50 text-[#38BDF8] bg-[#0F172A]/80",
  success: "border border-[#22C55E]/50 text-[#22C55E] bg-[#0F172A]/80",
  neutral: "border border-[#334155] text-[#94A3B8] bg-[#0F172A]/80",
};

export function Badge({ className, variant = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
