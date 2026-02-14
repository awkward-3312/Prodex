import { cn } from "@/lib/cn";
import type { HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  variant?: "surface" | "muted";
};

const variants = {
  surface: "border border-[#334155] bg-[#1E293B]/90",
  muted: "border border-[#334155] bg-[#0F172A]/80",
};

export function Card({ className, variant = "surface", ...props }: CardProps) {
  return <div className={cn("rounded-2xl p-6 shadow-sm", variants[variant], className)} {...props} />;
}
