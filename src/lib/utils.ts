import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const numberFormat = new Intl.NumberFormat("en-GH");
export const formatNumber = (n: number | null | undefined) => (n == null ? "—" : numberFormat.format(n));

export function formatDate(value: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Accra", ...opts }).format(new Date(value));
}

export function percent(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

/** Only allow same-site relative redirects (prevents open redirects via ?next=). */
export function safeNextPath(next: string | null | undefined, fallback = "/app") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
