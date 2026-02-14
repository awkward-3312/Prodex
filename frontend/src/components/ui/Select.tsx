import { cn } from "@/lib/cn";
import type { SelectHTMLAttributes } from "react";
import { forwardRef } from "react";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

const base =
  "w-full rounded-xl border border-[#334155] bg-[#0F172A]/80 p-3 text-sm text-[#E2E8F0] shadow-sm transition focus:border-[#38BDF8] focus:outline-none focus:ring-4 focus:ring-[#38BDF8]/20 disabled:opacity-60";

export const Select = forwardRef<HTMLSelectElement, SelectProps>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(base, className)} {...props} />
));

Select.displayName = "Select";
