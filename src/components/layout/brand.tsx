import { cn } from "@/lib/utils";

/** AI SHS Ghana mark: an open book forming a rising chevron, with a gold star. */
export function BrandMark({ inverted = false, compact = false, tagline = true, className }: { inverted?: boolean; compact?: boolean; tagline?: boolean; className?: string }) {
  return (
    <div className={cn("flex shrink-0 items-center gap-2.5 whitespace-nowrap", className)}>
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="7" fill={inverted ? "#ffffff" : "var(--primary)"} fillOpacity={inverted ? 0.1 : 1} />
        <path d="M7 21.5 16 25l9-3.5V11l-9 3.5L7 11z" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
        <path d="M16 14.5V25" stroke="#fff" strokeWidth="2" />
        <path d="m16 5.2 1.2 2.5 2.7.4-2 1.9.5 2.7-2.4-1.3-2.4 1.3.5-2.7-2-1.9 2.7-.4z" fill="#e3b84f" />
      </svg>
      {!compact && (
        <div className="leading-tight">
          <p className={cn("text-sm font-semibold tracking-tight", inverted ? "text-white" : "text-foreground")}>AI SHS Ghana</p>
          {tagline && <p className={cn("text-[11px]", inverted ? "text-white/55" : "text-muted-foreground")}>Smarter schools, stronger learners</p>}
        </div>
      )}
    </div>
  );
}
