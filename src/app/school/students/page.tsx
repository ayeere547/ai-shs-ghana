import { ArrowUpRight, Upload, UserPlus, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { buttonClass, ButtonLink } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Badge, Card, EmptyState, Input, PageHeader, Select, Table, Td, Th, type BadgeTone } from "@/components/ui/primitives";
import { requireSchoolPermission } from "@/lib/auth/session";
import { labelFrom, schoolLookups } from "@/lib/school/lookups";
import { pageRange, searchTerm } from "@/lib/schools";
import { fullName, STUDENT_STATUSES } from "@/lib/students/schema";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Students" };

const STATUS_TONE: Record<string, BadgeTone> = { active: "success", suspended: "warning", transferred: "neutral", withdrawn: "neutral", graduated: "info" };

type Row = { id: string; student_number: string; first_name: string; middle_name: string | null; last_name: string; gender: string; class_id: string | null; residency: string; status: string };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string; class?: string; status?: string; page?: string }> }) {
  const { school } = await requireSchoolPermission("students.read");
  const params = await searchParams;
  const { page, from, to, size } = pageRange(params.page, 25);
  const lookups = await schoolLookups(school.schoolId);
  const q = searchTerm(params.q);
  const cls = lookups.classes.some((c) => c.value === params.class) ? params.class : undefined;
  const status = STUDENT_STATUSES.some((s) => s.value === params.status) ? params.status : params.status === "all" ? "all" : "active";
  const canManage = school.permissions.has("students.manage") && school.schoolStatus === "active";

  const supabase = await createClient();
  let query = supabase.from("students").select("id, student_number, first_name, middle_name, last_name, gender, class_id, residency, status", { count: "exact" }).eq("school_id", school.schoolId);
  if (status !== "all") query = query.eq("status", status);
  if (cls) query = query.eq("class_id", cls);
  if (q) query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,student_number.ilike.%${q}%`);
  const { data, count } = await query.order("last_name").order("first_name").range(from, to).returns<Row[]>();

  return (
    <>
      <PageHeader
        title="Students"
        description="Student records for your school. Only staff with student access can see them."
        actions={
          canManage && (
            <>
              <ButtonLink href="/school/students/promote" variant="secondary"><ArrowUpRight className="h-4 w-4" /> Promote / graduate</ButtonLink>
              <ButtonLink href="/school/students/import" variant="secondary"><Upload className="h-4 w-4" /> Import CSV</ButtonLink>
              <ButtonLink href="/school/students/new"><UserPlus className="h-4 w-4" /> Admit student</ButtonLink>
            </>
          )
        }
      />
      <Card>
        <form className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row" role="search">
          <Input name="q" defaultValue={params.q} placeholder="Search name or student number…" aria-label="Search students" className="sm:max-w-xs" />
          <Select name="class" defaultValue={cls ?? ""} aria-label="Class" className="sm:w-48">
            <option value="">All classes</option>
            {lookups.classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
          <Select name="status" defaultValue={status} aria-label="Status" className="sm:w-44">
            {STUDENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            <option value="all">All statuses</option>
          </Select>
          <button type="submit" className={buttonClass("secondary")}>Filter</button>
        </form>
        {!data?.length ? (
          <EmptyState icon={UserRound} title="No students found" action={canManage && <ButtonLink href="/school/students/new" size="sm">Admit a student</ButtonLink>}>
            {q || cls ? "Try a different search or filter." : "Admit students one at a time or import a CSV file."}
          </EmptyState>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Student</Th>
                  <Th className="hidden sm:table-cell">Number</Th>
                  <Th>Class</Th>
                  <Th className="hidden md:table-cell">Residency</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.id} className="hover:bg-surface-muted/60">
                    <Td>
                      <Link href={`/school/students/${s.id}`} className="font-medium hover:text-royal hover:underline">{fullName(s)}</Link>
                      <p className="text-xs text-muted-foreground sm:hidden">{s.student_number}</p>
                    </Td>
                    <Td className="hidden font-mono text-xs text-muted-foreground sm:table-cell">{s.student_number}</Td>
                    <Td className="text-muted-foreground">{labelFrom(lookups.classes, s.class_id)}</Td>
                    <Td className="hidden capitalize text-muted-foreground md:table-cell">{s.residency}</Td>
                    <Td><Badge tone={STATUS_TONE[s.status]}>{STUDENT_STATUSES.find((x) => x.value === s.status)?.label}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} size={size} total={count ?? 0} basePath="/school/students" params={{ q: params.q, class: cls, status }} />
          </>
        )}
      </Card>
    </>
  );
}
