import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";
import { getSession } from "@/lib/auth/session";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader signedIn={Boolean(session)} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
