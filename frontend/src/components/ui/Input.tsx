import { cn } from "@/lib/cn";
import type { InputHTMLAttributes } from "react";
import { forwardRef } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

const base =
  "w-full rounded-xl border border-[#334155] bg-[#0F172A]/80 p-3 text-sm text-[#E2E8F0] shadow-sm transition placeholder:text-[#94A3B8] focus:border-[#38BDF8] focus:outline-none focus:ring-4 focus:ring-[#38BDF8]/20 disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(base, className)} {...props} />
));

Input.displayName = "Input";
