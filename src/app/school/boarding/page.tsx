import { BedDouble } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ResourceManager } from "@/components/school/resource-manager";
import { ActionForm } from "@/components/ui/action-form";
import { ConfirmSubmit, SubmitButton } from "@/components/ui/confirm-submit";
import { Badge, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, Select } from "@/components/ui/primitives";
import { requireSchoolPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { allocateBed, releaseBed } from "../operations/actions";

export const metadata: Metadata = { title: "Boarding" };

type Room = { id: string; name: string; beds: number; dormitories: { name: string; gender: string } };
type Alloc = { id: string; room_id: string; bed_label: string | null; students: { id: string; first_name: string; last_name: string; student_number: string } };

export default async function BoardingPage({ searchParams }: { searchParams: Promise<{ tab?: string; edit?: string }> }) {
  const { school } = await requireSchoolPermission("boarding.manage");
  const params = await searchParams;
  const tab = ["allocations", "dormitories", "rooms"].includes(params.tab ?? "") ? params.tab! : "allocations";
  const manage = school.schoolStatus === "active";
  const href = (t: string) => `/school/boarding?tab=${t}`;

  let body: React.ReactNode;
  if (tab === "dormitories" || tab === "rooms") {
    body = <ResourceManager resource={tab} schoolId={school.schoolId} canManage={manage} editId={params.edit} hrefFor={(id) => `${href(tab)}${id ? `&edit=${id}` : ""}`} />;
  } else {
    const supabase = await createClient();
    const [{ data: rooms }, { data: allocs }, { data: boarders }] = await Promise.all([
      supabase.from("dorm_rooms").select("id, name, beds, dormitories(name, gender)").eq("school_id", school.schoolId).order("name").returns<Room[]>(),
      supabase.from("boarding_allocations").select("id, room_id, bed_label, students(id, first_name, last_name, student_number)").eq("school_id", school.schoolId).is("released_on", null).returns<Alloc[]>(),
      supabase.from("students").select("id, first_name, last_name, gender").eq("school_id", school.schoolId).eq("status", "active").eq("residency", "boarding").order("last_name"),
    ]);
    const byRoom = new Map<string, Alloc[]>();
    for (const a of allocs ?? []) byRoom.set(a.room_id, [...(byRoom.get(a.room_id) ?? []), a]);
    const housed = new Set((allocs ?? []).map((a) => a.students.id));
    const unhoused = (boarders ?? []).filter((s) => !housed.has(s.id));
    const sorted = [...(rooms ?? [])].sort((a, b) => `${a.dormitories.name}${a.name}`.localeCompare(`${b.dormitories.name}${b.name}`));
    const free = (r: Room) => r.beds - (byRoom.get(r.id)?.length ?? 0);
    body = (
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          {!sorted.length && <Card><EmptyState icon={BedDouble} title="No rooms yet">Add dormitories, then rooms with their number of beds.</EmptyState></Card>}
          {sorted.map((r) => {
            const occ = byRoom.get(r.id) ?? [];
            return (
              <Card key={r.id}>
                <CardHeader title={`${r.dormitories.name} · ${r.name}`} action={<Badge tone={occ.length >= r.beds ? "warning" : "success"}>{occ.length}/{r.beds} beds</Badge>} />
                {occ.length > 0 && (
                  <ul className="divide-y divide-border">
                    {occ.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2 px-5 py-2 text-sm">
                        <span><Link href={`/school/students/${a.students.id}`} className="hover:text-royal hover:underline">{a.students.first_name} {a.students.last_name}</Link> <span className="text-xs text-muted-foreground">{a.bed_label ? `· bed ${a.bed_label}` : ""}</span></span>
                        {manage && <form action={releaseBed}><input type="hidden" name="id" value={a.id} /><ConfirmSubmit title="Release bed?" description="The student will no longer be allocated to this room." confirmLabel="Release">Release</ConfirmSubmit></form>}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
        {manage && (
          <Card className="self-start">
            <CardHeader title="Allocate a bed" description={`${unhoused.length} boarder${unhoused.length === 1 ? "" : "s"} without a bed`} />
            <CardBody>
              <ActionForm action={allocateBed}>
                <Field label="Student" htmlFor="ab-student"><Select id="ab-student" name="studentId" defaultValue=""><option value="" disabled>Choose…</option>{unhoused.map((s) => <option key={s.id} value={s.id}>{s.last_name}, {s.first_name}</option>)}</Select></Field>
                <Field label="Room" htmlFor="ab-room"><Select id="ab-room" name="roomId" defaultValue=""><option value="" disabled>Choose…</option>{sorted.filter((r) => free(r) > 0).map((r) => <option key={r.id} value={r.id}>{r.dormitories.name} · {r.name} ({free(r)} free, {r.dormitories.gender})</option>)}</Select></Field>
                <Field label="Bed label (optional)" htmlFor="ab-bed"><Input id="ab-bed" name="bed" maxLength={20} /></Field>
                <SubmitButton>Allocate</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        )}
      </div>
    );
  }
  return (
    <>
      <PageHeader title="Boarding" description="Dormitories, rooms and bed allocations. Only boarding students can be allocated, and dormitory gender rules are enforced." />
      <nav className="mb-6 flex gap-1 border-b border-border" aria-label="Boarding sections">
        {[["allocations", "Allocations"], ["dormitories", "Dormitories"], ["rooms", "Rooms"]].map(([k, label]) => <Link key={k} href={href(k)} aria-current={k === tab ? "page" : undefined} className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", k === tab ? "border-royal text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{label}</Link>)}
      </nav>
      {body}
    </>
  );
}
