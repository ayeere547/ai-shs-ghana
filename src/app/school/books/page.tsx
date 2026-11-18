import type { Metadata } from "next";
import Link from "next/link";

import { ResourceManager } from "@/components/school/resource-manager";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/confirm-submit";
import { Badge, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui/primitives";
import { requireSchoolPermission } from "@/lib/auth/session";
import { staffName } from "@/lib/staff/schema";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate, todayInAccra } from "@/lib/utils";

import { issueBook, returnBook } from "../operations/actions";

export const metadata: Metadata = { title: "Library lending" };

type Loan = { id: string; loaned_on: string; due_on: string; library_books: { title: string }; students: { first_name: string; last_name: string } | null; staff: { title: string | null; first_name: string; last_name: string } | null };

export default async function BooksPage({ searchParams }: { searchParams: Promise<{ tab?: string; edit?: string }> }) {
  const { school } = await requireSchoolPermission("library.circulation");
  const params = await searchParams;
  const tab = params.tab === "books" ? "books" : "loans";
  const manage = school.schoolStatus === "active";
  const today = todayInAccra();

  let body: React.ReactNode;
  if (tab === "books") {
    body = <ResourceManager resource="books" schoolId={school.schoolId} canManage={manage} editId={params.edit} hrefFor={(id) => `/school/books?tab=books${id ? `&edit=${id}` : ""}`} />;
  } else {
    const supabase = await createClient();
    const [{ data: loans }, { data: books }, { data: students }, { data: staff }] = await Promise.all([
      supabase.from("library_loans").select("id, loaned_on, due_on, library_books(title), students(first_name, last_name), staff(title, first_name, last_name)").eq("school_id", school.schoolId).is("returned_on", null).order("due_on").returns<Loan[]>(),
      supabase.from("library_books").select("id, title, copies").eq("school_id", school.schoolId).order("title"),
      supabase.from("students").select("id, first_name, last_name, student_number").eq("school_id", school.schoolId).eq("status", "active").order("last_name").limit(3000),
      supabase.from("staff").select("id, title, first_name, last_name").eq("school_id", school.schoolId).neq("employment_status", "left").order("last_name"),
    ]);
    const due = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
    body = (
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader title={`On loan (${loans?.length ?? 0})`} description={`${(loans ?? []).filter((l) => l.due_on < today).length} overdue`} />
          {!loans?.length ? <EmptyState title="Nothing on loan" /> : (
            <Table>
              <thead><tr><Th>Book</Th><Th>Borrower</Th><Th>Due</Th><Th><span className="sr-only">Return</span></Th></tr></thead>
              <tbody>
                {loans.map((l) => (
                  <tr key={l.id}>
                    <Td className="font-medium">{l.library_books.title}</Td>
                    <Td>{l.students ? `${l.students.first_name} ${l.students.last_name}` : l.staff ? staffName(l.staff) : "—"}</Td>
                    <Td className={cn("whitespace-nowrap", l.due_on < today && "text-danger")}>{formatDate(l.due_on)}{l.due_on < today && <Badge tone="danger" className="ml-2">Overdue</Badge>}</Td>
                    <Td className="text-right">{manage && <form action={returnBook}><input type="hidden" name="id" value={l.id} /><SubmitButton size="sm" variant="secondary">Returned</SubmitButton></form>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        {manage && (
          <Card className="self-start">
            <CardHeader title="Issue a book" />
            <CardBody>
              <ActionForm action={issueBook}>
                <Field label="Book" htmlFor="ib-book"><Select id="ib-book" name="bookId" defaultValue=""><option value="" disabled>Choose…</option>{(books ?? []).map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}</Select></Field>
                <Field label="Borrower" htmlFor="ib-who">
                  <Select id="ib-who" name="borrower" defaultValue="">
                    <option value="" disabled>Choose…</option>
                    <optgroup label="Students">{(students ?? []).map((s) => <option key={s.id} value={`student:${s.id}`}>{s.last_name}, {s.first_name} ({s.student_number})</option>)}</optgroup>
                    <optgroup label="Staff">{(staff ?? []).map((s) => <option key={s.id} value={`staff:${s.id}`}>{staffName(s)}</option>)}</optgroup>
                  </Select>
                </Field>
                <Field label="Due back" htmlFor="ib-due"><Input id="ib-due" name="dueOn" type="date" defaultValue={due} min={today} /></Field>
                <SubmitButton>Issue</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        )}
      </div>
    );
  }
  return (
    <>
      <PageHeader title="Library lending" description="Physical books, loans and returns. The database refuses to lend more copies than the library holds." />
      <nav className="mb-6 flex gap-1 border-b border-border" aria-label="Library sections">
        {[["loans", "Loans"], ["books", "Books"]].map(([k, label]) => <Link key={k} href={`/school/books?tab=${k}`} aria-current={k === tab ? "page" : undefined} className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", k === tab ? "border-royal text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{label}</Link>)}
      </nav>
      {body}
    </>
  );
}
