import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "surface";
type Size = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

const base =
  "inline-flex items-center justify-center rounded-full font-semibold transition focus:outline-none focus:ring-4 focus:ring-[#38BDF8]/25 disabled:pointer-events-none disabled:opacity-60";

const variants: Record<Variant, string> = {
  primary: "bg-[#22C55E] text-[#0F172A] hover:bg-[#22C55E]/90",
  secondary: "border border-[#38BDF8] text-[#38BDF8] hover:bg-[#38BDF8]/15",
  ghost: "bg-transparent text-[#E2E8F0] hover:bg-[#1E293B]",
  surface: "bg-[#1E293B] text-[#E2E8F0] hover:bg-[#1E293B]/80",
};

const sizes: Record<Size, string> = {
  sm: "px-3 py-2 text-xs",
  md: "px-5 py-2 text-sm",
  lg: "px-6 py-3 text-sm",
};

export function Button({
  variant = "surface",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
}
