import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/primitives";
import { cn, formatNumber } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  detail,
  tone = "neutral",
  href,
  display,
}: {
  label: string;
  value: number | null;
  /** Pre-formatted value (e.g. a currency amount) shown instead of `value`. */
  display?: string;
  icon: LucideIcon;
  detail?: string;
  tone?: "neutral" | "primary" | "success" | "warning";
  href?: string;
}) {
  const iconTone = {
    neutral: "bg-surface-muted text-muted-foreground",
    primary: "bg-primary-soft text-primary",
    success: "bg-accent-soft text-accent",
    warning: "bg-warning-soft text-warning",
  }[tone];
  const body = (
    <Card className={cn("h-full p-4 transition-colors", href && "hover:border-primary/40")}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className={cn("rounded-md p-1.5", iconTone)}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{display ?? formatNumber(value)}</p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </Card>
  );
  return href ? (
    <Link href={href} className="block h-full rounded-lg">
      {body}
    </Link>
  ) : (
    body
  );
}
