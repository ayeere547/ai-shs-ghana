import type { BadgeTone } from "@/components/ui/primitives";
import type { SchoolStatus } from "@/lib/auth/session";

export const SCHOOL_STATUS: Record<SchoolStatus, { label: string; tone: BadgeTone }> = {
  pending_verification: { label: "Awaiting verification", tone: "warning" },
  active: { label: "Active", tone: "success" },
  suspended: { label: "Suspended", tone: "danger" },
  rejected: { label: "Rejected", tone: "neutral" },
};

export const PAGE_SIZE = 20;

/** Parses a 1-based ?page= value into a safe range for Supabase `.range()`. */
export function pageRange(page: string | undefined, size = PAGE_SIZE) {
  const n = Math.min(Math.max(Number.parseInt(page ?? "1", 10) || 1, 1), 10_000);
  return { page: n, from: (n - 1) * size, to: n * size - 1, size };
}

/** Escapes characters that are special in PostgREST `ilike` filters / or() expressions. */
export function searchTerm(q: string | undefined) {
  const cleaned = (q ?? "").replace(/[%_,()*\\]/g, " ").trim().slice(0, 80);
  return cleaned || null;
}
