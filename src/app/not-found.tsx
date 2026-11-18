import Link from "next/link";

import { BrandMark } from "@/components/layout/brand";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <BrandMark />
      <div>
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">The page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      </div>
      <Link href="/" className={buttonClass("secondary")}>Go to the homepage</Link>
    </main>
  );
}
