import { ArrowLeft, Printer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PayOnlineForm } from "@/components/finance/pay-form";
import { FamilyThread } from "@/components/messages/thread";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { cedis, INVOICE_STATUS, METHOD_LABEL } from "@/lib/finance";
import { requireChild } from "@/lib/parent";
import { computeResults, type Band } from "@/lib/results/compute";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Child" };

type Summary = {
  attendance: { days: number; present: number; absent: number; recent_absences: string[] };
  assignments: { title: string; subject: string; due_at: string; max_score: number; status: string; score: number | null }[];
  exams: { title: string; subject: string; opens_at: string; released: boolean; score: number | null; max: number | null; attempted: boolean }[];
  boarding: { dormitory: string; room: string; bed: string | null } | null;
  library_loans: { title: string; due_on: string; overdue: boolean }[];
};
type ResultRow = { subject_id: string; subject_name: string; max_score: number; weight: number; score: number | null };

const ASSIGNMENT: Record<string, { label: string; tone: "neutral" | "info" | "success" | "danger" }> = { pending: { label: "To do", tone: "neutral" }, submitted: { label: "Submitted", tone: "info" }, returned: { label: "Marked", tone: "success" }, missed: { label: "Not submitted", tone: "danger" } };

export default async function ChildPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ payment?: string }> }) {
  const { id } = await params;
  const { payment } = await searchParams;
  const { session, child } = await requireChild(id);
  const supabase = await createClient();

  const [{ data: summaryData }, { data: terms }, { data: invoices }, { data: payments }, { data: visits }, { data: comments }, { data: msgs }, { data: payOnline }] = await Promise.all([
    supabase.rpc("guardian_child_summary", { p_student: id }),
    supabase.rpc("student_published_terms", { p_student: id }),
    supabase.from("student_invoices").select("id, invoice_number, status, total, amount_paid, due_date, academic_terms(name), invoice_lines(description, amount)").eq("student_id", id).neq("status", "cancelled").order("issued_at", { ascending: false })
      .returns<{ id: string; invoice_number: string; status: string; total: number; amount_paid: number; due_date: string | null; academic_terms: { name: string } | null; invoice_lines: { description: string; amount: number }[] }[]>(),
    supabase.from("student_payments").select("id, amount, method, receipt_number, received_at, status").eq("student_id", id).order("received_at", { ascending: false }).limit(20),
    supabase.from("clinic_visits").select("id, visited_at, complaint, outcome").eq("student_id", id).order("visited_at", { ascending: false }).limit(10),
    supabase.from("report_comments").select("id, comment, term_id").eq("student_id", id).eq("status", "approved"),
    supabase.from("family_messages").select("id, body, from_family, created_at, author_id").eq("student_id", id).order("created_at").limit(200),
    supabase.from("school_payment_settings").select("online_payments_enabled").eq("school_id", child.school_id).maybeSingle(),
  ]);
  const s = summaryData as Summary | null;
  const termList = (terms ?? []) as { term_id: string; term_name: string; year_name: string }[];
  const latest = termList[0];
  let results: { subject: string; total: number | null; grade: string | null }[] = [];
  let average: number | null = null;
  if (latest) {
    const [{ data: rows }, { data: scheme }] = await Promise.all([
      supabase.rpc("student_term_results", { p_student: id, p_term: latest.term_id }),
      supabase.from("grading_schemes").select("grading_bands(grade, min_score, max_score, remark)").eq("school_id", child.school_id).eq("is_default", true).maybeSingle<{ grading_bands: Band[] }>(),
    ]);
    const r = (rows ?? []) as ResultRow[];
    const [mine] = computeResults({ studentIds: [id], assessments: r.map((x, i) => ({ id: String(i), subject_id: x.subject_id, max_score: Number(x.max_score), weight: Number(x.weight) })), scores: r.map((x, i) => ({ assessment_id: String(i), student_id: id, score: x.score == null ? null : Number(x.score) })), bands: scheme?.grading_bands ?? [] });
    const names = new Map(r.map((x) => [x.subject_id, x.subject_name]));
    results = Object.entries(mine?.subjects ?? {}).map(([sid, x]) => ({ subject: names.get(sid) ?? "Subject", total: x.total, grade: x.grade }));
    average = mine?.average ?? null;
  }
  const rate = s && s.attendance.days ? Math.round((s.attendance.present / s.attendance.days) * 100) : null;
  const thread = (msgs ?? []).map((m) => ({ id: m.id, body: m.body, from_family: m.from_family, created_at: m.created_at, mine: m.author_id === session.userId, author: m.from_family ? "Family" : "School" }));

  return (
    <>
      <Link href="/parent" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Family</Link>
      <PageHeader title={`${child.first_name} ${child.last_name}`} description={`${child.class_name ?? "No class"} · ${child.school_name}`} />
      {payment === "succeeded" && <Alert tone="success" className="mb-4" title="Payment received">Thank you. Your receipt is listed under Fees.</Alert>}
      {payment === "pending" && <Alert tone="info" className="mb-4">Your payment is still being confirmed. It will appear here once Paystack confirms it.</Alert>}
      {payment === "failed" && <Alert tone="warning" className="mb-4">The payment wasn&apos;t completed. No money was recorded — you can try again.</Alert>}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Attendance (last 60 days)" />
          <CardBody className="text-sm">
            {!s?.attendance.days ? <p className="text-muted-foreground">No attendance recorded yet.</p> : (
              <>
                <p className="text-2xl font-semibold">{rate}%</p>
                <p className="text-muted-foreground">{s.attendance.present} of {s.attendance.days} school days present or late · {s.attendance.absent} absent</p>
                {s.attendance.recent_absences.length > 0 && <p className="mt-2 text-muted-foreground">Recent absences: {s.attendance.recent_absences.map((d) => formatDate(d)).join(", ")}</p>}
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={latest ? `Results · ${latest.year_name} ${latest.term_name}` : "Results"} description={average != null ? `Average ${average.toFixed(1)}%` : undefined} />
          {!latest ? <CardBody className="text-sm text-muted-foreground">Results appear here when the school publishes them.</CardBody> : (
            <>
              <Table><thead><tr><Th>Subject</Th><Th className="text-right">Score</Th><Th>Grade</Th></tr></thead><tbody>{results.map((r) => <tr key={r.subject}><Td>{r.subject}</Td><Td className="text-right tabular-nums">{r.total?.toFixed(1) ?? "—"}%</Td><Td className="font-semibold">{r.grade ?? "—"}</Td></tr>)}</tbody></Table>
              {(comments ?? []).filter((c) => c.term_id === latest.term_id).map((c) => <CardBody key={c.id} className="border-t border-border text-sm"><p className="text-xs font-medium text-muted-foreground">Teacher&apos;s comment</p><p>{c.comment}</p></CardBody>)}
            </>
          )}
        </Card>

        <Card>
          <CardHeader title="Assignments" />
          {!s?.assignments.length ? <EmptyState title="No recent assignments" /> : (
            <ul className="divide-y divide-border">
              {s.assignments.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span><span className="font-medium">{a.title}</span><span className="block text-xs text-muted-foreground">{a.subject} · due {formatDate(a.due_at)}</span></span>
                  <Badge tone={ASSIGNMENT[a.status]?.tone ?? "neutral"}>{a.status === "returned" && a.score != null ? `${Number(a.score)} / ${Number(a.max_score)}` : (ASSIGNMENT[a.status]?.label ?? a.status)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Online exams" />
          {!s?.exams.length ? <EmptyState title="No recent exams" /> : (
            <ul className="divide-y divide-border">
              {s.exams.map((e, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span><span className="font-medium">{e.title}</span><span className="block text-xs text-muted-foreground">{e.subject} · {formatDate(e.opens_at)}</span></span>
                  {e.released && e.score != null ? <Badge tone="success">{Number(e.score)} / {Number(e.max)}</Badge> : <Badge>{e.attempted ? "Awaiting results" : "Not taken"}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Fees" />
          {!invoices?.length ? <CardBody className="text-sm text-muted-foreground">No invoices.</CardBody> : (
            <ul className="divide-y divide-border">
              {invoices.map((inv) => {
                const balance = Number(inv.total) - Number(inv.amount_paid);
                return (
                  <li key={inv.id} className="space-y-3 px-5 py-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{inv.academic_terms?.name ?? "Invoice"} · <span className="font-mono text-xs">{inv.invoice_number}</span></p>
                      <Badge tone={INVOICE_STATUS[inv.status].tone}>{INVOICE_STATUS[inv.status].label}</Badge>
                    </div>
                    <ul className="text-muted-foreground">{inv.invoice_lines.map((l, i) => <li key={i} className="flex justify-between"><span>{l.description}</span><span className="tabular-nums">{cedis(l.amount)}</span></li>)}</ul>
                    <p className="flex justify-between font-medium"><span>Balance{inv.due_date ? ` · due ${formatDate(inv.due_date)}` : ""}</span><span className="tabular-nums">{cedis(Math.max(0, balance))}</span></p>
                    {balance > 0 && (payOnline?.online_payments_enabled ? <PayOnlineForm studentId={id} invoiceId={inv.id} balance={balance} /> : <p className="text-xs text-muted-foreground">Pay at the school&apos;s accounts office or by the methods your school has shared. Online payment isn&apos;t enabled for this school yet.</p>)}
                  </li>
                );
              })}
            </ul>
          )}
          {(payments ?? []).length > 0 && (
            <CardBody className="border-t border-border">
              <p className="mb-2 text-sm font-medium">Receipts</p>
              <ul className="space-y-1 text-sm">{payments!.map((p) => <li key={p.id} className="flex flex-wrap justify-between gap-2"><span>{formatDate(p.received_at)} · {METHOD_LABEL[p.method]} · {cedis(p.amount)}{p.status === "reversed" && " (reversed)"}</span><Link href={`/parent/receipts/${p.id}`} className="inline-flex items-center gap-1 text-royal hover:underline"><Printer className="h-3.5 w-3.5" /> {p.receipt_number}</Link></li>)}</ul>
            </CardBody>
          )}
        </Card>

        {(s?.boarding || (s?.library_loans.length ?? 0) > 0 || (visits ?? []).length > 0) && (
          <Card>
            <CardHeader title="School life" />
            <CardBody className="space-y-3 text-sm">
              {s?.boarding && <p><span className="text-muted-foreground">Boarding:</span> {s.boarding.dormitory}, {s.boarding.room}{s.boarding.bed ? `, bed ${s.boarding.bed}` : ""}</p>}
              {s?.library_loans.map((l, i) => <p key={i}><span className="text-muted-foreground">Library book:</span> {l.title} — due {formatDate(l.due_on)} {l.overdue && <Badge tone="danger">Overdue</Badge>}</p>)}
              {(visits ?? []).map((v) => <p key={v.id}><span className="text-muted-foreground">Clinic visit {formatDate(v.visited_at)}:</span> {v.complaint} ({v.outcome.replace(/_/g, " ")})</p>)}
            </CardBody>
          </Card>
        )}

        <Card id="messages">
          <CardHeader title="Messages with school" description={`${child.first_name}'s teachers and authorised staff can read and reply.`} />
          <CardBody><FamilyThread studentId={id} messages={thread} emptyText="No messages yet. Ask a question or share something the school should know." /></CardBody>
        </Card>
      </div>
    </>
  );
}
