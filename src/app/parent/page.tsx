import { ArrowRight, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Alert, Badge, Card, CardBody, EmptyState, PageHeader } from "@/components/ui/primitives";
import { cedis } from "@/lib/finance";
import { requireParent } from "@/lib/parent";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Family" };

type Summary = { attendance: { days: number; present: number; absent: number }; assignments: { status: string }[] };

export default async function ParentHome() {
  const { session, children } = await requireParent();
  const supabase = await createClient();
  const cards = await Promise.all(
    children.map(async (c) => {
      const [{ data: summary }, { data: invoices }] = await Promise.all([
        supabase.rpc("guardian_child_summary", { p_student: c.student_id }),
        supabase.from("student_invoices").select("total, amount_paid, status").eq("student_id", c.student_id).in("status", ["issued", "partially_paid"]),
      ]);
      const s = summary as Summary | null;
      const balance = (invoices ?? []).reduce((n, i) => n + Number(i.total) - Number(i.amount_paid), 0);
      const rate = s && s.attendance.days ? Math.round((s.attendance.present / s.attendance.days) * 100) : null;
      const pending = (s?.assignments ?? []).filter((a) => a.status === "pending").length;
      return { c, balance, rate, pending, absences: s?.attendance.absent ?? 0 };
    }),
  );
  const firstName = (session.fullName ?? "").split(" ")[0];

  return (
    <>
      <PageHeader title={firstName ? `Welcome, ${firstName}` : "Welcome"} description="Follow your children's progress, fees and messages from school." />
      {!children.length ? (
        <Card>
          <EmptyState icon={Users} title="No children linked yet">Your school links your account to your child&apos;s record. Ask the school office to add <strong>{session.email}</strong> as a guardian.</EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {cards.map(({ c, balance, rate, pending, absences }) => (
            <Link key={c.student_id} href={`/parent/child/${c.student_id}`} className="group rounded-lg border border-border bg-surface p-5 transition-colors hover:border-royal/40">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">{c.first_name} {c.last_name}</p>
                  <p className="text-sm text-muted-foreground">{c.class_name ?? "No class"} · {c.school_name}</p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div><dt className="text-xs text-muted-foreground">Attendance (60 days)</dt><dd className="font-semibold">{rate == null ? "—" : `${rate}%`}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Work due</dt><dd className="font-semibold">{pending}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Fees owed</dt><dd className="font-semibold">{balance > 0 ? cedis(balance) : "None"}</dd></div>
              </dl>
              {absences > 0 && <Badge tone="warning" className="mt-3">{absences} absence{absences === 1 ? "" : "s"} recently</Badge>}
            </Link>
          ))}
        </div>
      )}
      <Card className="mt-6"><CardBody className="text-sm text-muted-foreground">Choose how you hear from school — email or SMS — in <Link href="/app/account" className="font-medium text-royal hover:underline">My account</Link>.</CardBody></Card>
      <Alert tone="info" className="mt-4">You only see records your school has authorised you to view.</Alert>
    </>
  );
}
