import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { openTicket } from "@/app/support-actions";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Alert, Card, CardBody, Field, Input, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { requireSession } from "@/lib/auth/session";
import { TICKET_CATEGORIES } from "@/lib/support";

export const metadata: Metadata = { title: "New support request" };

export default async function NewTicket({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const session = await requireSession();
  const { category } = await searchParams;
  const schools = session.memberships.filter((m) => m.permissions.has("support.request"));
  const initialCategory = TICKET_CATEGORIES.some((c) => c.value === category) ? category : "technical";

  return (
    <>
      <Link href="/app/support" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Help & support</Link>
      <PageHeader title="New support request" description="Tell us what happened and we'll get back to you here." />
      <Card className="max-w-2xl">
        <CardBody>
          <ActionForm action={openTicket} className="space-y-4">
            <Field label="About" htmlFor="schoolId" hint="Requests about a school are visible to that school's administrators.">
              <Select id="schoolId" name="schoolId" defaultValue={schools[0]?.schoolId ?? ""}>
                {schools.map((m) => <option key={m.schoolId} value={m.schoolId}>{m.schoolName}</option>)}
                <option value="">My own account (no school)</option>
              </Select>
            </Field>
            <Field label="Topic" htmlFor="category">
              <Select id="category" name="category" defaultValue={initialCategory}>
                {TICKET_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </Field>
            <Field label="Subject" htmlFor="subject"><Input id="subject" name="subject" maxLength={160} required /></Field>
            <Field label="Details" htmlFor="body" hint="What were you trying to do, and what happened instead?">
              <Textarea id="body" name="body" rows={6} maxLength={5000} required />
            </Field>
            <Field label="How urgent is it?" htmlFor="priority">
              <Select id="priority" name="priority" defaultValue="normal">
                <option value="low">Low — a question or suggestion</option>
                <option value="normal">Normal</option>
                <option value="high">High — the school can&apos;t work</option>
              </Select>
            </Field>
            <Alert tone="info">Please don&apos;t include passwords, health details or full student records. For data protection requests we may ask you to confirm your identity.</Alert>
            <SubmitButton>Send request</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
