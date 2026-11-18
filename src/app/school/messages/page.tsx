import { MessagesSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { FamilyThread } from "@/components/messages/thread";
import { Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireSchool } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Family messages" };

type Msg = { id: string; student_id: string; body: string; from_family: boolean; created_at: string; author_id: string; students: { first_name: string; last_name: string } };

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ student?: string }> }) {
  const { session, school } = await requireSchool();
  const p = school.permissions;
  if (!(p.has("parents.message") || p.has("classroom.teach"))) redirect("/school?denied=1");
  const supabase = await createClient();
  // RLS limits this to children whose families this user may message.
  const { data } = await supabase.from("family_messages").select("id, student_id, body, from_family, created_at, author_id, students(first_name, last_name)").eq("school_id", school.schoolId).order("created_at", { ascending: false }).limit(500).returns<Msg[]>();
  const threads = new Map<string, Msg>();
  for (const m of data ?? []) if (!threads.has(m.student_id)) threads.set(m.student_id, m);
  const wanted = (await searchParams).student;
  const current = wanted && /^[0-9a-f-]{36}$/i.test(wanted) ? wanted : [...threads.keys()][0];
  const { data: student } = current ? await supabase.from("students").select("id, first_name, last_name").eq("id", current).maybeSingle() : { data: null };
  const thread = (data ?? []).filter((m) => m.student_id === current).reverse().map((m) => ({ id: m.id, body: m.body, from_family: m.from_family, created_at: m.created_at, mine: m.author_id === session.userId, author: m.from_family ? "Family" : "School staff" }));

  return (
    <>
      <PageHeader title="Family messages" description="Conversations with parents and guardians about their children. Visible to the class's teachers and authorised staff." />
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <Card className="self-start">
          {!threads.size ? <EmptyState icon={MessagesSquare} title="No conversations yet">Start one from a student&apos;s page, or wait for a family to write.</EmptyState> : (
            <ul className="divide-y divide-border">
              {[...threads.values()].map((m) => (
                <li key={m.student_id}>
                  <Link href={`/school/messages?student=${m.student_id}`} className={cn("block px-4 py-3 text-sm hover:bg-surface-muted", m.student_id === current && "bg-surface-muted")}>
                    <span className="font-medium">{m.students.first_name} {m.students.last_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{m.from_family ? "Family: " : "You/staff: "}{m.body}</span>
                    <span className="block text-[11px] text-muted-foreground">{formatDate(m.created_at, { dateStyle: "medium", timeStyle: "short" })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {student && (
          <Card>
            <CardHeader title={`${student.first_name} ${student.last_name}'s family`} action={<Link href={`/school/students/${student.id}`} className="text-sm text-royal hover:underline">Student record</Link>} />
            <CardBody><FamilyThread studentId={student.id} messages={thread} emptyText="No messages yet. Write to the family below." /></CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
