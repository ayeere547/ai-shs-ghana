import Link from "next/link";

import { buttonClass } from "./button";

/** Server-rendered pagination that preserves the current query string. */
export function Pagination({ page, size, total, basePath, params }: { page: number; size: number; total: number; basePath: string; params: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / size));
  const href = (p: number) => {
    const qs = new URLSearchParams(Object.entries({ ...params, page: String(p) }).filter(([, v]) => v) as [string, string][]);
    return `${basePath}?${qs.toString()}`;
  };
  return (
    <nav className="flex items-center justify-between gap-3 border-t border-border px-5 py-3 text-sm" aria-label="Pagination">
      <p className="text-muted-foreground">
        {total === 0 ? "No results" : `${(page - 1) * size + 1}–${Math.min(page * size, total)} of ${total}`}
      </p>
      <div className="flex gap-2">
        {page > 1 ? <Link className={buttonClass("secondary", "sm")} href={href(page - 1)}>Previous</Link> : <span className={buttonClass("secondary", "sm", "pointer-events-none opacity-50")}>Previous</span>}
        {page < pages ? <Link className={buttonClass("secondary", "sm")} href={href(page + 1)}>Next</Link> : <span className={buttonClass("secondary", "sm", "pointer-events-none opacity-50")}>Next</span>}
      </div>
    </nav>
  );
}
